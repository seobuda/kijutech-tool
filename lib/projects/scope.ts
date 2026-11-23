import 'server-only';

// Núcleo: alcance de un proyecto (cimientos, 23 nov 2026). Un proyecto pertenece a un cliente y elige, de entre las
// «Webs y cuentas» de ese cliente, cuáles son suyas: webs, dominios, Search Console, Analytics, fichas de Google y redes.
// Un cliente puede tener varios proyectos y una misma cuenta puede estar en dos.
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clientAssets, clients, projectAssets, projects, type ClientAsset } from '@/lib/db/schema';
import { syncGscPropertiesForProject } from '@/lib/core/gsc';

export type PickerClient = { id: string; name: string; assets: { id: string; kind: string; label: string; value: string }[] };

/** Clientes con sus cuentas, para elegir el cliente y el alcance de un proyecto. */
export async function clientsForProjectPicker(tenantId: string): Promise<PickerClient[]> {
  const [list, assets] = await Promise.all([
    db.select({ id: clients.id, name: clients.name, status: clients.status }).from(clients).where(eq(clients.tenantId, tenantId)).orderBy(asc(clients.name)),
    db.select().from(clientAssets).where(eq(clientAssets.tenantId, tenantId)).orderBy(asc(clientAssets.kind), asc(clientAssets.createdAt))
  ]);
  const byClient = new Map<string, ClientAsset[]>();
  for (const a of assets) byClient.set(a.clientId, [...(byClient.get(a.clientId) ?? []), a]);
  return list
    .filter((c) => c.status !== 'baja')
    .map((c) => ({ id: c.id, name: c.name, assets: (byClient.get(c.id) ?? []).map((a) => ({ id: a.id, kind: a.kind, label: a.label ?? a.value ?? a.kind, value: a.value ?? '' })) }));
}

/** Cuentas del alcance de un proyecto. */
export async function projectAssetIds(projectId: string): Promise<string[]> {
  const rows = await db.select({ id: projectAssets.clientAssetId }).from(projectAssets).where(eq(projectAssets.projectId, projectId));
  return rows.map((r) => r.id);
}

/**
 * Fija el alcance de un proyecto. Solo admite cuentas del MISMO cliente y cuenta (lo demás se ignora). Da de alta las
 * propiedades de Search Console del alcance para que empiece su descarga. Devuelve las cuentas guardadas.
 */
export async function setProjectScope(tenantId: string, projectId: string, assetIds: string[]): Promise<string[]> {
  const [p] = await db.select({ clientId: projects.clientId }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  if (!p?.clientId) throw new Error('Proyecto sin cliente');
  const wanted = [...new Set(assetIds)].filter(Boolean);
  const valid = wanted.length
    ? (
        await db
          .select({ id: clientAssets.id })
          .from(clientAssets)
          .where(and(eq(clientAssets.tenantId, tenantId), eq(clientAssets.clientId, p.clientId), inArray(clientAssets.id, wanted)))
      ).map((r) => r.id)
    : [];
  await db.transaction(async (tx) => {
    await tx.delete(projectAssets).where(eq(projectAssets.projectId, projectId));
    if (valid.length) await tx.insert(projectAssets).values(valid.map((id) => ({ projectId, clientAssetId: id })));
  });
  await syncGscPropertiesForProject(tenantId, projectId).catch((e) => console.error('[proyectos] alta de Search Console:', e instanceof Error ? e.message : e));
  return valid;
}

/** Dominio principal del alcance (la primera web), para lo que aún lee projects.domain. */
export async function primaryDomainOf(tenantId: string, projectId: string): Promise<string | null> {
  const rows = await db
    .select({ kind: clientAssets.kind, value: clientAssets.value })
    .from(projectAssets)
    .innerJoin(clientAssets, eq(clientAssets.id, projectAssets.clientAssetId))
    .where(and(eq(projectAssets.projectId, projectId), eq(clientAssets.tenantId, tenantId), inArray(clientAssets.kind, ['web', 'dominio'])));
  const v = rows.find((r) => r.kind === 'web')?.value ?? rows[0]?.value ?? null;
  if (!v) return null;
  try {
    return new URL(/^https?:\/\//.test(v) ? v : `https://${v}`).hostname.replace(/^www\./, '');
  } catch {
    return v.slice(0, 255);
  }
}

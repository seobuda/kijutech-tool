import 'server-only';

// SEO · Local, tanda 5a: la ficha de Google del cliente y de sus competidores (26 nov 2026; docs/DISENO-SEO-LOCAL.md).
// - Datos de DataForSEO my_business_info por el núcleo (businessSource): se pueden guardar (Google Places no).
// - Fichas POR CLIENTE (seo_local_places): la del cliente se propone sola (nombre + población) y una persona la confirma
//   (o pega la URL de Maps); al confirmar se guarda lo confirmado (baseline) y los cambios se comparan con eso.
// - Proceso «seo.local» (semanal): foto del cliente cada semana y de los competidores confirmados cada 4 semanas.
//   «Cerrada» se vuelve a mirar a los 30 min y solo entonces se avisa (una vez por ficha y estado).
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clientCompetitors, clientLocations, clients, projects, seoDossierFacts, seoLocalPlaces, seoLocalSnapshots, type SeoLocalPlace } from '@/lib/db/schema';
import { businessSource, emitProjectAlert, serpSource, telegramOutbound, type BusinessInfo } from '@/lib/core/capabilities';
import { enqueueJob, registerJobKind } from '@/lib/core/jobs';
import { findingKind, syncFindings } from '@/lib/core/findings';
import { projectWebUrl } from '@/lib/seo/salud/audit';
import { host } from '@/lib/seo/expediente/rules';
import { canSpend, recordDataSpend } from '@/lib/seo/gasto';
import { pickLocation, zoneTowns } from '@/lib/seo/posiciones/rules';
import { changedFields, FICHA_SOURCE, fichaFindings, matchesClient, reviewsBehind, reviewsStalled, type Baseline, type ReviewPoint } from '@/lib/seo/local/ficha-rules';

const INFO_COST = 0.0054;
const CONFIRM_KIND = 'seo.local.confirmar';
const FICHA_KIND_KEYS = ['seo.gbp_closed', 'seo.gbp_changed', 'seo.reviews_behind', 'seo.reviews_stalled'];

type Outcome = { status: 'ok' | 'aviso' | 'omitido'; summary: string };

async function projectClient(tenantId: string, projectId: string) {
  const [p] = await db
    .select({ clientId: projects.clientId, name: clients.name, projectName: projects.name })
    .from(projects)
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
    .limit(1);
  return p?.clientId ? { clientId: p.clientId, name: p.name ?? p.projectName, projectName: p.projectName } : null;
}

/** Población principal: la zona confirmada del expediente o la ciudad del local principal. */
async function mainTown(projectId: string, clientId: string): Promise<string | null> {
  const [z] = await db
    .select({ value: seoDossierFacts.value })
    .from(seoDossierFacts)
    .where(and(eq(seoDossierFacts.projectId, projectId), eq(seoDossierFacts.field, 'zona'), sql`(${seoDossierFacts.status} = 'confirmado' OR ${seoDossierFacts.source} = 'ficha')`))
    .limit(1);
  const town = zoneTowns(typeof z?.value === 'string' ? z.value : null)[0];
  if (town) return town;
  const [loc] = await db.select({ city: clientLocations.city }).from(clientLocations).where(eq(clientLocations.clientId, clientId)).orderBy(desc(clientLocations.isPrimary)).limit(1);
  return loc?.city ?? null;
}

async function locationFor(tenantId: string, town: string | null): Promise<string> {
  const src = serpSource();
  if (!town || !src?.locations) return 'Spain';
  return pickLocation([town], await src.locations(tenantId, 'es').catch(() => [])).name;
}

/** Una consulta de ficha (cobrada): comprueba el tope antes y apunta el gasto después. */
async function fetchInfo(tenantId: string, projectId: string, keyword: string, location: string): Promise<BusinessInfo | null> {
  const src = businessSource();
  if (!src || !(await src.isConnected(tenantId).catch(() => false))) throw new Error('DataForSEO no está conectado');
  if (!(await canSpend(projectId, INFO_COST)).ok) throw new Error('Tope de gasto en datos del mes alcanzado');
  const r = await src.info(tenantId, { keyword, location, language: 'es' });
  await recordDataSpend(tenantId, projectId, 'serp', 'local: ficha de Google', r.costUsd || INFO_COST);
  return r.info;
}

const toBaseline = (i: BusinessInfo | { title: string | null; category: string | null; phone: string | null; domain: string | null; hours: Record<string, string> | null }): Baseline => ({ title: i.title, category: i.category, phone: i.phone, domain: i.domain, hours: i.hours ?? null });

async function upsertPlace(tenantId: string, clientId: string, role: 'cliente' | 'competidor', info: BusinessInfo, opts: { competitorId?: string | null; status?: 'propuesta' | 'confirmada'; by?: string } = {}): Promise<SeoLocalPlace> {
  const values = {
    tenantId,
    clientId,
    role,
    clientCompetitorId: opts.competitorId ?? null,
    cid: info.cid!,
    placeId: info.placeId,
    title: info.title.slice(0, 255),
    status: opts.status ?? 'propuesta',
    ...(opts.status === 'confirmada' ? { baseline: toBaseline(info) as Record<string, unknown>, decidedBy: opts.by?.slice(0, 120) ?? null, decidedAt: new Date() } : {})
  };
  const [row] = await db
    .insert(seoLocalPlaces)
    .values(values)
    .onConflictDoUpdate({ target: [seoLocalPlaces.clientId, seoLocalPlaces.cid], set: { title: values.title, placeId: values.placeId, updatedAt: new Date(), ...(opts.status === 'confirmada' ? { status: 'confirmada', baseline: values.baseline, decidedBy: values.decidedBy, decidedAt: values.decidedAt, role } : {}) } })
    .returning();
  return row;
}

async function saveSnapshot(tenantId: string, placeRowId: string, info: BusinessInfo): Promise<void> {
  await db.insert(seoLocalSnapshots).values({
    tenantId,
    placeRowId,
    title: info.title.slice(0, 255),
    category: info.category?.slice(0, 160) ?? null,
    additionalCategories: info.additionalCategories,
    phone: info.phone?.slice(0, 40) ?? null,
    domain: info.domain?.slice(0, 255) ?? null,
    status: info.status,
    rating: info.rating,
    votes: info.votes,
    distribution: info.distribution,
    hours: info.hours,
    isClaimed: info.isClaimed,
    lat: info.lat,
    lng: info.lng,
    costUsd: INFO_COST.toFixed(5)
  });
}

/** Propone la ficha del cliente (nombre + población). Si coincide su web o su teléfono, queda marcada como probable. */
export async function proposeClientPlace(tenantId: string, projectId: string): Promise<{ found: boolean; matches: boolean }> {
  const pc = await projectClient(tenantId, projectId);
  if (!pc) return { found: false, matches: false };
  const town = await mainTown(projectId, pc.clientId);
  const info = await fetchInfo(tenantId, projectId, `${pc.name}${town ? ` ${town}` : ''}`, await locationFor(tenantId, town));
  if (!info?.cid) return { found: false, matches: false };
  const domain = host(await projectWebUrl(tenantId, projectId));
  const phones = (await db.select({ phone: clientLocations.phone }).from(clientLocations).where(eq(clientLocations.clientId, pc.clientId))).map((l) => l.phone ?? '').filter(Boolean);
  const row = await upsertPlace(tenantId, pc.clientId, 'cliente', info);
  await saveSnapshot(tenantId, row.id, info);
  return { found: true, matches: matchesClient(info, { domains: domain ? [domain] : [], phones }) };
}

/** Una persona pega la URL de Maps o el cid: se consulta y queda confirmada (la eligió ella). */
export async function setPlaceFromCid(tenantId: string, projectId: string, cid: string, role: 'cliente' | 'competidor', by: string, competitorId?: string | null): Promise<BusinessInfo | null> {
  const pc = await projectClient(tenantId, projectId);
  if (!pc) return null;
  const info = await fetchInfo(tenantId, projectId, `cid:${cid}`, 'Spain');
  if (!info?.cid) return null;
  if (role === 'cliente') await db.update(seoLocalPlaces).set({ status: 'descartada', updatedAt: new Date() }).where(and(eq(seoLocalPlaces.clientId, pc.clientId), eq(seoLocalPlaces.role, 'cliente'), eq(seoLocalPlaces.status, 'confirmada')));
  const row = await upsertPlace(tenantId, pc.clientId, role, info, { status: 'confirmada', by, competitorId });
  await saveSnapshot(tenantId, row.id, info);
  return info;
}

/** Confirmar o descartar una ficha propuesta. Al confirmar, lo de su última foto pasa a ser «lo confirmado». */
export async function decidePlace(tenantId: string, placeRowId: string, status: 'confirmada' | 'descartada', by: string): Promise<boolean> {
  const [row] = await db.select().from(seoLocalPlaces).where(and(eq(seoLocalPlaces.id, placeRowId), eq(seoLocalPlaces.tenantId, tenantId))).limit(1);
  if (!row) return false;
  const [snap] = await db.select().from(seoLocalSnapshots).where(eq(seoLocalSnapshots.placeRowId, row.id)).orderBy(desc(seoLocalSnapshots.takenAt)).limit(1);
  if (status === 'confirmada' && row.role === 'cliente') await db.update(seoLocalPlaces).set({ status: 'descartada', updatedAt: new Date() }).where(and(eq(seoLocalPlaces.clientId, row.clientId), eq(seoLocalPlaces.role, 'cliente'), eq(seoLocalPlaces.status, 'confirmada')));
  await db
    .update(seoLocalPlaces)
    .set({ status, decidedBy: by.slice(0, 120), decidedAt: new Date(), updatedAt: new Date(), ...(status === 'confirmada' && snap ? { baseline: toBaseline({ title: snap.title, category: snap.category, phone: snap.phone, domain: snap.domain, hours: (snap.hours as Record<string, string> | null) ?? null }) as Record<string, unknown> } : {}) })
    .where(eq(seoLocalPlaces.id, row.id));
  return true;
}

/** «Lo cambiamos nosotros»: la última foto pasa a ser lo confirmado (el hallazgo de cambio se resuelve en la siguiente pasada). */
export async function acceptChanges(tenantId: string, placeRowId: string, by: string): Promise<boolean> {
  return decidePlace(tenantId, placeRowId, 'confirmada', by);
}

async function latestSnapshots(placeRowId: string, n = 6) {
  return db.select().from(seoLocalSnapshots).where(eq(seoLocalSnapshots.placeRowId, placeRowId)).orderBy(desc(seoLocalSnapshots.takenAt)).limit(n);
}

/** El proceso semanal (y su pasada de confirmación si la ficha sale cerrada). */
export async function runLocal(tenantId: string, projectId: string, confirmPass = false): Promise<Outcome> {
  const pc = await projectClient(tenantId, projectId);
  if (!pc) return { status: 'omitido', summary: 'El proyecto no tiene cliente.' };
  if (!businessSource() || !(await businessSource()!.isConnected(tenantId).catch(() => false))) return { status: 'omitido', summary: 'DataForSEO no está conectado (Agentes → Integraciones).' };
  const places = await db.select().from(seoLocalPlaces).where(eq(seoLocalPlaces.clientId, pc.clientId));
  const client = places.find((p) => p.role === 'cliente' && p.status === 'confirmada');
  if (!client) {
    const recentProposal = places.some((p) => p.role === 'cliente' && p.status === 'propuesta' && Date.now() - p.createdAt.getTime() < 30 * 86_400_000);
    if (recentProposal) return { status: 'omitido', summary: 'Falta confirmar la ficha de Google del cliente (pestaña Local).' };
    const r = await proposeClientPlace(tenantId, projectId);
    return { status: 'aviso', summary: r.found ? `Propuesta la ficha de Google del cliente${r.matches ? ' (coincide su web o su teléfono)' : ''}: confírmala en la pestaña Local.` : 'No se encontró su ficha de Google por nombre y población: pega su enlace de Google Maps en la pestaña Local.' };
  }
  // Foto del cliente.
  const info = await fetchInfo(tenantId, projectId, `cid:${client.cid}`, 'Spain');
  if (!info) return { status: 'aviso', summary: 'Google no devolvió la ficha del cliente: puede haber cambiado de identificador. Revísala en la pestaña Local.' };
  await saveSnapshot(tenantId, client.id, info);
  const closed = info.status === 'cerrada_temporal' || info.status === 'cerrada_definitiva' ? info.status : null;
  if (closed && !confirmPass) {
    await enqueueJob({ tenantId, kind: CONFIRM_KIND, payload: { projectId }, scopeType: 'proyecto', scopeId: projectId, priority: 2, runAt: new Date(Date.now() + 30 * 60_000), dedupeKey: `${CONFIRM_KIND}:${projectId}` });
    return { status: 'aviso', summary: 'La ficha sale como cerrada: se vuelve a comprobar en 30 min antes de avisar.' };
  }
  // Competidores confirmados: foto cada 4 semanas.
  const comps = places.filter((p) => p.role === 'competidor' && p.status === 'confirmada').slice(0, 8);
  const compPoints: ReviewPoint[] = [];
  for (const c of comps) {
    const [last] = await latestSnapshots(c.id, 1);
    let cur = last ?? null;
    if (!last || Date.now() - last.takenAt.getTime() > 25 * 86_400_000) {
      const ci = await fetchInfo(tenantId, projectId, `cid:${c.cid}`, 'Spain').catch(() => null);
      if (ci) {
        await saveSnapshot(tenantId, c.id, ci);
        cur = (await latestSnapshots(c.id, 1))[0] ?? null;
      }
    }
    if (cur) compPoints.push({ rating: cur.rating, votes: cur.votes, takenAt: cur.takenAt.toISOString() });
  }
  const hist = await latestSnapshots(client.id, 8);
  const clientPoint: ReviewPoint = { rating: info.rating, votes: info.votes, takenAt: new Date().toISOString() };
  const base = (client.baseline as Baseline | null) ?? null;
  const cur = toBaseline(info);
  const changed = base ? changedFields(base, cur) : [];
  const found = fichaFindings({
    cid: client.cid,
    url: `https://maps.google.com/?cid=${client.cid}`,
    closedConfirmed: closed,
    changed,
    base,
    cur,
    behind: reviewsBehind(clientPoint, compPoints),
    client: clientPoint,
    stalled: reviewsStalled(hist.map((h) => ({ rating: h.rating, votes: h.votes, takenAt: h.takenAt.toISOString() })))
  });
  await syncFindings(tenantId, projectId, FICHA_SOURCE, found, FICHA_KIND_KEYS);
  if (closed) {
    const label = closed === 'cerrada_definitiva' ? 'CERRADA DEFINITIVAMENTE' : 'cerrada temporalmente';
    // Una vez por ficha y estado (la cola de avisos no repite la misma clave).
    await telegramOutbound()?.notifyOwner(tenantId, `seo.local.cerrada:${client.cid}:${closed}`, `🚨 <b>${pc.name}</b>: su ficha de Google aparece ${label}. Si no es así, hay que corregirlo ya en Business Profile (pierde llamadas y visitas).`);
    await emitProjectAlert({ tenantId, clientId: pc.clientId, projectId, title: `Ficha de Google ${label}`, source: 'seo.local' });
  }
  return {
    status: found.length ? 'aviso' : 'ok',
    summary: found.length ? found.map((f) => findingKind(f.kind)?.title ?? f.kind).join(' · ') : `Ficha correcta: ${info.rating ?? '—'} ★ con ${info.votes ?? 0} reseñas${compPoints.length ? `; ${compPoints.length} competidor(es) comparados` : ''}.`
  };
}

/** Propone las fichas de los competidores directos confirmados que aún no la tienen (como mucho 5 por pasada). */
export async function proposeCompetitorPlaces(tenantId: string, projectId: string): Promise<number> {
  const pc = await projectClient(tenantId, projectId);
  if (!pc) return 0;
  const have = new Set((await db.select({ id: seoLocalPlaces.clientCompetitorId }).from(seoLocalPlaces).where(eq(seoLocalPlaces.clientId, pc.clientId))).map((r) => r.id).filter(Boolean));
  const comps = (await db.select({ id: clientCompetitors.id, name: clientCompetitors.name, kind: clientCompetitors.kind }).from(clientCompetitors).where(and(eq(clientCompetitors.clientId, pc.clientId), eq(clientCompetitors.status, 'confirmado'), eq(clientCompetitors.kind, 'directo')))).filter((c) => !have.has(c.id) && c.name);
  const town = await mainTown(projectId, pc.clientId);
  const location = await locationFor(tenantId, town);
  let n = 0;
  for (const c of comps.slice(0, 5)) {
    const info = await fetchInfo(tenantId, projectId, `${c.name}${town ? ` ${town}` : ''}`, location).catch(() => null);
    if (!info?.cid) continue;
    const row = await upsertPlace(tenantId, pc.clientId, 'competidor', info, { competitorId: c.id });
    await saveSnapshot(tenantId, row.id, info);
    n++;
  }
  return n;
}

let registered = false;
export function registerLocalJobs(): void {
  if (registered) return;
  registered = true;
  registerJobKind({ kind: CONFIRM_KIND, timeoutS: 120, maxConcurrent: 2, maxAttempts: 2, run: async (ctx, payload) => runLocal(ctx.tenantId, String(payload.projectId ?? ''), true) });
}

export { FICHA_KIND_KEYS };

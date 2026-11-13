'use server';

// «Completar fichas con el historial de ClickUp» (pantalla Clientes). Buscar consulta ClickUp una vez (caché de 10 min);
// aplicar añade los servicios y las listas elegidas SOLO si la ficha no los tenía (nunca sobrescribe).
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { opsClientServices, clients, opsClients } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { logEvent } from '@/lib/operaciones/events';
import { getServices } from '@/lib/operaciones/clients';
import { buildClientProposals, clearProposalCache, type ClientProposal } from '@/lib/operaciones/client-proposals';
import { getStructure } from '@/lib/operaciones/structure';

type Res<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export async function getClientProposalsAction(force = false): Promise<
  Res<{ proposals: ClientProposal[]; truncated: boolean; requests: number; scanned: number; members: { id: string; name: string }[] }>
> {
  try {
    const user = await requirePermission('edit');
    const r = await buildClientProposals(user.tenantId, { force: Boolean(force) });
    const members = (await getStructure(user.tenantId)).members.map((m) => ({ id: m.id, name: m.username }));
    return { ok: true, proposals: r.proposals, truncated: r.truncated, requests: r.requests, scanned: r.scanned, members };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudieron preparar las propuestas') };
  }
}

const applySchema = z.object({
  clientId: z.string().uuid(),
  services: z.array(z.object({ key: z.string().trim().min(1).max(40), responsibleId: z.string().trim().max(50).nullable() })).max(10),
  listIds: z.array(z.string().trim().min(1).max(50)).max(5)
});

export async function applyClientProposalAction(input: z.infer<typeof applySchema>): Promise<Res<{ added: number }>> {
  try {
    const user = await requirePermission('edit');
    const parsed = applySchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Datos no válidos' };
    const d = parsed.data;
    const [client] = await db.select().from(opsClients).where(and(eq(opsClients.id, d.clientId), eq(opsClients.tenantId, user.tenantId))).limit(1);
    if (!client) return { ok: false, error: 'Ese cliente no existe' };
    const [core] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, client.id)).limit(1);

    const valid = new Set((await getServices(user.tenantId)).filter((s) => s.active).map((s) => s.key));
    const structure = await getStructure(user.tenantId);
    const members = new Set(structure.members.map((m) => m.id));
    const lists = new Set(structure.spaces.flatMap((s) => s.lists.map((l) => l.id)));
    let added = 0;
    for (const s of d.services) {
      if (!valid.has(s.key)) continue;
      const responsible = s.responsibleId && members.has(s.responsibleId) ? s.responsibleId : null;
      const ins = await db
        .insert(opsClientServices)
        .values({ clientId: client.id, serviceKey: s.key, responsibleClickupId: responsible })
        .onConflictDoNothing()
        .returning({ id: opsClientServices.id });
      added += ins.length;
    }
    const listIds = d.listIds.filter((id) => lists.has(id));
    let listsSet = false;
    if (client.usualListIds.length === 0 && listIds.length) {
      await db.update(opsClients).set({ usualListIds: listIds, updatedAt: new Date() }).where(eq(opsClients.id, client.id));
      listsSet = true;
    }
    await logEvent(user.tenantId, {
      actor: { clickupUserId: null, name: user.name || user.email },
      type: 'ficha_cliente',
      payload: { client: core?.name ?? '', servicesAdded: added, lists: listsSet ? listIds.length : 0, via: 'historial' }
    });
    clearProposalCache(user.tenantId);
    revalidatePath('/dashboard/clientes');
    return { ok: true, added };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo aplicar la propuesta') };
  }
}

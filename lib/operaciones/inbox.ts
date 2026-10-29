// «Mi bandeja»: lo que está pendiente de quien lleva las operaciones, ordenado por tiempo de
// espera (lo más antiguo primero). Se calcula a partir del estado actual (encargos en revisión y
// bloqueos escalados), no tiene tabla propia. Lo usan la pestaña web y los resúmenes.
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsBlockers, opsRequests, type OpsBlocker, type OpsRequest } from '@/lib/db/schema';

export type InboxItem =
  | { kind: 'review'; since: Date; req: OpsRequest }
  | { kind: 'blocker'; since: Date; req: OpsRequest; blocker: OpsBlocker };

export async function getInbox(tenantId: string): Promise<InboxItem[]> {
  const reviews = await db
    .select()
    .from(opsRequests)
    .where(
      and(
        eq(opsRequests.tenantId, tenantId),
        eq(opsRequests.workStatus, 'en_revision'),
        eq(opsRequests.reviewerKey, 'owner')
      )
    )
    .orderBy(asc(opsRequests.workStatusAt));

  const blockers = await db
    .select({ blocker: opsBlockers, req: opsRequests })
    .from(opsBlockers)
    .innerJoin(opsRequests, eq(opsBlockers.requestId, opsRequests.id))
    .where(and(eq(opsBlockers.tenantId, tenantId), eq(opsBlockers.status, 'escalado')))
    .orderBy(asc(opsBlockers.createdAt));

  const items: InboxItem[] = [
    ...reviews.map((r) => ({ kind: 'review' as const, since: r.workStatusAt, req: r })),
    ...blockers.map((x) => ({ kind: 'blocker' as const, since: x.blocker.createdAt, req: x.req, blocker: x.blocker }))
  ];
  return items.sort((a, b) => a.since.getTime() - b.since.getTime());
}

export function waitLabel(since: Date, now = new Date()): string {
  const min = Math.max(0, Math.round((now.getTime() - since.getTime()) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ${min % 60} min`;
  return `${Math.floor(h / 24)} días`;
}

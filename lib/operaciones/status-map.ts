// Correspondencia entre el flujo de la herramienta (en curso / en revisión / completado) y los
// estados reales de cada lista de ClickUp. Los estados salen de la caché (ops_clickup_lists.statuses);
// la propuesta se calcula por nombre y es editable en Ajustes. Si una lista no tiene el equivalente
// (null), el flujo solo deja un comentario en la tarea.
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsClickupLists, opsStatusMap } from '@/lib/db/schema';

export type StatusLike = { status: string; type: string };
export type MapValues = { inProgress: string | null; inReview: string | null; done: string | null };

const norm = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

const IN_PROGRESS = /^(in progress|en progreso|en curso|doing|working|wip|haciendo|trabajando)/;
const IN_REVIEW = /(review|revision|revisar|qa\b|aprobacion|pending approval|por aprobar|validacion)/;
const DONE_NAME = /^(complete|completed|completado|completada|done|hecho|hecha|finalizado|finalizada|terminado|terminada|cerrado|cerrada|closed|entregado|entregada)/;

// Propuesta por nombre; para "completado" se acepta también un estado de tipo done/closed.
export function proposeStatuses(statuses: StatusLike[]): MapValues {
  const find = (re: RegExp) => statuses.find((s) => re.test(norm(s.status)))?.status ?? null;
  const done =
    find(DONE_NAME) ??
    statuses.find((s) => s.type === 'done')?.status ??
    statuses.find((s) => s.type === 'closed')?.status ??
    null;
  return { inProgress: find(IN_PROGRESS), inReview: find(IN_REVIEW), done };
}

// Crea/actualiza la propuesta de todas las listas con estados conocidos, salvo las editadas a mano.
export async function proposeStatusMaps(tenantId: string): Promise<void> {
  const lists = await db.select().from(opsClickupLists).where(eq(opsClickupLists.tenantId, tenantId));
  const existing = await db.select().from(opsStatusMap).where(eq(opsStatusMap.tenantId, tenantId));
  const byList = new Map(existing.map((m) => [m.clickupListId, m]));
  for (const l of lists) {
    if (!l.statuses || l.statuses.length === 0) continue;
    const cur = byList.get(l.clickupListId);
    if (cur?.edited) continue;
    const p = proposeStatuses(l.statuses);
    if (cur && cur.inProgressStatus === p.inProgress && cur.inReviewStatus === p.inReview && cur.doneStatus === p.done) {
      continue;
    }
    await db
      .insert(opsStatusMap)
      .values({
        tenantId,
        clickupListId: l.clickupListId,
        inProgressStatus: p.inProgress,
        inReviewStatus: p.inReview,
        doneStatus: p.done
      })
      .onConflictDoUpdate({
        target: [opsStatusMap.tenantId, opsStatusMap.clickupListId],
        set: { inProgressStatus: p.inProgress, inReviewStatus: p.inReview, doneStatus: p.done }
      });
  }
}

export async function getStatusMapFor(tenantId: string, listId: string): Promise<MapValues> {
  const [m] = await db
    .select()
    .from(opsStatusMap)
    .where(and(eq(opsStatusMap.tenantId, tenantId), eq(opsStatusMap.clickupListId, listId)))
    .limit(1);
  return { inProgress: m?.inProgressStatus ?? null, inReview: m?.inReviewStatus ?? null, done: m?.doneStatus ?? null };
}

// Para Ajustes: las listas con exactamente los mismos estados se agrupan (casi todas lo son).
export type StatusGroup = {
  key: string;
  statuses: string[];
  listIds: string[];
  listNames: string[];
  values: MapValues;
  edited: boolean;
};

export async function getStatusGroups(tenantId: string): Promise<StatusGroup[]> {
  const lists = await db.select().from(opsClickupLists).where(eq(opsClickupLists.tenantId, tenantId));
  const maps = await db.select().from(opsStatusMap).where(eq(opsStatusMap.tenantId, tenantId));
  const byList = new Map(maps.map((m) => [m.clickupListId, m]));
  const groups = new Map<string, StatusGroup>();
  for (const l of lists) {
    if (!l.statuses || l.statuses.length === 0) continue;
    const names = l.statuses.map((s) => s.status);
    const m = byList.get(l.clickupListId);
    const values = { inProgress: m?.inProgressStatus ?? null, inReview: m?.inReviewStatus ?? null, done: m?.doneStatus ?? null };
    // Dos listas con los mismos estados pero distinta correspondencia no se mezclan.
    const key = `${names.join('|')}::${values.inProgress}|${values.inReview}|${values.done}`;
    const g = groups.get(key) ?? { key, statuses: names, listIds: [], listNames: [], values, edited: false };
    g.listIds.push(l.clickupListId);
    g.listNames.push(l.folderName ? `${l.folderName} / ${l.name}` : l.name);
    g.edited = g.edited || Boolean(m?.edited);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.listIds.length - a.listIds.length);
}

export async function saveStatusGroup(tenantId: string, listIds: string[], v: MapValues): Promise<void> {
  for (const id of listIds) {
    await db
      .insert(opsStatusMap)
      .values({
        tenantId,
        clickupListId: id,
        inProgressStatus: v.inProgress,
        inReviewStatus: v.inReview,
        doneStatus: v.done,
        edited: true
      })
      .onConflictDoUpdate({
        target: [opsStatusMap.tenantId, opsStatusMap.clickupListId],
        set: { inProgressStatus: v.inProgress, inReviewStatus: v.inReview, doneStatus: v.done, edited: true }
      });
  }
}

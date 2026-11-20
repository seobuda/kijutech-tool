// Mis tareas (20 nov 2026): las tareas de UNA persona con un tipo PROPIO (WorkTask), no con los tipos de ClickUp.
// La herramienta sustituirá a ClickUp en 2027: entonces esta capa leerá de una tabla de tareas propia y las pantallas
// (Mis tareas, el Inicio de cada persona) no tendrán que cambiar. Hoy junta dos fuentes:
//  - ClickUp: UNA consulta de workspace filtrada por la persona y por fecha (vencidas, hoy y los próximos 14 días),
//    con caché corta por persona; nunca lista por lista. Lo «sin fecha» sale del recuento en segundo plano de Equipo hoy.
//  - Los encargos de la herramienta (ops_requests): su estado de trabajo (devuelto, en revisión, bloqueado…), que
//    ClickUp no tiene. Se enlazan por el id de la tarea de ClickUp.
import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsRequests } from '@/lib/db/schema';
import { getClickUpToken } from '@/lib/operaciones/queries';
import { fetchDueTasks, todayRange, type OpsTask } from '@/lib/operaciones/clickup';
import { getStructure } from '@/lib/operaciones/structure';
import { getNoDateCounts } from '@/lib/operaciones/team-today';

export type WorkStatus = 'asignado' | 'en_curso' | 'bloqueado' | 'en_revision' | 'devuelto' | 'completado';

/** Una tarea de la persona, independiente de dónde viva hoy (ClickUp) o mañana (tabla propia). */
export type WorkTask = {
  id: string;
  title: string;
  dueMs: number | null;
  clientName: string | null;
  listName: string | null;
  /** Estado en ClickUp (texto libre de cada lista). Desaparecerá con ClickUp. */
  externalStatus: string | null;
  /** Enlace a la tarea en ClickUp mientras exista. */
  externalUrl: string | null;
  /** Encargo de la herramienta enlazado (si lo hay) y su estado de trabajo. */
  requestId: string | null;
  workStatus: WorkStatus | null;
};

export type MyTasks = {
  overdue: WorkTask[];
  today: WorkTask[];
  /** Mañana y los 6 días siguientes. */
  week: WorkTask[];
  /** Del día 8 al 14. */
  later: WorkTask[];
  /** Tareas abiertas sin fecha (recuento de Equipo hoy; null mientras se calcula). */
  noDateCount: number | null;
  truncated: boolean;
  fetchedAt: number;
  requests: number;
};

export const HORIZON_DAYS = 14;
const CACHE_MS = 2 * 60 * 1000;
const DAY = 86_400_000;

type Entry = { at: number; data: MyTasks };
const g = globalThis as unknown as { __opsMyTasks?: Map<string, Entry>; __opsMyTasksInflight?: Map<string, Promise<Entry>> };
const cache = (g.__opsMyTasks ??= new Map());
const inflight = (g.__opsMyTasksInflight ??= new Map());

/** Reparte tareas en vencidas / hoy / semana / más adelante (puro, para probarlo). */
export function bucketTasks(tasks: WorkTask[], now = new Date()): Pick<MyTasks, 'overdue' | 'today' | 'week' | 'later'> {
  const { start, end } = todayRange(now);
  const out = { overdue: [] as WorkTask[], today: [] as WorkTask[], week: [] as WorkTask[], later: [] as WorkTask[] };
  for (const t of tasks) {
    if (t.dueMs === null) continue;
    if (t.dueMs < start) out.overdue.push(t);
    else if (t.dueMs < end) out.today.push(t);
    else if (t.dueMs < end + 7 * DAY) out.week.push(t);
    else out.later.push(t);
  }
  const byDue = (a: WorkTask, b: WorkTask) => (a.dueMs ?? 0) - (b.dueMs ?? 0);
  for (const list of Object.values(out)) list.sort(byDue);
  return out;
}

/** Une una tarea de ClickUp con su encargo de la herramienta (si lo hay). */
export function toWorkTask(t: OpsTask, req: { id: string; workStatus: string; clientName: string | null } | undefined): WorkTask {
  return {
    id: t.id,
    title: t.name,
    dueMs: t.dueDate,
    clientName: req?.clientName ?? null,
    listName: t.listName || null,
    externalStatus: t.status || null,
    externalUrl: t.url || null,
    requestId: req?.id ?? null,
    workStatus: (req?.workStatus as WorkStatus | undefined) ?? null
  };
}

async function load(tenantId: string, clickupUserId: string): Promise<Entry> {
  const [conn, structure] = await Promise.all([getClickUpToken(tenantId), getStructure(tenantId)]);
  if (!conn) throw new Error('ClickUp no está conectado');
  if (!structure.workspaceId) throw new Error('La estructura de ClickUp no está sincronizada');
  const spaceIds = structure.spaces.filter((s) => s.selected).map((s) => s.id);
  const { end } = todayRange();
  const res = spaceIds.length
    ? await fetchDueTasks(conn.token, structure.workspaceId, { spaceIds, assigneeIds: [Number(clickupUserId)], dueBeforeMs: end + (HORIZON_DAYS - 1) * DAY })
    : { tasks: [], truncated: false, requests: 0 };

  const mine = res.tasks.filter((t) => t.assigneeIds.map(String).includes(clickupUserId));
  const ids = mine.map((t) => t.id);
  const reqs = ids.length
    ? await db
        .select({ id: opsRequests.id, taskId: opsRequests.clickupTaskId, workStatus: opsRequests.workStatus, clientName: opsRequests.clientName })
        .from(opsRequests)
        .where(and(eq(opsRequests.tenantId, tenantId), inArray(opsRequests.clickupTaskId, ids)))
    : [];
  const reqOf = new Map(reqs.map((r) => [r.taskId, r]));
  const tasks = mine.map((t) => toWorkTask(t, reqOf.get(t.id)));

  const nd = getNoDateCounts(tenantId);
  return {
    at: Date.now(),
    data: {
      ...bucketTasks(tasks),
      noDateCount: nd.status === 'ready' ? (nd.counts[clickupUserId] ?? 0) : null,
      truncated: res.truncated,
      fetchedAt: Date.now(),
      requests: res.requests
    }
  };
}

/** Tareas de la persona (vencidas, hoy, 7 días y hasta 14), con caché de 2 minutos por persona. */
export async function getMyTasks(tenantId: string, clickupUserId: string, opts: { force?: boolean } = {}): Promise<MyTasks & { cached: boolean }> {
  const key = `${tenantId}:${clickupUserId}`;
  const hit = cache.get(key);
  if (!opts.force && hit && Date.now() - hit.at < CACHE_MS) return { ...hit.data, requests: 0, cached: true };
  let p = inflight.get(key);
  if (!p) {
    p = load(tenantId, clickupUserId).finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  const entry = await p;
  cache.set(key, entry);
  return { ...entry.data, cached: false };
}

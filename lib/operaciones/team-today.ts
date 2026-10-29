// Datos de "Equipo hoy". Nunca se piden lista por lista ni persona por persona:
//  - Vencidas + de hoy: UNA consulta de workspace filtrada por fecha, espacios
//    seleccionados y responsables. Caché de 2 minutos en memoria.
//  - "Sin fecha": ClickUp no tiene filtro para eso, así que hay que recorrer las
//    tareas abiertas de los espacios seleccionados. Se calcula EN SEGUNDO PLANO
//    cada 30 minutos y se muestra después de pintar la página.
import { getClickUpToken } from '@/lib/operaciones/queries';
import {
  countTasksWithoutDate,
  fetchDueTasks,
  todayRange,
  type OpsTask
} from '@/lib/operaciones/clickup';
import { getStructure } from '@/lib/operaciones/structure';

export const TEAM_CACHE_MS = 2 * 60 * 1000;
export const NO_DATE_CACHE_MS = 30 * 60 * 1000;
const NO_DATE_RETRY_AFTER_ERROR_MS = 2 * 60 * 1000;

export type TeamMemberToday = {
  member: { id: string; username: string };
  overdue: OpsTask[];
  today: OpsTask[];
};

export type TeamTodayData = {
  members: TeamMemberToday[];
  truncated: boolean;
  fetchedAt: number;
  requests: number; // peticiones a ClickUp que costó esta carga (0 si salió de la caché)
  cached: boolean;
  workspaceName: string | null;
  spacesCount: number;
};

type TeamEntry = { at: number; data: Omit<TeamTodayData, 'cached' | 'requests'>; requests: number };
type NoDateEntry = {
  counts?: Record<string, number>;
  computedAt?: number;
  running?: Promise<void>;
  error?: string;
  errorAt?: number;
};

// globalThis: las páginas y las acciones de servidor pueden cargar el módulo por separado.
const g = globalThis as unknown as {
  __opsTeam?: Map<string, TeamEntry>;
  __opsTeamInflight?: Map<string, Promise<TeamEntry>>;
  __opsNoDate?: Map<string, NoDateEntry>;
};
const teamCache = (g.__opsTeam ??= new Map());
const teamInflight = (g.__opsTeamInflight ??= new Map());
const noDateCache = (g.__opsNoDate ??= new Map());

export function clearTeamTodayCache(tenantId: string) {
  teamCache.delete(tenantId);
}

async function loadTeamToday(tenantId: string): Promise<TeamEntry> {
  const [conn, structure] = await Promise.all([getClickUpToken(tenantId), getStructure(tenantId)]);
  if (!conn) throw new Error('ClickUp no está conectado (falta el token en Ajustes)');
  if (!structure.syncedAt || !structure.workspaceId) {
    throw new Error('La estructura de ClickUp todavía no está sincronizada. Ve a Ajustes → «Actualizar desde ClickUp».');
  }

  const spaceIds = structure.spaces.filter((s) => s.selected).map((s) => s.id);
  const members = structure.members;
  const { start, end } = todayRange();

  const byMember = new Map<string, TeamMemberToday>(
    members.map((m) => [m.id, { member: m, overdue: [], today: [] }])
  );

  let truncated = false;
  let requests = 0;
  if (spaceIds.length > 0 && members.length > 0) {
    const res = await fetchDueTasks(conn.token, structure.workspaceId, {
      spaceIds,
      assigneeIds: members.map((m) => Number(m.id)),
      dueBeforeMs: end
    });
    truncated = res.truncated;
    requests = res.requests;
    for (const t of res.tasks) {
      if (t.dueDate === null) continue;
      for (const a of t.assigneeIds) {
        const bucket = byMember.get(String(a));
        if (!bucket) continue;
        if (t.dueDate < start) bucket.overdue.push(t);
        else if (t.dueDate < end) bucket.today.push(t);
      }
    }
  }

  for (const b of byMember.values()) b.overdue.sort((x, y) => (x.dueDate ?? 0) - (y.dueDate ?? 0));

  return {
    at: Date.now(),
    requests,
    data: {
      members: [...byMember.values()],
      truncated,
      fetchedAt: Date.now(),
      workspaceName: structure.workspaceName,
      spacesCount: spaceIds.length
    }
  };
}

export async function getTeamToday(
  tenantId: string,
  opts: { force?: boolean } = {}
): Promise<TeamTodayData> {
  const hit = teamCache.get(tenantId);
  if (!opts.force && hit && Date.now() - hit.at < TEAM_CACHE_MS) {
    return { ...hit.data, requests: 0, cached: true };
  }

  // Si ya hay una carga en marcha (otro clic), se espera a esa en vez de repetirla.
  let inflight = teamInflight.get(tenantId);
  if (!inflight) {
    inflight = loadTeamToday(tenantId).finally(() => teamInflight.delete(tenantId));
    teamInflight.set(tenantId, inflight);
  }
  const entry = await inflight;
  teamCache.set(tenantId, entry);
  return { ...entry.data, requests: entry.requests, cached: false };
}

// ---------------------------------------------------------------------------
// "Sin fecha"
// ---------------------------------------------------------------------------

export type NoDateResult =
  | { status: 'ready'; counts: Record<string, number>; computedAt: number; refreshing: boolean }
  | { status: 'computing' }
  | { status: 'error'; error: string };

async function computeNoDate(tenantId: string, entry: NoDateEntry) {
  try {
    const [conn, structure] = await Promise.all([getClickUpToken(tenantId), getStructure(tenantId)]);
    if (!conn || !structure.workspaceId) throw new Error('La estructura de ClickUp no está sincronizada');
    const spaceIds = structure.spaces.filter((s) => s.selected).map((s) => s.id);
    if (spaceIds.length === 0) {
      entry.counts = {};
    } else {
      const res = await countTasksWithoutDate(conn.token, structure.workspaceId, { spaceIds });
      entry.counts = res.counts;
    }
    entry.computedAt = Date.now();
    entry.error = undefined;
  } catch (e) {
    entry.error = e instanceof Error ? e.message : 'Error desconocido';
    entry.errorAt = Date.now();
  } finally {
    entry.running = undefined;
  }
}

// Devuelve lo que haya (aunque sea de hace más de 30 min) y, si está caducado,
// lanza el recálculo en segundo plano sin esperar.
export function getNoDateCounts(tenantId: string): NoDateResult {
  let entry = noDateCache.get(tenantId);
  if (!entry) {
    entry = {};
    noDateCache.set(tenantId, entry);
  }

  const fresh = entry.computedAt !== undefined && Date.now() - entry.computedAt < NO_DATE_CACHE_MS;
  const canRetry = !entry.errorAt || Date.now() - entry.errorAt > NO_DATE_RETRY_AFTER_ERROR_MS;
  if (!fresh && !entry.running && canRetry) {
    entry.running = computeNoDate(tenantId, entry);
  }

  if (entry.counts && entry.computedAt) {
    return { status: 'ready', counts: entry.counts, computedAt: entry.computedAt, refreshing: !fresh };
  }
  if (entry.error && !entry.running) return { status: 'error', error: entry.error };
  return { status: 'computing' };
}

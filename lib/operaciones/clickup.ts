// Cliente de la API v2 de ClickUp. Autenticación con token personal: va en la
// cabecera Authorization SIN prefijo "Bearer".
//
// REGLA (ver CLAUDE.md): toda llamada a ClickUp pasa por cuFetch(), que
//  - cuenta las peticiones por minuto (el límite del token es 100/min) y espera
//    antes de seguir cuando se acerca al 80 %;
//  - reintenta con espera si ClickUp responde 429;
//  - registra cada petición en ops_clickup_requests (tabla de Ajustes).
// Las pantallas no deben llamar aquí para pintarse: usan la caché de la base de
// datos (lib/operaciones/structure.ts) y consultas agrupadas.
import { lt } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsClickupRequests } from '@/lib/db/schema';

const BASE_URL = 'https://api.clickup.com/api/v2';

// Zona horaria con la que se decide qué es "hoy" para las fechas de entrega.
export const OPS_TIMEZONE = 'Europe/Madrid';

// Tope de seguridad de páginas (100 tareas por página).
const MAX_TASK_PAGES = 30;

// Ninguna llamada a ClickUp puede quedarse esperando indefinidamente.
const CLICKUP_TIMEOUT_MS = 20_000;

// --- Límite de peticiones ---------------------------------------------------
export const CLICKUP_RATE_LIMIT = 100; // por minuto y token
const SOFT_LIMIT = Math.floor(CLICKUP_RATE_LIMIT * 0.8); // se espera al llegar a 80
const WINDOW_MS = 60_000;
const MAX_429_RETRIES = 3;
const LOG_RETENTION_MS = 24 * 60 * 60 * 1000;
const CLEANUP_EVERY_MS = 10 * 60 * 1000;

// Estado compartido por todo el proceso (globalThis: las acciones de servidor y
// las páginas pueden cargar este módulo por separado).
type ClickUpState = {
  windows: Map<string, number[]>; // token → instantes de las peticiones del último minuto
  tokenTenant: Map<string, string>; // token → cuenta (para el registro)
  lastCleanup: number;
};
const g = globalThis as unknown as { __opsClickUp?: ClickUpState };
const state: ClickUpState = (g.__opsClickUp ??= {
  windows: new Map(),
  tokenTenant: new Map(),
  lastCleanup: 0
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Asocia un token con su cuenta, para poder registrar sus peticiones.
export function registerTokenTenant(token: string, tenantId: string) {
  state.tokenTenant.set(token, tenantId);
}

// Peticiones hechas con ese token en el último minuto.
export function requestsInLastMinute(token: string): number {
  const now = Date.now();
  return (state.windows.get(token) ?? []).filter((t) => now - t < WINDOW_MS).length;
}

// Espera hasta que haya hueco por debajo del 80 % del límite, y reserva el hueco.
async function acquireSlot(token: string): Promise<void> {
  for (;;) {
    const now = Date.now();
    const w = (state.windows.get(token) ?? []).filter((t) => now - t < WINDOW_MS);
    if (w.length < SOFT_LIMIT) {
      w.push(now);
      state.windows.set(token, w);
      return;
    }
    state.windows.set(token, w);
    // Espera a que salga del minuto la petición más antigua.
    await sleep(Math.min(WINDOW_MS - (now - w[0]) + 50, 10_000));
  }
}

function normalizeEndpoint(url: string): string {
  return url
    .replace(BASE_URL, '')
    .replace(/\?.*$/, '')
    .replace(/\d{5,}/g, '{id}')
    .replace(/\/[0-9a-z]{6,9}(?=\/|$)/g, (m) => (/^\/[0-9]/.test(m) ? '/{id}' : m))
    .slice(0, 200);
}

function logRequest(token: string, method: string, url: string, status: number, durationMs: number) {
  const tenantId = state.tokenTenant.get(token);
  if (!tenantId) return;
  db.insert(opsClickupRequests)
    .values({ tenantId, method, endpoint: normalizeEndpoint(url), status, durationMs })
    .then(() => {
      // Los registros de más de 24 h se borran solos (como mucho cada 10 min).
      if (Date.now() - state.lastCleanup > CLEANUP_EVERY_MS) {
        state.lastCleanup = Date.now();
        return db
          .delete(opsClickupRequests)
          .where(lt(opsClickupRequests.requestedAt, new Date(Date.now() - LOG_RETENTION_MS)));
      }
    })
    .catch(() => {
      // el registro es secundario: nunca debe romper una llamada a ClickUp
    });
}

export class ClickUpError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

function retryDelayMs(res: Response, attempt: number): number {
  const retryAfter = Number(res.headers.get('retry-after'));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, 30_000);
  const reset = Number(res.headers.get('x-ratelimit-reset')); // epoch en segundos
  if (Number.isFinite(reset) && reset > 1e9) {
    const ms = reset * 1000 - Date.now();
    if (ms > 0) return Math.min(ms + 250, 30_000);
  }
  return Math.min(5_000 * (attempt + 1), 20_000);
}

async function cuFetch(url: string, init: RequestInit): Promise<Response> {
  const headers = (init.headers ?? {}) as Record<string, string>;
  const token = headers.Authorization ?? '';
  const method = init.method ?? 'GET';

  for (let attempt = 0; ; attempt++) {
    await acquireSlot(token);
    const t0 = Date.now();
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(CLICKUP_TIMEOUT_MS), ...init });
    } catch (e) {
      logRequest(token, method, url, 0, Date.now() - t0);
      if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
        throw new ClickUpError('ClickUp no responde (tiempo de espera agotado). Inténtalo de nuevo.');
      }
      throw new ClickUpError(
        `No se pudo conectar con ClickUp${e instanceof Error ? `: ${e.message}` : ''}`
      );
    }
    logRequest(token, method, url, res.status, Date.now() - t0);

    // Límite superado: se espera y se reintenta en vez de fallar.
    if (res.status === 429 && attempt < MAX_429_RETRIES) {
      await sleep(retryDelayMs(res, attempt));
      continue;
    }
    return res;
  }
}

async function errorFrom(res: Response, what = 'ClickUp respondió'): Promise<ClickUpError> {
  let detail = '';
  try {
    detail = (await res.json())?.err ?? '';
  } catch {}
  const msg =
    res.status === 401
      ? 'Token no válido o revocado (ClickUp respondió 401)'
      : res.status === 429
        ? 'ClickUp sigue limitando las peticiones (429) tras varios reintentos. Espera un minuto.'
        : `${what} ${res.status}${detail ? `: ${detail}` : ''}`;
  return new ClickUpError(msg, res.status);
}

async function cu<T>(token: string, path: string): Promise<T> {
  const res = await cuFetch(`${BASE_URL}${path}`, {
    headers: { Authorization: token },
    cache: 'no-store'
  });
  if (!res.ok) throw await errorFrom(res);
  return res.json() as Promise<T>;
}

async function cuSend<T>(token: string, path: string, body: unknown): Promise<T> {
  const res = await cuFetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store'
  });
  if (!res.ok) throw await errorFrom(res);
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Estructura (solo la usa la sincronización de la caché)
// ---------------------------------------------------------------------------

export type ClickUpMember = {
  id: number;
  username: string;
  email: string;
  initials?: string;
  color?: string | null;
};

export type ClickUpWorkspace = {
  id: string;
  name: string;
  members: ClickUpMember[];
};

export async function getWorkspaces(token: string): Promise<ClickUpWorkspace[]> {
  const data = await cu<{
    teams: { id: string; name: string; members: { user: ClickUpMember }[] }[];
  }>(token, '/team');
  return data.teams.map((t) => ({
    id: t.id,
    name: t.name,
    members: t.members.map((m) => m.user)
  }));
}

export async function getMe(token: string): Promise<{ id: number; username: string }> {
  const data = await cu<{ user: { id: number; username: string } }>(token, '/user');
  return data.user;
}

// clientFieldId: campo personalizado "Cliente" de la lista (solo viene de la caché de estructura).
export type ClickUpList = { id: string; name: string; folder: string | null; clientFieldId?: string | null };
export type ClickUpSpaceWithLists = { id: string; name: string; lists: ClickUpList[] };

// Espacios del workspace (sin sus listas): 1 petición.
export async function getSpacesBasic(
  token: string,
  workspaceId: string
): Promise<{ id: string; name: string }[]> {
  const { spaces } = await cu<{ spaces: { id: string; name: string }[] }>(
    token,
    `/team/${workspaceId}/space?archived=false`
  );
  return spaces.map((s) => ({ id: s.id, name: s.name }));
}

// Listas reales de un espacio (las sueltas y las de dentro de carpetas): 2 peticiones.
export async function getSpaceLists(token: string, spaceId: string): Promise<ClickUpList[]> {
  const [folderless, folders] = await Promise.all([
    cu<{ lists: { id: string; name: string }[] }>(token, `/space/${spaceId}/list?archived=false`),
    cu<{ folders: { id: string; name: string; lists: { id: string; name: string }[] }[] }>(
      token,
      `/space/${spaceId}/folder?archived=false`
    )
  ]);
  return [
    ...folderless.lists.map((l) => ({ id: l.id, name: l.name, folder: null })),
    ...folders.folders.flatMap((f) => f.lists.map((l) => ({ id: l.id, name: l.name, folder: f.name })))
  ];
}

// ---------------------------------------------------------------------------
// Adjuntos
// ---------------------------------------------------------------------------

// Adjunta un archivo a una tarea (multipart; el boundary lo pone fetch).
export async function attachFileToTask(
  token: string,
  taskId: string,
  file: { filename: string; mimeType: string; data: Buffer }
): Promise<void> {
  const form = new FormData();
  form.append(
    'attachment',
    new Blob([new Uint8Array(file.data)], { type: file.mimeType }),
    file.filename
  );
  const res = await cuFetch(`${BASE_URL}/task/${taskId}/attachment`, {
    signal: AbortSignal.timeout(60_000), // subir un archivo puede tardar más
    method: 'POST',
    headers: { Authorization: token },
    body: form,
    cache: 'no-store'
  });
  if (!res.ok) throw await errorFrom(res, 'ClickUp no aceptó el adjunto');
}

// ---------------------------------------------------------------------------
// Tareas: consultas agrupadas a nivel de workspace
// ---------------------------------------------------------------------------

type RawTask = {
  id: string;
  name: string;
  url: string;
  due_date: string | null;
  status?: { status: string; type?: string };
  list?: { id: string; name: string };
  assignees: { id: number }[];
};

export type OpsTask = {
  id: string;
  name: string;
  url: string;
  dueDate: number | null;
  status: string;
  listName: string;
  assigneeIds: number[];
};

function toOpsTask(t: RawTask): OpsTask {
  return {
    id: t.id,
    name: t.name,
    url: t.url,
    dueDate: t.due_date ? Number(t.due_date) : null,
    status: t.status?.status ?? '',
    listName: t.list?.name ?? '—',
    assigneeIds: t.assignees.map((a) => a.id)
  };
}

const isClosed = (t: RawTask) => t.status?.type === 'closed' || t.status?.type === 'done';

// Inicio y fin (ms) del día actual en OPS_TIMEZONE.
export function todayRange(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: OPS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const [y, m, d] = fmt.format(now).split('-').map(Number);
  // Desfase de la zona en ese día = (hora local interpretada como UTC) - UTC real.
  const asUtc = (hh: number) => Date.UTC(y, m - 1, d, hh, 0, 0);
  const offsetAt = (ts: number) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: OPS_TIMEZONE,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).formatToParts(new Date(ts));
    const gg = (t: string) => Number(parts.find((p) => p.type === t)!.value);
    return Date.UTC(gg('year'), gg('month') - 1, gg('day'), gg('hour'), gg('minute'), gg('second')) - ts;
  };
  const start = asUtc(0) - offsetAt(asUtc(12));
  return { start, end: start + 24 * 60 * 60 * 1000 };
}

function taskQuery(opts: { spaceIds: string[]; assigneeIds?: number[]; extra?: string; page: number }) {
  const q = new URLSearchParams();
  q.set('page', String(opts.page));
  q.set('subtasks', 'true');
  q.set('include_closed', 'false');
  for (const s of opts.spaceIds) q.append('space_ids[]', s);
  for (const a of opts.assigneeIds ?? []) q.append('assignees[]', String(a));
  return `${q.toString()}${opts.extra ? `&${opts.extra}` : ''}`;
}

// UNA consulta de workspace (paginada de 100 en 100) con todo lo vencido o de hoy:
// filtrada por fecha (due_date_lt = fin de hoy), espacios seleccionados y
// responsables. Las tareas sin fecha de entrega no entran por el filtro.
export async function fetchDueTasks(
  token: string,
  workspaceId: string,
  opts: { spaceIds: string[]; assigneeIds: number[]; dueBeforeMs: number }
): Promise<{ tasks: OpsTask[]; truncated: boolean; requests: number }> {
  const tasks: OpsTask[] = [];
  let requests = 0;
  for (let page = 0; ; page++) {
    if (page >= MAX_TASK_PAGES) return { tasks, truncated: true, requests };
    const res = await cu<{ tasks: RawTask[] }>(
      token,
      `/team/${workspaceId}/task?${taskQuery({
        spaceIds: opts.spaceIds,
        assigneeIds: opts.assigneeIds,
        extra: `due_date_lt=${opts.dueBeforeMs}`,
        page
      })}`
    );
    requests++;
    tasks.push(...res.tasks.filter((t) => !isClosed(t)).map(toOpsTask));
    if (res.tasks.length < 100) return { tasks, truncated: false, requests };
  }
}

// Cuántas tareas abiertas sin fecha de entrega tiene cada persona. ClickUp no
// tiene filtro de "sin fecha", así que hay que recorrer las tareas abiertas de
// los espacios seleccionados: por eso se hace aparte, en segundo plano y cada
// 30 minutos (ver lib/operaciones/team-today.ts).
export async function countTasksWithoutDate(
  token: string,
  workspaceId: string,
  opts: { spaceIds: string[] }
): Promise<{ counts: Record<string, number>; truncated: boolean; requests: number }> {
  const counts: Record<string, number> = {};
  let requests = 0;
  for (let page = 0; ; page++) {
    if (page >= MAX_TASK_PAGES) return { counts, truncated: true, requests };
    const res = await cu<{ tasks: RawTask[] }>(
      token,
      `/team/${workspaceId}/task?${taskQuery({ spaceIds: opts.spaceIds, page })}`
    );
    requests++;
    for (const t of res.tasks) {
      if (isClosed(t) || t.due_date) continue;
      for (const a of t.assignees) counts[String(a.id)] = (counts[String(a.id)] ?? 0) + 1;
    }
    if (res.tasks.length < 100) return { counts, truncated: false, requests };
  }
}

// ---------------------------------------------------------------------------
// Escritura: crear encargos como tareas de ClickUp
// ---------------------------------------------------------------------------

// Las 12:00 (ms) de una fecha YYYY-MM-DD en OPS_TIMEZONE. Al mediodía de Madrid
// es la mañana en República Dominicana (UTC-4), así que la fecha cae en el
// MISMO día en ambos sitios. ClickUp recibe la fecha sin hora (due_date_time=false).
export function madridNoonMs(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  const wallAsUtc = Date.UTC(y, m - 1, d, 12, 0, 0);
  // Desfase de la zona en un instante concreto (en ms).
  const offsetAt = (ts: number) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: OPS_TIMEZONE,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).formatToParts(new Date(ts));
    const gg = (t: string) => Number(parts.find((p) => p.type === t)!.value);
    return Date.UTC(gg('year'), gg('month') - 1, gg('day'), gg('hour'), gg('minute'), gg('second')) - ts;
  };
  // Dos pasadas: la segunda recalcula el desfase en el propio instante y así
  // se respetan los cambios de hora (CET/CEST).
  const first = wallAsUtc - offsetAt(wallAsUtc);
  return wallAsUtc - offsetAt(first);
}

export type CreateTaskInput = {
  name: string;
  description: string;
  assigneeId?: number | null;
  dueDate?: string | null; // YYYY-MM-DD
  priority?: number | null; // 1 urgente … 4 baja
  // Campos personalizados; en un desplegable, value = id de la opción.
  customFields?: { id: string; value: string }[];
};

export async function createTask(
  token: string,
  listId: string,
  input: CreateTaskInput
): Promise<{ id: string; url: string }> {
  const body: Record<string, unknown> = {
    name: input.name,
    markdown_description: input.description
  };
  if (input.assigneeId) body.assignees = [input.assigneeId];
  if (input.dueDate) {
    body.due_date = madridNoonMs(input.dueDate);
    body.due_date_time = false;
  }
  if (input.priority) body.priority = input.priority;
  if (input.customFields?.length) body.custom_fields = input.customFields;

  const task = await cuSend<{ id: string; url: string }>(token, `/list/${listId}/task`, body);
  return { id: task.id, url: task.url };
}

// Busca en la lista (abiertas y cerradas, subtareas incluidas) una tarea cuya
// descripción contenga la marca. Sirve para no duplicar al reintentar.
export async function findTaskByMarker(
  token: string,
  listId: string,
  marker: string
): Promise<{ id: string; url: string } | null> {
  for (let page = 0; page < MAX_TASK_PAGES; page++) {
    const { tasks } = await cu<{
      tasks: { id: string; url: string; description?: string; text_content?: string; markdown_description?: string }[];
    }>(
      token,
      `/list/${listId}/task?page=${page}&include_closed=true&subtasks=true&include_markdown_description=true`
    );
    const hit = tasks.find(
      (t) =>
        t.description?.includes(marker) ||
        t.text_content?.includes(marker) ||
        t.markdown_description?.includes(marker)
    );
    if (hit) return { id: hit.id, url: hit.url };
    if (tasks.length < 100) break;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Campos personalizados
// ---------------------------------------------------------------------------

export type ClickUpCustomField = {
  id: string;
  name: string;
  type: string; // drop_down, labels, short_text, text, …
  options: { id: string; label: string }[];
};

// Campos personalizados accesibles de una lista: 1 petición (ClickUp no tiene una
// consulta agrupada por workspace para esto).
export async function getListFields(token: string, listId: string): Promise<ClickUpCustomField[]> {
  const { fields } = await cu<{
    fields: {
      id: string;
      name: string;
      type: string;
      type_config?: { options?: { id: string; name?: string; label?: string }[] };
    }[];
  }>(token, `/list/${listId}/field`);
  return fields.map((f) => ({
    id: f.id,
    name: f.name,
    type: f.type,
    options: (f.type_config?.options ?? []).map((o) => ({ id: o.id, label: (o.name ?? o.label ?? '').trim() }))
  }));
}

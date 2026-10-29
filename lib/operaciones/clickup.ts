// Cliente mínimo de la API v2 de ClickUp (solo lectura). Autenticación con
// token personal: va en la cabecera Authorization SIN prefijo "Bearer".
const BASE_URL = 'https://api.clickup.com/api/v2';

// Zona horaria con la que se decide qué es "hoy" para las fechas de entrega.
export const OPS_TIMEZONE = 'Europe/Madrid';

// Tope de seguridad de páginas (100 tareas por página) para no agotar el
// límite de peticiones de ClickUp (100/min) en workspaces muy grandes.
const MAX_TASK_PAGES = 30;

export class ClickUpError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

async function cu<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: token },
    cache: 'no-store'
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json())?.err ?? '';
    } catch {}
    const msg =
      res.status === 401
        ? 'Token no válido o revocado (ClickUp respondió 401)'
        : res.status === 429
          ? 'ClickUp está limitando las peticiones (429). Espera un minuto y reintenta'
          : `ClickUp respondió ${res.status}${detail ? `: ${detail}` : ''}`;
    throw new ClickUpError(msg, res.status);
  }
  return res.json() as Promise<T>;
}

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

export type ClickUpList = { id: string; name: string; folder: string | null };
export type ClickUpSpaceWithLists = { id: string; name: string; lists: ClickUpList[] };

export async function getSpacesWithLists(
  token: string,
  workspaceId: string
): Promise<ClickUpSpaceWithLists[]> {
  const { spaces } = await cu<{ spaces: { id: string; name: string }[] }>(
    token,
    `/team/${workspaceId}/space?archived=false`
  );

  return Promise.all(
    spaces.map(async (space) => {
      const [folderless, folders] = await Promise.all([
        cu<{ lists: { id: string; name: string }[] }>(
          token,
          `/space/${space.id}/list?archived=false`
        ),
        cu<{ folders: { id: string; name: string; lists: { id: string; name: string }[] }[] }>(
          token,
          `/space/${space.id}/folder?archived=false`
        )
      ]);
      const lists: ClickUpList[] = [
        ...folderless.lists.map((l) => ({ id: l.id, name: l.name, folder: null })),
        ...folders.folders.flatMap((f) =>
          f.lists.map((l) => ({ id: l.id, name: l.name, folder: f.name }))
        )
      ];
      return { id: space.id, name: space.name, lists };
    })
  );
}

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
};

export type MemberBuckets = {
  member: ClickUpMember;
  overdue: OpsTask[];
  today: OpsTask[];
  noDateCount: number;
};

// Inicio y fin (ms) del día actual en OPS_TIMEZONE.
function todayRange(now = new Date()) {
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
    const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - ts;
  };
  const start = asUtc(0) - offsetAt(asUtc(12));
  return { start, end: start + 24 * 60 * 60 * 1000 };
}

// Todas las tareas abiertas del workspace (subtareas incluidas), repartidas
// por miembro: vencidas, de hoy y número de tareas sin fecha.
export async function getTeamToday(
  token: string,
  workspace: ClickUpWorkspace
): Promise<{ buckets: MemberBuckets[]; truncated: boolean }> {
  const { start, end } = todayRange();
  const byMember = new Map<number, MemberBuckets>(
    workspace.members.map((member) => [
      member.id,
      { member, overdue: [], today: [], noDateCount: 0 }
    ])
  );

  let truncated = false;
  for (let page = 0; ; page++) {
    if (page >= MAX_TASK_PAGES) {
      truncated = true;
      break;
    }
    const { tasks } = await cu<{ tasks: RawTask[] }>(
      token,
      `/team/${workspace.id}/task?page=${page}&subtasks=true&include_closed=false`
    );

    for (const t of tasks) {
      if (t.status?.type === 'closed' || t.status?.type === 'done') continue;
      const due = t.due_date ? Number(t.due_date) : null;
      const task: OpsTask = {
        id: t.id,
        name: t.name,
        url: t.url,
        dueDate: due,
        status: t.status?.status ?? '',
        listName: t.list?.name ?? '—'
      };
      for (const a of t.assignees) {
        const bucket = byMember.get(a.id);
        if (!bucket) continue;
        if (due === null) bucket.noDateCount++;
        else if (due < start) bucket.overdue.push(task);
        else if (due < end) bucket.today.push(task);
      }
    }

    if (tasks.length < 100) break;
  }

  for (const b of byMember.values()) {
    b.overdue.sort((x, y) => (x.dueDate ?? 0) - (y.dueDate ?? 0));
  }
  return { buckets: [...byMember.values()], truncated };
}

// ---------------------------------------------------------------------------
// Escritura: crear encargos como tareas de ClickUp
// ---------------------------------------------------------------------------

async function cuSend<T>(token: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store'
  });
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json())?.err ?? '';
    } catch {}
    throw new ClickUpError(
      res.status === 429
        ? 'ClickUp está limitando las peticiones (429). Espera un minuto y reintenta'
        : `ClickUp respondió ${res.status}${detail ? `: ${detail}` : ''}`,
      res.status
    );
  }
  return res.json() as Promise<T>;
}

export async function getMe(token: string): Promise<{ id: number; username: string }> {
  const data = await cu<{ user: { id: number; username: string } }>(token, '/user');
  return data.user;
}

// Miembros que tienen acceso a una lista concreta (los posibles responsables).
export async function getListMembers(token: string, listId: string): Promise<ClickUpMember[]> {
  const data = await cu<{ members: ClickUpMember[] }>(token, `/list/${listId}/member`);
  return data.members;
}

// Medianoche (ms) de una fecha YYYY-MM-DD en OPS_TIMEZONE. ClickUp recibe la
// fecha sin hora (due_date_time=false), así que basta con que caiga en ese día.
export function madridMidnightMs(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  const wallAsUtc = Date.UTC(y, m - 1, d, 0, 0, 0);
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
    const g = (t: string) => Number(parts.find((p) => p.type === t)!.value);
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - ts;
  };
  // Dos pasadas: la segunda corrige los días en que cambia la hora.
  const first = wallAsUtc - offsetAt(wallAsUtc);
  return wallAsUtc - offsetAt(first);
}

export type CreateTaskInput = {
  name: string;
  description: string;
  assigneeId?: number | null;
  dueDate?: string | null; // YYYY-MM-DD
  priority?: number | null; // 1 urgente … 4 baja
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
    body.due_date = madridMidnightMs(input.dueDate);
    body.due_date_time = false;
  }
  if (input.priority) body.priority = input.priority;

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

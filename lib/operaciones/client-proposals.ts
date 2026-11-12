import 'server-only';

// Completar fichas de clientes con el historial de ClickUp (revisión de autonomía, A3). 50 de 52 fichas estaban en gris
// (sin servicio ni horas) y por eso no generaban alertas ni proponían responsable. Sin IA: UNA consulta agrupada de
// workspace (tareas actualizadas en los últimos 180 días, por el cliente con contador) y reglas del código:
//   - listas habituales: las listas donde más tareas tiene el cliente (al menos 2);
//   - servicios: por el nombre del espacio y de la lista (palabras clave de cada servicio y su etiqueta);
//   - responsable habitual de cada servicio: quien más tareas de ese servicio lleva.
// Solo propone: nada se guarda hasta que alguien pulsa «Aplicar», y nunca sobrescribe lo que ya está en la ficha.
import { getClickUpToken } from '@/lib/operaciones/queries';
import { getStructure, selectedSpaces } from '@/lib/operaciones/structure';
import { fetchWatchTasks, type WatchTask } from '@/lib/operaciones/clickup';
import { taskClientOption } from '@/lib/operaciones/client-activity';
import { getServices, listClients, normText, type ServiceRow } from '@/lib/operaciones/clients';

export const HISTORY_DAYS = 180;
const CACHE_MS = 10 * 60_000;

// Palabras clave por servicio (además de la clave y la etiqueta del propio servicio).
const KEYWORDS: Record<string, string[]> = {
  seo: ['seo', 'contenido', 'contenidos', 'articulo', 'articulos', 'blog', 'posicionamiento', 'keyword'],
  google_ads: ['ads', 'google ads', 'sem', 'ppc', 'campana', 'campanas', 'meta ads', 'publicidad'],
  web: ['web', 'diseno', 'desarrollo', 'landing', 'wordpress', 'pagina'],
  mantenimiento: ['mantenimiento', 'soporte', 'actualizacion', 'actualizaciones'],
  gohighlevel: ['gohighlevel', 'highlevel', 'ghl', 'crm', 'automatizacion', 'automatizaciones']
};

/** Servicio que corresponde a un espacio y una lista por su nombre (o null). Función pura. */
export function serviceFor(spaceName: string, listName: string, services: Pick<ServiceRow, 'key' | 'label'>[]): string | null {
  const text = ` ${normText(`${spaceName} ${listName}`).replace(/[^a-z0-9]+/g, ' ')} `;
  let best: { key: string; score: number } | null = null;
  for (const s of services) {
    const words = [...(KEYWORDS[s.key] ?? []), s.key.replace(/_/g, ' '), normText(s.label)];
    // La lista pesa más que el espacio: se mira primero la lista y luego todo.
    const listText = ` ${normText(listName).replace(/[^a-z0-9]+/g, ' ')} `;
    let score = 0;
    for (const w of words) {
      const needle = ` ${w.trim()} `;
      if (needle.trim().length < 2) continue;
      if (listText.includes(needle)) score += 2;
      else if (text.includes(needle)) score += 1;
    }
    if (score > 0 && (!best || score > best.score)) best = { key: s.key, score };
  }
  return best?.key ?? null;
}

export type ProposedService = { key: string; label: string; tasks: number; responsible: { id: string; name: string } | null };
export type ClientProposal = {
  clientId: string;
  name: string;
  tasks: number;
  lastDays: number | null;
  lists: { id: string; name: string; tasks: number }[];
  services: ProposedService[];
  hasServices: boolean;
  hasLists: boolean;
};

type Task = Pick<WatchTask, 'listId' | 'listName' | 'assignees' | 'updatedMs'> & { spaceName: string };

/** Propuesta para un cliente a partir de sus tareas. Función pura. */
export function proposeFor(
  tasks: Task[],
  services: Pick<ServiceRow, 'key' | 'label'>[],
  names: Map<string, string>,
  now = Date.now()
): Pick<ClientProposal, 'tasks' | 'lastDays' | 'lists' | 'services'> {
  const byList = new Map<string, { id: string; name: string; tasks: number }>();
  const bySvc = new Map<string, { tasks: number; people: Map<string, number> }>();
  let last = 0;
  for (const t of tasks) {
    last = Math.max(last, t.updatedMs);
    const l = byList.get(t.listId) ?? { id: t.listId, name: t.listName, tasks: 0 };
    l.tasks++;
    byList.set(t.listId, l);
    const svc = serviceFor(t.spaceName, t.listName, services);
    if (!svc) continue;
    const s = bySvc.get(svc) ?? { tasks: 0, people: new Map<string, number>() };
    s.tasks++;
    for (const a of t.assignees) s.people.set(a.id, (s.people.get(a.id) ?? 0) + 1);
    bySvc.set(svc, s);
  }
  const lists = [...byList.values()].filter((l) => l.tasks >= 2).sort((a, b) => b.tasks - a.tasks).slice(0, 3);
  const proposed: ProposedService[] = [...bySvc.entries()]
    .filter(([, s]) => s.tasks >= 2)
    .sort((a, b) => b[1].tasks - a[1].tasks)
    .map(([key, s]) => {
      const top = [...s.people.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        key,
        label: services.find((x) => x.key === key)?.label ?? key,
        tasks: s.tasks,
        responsible: top ? { id: top[0], name: names.get(top[0]) ?? 'Persona de ClickUp' } : null
      };
    });
  return { tasks: tasks.length, lastDays: last ? Math.floor((now - last) / 86_400_000) : null, lists, services: proposed };
}

const cache = new Map<string, { at: number; data: { proposals: ClientProposal[]; truncated: boolean; requests: number; scanned: number } }>();

export function clearProposalCache(tenantId: string) {
  cache.delete(tenantId);
}

/** Propuestas para las fichas activas enlazadas al campo «Cliente» a las que les faltan servicios o listas. */
export async function buildClientProposals(tenantId: string, opts: { force?: boolean } = {}) {
  const hit = cache.get(tenantId);
  if (!opts.force && hit && Date.now() - hit.at < CACHE_MS) return { ...hit.data, requests: 0, cached: true };

  const conn = await getClickUpToken(tenantId);
  if (!conn?.workspaceId) throw new Error('ClickUp no está conectado');
  const structure = await getStructure(tenantId);
  const spaces = selectedSpaces(structure);
  const spaceOfList = new Map<string, string>();
  for (const s of spaces) for (const l of s.lists) spaceOfList.set(l.id, s.name);
  const fieldIds = new Set(Object.keys(structure.clientFields));
  const res = await fetchWatchTasks(conn.token, conn.workspaceId, {
    spaceIds: spaces.map((s) => s.id),
    updatedAfterMs: Date.now() - HISTORY_DAYS * 86_400_000
  });
  const byOption = new Map<string, Task[]>();
  for (const t of res.tasks) {
    const opt = taskClientOption(t, fieldIds);
    if (!opt) continue;
    byOption.set(opt, [...(byOption.get(opt) ?? []), { listId: t.listId, listName: t.listName, assignees: t.assignees, updatedMs: t.updatedMs, spaceName: spaceOfList.get(t.listId) ?? '' }]);
  }
  const services = (await getServices(tenantId)).filter((s) => s.active);
  const names = new Map(structure.members.map((m) => [m.id, m.username]));
  const proposals: ClientProposal[] = [];
  for (const c of await listClients(tenantId)) {
    if (!c.active || !c.clickupOptionId) continue;
    const hasServices = c.services.length > 0;
    const hasLists = c.usualListIds.length > 0;
    if (hasServices && hasLists) continue;
    const tasks = byOption.get(c.clickupOptionId) ?? [];
    if (tasks.length === 0) continue;
    const p = proposeFor(tasks, services, names);
    const useful = (!hasServices && p.services.length > 0) || (!hasLists && p.lists.length > 0);
    if (!useful) continue;
    proposals.push({ clientId: c.id, name: c.name, hasServices, hasLists, ...p });
  }
  proposals.sort((a, b) => b.tasks - a.tasks);
  const data = { proposals, truncated: res.truncated, requests: res.requests, scanned: res.tasks.length };
  cache.set(tenantId, { at: Date.now(), data });
  return { ...data, cached: false };
}

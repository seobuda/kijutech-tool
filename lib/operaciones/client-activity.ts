// Actividad por cliente y alertas (paso 6D). Todo se calcula en el código, sin IA:
//  - Una pasada al día (de madrugada) con UNA consulta agrupada de workspace (por el cliente con contador):
//    última actividad, tareas completadas este mes, tareas abiertas con fecha en el horizonte del cliente y
//    horas aproximadas del mes (tiempo laboral entre Empezar y Hecho de los encargos del cliente).
//  - Dos alertas: «sin actividad» y «sin trabajo planificado». Solo las generan los clientes activos,
//    vinculados, con la ficha completada y el interruptor encendido (ver alertEligibility).
//  - El resumen del dueño avisa una vez de cada alerta nueva y la recuerda cada 7 días si sigue.
import { and, eq, gte, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsClientActivity, opsRequestEvents, opsRequests, opsSettings } from '@/lib/db/schema';
import { fetchWatchTasks, madridNoonMs, OPS_TIMEZONE, type WatchTask } from '@/lib/operaciones/clickup';
import { getClickUpToken } from '@/lib/operaciones/queries';
import { getStructure, selectedSpaces } from '@/lib/operaciones/structure';
import { localParts } from '@/lib/operaciones/notifications';
import { getScheduleMap, scheduleOrDefault } from '@/lib/operaciones/team-profiles';
import { workingMinutesBetween } from '@/lib/operaciones/reminders';
import {
  clientInactivityDays,
  clientPlanningDays,
  evaluateClient,
  getLevels,
  listClients,
  type ClientWithServices
} from '@/lib/operaciones/clients';

const DAY_MS = 24 * 3600 * 1000;
const KEY_LAST_RUN = 'client_activity_last_run'; // AAAA-MM-DD (Madrid) de la última pasada correcta
const KEY_LAST_ATTEMPT = 'client_activity_last_attempt'; // ms del último intento
const KEY_LAST_ERROR = 'client_activity_last_error';
const RETRY_AFTER_MS = 30 * 60 * 1000;
const RUN_AFTER_MINUTES = 3 * 60; // 03:00 Madrid
const REMIND_EVERY_MS = 7 * DAY_MS;
const isClosedType = (t: string) => t === 'closed' || t === 'done';

async function getSetting(tenantId: string, key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: opsSettings.value })
    .from(opsSettings)
    .where(and(eq(opsSettings.tenantId, tenantId), eq(opsSettings.key, key)))
    .limit(1);
  return row?.value ?? null;
}

async function setSetting(tenantId: string, key: string, value: string) {
  await db
    .insert(opsSettings)
    .values({ tenantId, key, value })
    .onConflictDoUpdate({ target: [opsSettings.tenantId, opsSettings.key], set: { value, updatedAt: new Date() } });
}

export async function getActivityRunInfo(tenantId: string): Promise<{ lastRun: string | null; lastError: string | null }> {
  return { lastRun: await getSetting(tenantId, KEY_LAST_RUN), lastError: await getSetting(tenantId, KEY_LAST_ERROR) };
}

// Inicio (ms) del día de una fecha AAAA-MM-DD en Madrid.
const startOfDayMs = (ymd: string) => madridNoonMs(ymd) - 12 * 3600 * 1000;

// Mes natural en Madrid: 0 = actual, -1 = anterior.
export function monthRange(offset: 0 | -1, now = Date.now()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: OPS_TIMEZONE }).format(new Date(now));
  const [y, m] = today.split('-').map(Number);
  const idx = y * 12 + (m - 1) + offset;
  const ym = (i: number) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`;
  const startYmd = ym(idx);
  return {
    startMs: startOfDayMs(startYmd),
    endMs: startOfDayMs(ym(idx + 1)),
    label: new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${startYmd}T12:00:00Z`))
  };
}

// Opción del campo «Cliente» elegida en una tarea (cualquiera de los campos Cliente de la caché).
function taskClientOption(t: WatchTask, fieldIds: Set<string>): string | null {
  for (const [fieldId, d] of Object.entries(t.dropdowns)) if (fieldIds.has(fieldId)) return d.optionId;
  return null;
}

export type ScanResult = { clients: number; tasks: number; requests: number; truncated: boolean };

export async function runActivityScan(tenantId: string, now = Date.now()): Promise<ScanResult> {
  const conn = await getClickUpToken(tenantId);
  if (!conn?.workspaceId) throw new Error('ClickUp no está conectado');
  const structure = await getStructure(tenantId);
  const spaceIds = selectedSpaces(structure).map((s) => s.id);
  if (spaceIds.length === 0) throw new Error('No hay espacios seleccionados en Ajustes');

  const [clients, levels] = await Promise.all([listClients(tenantId), getLevels(tenantId)]);
  const linked = clients.filter((c) => c.clickupOptionId);
  const maxInactive = Math.max(0, ...levels.map((l) => l.inactivityDays), ...clients.map((c) => c.inactivityDays ?? 0));
  const windowDays = Math.max(62, maxInactive + 7);

  const { tasks, truncated, requests } = await fetchWatchTasks(conn.token, conn.workspaceId, {
    spaceIds,
    updatedAfterMs: now - windowDays * DAY_MS
  });

  const byOption = new Map(linked.map((c) => [c.clickupOptionId!, c]));
  const fieldIds = new Set(Object.keys(structure.clientFields));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: OPS_TIMEZONE }).format(new Date(now));
  const todayStart = startOfDayMs(today);
  const month = monthRange(0, now);

  type Agg = { last: number | null; completed: number; upcoming: number };
  const agg = new Map<string, Agg>(linked.map((c) => [c.id, { last: null, completed: 0, upcoming: 0 }]));
  for (const t of tasks) {
    const opt = taskClientOption(t, fieldIds);
    const client = opt ? byOption.get(opt) : undefined;
    if (!client) continue;
    const a = agg.get(client.id)!;
    a.last = Math.max(a.last ?? 0, t.updatedMs, t.createdMs, t.closedMs ?? 0) || a.last;
    if (isClosedType(t.statusType)) {
      const done = t.closedMs ?? t.updatedMs;
      if (done >= month.startMs && done < month.endMs) a.completed++;
    } else {
      const horizon = clientPlanningDays(client, levels);
      if (horizon > 0 && t.dueMs !== null && t.dueMs >= todayStart && t.dueMs < todayStart + (horizon + 1) * DAY_MS) a.upcoming++;
    }
  }

  // Horas del mes: tiempo laboral entre Empezar y Hecho (o Hecho, ¿lo revisas?) de los encargos del cliente.
  const hours = new Map<string, number>();
  const reqs = await db
    .select({ id: opsRequests.id, opt: opsRequests.clientOptionId, assignee: opsRequests.assigneeClickupId })
    .from(opsRequests)
    .where(and(eq(opsRequests.tenantId, tenantId)));
  const reqById = new Map(reqs.filter((r) => r.opt).map((r) => [r.id, r]));
  if (reqById.size > 0) {
    const events = await db
      .select()
      .from(opsRequestEvents)
      .where(
        and(
          eq(opsRequestEvents.tenantId, tenantId),
          inArray(opsRequestEvents.eventType, ['start', 'done', 'done_review']),
          gte(opsRequestEvents.createdAt, new Date(month.startMs - 31 * DAY_MS))
        )
      )
      .orderBy(opsRequestEvents.createdAt);
    const schedules = await getScheduleMap(tenantId);
    const perReq = new Map<string, { start?: number; done?: number }>();
    for (const e of events) {
      if (!e.requestId || !reqById.has(e.requestId)) continue;
      const cur = perReq.get(e.requestId) ?? {};
      const ms = e.createdAt.getTime();
      if (e.eventType === 'start') cur.start ??= ms;
      else if (cur.start !== undefined && cur.done === undefined && ms > cur.start) cur.done = ms;
      perReq.set(e.requestId, cur);
    }
    for (const [id, p] of perReq) {
      if (p.start === undefined || p.done === undefined || p.done < month.startMs || p.done >= month.endMs) continue;
      const r = reqById.get(id)!;
      const sch = scheduleOrDefault(schedules, r.assignee ?? '');
      const min = workingMinutesBetween(sch, p.start, p.done);
      hours.set(r.opt!, (hours.get(r.opt!) ?? 0) + min / 60);
    }
  }

  for (const c of linked) {
    const a = agg.get(c.id)!;
    const values = {
      clientId: c.id,
      tenantId,
      lastActivityMs: a.last,
      windowDays,
      completedMonth: a.completed,
      upcomingTasks: a.upcoming,
      horizonDays: clientPlanningDays(c, levels),
      hoursMonth: (Math.round((hours.get(c.clickupOptionId!) ?? 0) * 10) / 10).toFixed(1),
      computedAt: new Date(now)
    };
    await db
      .insert(opsClientActivity)
      .values(values)
      .onConflictDoUpdate({ target: opsClientActivity.clientId, set: values });
  }

  // Alertas que dejaron de cumplirse: se borra la marca de «ya avisada» (si vuelven, serán nuevas).
  const rows = await db.select().from(opsClientActivity).where(eq(opsClientActivity.tenantId, tenantId));
  const clearInactive: string[] = [];
  const clearUnplanned: string[] = [];
  for (const c of linked) {
    const row = rows.find((r) => r.clientId === c.id);
    const ev = evaluateClient(c, row ?? null, levels, now);
    if (!ev.inactive) clearInactive.push(c.id);
    if (!ev.unplanned) clearUnplanned.push(c.id);
  }
  if (clearInactive.length) {
    await db.update(opsClientActivity).set({ inactiveNotifiedAt: null }).where(inArray(opsClientActivity.clientId, clearInactive));
  }
  if (clearUnplanned.length) {
    await db.update(opsClientActivity).set({ unplannedNotifiedAt: null }).where(inArray(opsClientActivity.clientId, clearUnplanned));
  }
  return { clients: linked.length, tasks: tasks.length, requests, truncated };
}

// Pasada manual (botón «Recalcular ahora»): registra el resultado igual que la nocturna.
export async function runActivityNow(tenantId: string): Promise<ScanResult> {
  try {
    const r = await runActivityScan(tenantId);
    await setSetting(tenantId, KEY_LAST_RUN, new Date().toISOString());
    await setSetting(tenantId, KEY_LAST_ERROR, '');
    return r;
  } catch (e) {
    await setSetting(tenantId, KEY_LAST_ERROR, (e instanceof Error ? e.message : 'Error desconocido').slice(0, 500));
    throw e;
  }
}

// Planificador (cada 30 s): una pasada al día, a partir de las 03:00 de Madrid.
export async function runActivityDaily(tenantId: string, now = new Date()): Promise<void> {
  const lp = localParts(OPS_TIMEZONE, now);
  if (lp.minutes < RUN_AFTER_MINUTES) return;
  const last = await getSetting(tenantId, KEY_LAST_RUN);
  if (last) {
    const lastDay = new Intl.DateTimeFormat('en-CA', { timeZone: OPS_TIMEZONE }).format(new Date(last));
    if (lastDay === lp.date) return;
  }
  const attempt = Number(await getSetting(tenantId, KEY_LAST_ATTEMPT));
  if (Number.isFinite(attempt) && now.getTime() - attempt < RETRY_AFTER_MS) return;
  await setSetting(tenantId, KEY_LAST_ATTEMPT, String(now.getTime()));
  try {
    await runActivityNow(tenantId);
  } catch (e) {
    console.error('[actividad] pasada nocturna:', e instanceof Error ? e.message : e);
  }
}

// --- Alertas para el resumen del dueño --------------------------------------------------------

export type ClientAlertItem = { clientId: string; name: string; kind: 'inactive' | 'unplanned'; text: string; reminder: boolean };

// Alertas que toca mostrar: las nuevas y las que siguen activas desde hace 7 días o más.
export async function getClientAlertsToShow(tenantId: string, now = Date.now()): Promise<ClientAlertItem[]> {
  const [clients, levels, rows] = await Promise.all([
    listClients(tenantId),
    getLevels(tenantId),
    db.select().from(opsClientActivity).where(eq(opsClientActivity.tenantId, tenantId))
  ]);
  const out: ClientAlertItem[] = [];
  for (const c of clients) {
    const row = rows.find((r) => r.clientId === c.id);
    if (!row) continue;
    const ev = evaluateClient(c, row, levels, now);
    const due = (notified: Date | null) => !notified || now - notified.getTime() >= REMIND_EVERY_MS;
    if (ev.inactive && due(row.inactiveNotifiedAt)) {
      out.push({ clientId: c.id, name: c.name, kind: 'inactive', text: ev.inactiveNote, reminder: Boolean(row.inactiveNotifiedAt) });
    }
    if (ev.unplanned && due(row.unplannedNotifiedAt)) {
      out.push({ clientId: c.id, name: c.name, kind: 'unplanned', text: ev.unplannedNote, reminder: Boolean(row.unplannedNotifiedAt) });
    }
  }
  return out;
}

export async function markClientAlertsShown(items: ClientAlertItem[]): Promise<void> {
  const now = new Date();
  const inactive = items.filter((i) => i.kind === 'inactive').map((i) => i.clientId);
  const unplanned = items.filter((i) => i.kind === 'unplanned').map((i) => i.clientId);
  if (inactive.length) await db.update(opsClientActivity).set({ inactiveNotifiedAt: now }).where(inArray(opsClientActivity.clientId, inactive));
  if (unplanned.length) await db.update(opsClientActivity).set({ unplannedNotifiedAt: now }).where(inArray(opsClientActivity.clientId, unplanned));
}

// --- «Trabajo de este mes» --------------------------------------------------------------------

export type MonthWorkItem = { title: string; url: string; doneMs: number; people: string[] };

const monthCache = new Map<string, { at: number; tasks: WatchTask[] }>();
const MONTH_CACHE_MS = 2 * 60 * 1000;

// Tareas completadas de un cliente en el mes actual (0) o el anterior (-1): una consulta agrupada
// (caché de 2 minutos) filtrada en el código por el campo «Cliente».
export async function getMonthWork(
  tenantId: string,
  client: Pick<ClientWithServices, 'clickupOptionId'>,
  offset: 0 | -1
): Promise<{ label: string; items: MonthWorkItem[]; truncated: boolean }> {
  const range = monthRange(offset);
  if (!client.clickupOptionId) return { label: range.label, items: [], truncated: false };
  const conn = await getClickUpToken(tenantId);
  if (!conn?.workspaceId) throw new Error('ClickUp no está conectado');
  const structure = await getStructure(tenantId);
  const spaceIds = selectedSpaces(structure).map((s) => s.id);
  const fieldIds = new Set(Object.keys(structure.clientFields));

  // Una sola consulta cubre ambos meses (actualizadas desde el inicio del mes anterior).
  const key = `${tenantId}:${monthRange(-1).startMs}`;
  let entry = monthCache.get(key);
  let truncated = false;
  if (!entry || Date.now() - entry.at > MONTH_CACHE_MS) {
    const res = await fetchWatchTasks(conn.token, conn.workspaceId, { spaceIds, updatedAfterMs: monthRange(-1).startMs });
    truncated = res.truncated;
    entry = { at: Date.now(), tasks: res.tasks };
    monthCache.set(key, entry);
  }
  const names = new Map(structure.members.map((m) => [m.id, m.username]));
  const items = entry.tasks
    .filter((t) => isClosedType(t.statusType) && taskClientOption(t, fieldIds) === client.clickupOptionId)
    .map((t) => ({ t, done: t.closedMs ?? t.updatedMs }))
    .filter(({ done }) => done >= range.startMs && done < range.endMs)
    .sort((a, b) => a.done - b.done)
    .map(({ t, done }) => ({
      title: t.name,
      url: t.url,
      doneMs: done,
      people: t.assignees.map((a) => names.get(a.id) ?? a.username).filter(Boolean)
    }));
  return { label: range.label, items, truncated };
}

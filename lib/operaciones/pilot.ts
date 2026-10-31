// Métricas del piloto (paso 7): por semana (lunes a domingo, hora de Madrid) y por persona.
// Todo se calcula al vuelo con ops_request_events, ops_requests, ops_notifications y las fichas de Equipo;
// no hay tablas de métricas. La fecha de inicio del piloto vive en ops_settings («pilot_start»).
import { and, desc, eq, gte, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsNotifications, opsRequestEvents, opsRequests, opsSettings, opsSuggestions } from '@/lib/db/schema';
import { madridNoonMs } from '@/lib/operaciones/clickup';
import { getScheduleMap, scheduleOrDefault } from '@/lib/operaciones/team-profiles';
import { workingMinutesBetween } from '@/lib/operaciones/reminders';

const KEY_PILOT_START = 'pilot_start';
const TZ = 'Europe/Madrid';

const ymdOf = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ms));
const startOfDayMs = (ymd: string) => madridNoonMs(ymd) - 12 * 3600 * 1000;

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Lunes de la semana (en Madrid) a la que pertenece el instante.
export function weekStartOf(ms: number): string {
  const ymd = ymdOf(ms);
  const [y, m, d] = ymd.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
  return addDays(ymd, -((dow + 6) % 7));
}

function nextMonday(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return addDays(ymd, ((1 - dow + 7) % 7) || 7);
}

export async function getPilotStart(tenantId: string): Promise<string> {
  const [row] = await db
    .select({ value: opsSettings.value })
    .from(opsSettings)
    .where(and(eq(opsSettings.tenantId, tenantId), eq(opsSettings.key, KEY_PILOT_START)))
    .limit(1);
  if (row && /^\d{4}-\d{2}-\d{2}$/.test(row.value)) return row.value;
  // Sin configurar: el próximo lunes, y se guarda para que no cambie cada día.
  const value = nextMonday(ymdOf(Date.now()));
  await setPilotStart(tenantId, value);
  return value;
}

export async function setPilotStart(tenantId: string, ymd: string): Promise<void> {
  await db
    .insert(opsSettings)
    .values({ tenantId, key: KEY_PILOT_START, value: ymd })
    .onConflictDoUpdate({ target: [opsSettings.tenantId, opsSettings.key], set: { value: ymd, updatedAt: new Date() } });
}

// ---------------------------------------------------------------------------

export type Stat = { avg: number; median: number; n: number } | null;

export type PersonWeek = {
  createdBloc: number;
  createdNuevo: number;
  createdClickup: number;
  toStart: Stat; // aviso → Empezar, minutos laborables
  toDone: Stat; // Empezar → Hecho, minutos laborables
  blocksAi: number;
  blocksOwner: number;
  reviewsAccepted: number;
  reviewsReturned: number;
  reminders: number;
  unanswered: number;
  cleanupReviewed: number;
};

export type WeekData = {
  weekStart: string;
  people: Record<string, PersonWeek>;
  total: PersonWeek;
  immediate: number; // avisos urgentes que llegaron al instante al dueño
  toDigest: number; // lo que necesitaba al dueño y fue a los resúmenes
};

export type PilotData = {
  start: string;
  weeks: WeekData[]; // la más reciente primero
  names: Record<string, string>;
  order: string[]; // personas ordenadas por nombre
  hasData: boolean;
};

const emptyPerson = (): PersonWeek => ({
  createdBloc: 0,
  createdNuevo: 0,
  createdClickup: 0,
  toStart: null,
  toDone: null,
  blocksAi: 0,
  blocksOwner: 0,
  reviewsAccepted: 0,
  reviewsReturned: 0,
  reminders: 0,
  unanswered: 0,
  cleanupReviewed: 0
});

function stat(values: number[]): Stat {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { avg: values.reduce((a, b) => a + b, 0) / values.length, median, n: values.length };
}

export async function getPilotData(tenantId: string): Promise<PilotData> {
  const start = await getPilotStart(tenantId);
  const startMs = startOfDayMs(start);
  const since = new Date(startMs);

  const [requests, events, notifs, schedules] = await Promise.all([
    db.select().from(opsRequests).where(and(eq(opsRequests.tenantId, tenantId), gte(opsRequests.createdAt, since))),
    db.select().from(opsRequestEvents).where(and(eq(opsRequestEvents.tenantId, tenantId), gte(opsRequestEvents.createdAt, since))).orderBy(opsRequestEvents.createdAt),
    db
      .select()
      .from(opsNotifications)
      .where(and(eq(opsNotifications.tenantId, tenantId), gte(opsNotifications.createdAt, since), isNotNull(opsNotifications.sentAt))),
    getScheduleMap(tenantId)
  ]);

  const names: Record<string, string> = {};
  const weeks = new Map<string, WeekData>();
  const week = (ms: number): WeekData => {
    const key = weekStartOf(ms);
    let w = weeks.get(key);
    if (!w) {
      w = { weekStart: key, people: {}, total: emptyPerson(), immediate: 0, toDigest: 0 };
      weeks.set(key, w);
    }
    return w;
  };
  const person = (w: WeekData, id: string | null, name: string | null): PersonWeek => {
    const key = id ?? name ?? '—';
    if (name && !names[key]) names[key] = name;
    return (w.people[key] ??= emptyPerson());
  };
  // Suma en la persona y en el total de la semana.
  const bump = (ms: number, id: string | null, name: string | null, f: (p: PersonWeek) => void) => {
    const w = week(ms);
    f(person(w, id, name));
    f(w.total);
  };

  const reqById = new Map(requests.map((r) => [r.id, r]));
  const allReqs = new Map(reqById);

  // Encargos creados, por origen.
  for (const r of requests) {
    bump(r.createdAt.getTime(), r.assigneeClickupId, r.assigneeName, (p) => {
      if (r.origin === 'clickup') p.createdClickup++;
      else if (r.noteId) p.createdBloc++;
      else p.createdNuevo++;
    });
  }

  // Recordatorios, «sin respuesta» listados en un resumen.
  for (const r of requests) {
    if (r.unansweredListedAt) bump(r.unansweredListedAt.getTime(), r.assigneeClickupId, r.assigneeName, (p) => p.unanswered++);
  }

  // Tiempos: aviso → Empezar y Empezar → Hecho (minutos laborables de la persona que lo hizo).
  const noticeAt = new Map<string, number>();
  for (const n of notifs) {
    if (n.kind !== 'new_request' || !n.requestId || !n.sentAt) continue;
    const t = n.sentAt.getTime();
    const cur = noticeAt.get(n.requestId);
    if (cur === undefined || t < cur) noticeAt.set(n.requestId, t);
  }
  type Ev = (typeof events)[number];
  const byRequest = new Map<string, Ev[]>();
  for (const e of events) if (e.requestId) (byRequest.get(e.requestId) ?? byRequest.set(e.requestId, []).get(e.requestId)!).push(e);

  const toStartVals = new Map<string, number[]>(); // semana|persona → minutos
  const toDoneVals = new Map<string, number[]>();
  const push = (map: Map<string, number[]>, key: string, v: number) => (map.get(key) ?? map.set(key, []).get(key)!).push(v);
  const personKey = (id: string | null, name: string | null) => id ?? name ?? '—';

  for (const [reqId, evs] of byRequest) {
    const notice = noticeAt.get(reqId);
    const startEv = evs.find((e) => e.eventType === 'start' && (notice === undefined || e.createdAt.getTime() >= notice));
    if (!startEv) continue;
    const sch = scheduleOrDefault(schedules, startEv.personClickupUserId ?? '');
    const startMs2 = startEv.createdAt.getTime();
    if (notice !== undefined) {
      const w = week(startMs2);
      person(w, startEv.personClickupUserId, startEv.personName);
      const v = workingMinutesBetween(sch, notice, startMs2);
      push(toStartVals, `${w.weekStart}|${personKey(startEv.personClickupUserId, startEv.personName)}`, v);
      push(toStartVals, `${w.weekStart}|*`, v);
    }
    const doneEv = evs.find((e) => (e.eventType === 'done' || e.eventType === 'done_review') && e.createdAt.getTime() > startMs2);
    if (doneEv) {
      const w = week(doneEv.createdAt.getTime());
      person(w, startEv.personClickupUserId, startEv.personName);
      const v = workingMinutesBetween(sch, startMs2, doneEv.createdAt.getTime());
      push(toDoneVals, `${w.weekStart}|${personKey(startEv.personClickupUserId, startEv.personName)}`, v);
      push(toDoneVals, `${w.weekStart}|*`, v);
    }
  }

  // Bloqueos, revisiones, recordatorios y limpiezas.
  const needsOwnerByWeek = new Map<string, number>();
  for (const e of events) {
    const ms = e.createdAt.getTime();
    const req = e.requestId ? allReqs.get(e.requestId) : undefined;
    if (e.eventType === 'agent_answered') bump(ms, e.personClickupUserId, e.personName, (p) => p.blocksAi++);
    else if (e.eventType === 'escalated') {
      bump(ms, e.personClickupUserId, e.personName, (p) => p.blocksOwner++);
      const k = weekStartOf(ms);
      needsOwnerByWeek.set(k, (needsOwnerByWeek.get(k) ?? 0) + 1);
    } else if (e.eventType === 'review_requested') {
      const k = weekStartOf(ms);
      needsOwnerByWeek.set(k, (needsOwnerByWeek.get(k) ?? 0) + 1);
    } else if (e.eventType === 'accepted' || e.eventType === 'returned') {
      // El revisor es el dueño: la revisión se atribuye a quien hizo el trabajo.
      const id = req?.assigneeClickupId ?? null;
      const name = req?.assigneeName ?? null;
      bump(ms, id, name, (p) => (e.eventType === 'accepted' ? p.reviewsAccepted++ : p.reviewsReturned++));
    } else if (e.eventType === 'reminder_sent') bump(ms, e.personClickupUserId, e.personName, (p) => p.reminders++);
    else if (e.eventType === 'cleanup_finished') {
      const reviewed = Number((e.payload as { reviewed?: number } | null)?.reviewed ?? 0);
      bump(ms, e.personClickupUserId, e.personName, (p) => (p.cleanupReviewed += reviewed));
    }
  }

  // Interrupciones: avisos urgentes que llegaron al instante frente a lo que fue a los resúmenes.
  for (const n of notifs) {
    if ((n.kind === 'review_request' || n.kind === 'block_alert') && n.sentAt) week(n.sentAt.getTime()).immediate++;
  }
  for (const w of weeks.values()) w.toDigest = Math.max(0, (needsOwnerByWeek.get(w.weekStart) ?? 0) - w.immediate);

  // Tiempos medios (se rellenan al final con las listas acumuladas).
  for (const w of weeks.values()) {
    for (const [id, p] of Object.entries(w.people)) {
      p.toStart = stat(toStartVals.get(`${w.weekStart}|${id}`) ?? []);
      p.toDone = stat(toDoneVals.get(`${w.weekStart}|${id}`) ?? []);
    }
    w.total.toStart = stat(toStartVals.get(`${w.weekStart}|*`) ?? []);
    w.total.toDone = stat(toDoneVals.get(`${w.weekStart}|*`) ?? []);
  }

  // La semana en curso aparece siempre, aunque esté vacía.
  if (weekStartOf(Date.now()) >= weekStartOf(startMs)) week(Date.now());
  const list = [...weeks.values()].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  const order = [...new Set(list.flatMap((w) => Object.keys(w.people)))].sort((a, b) => (names[a] ?? a).localeCompare(names[b] ?? b, 'es'));
  const hasData = requests.length > 0 || events.length > 0;
  return { start, weeks: list, names, order, hasData };
}

export type SuggestionRow = { id: string; person: string; text: string; hasPhoto: boolean; at: number; shown: boolean };

export async function listSuggestions(tenantId: string): Promise<SuggestionRow[]> {
  const rows = await db
    .select()
    .from(opsSuggestions)
    .where(eq(opsSuggestions.tenantId, tenantId))
    .orderBy(desc(opsSuggestions.createdAt))
    .limit(200);
  return rows.map((r) => ({
    id: r.id,
    person: r.personName,
    text: r.text,
    hasPhoto: Boolean(r.photoFileId),
    at: r.createdAt.getTime(),
    shown: r.digestShownAt !== null
  }));
}

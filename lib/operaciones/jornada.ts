// Jornada real (paso 5A): registros en ops_work_events y estado del día de cada persona.
// El cálculo puro está en jornada-core.ts; aquí, la base de datos. Nunca se marca nada solo salvo el
// cierre automático de quien olvidó «Termino» (marcado como 'auto' y preguntado al día siguiente).
import { and, eq, gt, gte, inArray, isNull, lte, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsClickupMembers, opsNotifications, opsRequestEvents, opsTeamProfiles, opsWorkEvents, type OpsWorkEvent } from '@/lib/db/schema';
import { getAuto, num } from '@/lib/operaciones/automations';
import { logEvent } from '@/lib/operaciones/events';
import { localParts, toMinutes } from '@/lib/operaciones/notifications';
import { getScheduleMap, scheduleOrDefault, worksOn, type Schedule } from '@/lib/operaciones/team-profiles';
import {
  AWAY_STATUSES,
  breakOver,
  computeDay,
  fmtDuration,
  lunchPlannedMin,
  transitionError,
  type DayEvent,
  type DayState,
  type TaskRef,
  type WorkKind
} from '@/lib/operaciones/jornada-core';
import { escapeHtml } from '@/lib/operaciones/telegram';
import { getOwnerMember } from '@/lib/operaciones/telegram-config';

export type Person = { clickupUserId: string; name: string };
export type Source = 'telegram' | 'web' | 'auto' | 'correccion';

export async function jornadaSettings(tenantId: string) {
  const a = await getAuto(tenantId, 'jornada');
  return {
    enabled: a.enabled,
    repingMin: num(a, 'repingMin'),
    maxPings: num(a, 'maxPings'),
    emailPing: Boolean(a.cfg.emailPing),
    breakQuotaMin: num(a, 'breakQuotaMin'),
    lunchMarginMin: num(a, 'lunchMarginMin'),
    autoCloseMin: num(a, 'autoCloseMin'),
    holdNotices: Boolean(a.cfg.holdNotices)
  };
}

// --- Fechas ---------------------------------------------------------------------------------

export const todayIn = (tz: string, now = new Date()) => localParts(tz, now).date;

export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Instante (ms) de una hora local HH:MM en una fecha YYYY-MM-DD de la zona `tz`. */
export function localTimeMs(tz: string, date: string, hhmm: string): number {
  const guess = Date.parse(`${date}T${hhmm.padStart(5, '0')}:00Z`);
  // Ajuste por la diferencia horaria de la zona en ese momento (dos pasadas cubren el cambio de hora).
  let t = guess;
  for (let i = 0; i < 2; i++) {
    const lp = localParts(tz, new Date(t));
    const diffMin = (Date.parse(`${lp.date}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 60000 + lp.minutes - toMinutes(hhmm);
    t -= diffMin * 60000;
  }
  return t;
}

export const isWorkDay = (sch: Schedule, date: string) => worksOn(sch, date); // incluye festivos y ausencias del calendario

/** Inicio y fin del horario de la ficha en una fecha (ms). */
export function scheduledBounds(sch: Schedule, date: string): { start: number; end: number } {
  const start = localTimeMs(sch.timezone, date, sch.workStart);
  return { start, end: start + sch.hoursPerDay * 3600_000 };
}

/** Próximo inicio de jornada según la ficha, a partir de `now`. */
export function nextWorkStartMs(sch: Schedule, now: number): number {
  let date = todayIn(sch.timezone, new Date(now));
  for (let i = 0; i < 9; i++) {
    if (isWorkDay(sch, date)) {
      const s = localTimeMs(sch.timezone, date, sch.workStart);
      if (s > now) return s;
    }
    date = shiftDate(date, 1);
  }
  return now + 12 * 3600_000;
}

// --- Lectura --------------------------------------------------------------------------------

export function toDayEvent(r: OpsWorkEvent): DayEvent {
  return {
    id: r.id,
    kind: r.kind as WorkKind,
    at: r.at.getTime(),
    plannedMinutes: r.plannedMinutes,
    reason: r.reason,
    source: r.source,
    task: (r.task as TaskRef | null) ?? null
  };
}

/** Registros (sin anular por defecto) de varias personas y fechas. */
export async function loadWorkEvents(
  tenantId: string,
  opts: { users?: string[]; from: string; to: string; includeVoided?: boolean }
): Promise<OpsWorkEvent[]> {
  if (opts.users && opts.users.length === 0) return [];
  return db
    .select()
    .from(opsWorkEvents)
    .where(
      and(
        eq(opsWorkEvents.tenantId, tenantId),
        gte(opsWorkEvents.workDate, opts.from),
        lte(opsWorkEvents.workDate, opts.to),
        opts.users ? inArray(opsWorkEvents.clickupUserId, opts.users) : undefined,
        opts.includeVoided ? undefined : isNull(opsWorkEvents.voidedAt)
      )
    )
    .orderBy(opsWorkEvents.at);
}

const OPEN: DayState['status'][] = ['trabajando', 'descanso', 'comida', 'fuera'];

/** Día laboral «abierto» de la persona: hoy, o ayer si sigue trabajando pasada la medianoche. */
export function pickOpenDate(today: string, todayEvents: DayEvent[], yesterdayEvents: DayEvent[], now: number): string {
  if (todayEvents.length === 0 && yesterdayEvents.length && OPEN.includes(computeDay(yesterdayEvents, now).status)) {
    return shiftDate(today, -1);
  }
  return today;
}

export type PersonDay = { person: Person; profileId: string | null; sch: Schedule; date: string; state: DayState; events: DayEvent[] };

/** Estado actual de cada persona con ficha activa (o de las indicadas). Una sola consulta. */
export async function getCurrentDays(tenantId: string, now = new Date(), onlyUsers?: string[]): Promise<Map<string, PersonDay>> {
  const profiles = await db
    .select({ id: opsTeamProfiles.id, clickupUserId: opsTeamProfiles.clickupUserId, name: opsTeamProfiles.name, active: opsTeamProfiles.active })
    .from(opsTeamProfiles)
    .where(eq(opsTeamProfiles.tenantId, tenantId));
  const people = profiles.filter((p) => p.clickupUserId && (onlyUsers ? onlyUsers.includes(p.clickupUserId) : p.active));
  const out = new Map<string, PersonDay>();
  if (people.length === 0) return out;
  const schedules = await getScheduleMap(tenantId);
  const todays = new Map(people.map((p) => [p.clickupUserId!, todayIn(scheduleOrDefault(schedules, p.clickupUserId!).timezone, now)]));
  const all = [...todays.values()];
  const from = shiftDate(all.reduce((a, b) => (a < b ? a : b)), -1);
  const to = all.reduce((a, b) => (a > b ? a : b));
  const rows = await loadWorkEvents(tenantId, { users: people.map((p) => p.clickupUserId!), from, to });
  for (const p of people) {
    const u = p.clickupUserId!;
    const today = todays.get(u)!;
    const mine = rows.filter((r) => r.clickupUserId === u);
    const tEv = mine.filter((r) => r.workDate === today).map(toDayEvent);
    const yEv = mine.filter((r) => r.workDate === shiftDate(today, -1)).map(toDayEvent);
    const date = pickOpenDate(today, tEv, yEv, now.getTime());
    const events = date === today ? tEv : yEv;
    out.set(u, {
      person: { clickupUserId: u, name: p.name },
      profileId: p.id,
      sch: scheduleOrDefault(schedules, u),
      date,
      state: computeDay(events, now.getTime()),
      events
    });
  }
  return out;
}

export async function getPersonDay(tenantId: string, clickupUserId: string, now = new Date()): Promise<PersonDay | null> {
  return (await getCurrentDays(tenantId, now, [clickupUserId])).get(clickupUserId) ?? null;
}

// --- Escritura ------------------------------------------------------------------------------

export type RecordResult = { ok: true; day: PersonDay; eventId: string } | { ok: false; reason: string };

/**
 * Registra una acción de la jornada validando que tenga sentido ahora (no se puede ir a comer sin haber
 * empezado, ni volver sin estar en pausa…). Al empezar o volver, los avisos retenidos salen al momento.
 */
export async function recordWorkEvent(
  tenantId: string,
  person: Person,
  kind: WorkKind,
  opts: { source: Source; at?: Date; plannedMinutes?: number | null; reason?: string | null; task?: TaskRef | null; createdBy?: { id: number | null; name: string } } = { source: 'telegram' }
): Promise<RecordResult> {
  const now = new Date();
  const day = await getPersonDay(tenantId, person.clickupUserId, now);
  if (!day) return { ok: false, reason: 'No tienes ficha en Equipo: pide que te la creen.' };
  // Empezar o marcar ausencia abre siempre el día de hoy.
  const date = kind === 'entrada' || kind === 'ausencia' ? todayIn(day.sch.timezone, now) : day.date;
  const state = date === day.date ? day.state : computeDay([], now.getTime());
  const err = transitionError(state.status, kind);
  if (err) return { ok: false, reason: err };

  const [row] = await db
    .insert(opsWorkEvents)
    .values({
      tenantId,
      profileId: day.profileId,
      clickupUserId: person.clickupUserId,
      personName: day.person.name,
      workDate: date,
      kind,
      at: opts.at ?? now,
      plannedMinutes: opts.plannedMinutes ?? null,
      reason: opts.reason?.slice(0, 1000) ?? null,
      task: opts.task ?? null,
      source: opts.source,
      createdByUserId: opts.createdBy?.id ?? null,
      createdByName: opts.createdBy?.name ?? null
    })
    .returning({ id: opsWorkEvents.id });
  await logEvent(tenantId, {
    actor: { clickupUserId: person.clickupUserId, name: day.person.name },
    type: 'jornada',
    payload: { kind, source: opts.source, planned: opts.plannedMinutes ?? null, task: opts.task?.name ?? null }
  });
  if (kind === 'entrada' || kind === 'vuelta') await releaseHeldNotices(tenantId, person.clickupUserId);
  const fresh = (await getPersonDay(tenantId, person.clickupUserId))!;
  return { ok: true, day: fresh, eventId: row.id };
}

/** Corrección desde la web (administración): añade un registro en cualquier hora, sin validar la secuencia. */
export async function addCorrection(
  tenantId: string,
  input: { clickupUserId: string; date: string; kind: WorkKind; at: Date; reason: string | null; plannedMinutes: number | null },
  by: { id: number; name: string }
): Promise<void> {
  const [p] = await db
    .select({ id: opsTeamProfiles.id, name: opsTeamProfiles.name })
    .from(opsTeamProfiles)
    .where(and(eq(opsTeamProfiles.tenantId, tenantId), eq(opsTeamProfiles.clickupUserId, input.clickupUserId)))
    .limit(1);
  if (!p) throw new Error('Persona sin ficha');
  await db.insert(opsWorkEvents).values({
    tenantId,
    profileId: p.id,
    clickupUserId: input.clickupUserId,
    personName: p.name,
    workDate: input.date,
    kind: input.kind,
    at: input.at,
    plannedMinutes: input.plannedMinutes,
    reason: input.reason,
    source: 'correccion',
    createdByUserId: by.id,
    createdByName: by.name
  });
}

/** Anula un registro (nunca se borra). Devuelve false si no existe o ya estaba anulado. */
export async function voidWorkEvent(tenantId: string, id: string, byName: string, reason: string | null): Promise<OpsWorkEvent | null> {
  const [row] = await db
    .update(opsWorkEvents)
    .set({ voidedAt: new Date(), voidedByName: byName, voidReason: reason })
    .where(and(eq(opsWorkEvents.tenantId, tenantId), eq(opsWorkEvents.id, id), isNull(opsWorkEvents.voidedAt)))
    .returning();
  return row ?? null;
}

// --- Avisos retenidos -----------------------------------------------------------------------

/** Al empezar o volver: los avisos retenidos de esa persona salen ya (los envía el planificador). */
export async function releaseHeldNotices(tenantId: string, clickupUserId: string): Promise<void> {
  await db
    .update(opsNotifications)
    .set({ nextAttemptAt: new Date() })
    .where(
      and(
        eq(opsNotifications.tenantId, tenantId),
        eq(opsNotifications.forClickupUserId, clickupUserId),
        inArray(opsNotifications.status, ['pendiente', 'fallido']),
        ne(opsNotifications.kind, 'jornada'),
        gt(opsNotifications.nextAttemptAt, new Date()),
        sql`(${opsNotifications.payload}->>'heldByJornada') = 'true'`
      )
    );
}

/**
 * ¿Hay que retener un aviso no urgente para esta persona? Devuelve hasta cuándo (ms) o null.
 * En pausa: se vuelve a mirar en 10 min (y sale al pulsar «He vuelto»). Tras terminar o ausente: hasta
 * su próxima entrada según la ficha.
 */
export async function jornadaHoldUntil(tenantId: string, clickupUserId: string, nowMs = Date.now()): Promise<number | null> {
  const cfg = await jornadaSettings(tenantId);
  if (!cfg.enabled || !cfg.holdNotices) return null;
  const day = await getPersonDay(tenantId, clickupUserId, new Date(nowMs));
  if (!day) return null;
  // Festivo o ausencia planificada (calendario) sin haber empezado: los avisos esperan a su próximo día laborable.
  if (day.state.status === 'sin_empezar' && !isWorkDay(day.sch, day.date)) return nextWorkStartMs(day.sch, nowMs);
  if (!AWAY_STATUSES.includes(day.state.status)) return null;
  if (day.state.status === 'terminado' || day.state.status === 'ausente') return nextWorkStartMs(day.sch, nowMs);
  return nowMs + 10 * 60_000;
}

/** Tramos realmente trabajados por persona y fecha (para los recordatorios con minutos reales). */
export async function workedIntervals(
  tenantId: string,
  users: string[],
  from: string,
  to: string,
  now = Date.now()
): Promise<Map<string, { days: Set<string>; intervals: [number, number][] }>> {
  const out = new Map<string, { days: Set<string>; intervals: [number, number][] }>();
  if (!(await jornadaSettings(tenantId)).enabled || users.length === 0) return out;
  const rows = await loadWorkEvents(tenantId, { users, from, to });
  const groups = new Map<string, OpsWorkEvent[]>();
  for (const r of rows) {
    const k = `${r.clickupUserId}|${r.workDate}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  for (const [k, list] of groups) {
    const [u, date] = k.split('|');
    const st = computeDay(list.map(toDayEvent), now);
    if (st.status === 'sin_empezar') continue;
    const e = out.get(u) ?? { days: new Set<string>(), intervals: [] };
    e.days.add(date);
    e.intervals.push(...st.workIntervals);
    out.set(u, e);
  }
  return out;
}

// --- Contacto -------------------------------------------------------------------------------

export async function memberEmail(tenantId: string, clickupUserId: string): Promise<string | null> {
  const [m] = await db
    .select({ email: opsClickupMembers.email })
    .from(opsClickupMembers)
    .where(and(eq(opsClickupMembers.tenantId, tenantId), eq(opsClickupMembers.clickupUserId, clickupUserId)))
    .limit(1);
  return m?.email ?? null;
}

/** Primera actividad registrada (botones de encargos, etc.) de la persona desde un instante. */
export async function firstActivityAfter(tenantId: string, users: string[], from: Date, to: Date): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (users.length === 0) return out;
  const rows = await db
    .select({ u: opsRequestEvents.personClickupUserId, at: sql<Date>`min(${opsRequestEvents.createdAt})` })
    .from(opsRequestEvents)
    .where(
      and(
        eq(opsRequestEvents.tenantId, tenantId),
        inArray(opsRequestEvents.personClickupUserId, users),
        gte(opsRequestEvents.createdAt, from),
        lte(opsRequestEvents.createdAt, to),
        ne(opsRequestEvents.eventType, 'jornada')
      )
    )
    .groupBy(opsRequestEvents.personClickupUserId);
  for (const r of rows) if (r.u) out.set(r.u, new Date(r.at).getTime());
  return out;
}

// --- Resumen para el dueño ------------------------------------------------------------------

const hm = (ms: number, tz: string) => new Intl.DateTimeFormat('es-ES', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));

/** Línea de una persona para el resumen (HTML). */
export function dayLine(name: string, sch: Schedule, date: string, st: DayState, opts: { quotaMin: number; pings?: number; firstActivity?: number | null }): string {
  const tz = sch.timezone;
  const n = `<b>${escapeHtml(name)}</b>`;
  if (st.status === 'ausente') return `• ${n}: 🏠 ausencia${st.absenceReason ? `: «${escapeHtml(st.absenceReason)}»` : ''}`;
  if (st.status === 'sin_empezar') return `• ${n}: ⚪ no empezó${opts.pings ? ` (${opts.pings} aviso(s) sin respuesta)` : ''}`;
  const parts: string[] = [];
  const planned = scheduledBounds(sch, date);
  const late = Math.round((st.entradaAt! - planned.start) / 60000);
  parts.push(`entró ${hm(st.entradaAt!, tz)}${late > 5 ? ` (+${late} min)` : ''}${st.firstTask ? ` con «${escapeHtml(st.firstTask.name)}»` : ''}`);
  if (opts.firstActivity) parts.push(`1.ª actividad ${hm(opts.firstActivity, tz)}`);
  const lunchPlan = lunchPlannedMin(sch.lunchStart, sch.lunchEnd);
  if (st.lunchMin) parts.push(`comida ${fmtDuration(st.lunchMin)}${st.lunchMin > lunchPlan + 5 ? ` (+${st.lunchMin - lunchPlan})` : ''}`);
  if (st.breakCount) {
    const over = breakOver(st, opts.quotaMin);
    parts.push(`${st.breakCount} descanso(s) ${fmtDuration(st.breakMin)}${over ? ` (⚠️ +${over} sobre el cupo)` : ''}`);
  }
  for (const p of st.pauses.filter((x) => x.kind === 'salida_urgente')) {
    parts.push(`🚪 salió ${hm(p.start, tz)}${p.end ? `–${hm(p.end, tz)}` : ''}${p.reason ? `: «${escapeHtml(p.reason)}»` : ''}`);
  }
  if (st.salidaAt) parts.push(st.salidaSource === 'auto' ? `⚠️ salida sin marcar (cerrada a las ${hm(st.salidaAt, tz)})` : `salió ${hm(st.salidaAt, tz)}`);
  parts.push(`${fmtDuration(st.workedMin)} trabajadas`);
  return `• ${n}: ${parts.join(' · ')}`;
}

/**
 * Sección «🕘 Jornada» del primer resumen del día del dueño: el último día laborable ya cerrado de cada
 * persona (por la diferencia horaria, el día del equipo suele terminar de noche en Madrid).
 */
export async function buildJornadaDigestSection(tenantId: string, now = new Date()): Promise<string> {
  const cfg = await jornadaSettings(tenantId);
  if (!cfg.enabled) return '';
  const profiles = await db
    .select({ u: opsTeamProfiles.clickupUserId, name: opsTeamProfiles.name })
    .from(opsTeamProfiles)
    .where(and(eq(opsTeamProfiles.tenantId, tenantId), eq(opsTeamProfiles.active, true)));
  const owner = await getOwnerMember(tenantId); // quien lleva las operaciones no ficha
  const people = profiles.filter((p): p is { u: string; name: string } => Boolean(p.u) && p.u !== owner?.clickupUserId);
  if (people.length === 0) return '';
  const schedules = await getScheduleMap(tenantId);
  const targets = people
    .map((p) => {
      const sch = scheduleOrDefault(schedules, p.u);
      let date = shiftDate(todayIn(sch.timezone, now), -1);
      for (let i = 0; i < 7 && !isWorkDay(sch, date); i++) date = shiftDate(date, -1);
      return { ...p, sch, date };
    });
  const dates = targets.map((t) => t.date);
  const rows = await loadWorkEvents(tenantId, {
    users: people.map((p) => p.u),
    from: dates.reduce((a, b) => (a < b ? a : b)),
    to: dates.reduce((a, b) => (a > b ? a : b))
  });
  const pingRows = await db
    .select({ key: opsNotifications.dedupeKey })
    .from(opsNotifications)
    .where(and(eq(opsNotifications.tenantId, tenantId), eq(opsNotifications.kind, 'jornada'), sql`${opsNotifications.dedupeKey} LIKE 'jw:ping:%'`));
  const lines: string[] = [];
  for (const t of targets) {
    const evs = rows.filter((r) => r.clickupUserId === t.u && r.workDate === t.date).map(toDayEvent);
    const st = computeDay(evs, now.getTime());
    const pings = pingRows.filter((r) => r.key.startsWith(`jw:ping:${t.u}:${t.date}:`)).length;
    const first =
      st.entradaAt !== null
        ? (await firstActivityAfter(tenantId, [t.u], new Date(st.entradaAt), new Date(st.salidaAt ?? now.getTime()))).get(t.u) ?? null
        : null;
    lines.push(dayLine(t.name, t.sch, t.date, st, { quotaMin: cfg.breakQuotaMin, pings, firstActivity: first }));
  }
  return `🕘 <b>Jornada del último día laborable</b>\n${lines.join('\n')}`;
}


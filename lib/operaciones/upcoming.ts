// «Próximos envíos»: lo que el sistema enviará en las próximas 24 horas. No se guarda nada: se calcula en el
// momento con las mismas reglas que los planificadores (horario de la ficha, silencio, tiempos del panel).
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsNotifications, opsRequestEvents, opsRequests, opsTelegramMembers } from '@/lib/db/schema';
import { getAutoAll, num } from '@/lib/operaciones/automations';
import { getOwnerMember, getTelegramConfig } from '@/lib/operaciones/telegram-config';
import { getOwnerTimezone, getScheduleMap, scheduleOrDefault, WEEKDAY_ISO, type Schedule } from '@/lib/operaciones/team-profiles';
import { localParts, toMinutes } from '@/lib/operaciones/notifications';
import { isWorkMoment, workingMinutesBetween } from '@/lib/operaciones/reminders';
import { isQuietAt, nearestAllowedMinute, releaseAt } from '@/lib/operaciones/quiet';

export type UpcomingItem = { at: number; who: string; kind: string; note: string | null; now: boolean };

const HOUR = 3600_000;
const KIND_LABEL: Record<string, string> = {
  new_request: 'Aviso de encargo nuevo',
  daily_summary: 'Resumen diario del equipo',
  review_request: 'Aviso urgente de revisión',
  block_alert: 'Aviso urgente de bloqueo',
  reply: 'Respuesta a una pregunta',
  returned: 'Encargo devuelto',
  digest: 'Resumen de mi bandeja',
  reminder: 'Recordatorio',
  test: 'Prueba'
};

// Instante UTC de «fecha local + minutos» en una zona horaria.
function zonedToMs(timezone: string, date: string, minutes: number): number {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const offset = (ms: number) => {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
    const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute')) - Math.floor(ms / 60000) * 60000;
  };
  const first = guess - offset(guess);
  return guess - offset(first);
}

const addDays = (date: string, n: number) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

export async function getUpcoming(tenantId: string, nowMs = Date.now()): Promise<UpcomingItem[]> {
  const cfg = await getTelegramConfig(tenantId);
  if (!cfg) return [];
  const horizon = nowMs + 24 * HOUR;
  const [autos, schedules, owner, ownerTz] = await Promise.all([
    getAutoAll(tenantId),
    getScheduleMap(tenantId),
    getOwnerMember(tenantId),
    getOwnerTimezone(tenantId)
  ]);
  const items: UpcomingItem[] = [];
  const keysToCheck: string[] = [];
  const planned: { key: string; item: UpcomingItem }[] = [];

  // Envíos programados a una hora fija (resumen diario y de bandeja): hoy y los dos días siguientes.
  const scheduled = (opts: {
    key: (date: string) => string;
    tz: string;
    sch: Schedule;
    minute: number;
    windowMin: number;
    who: string;
    kind: string;
    note: string | null;
    weekdays: number[];
  }) => {
    const today = localParts(opts.tz, new Date(nowMs)).date;
    const eff = cfg.testMode ? opts.minute : nearestAllowedMinute(opts.sch, opts.minute);
    for (let i = 0; i <= 2; i++) {
      const date = addDays(today, i);
      const at = zonedToMs(opts.tz, date, eff);
      const wd = WEEKDAY_ISO[localParts(opts.tz, new Date(at)).weekday];
      if (!opts.weekdays.includes(wd)) continue;
      if (at > horizon || at + opts.windowMin * 60_000 <= nowMs) continue;
      const moved = eff !== opts.minute ? 'movido por comida o silencio' : null;
      const item: UpcomingItem = {
        at: Math.max(at, nowMs),
        who: opts.who,
        kind: opts.kind,
        note: [opts.note, moved].filter(Boolean).join(' · ') || null,
        now: at <= nowMs
      };
      keysToCheck.push(opts.key(date));
      planned.push({ key: opts.key(date), item });
    }
  };

  // Resumen diario del equipo
  if (autos.daily_team.enabled) {
    const members = await db
      .select()
      .from(opsTelegramMembers)
      .where(and(eq(opsTelegramMembers.tenantId, tenantId), eq(opsTelegramMembers.dailyEnabled, true)));
    for (const m of members) {
      if (!m.telegramChatId) continue;
      const sch = scheduleOrDefault(schedules, m.clickupUserId);
      if (!sch.active) continue;
      scheduled({
        key: (date) => `daily:${m.clickupUserId}:${date}`,
        tz: sch.timezone,
        sch,
        minute: toMinutes(sch.workStart),
        windowMin: num(autos.daily_team, 'windowMin'),
        who: m.username,
        kind: KIND_LABEL.daily_summary,
        note: 'no se envía si no tiene tareas',
        weekdays: sch.workDays
      });
    }
  }

  // Resumen de bandeja del dueño
  if (autos.digest.enabled && owner) {
    const sch = scheduleOrDefault(schedules, owner.clickupUserId);
    const slots = String(autos.digest.cfg.times).split(',').map((s) => s.trim()).filter(Boolean);
    const last = [...slots].sort((a, b) => toMinutes(a) - toMinutes(b)).at(-1);
    for (const s of slots) {
      scheduled({
        key: (date) => `digest:${date}:${s}`,
        tz: ownerTz,
        sch,
        minute: toMinutes(s),
        windowMin: num(autos.digest, 'windowMin'),
        who: owner.username,
        kind: KIND_LABEL.digest,
        note: s === last && autos.client_alerts.enabled ? 'con alertas de clientes · no se envía si no hay novedades' : 'no se envía si no hay novedades',
        weekdays: [1, 2, 3, 4, 5]
      });
    }
  }

  if (keysToCheck.length) {
    const done = await db
      .select({ k: opsNotifications.dedupeKey })
      .from(opsNotifications)
      .where(and(eq(opsNotifications.tenantId, tenantId), inArray(opsNotifications.dedupeKey, keysToCheck)));
    const doneKeys = new Set(done.map((d) => d.k));
    for (const p of planned) if (!doneKeys.has(p.key)) items.push(p.item);
  }

  // Recordatorios que vencerán por encargos que siguen sin empezar
  if (autos.reminder_unanswered.enabled || autos.reminder_later.enabled) {
    const reqs = await db
      .select()
      .from(opsRequests)
      .where(and(eq(opsRequests.tenantId, tenantId), eq(opsRequests.status, 'creado'), eq(opsRequests.workStatus, 'asignado')));
    if (reqs.length) {
      const ids = reqs.map((r) => r.id);
      const notices = await db
        .select()
        .from(opsNotifications)
        .where(and(eq(opsNotifications.tenantId, tenantId), eq(opsNotifications.kind, 'new_request'), eq(opsNotifications.status, 'enviado'), inArray(opsNotifications.requestId, ids)));
      const reminded = new Set(
        (await db.select({ k: opsNotifications.dedupeKey }).from(opsNotifications).where(and(eq(opsNotifications.tenantId, tenantId), eq(opsNotifications.kind, 'reminder')))).map((r) => r.k)
      );
      const laterEvents = await db
        .select()
        .from(opsRequestEvents)
        .where(and(eq(opsRequestEvents.tenantId, tenantId), inArray(opsRequestEvents.requestId, ids), eq(opsRequestEvents.eventType, 'later')));
      const unMin = num(autos.reminder_unanswered, 'minutes');
      const frac = num(autos.reminder_later, 'dayPct') / 100;
      for (const req of reqs) {
        for (const n of notices.filter((x) => x.requestId === req.id)) {
          const user = n.forClickupUserId;
          if (!user || !n.sentAt) continue;
          if (user !== req.assigneeClickupId && !(req.candidateIds ?? []).includes(user)) continue;
          if (reminded.has(`reminder:${req.id}:${user}`)) continue;
          if (nowMs - n.sentAt.getTime() > 3 * 24 * HOUR) continue;
          const sch = scheduleOrDefault(schedules, user);
          if (!sch.active) continue;
          const later = laterEvents.some((e) => e.personClickupUserId === user);
          let at: number | null = null;
          if (!later) {
            if (!autos.reminder_unanswered.enabled) continue;
            let remaining = unMin - workingMinutesBetween(sch, n.sentAt.getTime(), nowMs, unMin);
            if (remaining <= 0) at = nowMs;
            else {
              for (let t = nowMs; t <= horizon; t += 5 * 60_000) {
                if (isWorkMoment(sch, t)) remaining -= 5;
                if (remaining <= 0) {
                  at = t;
                  break;
                }
              }
            }
          } else {
            if (!autos.reminder_later.enabled || !req.dueDate) continue;
            const half = zonedToMs(sch.timezone, req.dueDate, toMinutes(sch.workStart) + sch.hoursPerDay * 60 * frac);
            const end = zonedToMs(sch.timezone, req.dueDate, toMinutes(sch.workStart) + sch.hoursPerDay * 60);
            if (end <= nowMs || half > horizon) continue;
            at = Math.max(half, nowMs);
          }
          if (at === null || at > horizon) continue;
          const moved = isQuietAt(sch, at) ? releaseAt(sch, at) : at;
          items.push({
            at: moved,
            who: n.forName ?? '—',
            kind: `${KIND_LABEL.reminder} (${later ? 'tras «Más tarde»' : 'sin respuesta'})`,
            note: [`«${req.title.slice(0, 50)}»`, moved !== at ? 'movido por comida o silencio' : null].filter(Boolean).join(' · '),
            now: moved <= nowMs
          });
        }
      }
    }
  }

  // Avisos ya en cola: pendientes, reintentos o retrasados por silencio.
  const queued = await db
    .select()
    .from(opsNotifications)
    .where(
      and(
        eq(opsNotifications.tenantId, tenantId),
        or(eq(opsNotifications.status, 'pendiente'), and(eq(opsNotifications.status, 'fallido'), sql`${opsNotifications.attempts} < ${num(autos.delivery, 'maxAttempts')}`))
      )
    );
  for (const q of queued) {
    const at = Math.max(q.nextAttemptAt.getTime(), nowMs);
    if (at > horizon) continue;
    items.push({
      at,
      who: q.forName ?? '—',
      kind: KIND_LABEL[q.kind] ?? q.kind,
      note: q.status === 'fallido' ? `reintento (${q.lastError ?? 'falló el envío'})` : q.nextAttemptAt.getTime() > nowMs + 2 * 60_000 ? 'retrasado por comida o silencio' : 'en cola',
      now: q.nextAttemptAt.getTime() <= nowMs
    });
  }

  return items.sort((a, b) => a.at - b.at);
}

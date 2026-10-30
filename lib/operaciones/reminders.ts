// Recordatorios de encargos sin empezar (paso 6C). Todo se calcula con el horario de la ficha del Equipo
// (zona, hora de entrada, horas por día y días de trabajo), sin IA:
//  - Nadie pulsó nada en 2 horas laborables de esa persona → UN recordatorio.
//  - Pulsó «Más tarde», pero el encargo vence hoy y a mitad de su jornada sigue sin empezar → UN recordatorio.
//  - Si tras el recordatorio sigue sin empezar al terminar su jornada, aparece una vez en el primer
//    resumen disponible del dueño (digest.ts).
// Cada persona tiene como máximo un recordatorio por encargo (dedupe_key único en ops_notifications).
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsNotifications, opsRequestEvents, opsRequests, opsSettings, type OpsRequest } from '@/lib/db/schema';
import {
  enqueueNotification,
  localParts,
  noticeKeyboard,
  toMinutes,
  type NotificationPayload
} from '@/lib/operaciones/notifications';
import { getTelegramConfig } from '@/lib/operaciones/telegram-config';
import { getScheduleMap, scheduleOrDefault, WEEKDAY_ISO, type Schedule } from '@/lib/operaciones/team-profiles';
import { logEvent } from '@/lib/operaciones/events';
import { clampMessage, escapeHtml } from '@/lib/operaciones/telegram';
import { DEF, getAuto, num, renderTemplate } from '@/lib/operaciones/automations';


// SOLO DESARROLLO: acorta los tiempos para poder probar. Con N minutos, las "2 horas laborables" pasan a
// ser N minutos de reloj, "a mitad de jornada" pasa a ser N minutos tras pulsar «Más tarde» y "al terminar
// la jornada" pasa a ser N minutos tras el recordatorio. Se activa con la variable de entorno
// OPS_DEV_REMINDER_MINUTES o con la fila dev_reminder_minutes de ops_settings (sin ella, tiempos reales).
export async function devReminderMinutes(tenantId: string): Promise<number | null> {
  const env = Number(process.env.OPS_DEV_REMINDER_MINUTES);
  if (Number.isFinite(env) && env > 0) return env;
  const [row] = await db
    .select({ value: opsSettings.value })
    .from(opsSettings)
    .where(and(eq(opsSettings.tenantId, tenantId), eq(opsSettings.key, 'dev_reminder_minutes')))
    .limit(1);
  const n = Number(row?.value);
  return Number.isFinite(n) && n > 0 ? n : null;
}
const STEP_MS = 5 * 60 * 1000;
const MAX_SCAN_DAYS = 14;
const MAX_NOTICE_AGE_MS = 3 * 24 * 3600 * 1000;
const REMINDERS_FROM = new Date('2026-10-30T10:30:00Z'); // despliegue del paso 6C

export function isWorkMoment(sch: Schedule, t: number): boolean {
  const lp = localParts(sch.timezone, new Date(t));
  if (!sch.workDays.includes(WEEKDAY_ISO[lp.weekday])) return false;
  const start = toMinutes(sch.workStart);
  return lp.minutes >= start && lp.minutes < start + sch.hoursPerDay * 60;
}

// Minutos laborables (de la persona) entre dos instantes; para al llegar a `cap`.
export function workingMinutesBetween(sch: Schedule, fromMs: number, toMs: number, cap = Infinity): number {
  const from = Math.max(fromMs, toMs - MAX_SCAN_DAYS * 24 * 3600 * 1000);
  let minutes = 0;
  for (let t = from; t < toMs; t += STEP_MS) {
    if (isWorkMoment(sch, t)) {
      minutes += STEP_MS / 60000;
      if (minutes >= cap) break;
    }
  }
  return minutes;
}

// ¿Terminó la jornada de la persona (en un día laborable) entre los dos instantes?
export function jornadaEndedBetween(sch: Schedule, fromMs: number, toMs: number): boolean {
  const end = toMinutes(sch.workStart) + sch.hoursPerDay * 60;
  const from = Math.max(fromMs, toMs - MAX_SCAN_DAYS * 24 * 3600 * 1000);
  let prev = localParts(sch.timezone, new Date(from));
  for (let t = from + 10 * 60 * 1000; t <= toMs; t += 10 * 60 * 1000) {
    const cur = localParts(sch.timezone, new Date(t));
    if (cur.date === prev.date && prev.minutes < end && cur.minutes >= end && sch.workDays.includes(WEEKDAY_ISO[cur.weekday])) {
      return true;
    }
    prev = cur;
  }
  return false;
}

function reminderText(req: OpsRequest, later: boolean, template: string, personName: string | null): string {
  return clampMessage(
    renderTemplate(DEF.get(later ? 'reminder_later' : 'reminder_unanswered')!, template, {
      nombre: escapeHtml(personName ?? ''),
      tarea: escapeHtml(req.title),
      fecha: req.dueDate ? escapeHtml(req.dueDate) : '',
      cliente: req.clientName ? escapeHtml(req.clientName) : '',
      url: req.clickupTaskUrl ? req.clickupTaskUrl.replace(/"/g, '%22') : ''
    })
  );
}

// Planificador (cada 30 s): envía los recordatorios que toquen.
export async function runReminders(tenantId: string, now = new Date()): Promise<void> {
  const cfg = await getTelegramConfig(tenantId);
  if (!cfg) return;
  const reqs = await db
    .select()
    .from(opsRequests)
    .where(and(eq(opsRequests.tenantId, tenantId), eq(opsRequests.status, 'creado'), eq(opsRequests.workStatus, 'asignado')));
  if (reqs.length === 0) return;

  const notices = await db
    .select()
    .from(opsNotifications)
    .where(
      and(
        eq(opsNotifications.tenantId, tenantId),
        eq(opsNotifications.kind, 'new_request'),
        eq(opsNotifications.status, 'enviado'),
        inArray(opsNotifications.requestId, reqs.map((r) => r.id))
      )
    );
  if (notices.length === 0) return;
  const reminded = new Set(
    (
      await db
        .select({ k: opsNotifications.dedupeKey })
        .from(opsNotifications)
        .where(and(eq(opsNotifications.tenantId, tenantId), eq(opsNotifications.kind, 'reminder')))
    ).map((r) => r.k)
  );
  const events = await db
    .select()
    .from(opsRequestEvents)
    .where(
      and(
        eq(opsRequestEvents.tenantId, tenantId),
        inArray(opsRequestEvents.requestId, reqs.map((r) => r.id)),
        inArray(opsRequestEvents.eventType, ['later', 'start'])
      )
    );
  const schedules = await getScheduleMap(tenantId);
  const dev = await devReminderMinutes(tenantId);
  const aUn = await getAuto(tenantId, 'reminder_unanswered');
  const aLater = await getAuto(tenantId, 'reminder_later');
  if (!aUn.enabled && !aLater.enabled) return;
  const unMinutes = num(aUn, 'minutes');
  const dayFrac = num(aLater, 'dayPct') / 100;

  for (const req of reqs) {
    for (const n of notices.filter((x) => x.requestId === req.id)) {
      const user = n.forClickupUserId;
      if (!user || !n.sentAt) continue;
      // Solo avisos recientes y posteriores al despliegue del 6C: no se resucitan encargos antiguos.
      if (n.sentAt < REMINDERS_FROM || now.getTime() - n.sentAt.getTime() > MAX_NOTICE_AGE_MS) continue;
      // Solo quien tiene el encargo (responsable o candidato) y su aviso más reciente.
      if (user !== req.assigneeClickupId && !(req.candidateIds ?? []).includes(user)) continue;
      const key = `reminder:${req.id}:${user}`;
      if (reminded.has(key)) continue;
      const sch = scheduleOrDefault(schedules, user);
      if (!sch.active) continue;

      const laterEvent = events.find((e) => e.requestId === req.id && e.personClickupUserId === user && e.eventType === 'later');
      const later = Boolean(laterEvent);
      const auto = later ? aLater : aUn;
      if (!auto.enabled) continue;
      let due = false;
      if (dev !== null) {
        // Modo desarrollo: minutos de reloj. «Más tarde» además exige que la tarea venza hoy.
        due = later
          ? req.dueDate === localParts(sch.timezone, now).date && now.getTime() - laterEvent!.createdAt.getTime() >= dev * 60000
          : now.getTime() - n.sentAt.getTime() >= dev * 60000;
      } else if (!later) {
        due = workingMinutesBetween(sch, n.sentAt.getTime(), now.getTime(), unMinutes) >= unMinutes;
      } else {
        // «Más tarde» + vence hoy + pasada la mitad de su jornada (y sin haber terminado).
        const lp = localParts(sch.timezone, now);
        const start = toMinutes(sch.workStart);
        const half = start + sch.hoursPerDay * 60 * dayFrac;
        due =
          req.dueDate === lp.date &&
          sch.workDays.includes(WEEKDAY_ISO[lp.weekday]) &&
          lp.minutes >= half &&
          lp.minutes < start + sch.hoursPerDay * 60;
      }
      if (!due) continue;

      reminded.add(key);
      const buttons = noticeKeyboard(req, { forUser: user, later }).map((row) =>
        row.map((b) => ({ text: b.text, data: b.callback_data }))
      );
      await enqueueNotification({
        tenantId,
        kind: 'reminder',
        dedupeKey: key,
        forClickupUserId: user,
        forName: n.forName,
        requestId: req.id,
        payload: { text: reminderText(req, later, auto.template, n.forName), buttons } satisfies Omit<NotificationPayload, 'testMode'>
      });
      await db
        .update(opsRequests)
        .set({ remindedAt: new Date() })
        .where(and(eq(opsRequests.id, req.id), eq(opsRequests.tenantId, tenantId)));
      await logEvent(tenantId, {
        requestId: req.id,
        actor: { clickupUserId: user, name: n.forName ?? '—' },
        type: 'reminder_sent',
        payload: { reason: later ? 'vence_hoy' : '2h_laborables' }
      });
    }
  }
}

// Encargos recordados que siguen sin empezar tras terminar la jornada de su responsable y aún no se
// han mostrado en ningún resumen del dueño.
export async function getUnanswered(tenantId: string, now = new Date()): Promise<OpsRequest[]> {
  const dev = await devReminderMinutes(tenantId);
  const rows = await db
    .select()
    .from(opsRequests)
    .where(and(eq(opsRequests.tenantId, tenantId), eq(opsRequests.status, 'creado'), eq(opsRequests.workStatus, 'asignado')));
  const pending = rows.filter((r) => r.remindedAt && !r.unansweredListedAt);
  if (pending.length === 0) return [];
  const schedules = await getScheduleMap(tenantId);
  return pending.filter((r) =>
    dev !== null
      ? now.getTime() - r.remindedAt!.getTime() >= dev * 60000
      : jornadaEndedBetween(scheduleOrDefault(schedules, r.assigneeClickupId ?? ''), r.remindedAt!.getTime(), now.getTime())
  );
}

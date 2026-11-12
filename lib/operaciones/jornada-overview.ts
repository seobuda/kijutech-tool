// Datos de la pestaña «Equipo → Jornada»: el día elegido de cada persona (con su línea de tiempo, incluidos
// los registros anulados) y los últimos 7 días. Solo base de datos; nada de ClickUp.
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsTeamProfiles } from '@/lib/db/schema';
import { getOwnerMember } from '@/lib/operaciones/telegram-config';
import { getScheduleMap, scheduleOrDefault } from '@/lib/operaciones/team-profiles';
import { breakOver, computeDay, lunchPlannedMin, STATUS_ICON, STATUS_LABEL, type DayStatus } from '@/lib/operaciones/jornada-core';
import { isWorkDay, jornadaSettings, loadWorkEvents, scheduledBounds, shiftDate, toDayEvent } from '@/lib/operaciones/jornada';

export type OverviewEvent = {
  id: string;
  kind: string;
  time: string;
  planned: number | null;
  reason: string | null;
  taskName: string | null; // tarea de la entrada o del cambio de tarea
  source: string;
  createdByName: string | null;
  voided: boolean;
  voidedByName: string | null;
  voidReason: string | null;
};

export type OverviewPerson = {
  clickupUserId: string;
  name: string;
  timezone: string;
  scheduleText: string;
  workday: boolean;
  status: DayStatus;
  statusLabel: string;
  statusIcon: string;
  entrada: string | null;
  lateMin: number;
  firstTask: string | null;
  activeTask: string | null; // tarea con la que está ahora (5B)
  lunchMin: number;
  lunchPlanned: number;
  breakMin: number;
  breakCount: number;
  breakOver: number;
  exits: { start: string; end: string | null; reason: string | null }[];
  salida: string | null;
  salidaAuto: boolean;
  workedMin: number;
  absenceReason: string | null;
  events: OverviewEvent[];
};

export type WeekRow = { clickupUserId: string; name: string; days: { date: string; workedMin: number; status: DayStatus; over: number; auto: boolean; workday: boolean }[]; totalMin: number; overTotal: number };

const hm = (ms: number, tz: string) => new Intl.DateTimeFormat('es-ES', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));

export async function getJornadaOverview(tenantId: string, date: string, now = new Date()) {
  const cfg = await jornadaSettings(tenantId);
  const owner = await getOwnerMember(tenantId);
  const profiles = (
    await db
      .select({ u: opsTeamProfiles.clickupUserId, name: opsTeamProfiles.name })
      .from(opsTeamProfiles)
      .where(and(eq(opsTeamProfiles.tenantId, tenantId), eq(opsTeamProfiles.active, true)))
  ).filter((p): p is { u: string; name: string } => Boolean(p.u) && p.u !== owner?.clickupUserId);
  const schedules = await getScheduleMap(tenantId);
  const from = shiftDate(date, -6);
  const rows = await loadWorkEvents(tenantId, { users: profiles.map((p) => p.u), from, to: date, includeVoided: true });
  const nowMs = now.getTime();

  const people: OverviewPerson[] = profiles.map((p) => {
    const sch = scheduleOrDefault(schedules, p.u);
    const tz = sch.timezone;
    const all = rows.filter((r) => r.clickupUserId === p.u && r.workDate === date);
    const st = computeDay(all.filter((r) => !r.voidedAt).map(toDayEvent), nowMs);
    const bounds = scheduledBounds(sch, date);
    const endH = hm(bounds.end, tz);
    return {
      clickupUserId: p.u,
      name: p.name,
      timezone: tz,
      scheduleText: `${sch.workStart}–${endH}${sch.lunchStart && sch.lunchEnd ? ` · comida ${sch.lunchStart}–${sch.lunchEnd}` : ''}`,
      workday: isWorkDay(sch, date),
      status: st.status,
      statusLabel: STATUS_LABEL[st.status],
      statusIcon: STATUS_ICON[st.status],
      entrada: st.entradaAt ? hm(st.entradaAt, tz) : null,
      lateMin: st.entradaAt ? Math.round((st.entradaAt - bounds.start) / 60000) : 0,
      firstTask: st.firstTask?.name ?? null,
      activeTask: st.status === 'terminado' ? null : (st.activeTask?.name ?? null),
      lunchMin: st.lunchMin,
      lunchPlanned: lunchPlannedMin(sch.lunchStart, sch.lunchEnd),
      breakMin: st.breakMin,
      breakCount: st.breakCount,
      breakOver: breakOver(st, cfg.breakQuotaMin),
      exits: st.pauses.filter((x) => x.kind === 'salida_urgente').map((x) => ({ start: hm(x.start, tz), end: x.end ? hm(x.end, tz) : null, reason: x.reason })),
      salida: st.salidaAt ? hm(st.salidaAt, tz) : null,
      salidaAuto: st.salidaSource === 'auto',
      workedMin: st.workedMin,
      absenceReason: st.absenceReason,
      events: all.map((r) => ({
        id: r.id,
        kind: r.kind,
        time: hm(r.at.getTime(), tz),
        planned: r.plannedMinutes,
        reason: r.reason,
        taskName: (r.task as { name?: string } | null)?.name ?? null,
        source: r.source,
        createdByName: r.createdByName,
        voided: Boolean(r.voidedAt),
        voidedByName: r.voidedByName,
        voidReason: r.voidReason
      }))
    };
  });

  const dates = Array.from({ length: 7 }, (_, i) => shiftDate(from, i));
  const week: WeekRow[] = profiles.map((p) => {
    const sch = scheduleOrDefault(schedules, p.u);
    const days = dates.map((d) => {
      const st = computeDay(rows.filter((r) => r.clickupUserId === p.u && r.workDate === d && !r.voidedAt).map(toDayEvent), nowMs);
      return { date: d, workedMin: st.workedMin, status: st.status, over: breakOver(st, cfg.breakQuotaMin), auto: st.salidaSource === 'auto', workday: isWorkDay(sch, d) };
    });
    return { clickupUserId: p.u, name: p.name, days, totalMin: days.reduce((s, d) => s + d.workedMin, 0), overTotal: days.reduce((s, d) => s + d.over, 0) };
  });

  return { enabled: cfg.enabled, quotaMin: cfg.breakQuotaMin, people, week, dates };
}

import 'server-only';

// Informes para el dueño (revisión de autonomía, 12 nov 2026). Gestión por excepción: lo urgente llega al momento
// (avisos urgentes, Salud, plazos de owner-queue.ts); lo demás, aquí y a horas fijas:
//   - Parte de la mañana (L-V): quién ha empezado y quién falta, qué se cae por una ausencia (con «Mover a mañana»
//     y a quién se le podría pasar), lo que espera de ti e incidencias abiertas. Si no hay nada que contar, no sale.
//   - Informe semanal (lunes): la semana anterior frente a la otra: equipo (jornada, entregas y a tiempo, precisión),
//     clientes, agente, sistema y pendientes. Telegram corto + detalle en Operaciones → Informes + copia por correo.
//   - Aviso mensual (primer día laborable): los borradores del trabajo del mes por cliente están en Informes.
// Todo se calcula de los datos guardados (nada nuevo en la base de datos); las claves únicas de ops_notifications
// garantizan que cada informe sale una sola vez aunque el servidor se reinicie.
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsHealthIncidents, opsNotifications } from '@/lib/db/schema';
import { getAuto } from '@/lib/operaciones/automations';
import { getAgentStats, AUTONOMY_LABEL } from '@/lib/operaciones/agent-actions';
import { agencyHolidays, getCalendar, KIND_LABEL, offEntry } from '@/lib/operaciones/calendar';
import { getInbox, waitLabel } from '@/lib/operaciones/inbox';
import { computeDay, fmtDuration, breakOver } from '@/lib/operaciones/jornada-core';
import {
  getCurrentDays,
  isWorkDay,
  jornadaSettings,
  loadWorkEvents,
  localTimeMs,
  scheduledBounds,
  shiftDate,
  todayIn,
  toDayEvent
} from '@/lib/operaciones/jornada';
import { enqueueNotification, localParts, toMinutes } from '@/lib/operaciones/notifications';
import { getPendingEmailProposals } from '@/lib/operaciones/owner-queue';
import { getOwnerMember, getTelegramConfig } from '@/lib/operaciones/telegram-config';
import { clampMessage, escapeHtml, htmlToPlain } from '@/lib/operaciones/telegram';
import { getTeamToday } from '@/lib/operaciones/team-today';

export const REPORT_TZ = 'Europe/Madrid';
const BASE_URL = () => (process.env.BASE_URL || '').replace(/\/$/, '');

export async function reportsSettings(tenantId: string) {
  const a = await getAuto(tenantId, 'reports');
  return {
    enabled: a.enabled,
    morning: Boolean(a.cfg.morning),
    morningTime: String(a.cfg.morningTime || '09:30'),
    weekly: Boolean(a.cfg.weekly),
    weeklyTime: String(a.cfg.weeklyTime || '08:30'),
    weeklyEmail: Boolean(a.cfg.weeklyEmail),
    monthly: Boolean(a.cfg.monthly)
  };
}

// --- Fechas -----------------------------------------------------------------------------------

/** Lunes (YYYY-MM-DD) de la semana de una fecha. */
export function mondayOf(date: string): string {
  const wd = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return shiftDate(date, wd === 0 ? -6 : 1 - wd);
}

/** Semana [lunes, lunes siguiente) en Madrid, como instantes. */
export function weekRange(monday: string): { from: string; to: string; fromMs: number; toMs: number; label: string } {
  const to = shiftDate(monday, 7);
  const f = (d: string) => new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(new Date(`${d}T12:00:00Z`));
  return { from: monday, to, fromMs: localTimeMs(REPORT_TZ, monday, '00:00'), toMs: localTimeMs(REPORT_TZ, to, '00:00'), label: `${f(monday)} – ${f(shiftDate(monday, 6))}` };
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
const pctText = (v: number | null) => (v === null ? '—' : `${v} %`);
const delta = (cur: number | null, prev: number | null, unit = '') => {
  if (cur === null || prev === null) return '';
  const d = Math.round((cur - prev) * 10) / 10;
  if (d === 0) return ' (=)';
  return ` (${d > 0 ? '▲' : '▼'}${Math.abs(d)}${unit})`;
};
const iso = (ms: number) => new Date(ms).toISOString();

// --- Parte de la mañana -----------------------------------------------------------------------

type Btn = { text: string; data: string };
export type MorningBrief = { text: string; buttons: Btn[][]; notable: boolean };

/** Persona libre que menos tareas tiene hoy (para sugerir a quién pasar algo). Función pura. */
export function suggestCover(load: { id: string; name: string; working: boolean; tasks: number }[], exclude: string): { id: string; name: string; tasks: number } | null {
  const c = load.filter((p) => p.working && p.id !== exclude).sort((a, b) => a.tasks - b.tasks)[0];
  return c ? { id: c.id, name: c.name, tasks: c.tasks } : null;
}

export async function buildMorningBrief(tenantId: string, now = new Date()): Promise<MorningBrief> {
  const nowMs = now.getTime();
  const owner = await getOwnerMember(tenantId);
  const jcfg = await jornadaSettings(tenantId);
  const auto = await getAuto(tenantId, 'autopilot');
  const calendar = await getCalendar(tenantId);
  const days = await getCurrentDays(tenantId, now);
  const sections: string[] = [];
  const buttons: Btn[][] = [];
  let notable = false;

  // Tareas de hoy y vencidas por persona (caché de 2 min de «Equipo hoy»; si ClickUp falla, el parte sale igual).
  let team: Awaited<ReturnType<typeof getTeamToday>> | null = null;
  try {
    team = await getTeamToday(tenantId);
  } catch (e) {
    console.error('[informes] equipo hoy:', e instanceof Error ? e.message : e);
  }
  const tasksOf = (u: string) => team?.members.find((m) => m.member.id === u) ?? null;

  // 1. Personas: quién trabaja, quién falta (calendario o ausencia) y quién no ha empezado.
  const lines: string[] = [];
  const out: { u: string; name: string; why: string }[] = [];
  const load: { id: string; name: string; working: boolean; tasks: number }[] = [];
  for (const [u, d] of days) {
    if (u === owner?.clickupUserId) continue;
    const today = todayIn(d.sch.timezone, now);
    const off = offEntry(calendar, u, today);
    const t = tasksOf(u);
    const nToday = t?.today.length ?? 0;
    const st = d.state.status;
    let working = false;
    if (off) {
      lines.push(`• <b>${escapeHtml(d.person.name)}</b>: ${KIND_LABEL[off.kind]} (${escapeHtml(off.name)})`);
      out.push({ u, name: d.person.name, why: off.kind === 'festivo' ? 'festivo' : off.kind });
    } else if (!isWorkDay(d.sch, today)) {
      continue; // no le toca trabajar hoy
    } else if (st === 'ausente') {
      lines.push(`• <b>${escapeHtml(d.person.name)}</b>: 🏠 ausencia${d.state.absenceReason ? ` («${escapeHtml(d.state.absenceReason)}»)` : ''}`);
      out.push({ u, name: d.person.name, why: 'ausencia' });
    } else if (jcfg.enabled && st === 'sin_empezar') {
      const { start } = scheduledBounds(d.sch, today);
      if (nowMs >= start + 45 * 60_000) {
        lines.push(`• <b>${escapeHtml(d.person.name)}</b>: ⚪ no ha empezado (entrada ${d.sch.workStart} en su hora)`);
        out.push({ u, name: d.person.name, why: 'no ha empezado' });
        notable = true;
      } else {
        working = true;
        lines.push(`• <b>${escapeHtml(d.person.name)}</b>: ⏳ aún no es su hora (${d.sch.workStart})`);
      }
    } else {
      working = true;
      if (jcfg.enabled) {
        const extra = d.state.activeTask ? ` · con «${escapeHtml(d.state.activeTask.name)}»` : '';
        lines.push(`• <b>${escapeHtml(d.person.name)}</b>: 🟢 ${st === 'trabajando' ? 'trabajando' : st}${extra} · ${nToday} tarea(s) hoy`);
      }
    }
    load.push({ id: u, name: d.person.name, working, tasks: nToday });
  }
  if (lines.length) sections.push(`👥 <b>Equipo hoy</b>\n${lines.join('\n')}`);

  // 2. Lo que se cae: tareas que vencen hoy de quien no está (B4). Nada se reasigna solo.
  const falling: string[] = [];
  for (const o of out) {
    const t = tasksOf(o.u);
    const due = t?.today ?? [];
    if (!due.length) continue;
    notable = true;
    const cover = auto.enabled && Boolean(auto.cfg.absenceReassign) ? suggestCover(load, o.u) : null;
    falling.push(
      `• <b>${escapeHtml(o.name)}</b> (${escapeHtml(o.why)}): ${due.length} tarea(s) vencen hoy${cover ? ` · podría llevarlas <b>${escapeHtml(cover.name)}</b> (${cover.tasks} hoy)` : ''}`
    );
    for (const task of due.slice(0, 6)) {
      falling.push(`   – <a href="${task.url.replace(/"/g, '%22')}">${escapeHtml(task.name.slice(0, 70))}</a>`);
      if (auto.enabled && auto.cfg.absenceReassign && buttons.length < 6) {
        const row = [{ text: `📅 Mañana · ${task.name.slice(0, 18)}`, data: `ap:due:${task.id}` }];
        if (cover) row.push({ text: `👤 A ${cover.name.split(' ')[0].slice(0, 12)}`, data: `ap:as:${task.id}:${cover.id}:${o.u}` });
        buttons.push(row);
      }
    }
  }
  if (falling.length) {
    sections.push(
      `⚠️ <b>Se cae hoy</b>\n${falling.join('\n')}\n<i>«👤 A…» la reasigna en ClickUp y el bot avisa a la nueva persona; «📅 Mañana» la mueve al siguiente día laborable.</i>`
    );
  }

  // 3. Lo que espera de ti.
  const inbox = await getInbox(tenantId);
  const emails = await getPendingEmailProposals(tenantId);
  if (inbox.length || emails.length) {
    notable = true;
    const oldest = [...inbox.map((i) => i.since), ...emails.map((e) => e.since)].sort((a, b) => a.getTime() - b.getTime())[0];
    const parts = [
      emails.length ? `${emails.length} correo(s) de cliente` : '',
      inbox.filter((i) => i.kind === 'review').length ? `${inbox.filter((i) => i.kind === 'review').length} revisión(es)` : '',
      inbox.filter((i) => i.kind === 'blocker').length ? `${inbox.filter((i) => i.kind === 'blocker').length} bloqueo(s)` : ''
    ].filter(Boolean);
    sections.push(`🙋 <b>Espera de ti</b>: ${parts.join(', ')} · lo más antiguo, ${waitLabel(oldest, now)}. Detalle en Mi bandeja.`);
  }

  // 4. Salud: solo si hay algo abierto.
  const open = await db
    .select({ title: opsHealthIncidents.title, severity: opsHealthIncidents.severity })
    .from(opsHealthIncidents)
    .where(and(eq(opsHealthIncidents.tenantId, tenantId), isNull(opsHealthIncidents.resolvedAt)));
  if (open.length) {
    notable = true;
    sections.push(`🩺 <b>Salud</b>: ${open.map((o) => `${o.severity === 'critico' ? '🔴' : '🟠'} ${escapeHtml(o.title)}`).join(' · ')}`);
  }

  const date = new Intl.DateTimeFormat('es-ES', { timeZone: REPORT_TZ, weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  const text = clampMessage(`☀️ <b>Parte de la mañana</b> · ${escapeHtml(date)}\n\n${sections.length ? sections.join('\n\n') : 'Todo en orden.'}`);
  return { text, buttons, notable };
}

// --- Informe semanal --------------------------------------------------------------------------

export type PersonWeek = {
  u: string;
  name: string;
  daysWorked: number;
  workedMin: number;
  breakOverDays: number;
  autoClosed: number;
  absences: number;
  delivered: number;
  withDue: number;
  onTime: number;
  timed: number;
  estimated: number;
  hits: number;
  over: number;
  blocked: number;
};

export type WeeklyReport = {
  label: string;
  monday: string;
  jornadaOn: boolean;
  people: PersonWeek[];
  team: { delivered: number; onTimePct: number | null; workedH: number; precisionPct: number | null; blocked: number; blockedByAi: number; reminders: number };
  prevTeam: WeeklyReport['team'] | null;
  clients: { inactive: number; unplanned: number; emailsIn: number; emailsAnswered: number };
  agent: { label: string; autonomy: string; decided: number; hitRate: number | null; auto: number; recommendation: string | null }[];
  system: { incidents: { title: string; severity: string; minutes: number | null }[]; downMin: number; aiUsd: number; clickupRequests: number };
  ai: { spentMonth: number; forecast: number; budget: number; account: boolean; topRecommendation: string | null } | null;
  pending: { count: number; oldest: string | null };
};

type Row = Record<string, unknown>;
const rows = async (q: ReturnType<typeof sql>) => (await db.execute(q)) as unknown as Row[];
const n = (v: unknown) => Number(v ?? 0);

async function teamWeek(tenantId: string, monday: string, withPeople: boolean): Promise<{ team: WeeklyReport['team']; people: PersonWeek[]; jornadaOn: boolean }> {
  const w = weekRange(monday);
  const from = iso(w.fromMs);
  const to = iso(w.toMs);
  const owner = await getOwnerMember(tenantId);
  const people = new Map<string, PersonWeek>();
  const person = (u: string, name: string) => {
    let p = people.get(u);
    if (!p) {
      p = { u, name, daysWorked: 0, workedMin: 0, breakOverDays: 0, autoClosed: 0, absences: 0, delivered: 0, withDue: 0, onTime: 0, timed: 0, estimated: 0, hits: 0, over: 0, blocked: 0 };
      people.set(u, p);
    }
    return p;
  };

  // Entregas (Hecho o Hecho con revisión) y si fueron a tiempo respecto a la fecha del encargo.
  for (const r of await rows(sql`
    SELECT e.person_clickup_user_id AS u, max(e.person_name) AS name,
           count(DISTINCT e.request_id)::int AS delivered,
           count(DISTINCT e.request_id) FILTER (WHERE r.due_date IS NOT NULL)::int AS with_due,
           count(DISTINCT e.request_id) FILTER (WHERE r.due_date IS NOT NULL AND r.due_date >= (e.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Madrid')::date)::int AS on_time
    FROM ops_request_events e JOIN ops_requests r ON r.id = e.request_id
    WHERE e.tenant_id = ${tenantId} AND e.event_type IN ('done', 'done_review')
      AND e.created_at >= ${from}::timestamp AND e.created_at < ${to}::timestamp AND e.person_clickup_user_id IS NOT NULL
    GROUP BY e.person_clickup_user_id`)) {
    if (r.u === owner?.clickupUserId) continue;
    const p = person(String(r.u), String(r.name ?? '—'));
    p.delivered = n(r.delivered);
    p.withDue = n(r.with_due);
    p.onTime = n(r.on_time);
  }

  // Bloqueos pedidos y cuántos resolvió la IA.
  let blockedByAi = 0;
  for (const r of await rows(sql`
    SELECT asked_by_clickup_id AS u, max(asked_by_name) AS name, count(*)::int AS n,
           count(*) FILTER (WHERE status = 'respondido_agente')::int AS ai
    FROM ops_blockers WHERE tenant_id = ${tenantId} AND created_at >= ${from}::timestamp AND created_at < ${to}::timestamp
    GROUP BY asked_by_clickup_id`)) {
    blockedByAi += n(r.ai);
    if (!r.u || r.u === owner?.clickupUserId) continue;
    person(String(r.u), String(r.name ?? '—')).blocked = n(r.n);
  }

  // Tiempos de tarea (5B): precisión y tareas por encima del margen.
  for (const r of await rows(sql`
    SELECT clickup_user_id AS u, max(person_name) AS name, count(*)::int AS n,
           count(estimate_minutes)::int AS est, count(*) FILTER (WHERE precision_hit)::int AS hits,
           count(*) FILTER (WHERE verdict = 'pasado')::int AS over
    FROM ops_task_times WHERE tenant_id = ${tenantId} AND status = 'cerrada' AND voided_at IS NULL
      AND done_at >= ${from}::timestamp AND done_at < ${to}::timestamp
    GROUP BY clickup_user_id`)) {
    if (r.u === owner?.clickupUserId) continue;
    const p = person(String(r.u), String(r.name ?? '—'));
    p.timed = n(r.n);
    p.estimated = n(r.est);
    p.hits = n(r.hits);
    p.over = n(r.over);
  }

  // Jornada: días trabajados, horas, descansos sobre el cupo, cierres automáticos y ausencias.
  const jcfg = await jornadaSettings(tenantId);
  const evs = await loadWorkEvents(tenantId, { from: w.from, to: shiftDate(w.to, -1) });
  const groups = new Map<string, typeof evs>();
  for (const e of evs) groups.set(`${e.clickupUserId}|${e.workDate}`, [...(groups.get(`${e.clickupUserId}|${e.workDate}`) ?? []), e]);
  for (const [k, list] of groups) {
    const u = k.split('|')[0];
    if (u === owner?.clickupUserId) continue;
    const st = computeDay(list.map(toDayEvent), w.toMs);
    const p = person(u, list[0].personName);
    if (st.status === 'ausente') {
      p.absences++;
      continue;
    }
    if (st.status === 'sin_empezar') continue;
    p.daysWorked++;
    p.workedMin += st.workedMin;
    if (breakOver(st, jcfg.breakQuotaMin) > 0) p.breakOverDays++;
    if (st.salidaSource === 'auto') p.autoClosed++;
  }

  const [rem] = await rows(sql`
    SELECT count(*)::int AS n FROM ops_request_events
    WHERE tenant_id = ${tenantId} AND event_type = 'reminder_sent' AND created_at >= ${from}::timestamp AND created_at < ${to}::timestamp`);

  const list = [...people.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const sum = (f: (p: PersonWeek) => number) => list.reduce((s, p) => s + f(p), 0);
  return {
    jornadaOn: jcfg.enabled,
    people: withPeople ? list : [],
    team: {
      delivered: sum((p) => p.delivered),
      onTimePct: pct(sum((p) => p.onTime), sum((p) => p.withDue)),
      workedH: Math.round(sum((p) => p.workedMin) / 6) / 10,
      precisionPct: pct(sum((p) => p.hits), sum((p) => p.estimated)),
      blocked: sum((p) => p.blocked),
      blockedByAi,
      reminders: n(rem?.n)
    }
  };
}

export async function buildWeeklyReport(tenantId: string, monday: string): Promise<WeeklyReport> {
  const w = weekRange(monday);
  const from = iso(w.fromMs);
  const to = iso(w.toMs);
  const cur = await teamWeek(tenantId, monday, true);
  const prev = await teamWeek(tenantId, shiftDate(monday, -7), false);

  const [cl] = await rows(sql`
    SELECT count(*) FILTER (WHERE inactive_notified_at IS NOT NULL)::int AS inactive,
           count(*) FILTER (WHERE unplanned_notified_at IS NOT NULL)::int AS unplanned
    FROM ops_client_activity WHERE tenant_id = ${tenantId}`);
  const [em] = await rows(sql`
    SELECT (SELECT count(*)::int FROM ops_inbound_emails WHERE tenant_id = ${tenantId} AND created_at >= ${from}::timestamp AND created_at < ${to}::timestamp) AS inbound,
           (SELECT count(*)::int FROM ops_agent_actions WHERE tenant_id = ${tenantId} AND kind = 'email_reply' AND status IN ('aprobado', 'corregido')
              AND decided_at >= ${from}::timestamp AND decided_at < ${to}::timestamp) AS answered`);

  const agent = (await getAgentStats(tenantId, 7)).map((s) => ({
    label: s.label,
    autonomy: AUTONOMY_LABEL[s.autonomy],
    decided: s.approved + s.corrected + s.rejected,
    hitRate: s.hitRate === null ? null : Math.round(s.hitRate * 100),
    auto: s.auto,
    recommendation: s.recommendation
  }));

  const incidents = (
    await rows(sql`
      SELECT title, severity, check_key,
             CASE WHEN resolved_at IS NULL THEN NULL ELSE round(extract(epoch from (resolved_at - opened_at)) / 60)::int END AS minutes
      FROM ops_health_incidents WHERE tenant_id = ${tenantId} AND opened_at >= ${from}::timestamp AND opened_at < ${to}::timestamp
      ORDER BY opened_at`)
  ).map((r) => ({ title: String(r.title), severity: String(r.severity), minutes: r.minutes === null ? null : n(r.minutes), key: String(r.check_key) }));
  const [sys] = await rows(sql`
    SELECT (SELECT coalesce(sum(estimated_cost), 0)::float FROM ai_jobs WHERE tenant_id = ${tenantId} AND created_at >= ${from}::timestamp AND created_at < ${to}::timestamp) AS ai,
           (SELECT count(*)::int FROM ops_clickup_requests WHERE tenant_id = ${tenantId} AND requested_at >= ${from}::timestamp AND requested_at < ${to}::timestamp) AS cu`);

  const inbox = await getInbox(tenantId);
  const emails = await getPendingEmailProposals(tenantId);
  const oldest = [...inbox.map((i) => i.since), ...emails.map((e) => e.since)].sort((a, b) => a.getTime() - b.getTime())[0];

  return {
    label: w.label,
    monday,
    jornadaOn: cur.jornadaOn,
    people: cur.people,
    team: cur.team,
    prevTeam: prev.team,
    clients: { inactive: n(cl?.inactive), unplanned: n(cl?.unplanned), emailsIn: n(em?.inbound), emailsAnswered: n(em?.answered) },
    agent,
    system: {
      incidents: incidents.filter((i) => i.key !== 'parada').map(({ title, severity, minutes }) => ({ title, severity, minutes })),
      downMin: incidents.filter((i) => i.key === 'parada').reduce((s, i) => s + (i.minutes ?? 0), 0),
      aiUsd: Math.round(n(sys?.ai) * 100) / 100,
      clickupRequests: n(sys?.cu)
    },
    ai: await aiLine(tenantId),
    pending: { count: inbox.length + emails.length, oldest: oldest ? waitLabel(oldest) : null }
  };
}

/** Línea del vigía de IA para el semanal (con la cuenta conectada usa su coste real, de la caché de 1 h). */
async function aiLine(tenantId: string): Promise<WeeklyReport['ai']> {
  try {
    const { getAiOverview } = await import('@/lib/operaciones/ai-watch');
    const o = await getAiOverview(tenantId);
    const account = o.org.connected && !o.org.error;
    const rec = o.recommendations.find((r) => r.savingUsdMonth) ?? o.recommendations[0];
    return {
      spentMonth: o.org.connected && !o.org.error ? o.org.mtdUsd : o.mtd,
      forecast: o.forecast,
      budget: o.settings.monthly,
      account,
      topRecommendation: rec ? `${rec.title}${rec.savingUsdMonth ? ` (≈ ${rec.savingUsdMonth.toFixed(2)} $/mes)` : ''}` : null
    };
  } catch (e) {
    console.error('[informes] vigía de IA:', e instanceof Error ? e.message : e);
    return null;
  }
}

/** Texto de Telegram del informe semanal (corto: el detalle está en la web). */
export function weeklyText(r: WeeklyReport, link: string | null): string {
  const t = r.team;
  const p = r.prevTeam;
  const lines: string[] = [`📊 <b>Informe semanal</b> · ${escapeHtml(r.label)}`, ''];
  lines.push('👥 <b>Equipo</b>');
  lines.push(`• Entregas: <b>${t.delivered}</b>${delta(t.delivered, p?.delivered ?? null)} · a tiempo ${pctText(t.onTimePct)}${delta(t.onTimePct, p?.onTimePct ?? null, ' pt')}`);
  if (r.jornadaOn) lines.push(`• Horas trabajadas: <b>${t.workedH} h</b>${delta(t.workedH, p?.workedH ?? null, ' h')}`);
  if (t.precisionPct !== null) lines.push(`• Precisión de estimación: ${pctText(t.precisionPct)}${delta(t.precisionPct, p?.precisionPct ?? null, ' pt')}`);
  lines.push(`• Bloqueos: ${t.blocked} (la IA resolvió ${t.blockedByAi}) · recordatorios: ${t.reminders}`);
  const flags = r.people.filter((x) => x.autoClosed || x.breakOverDays || (x.withDue && x.onTime / x.withDue < 0.7));
  for (const x of flags) {
    const f = [
      x.withDue && x.onTime / x.withDue < 0.7 ? `a tiempo ${pctText(pct(x.onTime, x.withDue))}` : '',
      x.breakOverDays ? `${x.breakOverDays} día(s) sobre el cupo de descanso` : '',
      x.autoClosed ? `${x.autoClosed} salida(s) sin marcar` : ''
    ].filter(Boolean);
    lines.push(`   ⚠️ ${escapeHtml(x.name)}: ${f.join(' · ')}`);
  }
  lines.push('', '🏢 <b>Clientes</b>');
  lines.push(`• En alerta: ${r.clients.inactive} sin actividad · ${r.clients.unplanned} sin trabajo planificado`);
  lines.push(`• Correos recibidos: ${r.clients.emailsIn} · respuestas enviadas: ${r.clients.emailsAnswered}`);
  lines.push('', '🤖 <b>Agente</b>');
  for (const a of r.agent) {
    if (!a.decided && !a.auto) continue;
    lines.push(`• ${escapeHtml(a.label)} (${escapeHtml(a.autonomy)}): ${a.decided} decididas, ${pctText(a.hitRate)} tal cual${a.auto ? ` · ${a.auto} solo` : ''}`);
    if (a.recommendation) lines.push(`   💡 ${escapeHtml(a.recommendation)}`);
  }
  if (r.agent.every((a) => !a.decided && !a.auto)) lines.push('• Sin propuestas esta semana.');
  lines.push('', '🩺 <b>Sistema</b>');
  lines.push(
    `• ${r.system.incidents.length ? `${r.system.incidents.length} incidencia(s)` : 'Sin incidencias'}${r.system.downMin ? ` · ${fmtDuration(r.system.downMin)} parado` : ''} · IA ${r.system.aiUsd.toFixed(2)} $ · ClickUp ${r.system.clickupRequests} peticiones`
  );
  if (r.ai) {
    lines.push(`• IA este mes: ${r.ai.spentMonth.toFixed(2)} $${r.ai.account ? ' (toda la cuenta)' : ''} · previsión ${r.ai.forecast.toFixed(2)} $ de ${r.ai.budget.toFixed(0)} $${r.ai.forecast > r.ai.budget ? ' ⚠️' : ''}`);
    if (r.ai.topRecommendation) lines.push(`   💡 ${escapeHtml(r.ai.topRecommendation)}`);
  }
  lines.push('', r.pending.count ? `🙋 <b>Te esperan ${r.pending.count}</b> (lo más antiguo, ${r.pending.oldest}).` : '🙋 Nada esperando tu decisión.');
  if (link) lines.push('', `<a href="${link}">Ver el informe completo</a>`);
  return clampMessage(lines.join('\n'));
}

// --- Planificador -----------------------------------------------------------------------------

async function exists(tenantId: string, key: string): Promise<boolean> {
  const [r] = await db
    .select({ id: opsNotifications.id })
    .from(opsNotifications)
    .where(and(eq(opsNotifications.tenantId, tenantId), eq(opsNotifications.dedupeKey, key)))
    .limit(1);
  return Boolean(r);
}

async function toOwner(tenantId: string, key: string, text: string, buttons: Btn[][] = [], skipped = false) {
  const owner = await getOwnerMember(tenantId);
  if (!owner) return false;
  return enqueueNotification({
    tenantId,
    kind: 'digest',
    dedupeKey: key,
    forClickupUserId: owner.clickupUserId,
    forName: owner.username,
    payload: { text, toOwner: true, buttons: buttons.length ? buttons : undefined, skipped: skipped ? 'nada que contar' : undefined },
    skipped
  });
}

/** Primer día laborable (L-V, sin festivos de la agencia) del mes de `date`. */
export function firstWorkdayOfMonth(date: string, holidays: Set<string>): string {
  let d = `${date.slice(0, 7)}-01`;
  for (let i = 0; i < 10; i++) {
    const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (wd !== 0 && wd !== 6 && !holidays.has(d)) return d;
    d = shiftDate(d, 1);
  }
  return d;
}

/** Correo con el informe semanal al dueño (buzón del agente). Silencioso si no hay buzón. */
async function emailWeekly(tenantId: string, r: WeeklyReport, text: string, key: string) {
  try {
    const { getEmailConfig, sendInternalEmail } = await import('@/lib/operaciones/resend');
    const ecfg = await getEmailConfig(tenantId);
    if (!ecfg.apiKey || !ecfg.bcc) return;
    await sendInternalEmail(ecfg, { to: ecfg.bcc, subject: `Informe semanal Kijutech · ${r.label}`, text: htmlToPlain(text), idempotencyKey: key });
  } catch (e) {
    console.error('[informes] correo semanal:', e instanceof Error ? e.message : e);
  }
}

/** Planificador (cada 30 s): parte de la mañana, semanal y aviso mensual, cada uno una sola vez. */
export async function runReports(tenantId: string, now = new Date()): Promise<void> {
  const cfg = await reportsSettings(tenantId);
  if (!cfg.enabled) return;
  if (!(await getTelegramConfig(tenantId))) return;
  const lp = localParts(REPORT_TZ, now);
  if (lp.weekday === 'Sat' || lp.weekday === 'Sun') return;
  const today = lp.date;
  const holidays = agencyHolidays(await getCalendar(tenantId));
  if (holidays.has(today)) return;
  const WINDOW = 4 * 60; // si el servidor estaba apagado a esa hora, hasta 4 h después

  // Parte de la mañana. Con la jornada encendida espera a que pasen 45 min de la entrada de todos los que trabajan hoy.
  if (cfg.morning) {
    let at = toMinutes(cfg.morningTime);
    if ((await jornadaSettings(tenantId)).enabled) {
      const owner = await getOwnerMember(tenantId);
      for (const [u, d] of await getCurrentDays(tenantId, now)) {
        if (u === owner?.clickupUserId) continue;
        const day = todayIn(d.sch.timezone, now);
        if (!isWorkDay(d.sch, day)) continue;
        const startMadrid = localParts(REPORT_TZ, new Date(scheduledBounds(d.sch, day).start + 45 * 60_000));
        if (startMadrid.date === today) at = Math.max(at, startMadrid.minutes);
      }
    }
    const key = `report:morning:${today}`;
    if (lp.minutes >= at && lp.minutes < at + WINDOW && !(await exists(tenantId, key))) {
      const b = await buildMorningBrief(tenantId, now);
      await toOwner(tenantId, key, b.text, b.buttons, !b.notable);
    }
  }

  const at = toMinutes(cfg.weeklyTime);
  if (lp.minutes < at || lp.minutes >= at + WINDOW) return;

  // Informe semanal: el lunes (o el primer día laborable de la semana si el lunes es festivo).
  if (cfg.weekly) {
    const monday = mondayOf(today);
    let firstDay = monday;
    for (let i = 0; i < 4 && holidays.has(firstDay); i++) firstDay = shiftDate(firstDay, 1);
    const key = `report:weekly:${monday}`;
    if (today === firstDay && !(await exists(tenantId, key))) {
      const prevMonday = shiftDate(monday, -7);
      const r = await buildWeeklyReport(tenantId, prevMonday);
      const base = BASE_URL();
      const text = weeklyText(r, base ? `${base}/dashboard/operaciones/informes?semana=${prevMonday}` : null);
      const inserted = await toOwner(tenantId, key, text);
      if (inserted && cfg.weeklyEmail) await emailWeekly(tenantId, r, text, key);
    }
  }

  // Aviso mensual: el trabajo del mes anterior por cliente, listo para revisar y enviar.
  if (cfg.monthly) {
    const key = `report:monthly:${today.slice(0, 7)}`;
    if (today === firstWorkdayOfMonth(today, holidays) && !(await exists(tenantId, key))) {
      const base = BASE_URL();
      await toOwner(
        tenantId,
        key,
        `📅 <b>Trabajo del mes pasado por cliente</b>\nLos borradores están listos para revisar y copiar (uno por cliente con trabajo cerrado).${base ? `\n\n<a href="${base}/dashboard/operaciones/informes?vista=mes">Abrir los borradores</a>` : '\n\nEn Operaciones → Informes → Trabajo del mes.'}`
      );
    }
  }
}

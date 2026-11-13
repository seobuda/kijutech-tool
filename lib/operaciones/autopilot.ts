import 'server-only';

// Piloto automático (revisión de autonomía, 12 nov 2026): decisiones de rutina que el sistema toma o propone solo.
//   - «Mover a mañana» (botón del parte de la mañana para lo que se cae por una ausencia): cambia la fecha en ClickUp
//     por la bandeja de salida. Reasignar a otra persona sigue siendo cosa de Enric en ClickUp (la vigilancia avisa
//     a la nueva persona sola).
//   - Limpieza semanal de vencidas (lunes, a la hora de entrada de cada persona, si tiene al menos N vencidas).
//   - Autonomía del agente: los lunes, propuesta de subirla cuando los datos lo avalan (botón); a diario, bajada
//     automática de «Autónomo» a «Con tu aprobación» si falla (dirección segura: solo baja sola, nunca sube sola).
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsNotifications, type OpsTelegramMember } from '@/lib/db/schema';
import { getAuto, num } from '@/lib/operaciones/automations';
import { AGENT_KINDS, AUTONOMY_LABEL, getAgentStats, isAgentKind, setAutonomy, type AgentKind } from '@/lib/operaciones/agent-actions';
import { agencyHolidays, getCalendar } from '@/lib/operaciones/calendar';
import { logEvent } from '@/lib/operaciones/events';
import { getCurrentDays, isWorkDay, scheduledBounds, shiftDate, todayIn } from '@/lib/operaciones/jornada';
import { enqueueNotification, localParts } from '@/lib/operaciones/notifications';
import { enqueueOutbox } from '@/lib/operaciones/outbox';
import { escapeHtml, type TgCallbackQuery } from '@/lib/operaciones/telegram';
import { getOwnerMember } from '@/lib/operaciones/telegram-config';

const TZ = 'Europe/Madrid';
export const AUTOPILOT_CALLBACK_RE = /^ap:(due|up|as):([\w-]{1,40})(?::(\d{1,20}):(\d{1,20}))?$/;
export const DEMOTE_MIN_DECIDED = 10;
export const DEMOTE_BELOW = 0.8;

/** Siguiente día laborable (L-V sin festivos de la agencia) después de `date`. Función pura. */
export function nextWorkday(date: string, holidays: Set<string>): string {
  let d = shiftDate(date, 1);
  for (let i = 0; i < 15; i++) {
    const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (wd !== 0 && wd !== 6 && !holidays.has(d)) return d;
    d = shiftDate(d, 1);
  }
  return d;
}

/** ¿Hay que bajar la autonomía de este tipo? Función pura. */
export function shouldDemote(s: { autonomy: string; approved: number; corrected: number; rejected: number }): boolean {
  const decided = s.approved + s.corrected + s.rejected;
  return s.autonomy === 'autonomo' && decided >= DEMOTE_MIN_DECIDED && s.approved / decided < DEMOTE_BELOW;
}

/** ¿Proponer subir a autónomo? (mismo criterio que la pestaña Agente). Función pura. */
export function shouldPromote(s: { autonomy: string; allowed: string[]; approved: number; corrected: number; rejected: number }): boolean {
  const decided = s.approved + s.corrected + s.rejected;
  return s.autonomy === 'aprobacion' && s.allowed.includes('autonomo') && decided >= 30 && s.approved / decided >= 0.95;
}

async function sent(tenantId: string, key: string) {
  const [r] = await db
    .select({ id: opsNotifications.id })
    .from(opsNotifications)
    .where(and(eq(opsNotifications.tenantId, tenantId), eq(opsNotifications.dedupeKey, key)))
    .limit(1);
  return Boolean(r);
}

async function toOwner(tenantId: string, key: string, text: string, buttons?: { text: string; data: string }[][]) {
  const owner = await getOwnerMember(tenantId);
  if (!owner) return;
  await enqueueNotification({
    tenantId,
    kind: 'digest',
    dedupeKey: key,
    forClickupUserId: owner.clickupUserId,
    forName: owner.username,
    payload: { text, toOwner: true, buttons }
  });
}

/** Texto y botones de la propuesta semanal de autonomía (null si no hay nada que proponer). */
export async function autonomyProposal(tenantId: string): Promise<{ text: string; buttons: { text: string; data: string }[][] } | null> {
  const stats = await getAgentStats(tenantId, 30);
  const up = stats.filter(shouldPromote);
  if (!up.length) return null;
  const lines = up.map((s) => {
    const decided = s.approved + s.corrected + s.rejected;
    return `• <b>${escapeHtml(s.label)}</b>: ${Math.round((s.approved / decided) * 100)} % aprobadas tal cual en ${decided} propuestas (30 días).`;
  });
  return {
    text: `🤖 <b>El agente está listo para más autonomía</b>\n${lines.join('\n')}\n\nSi la subes, actuará solo y quedará registrado; si empieza a fallar, vuelve sola a «Con tu aprobación».`,
    buttons: up.map((s) => [{ text: `⬆️ ${s.label}: pasar a autónomo`, data: `ap:up:${s.kind}` }])
  };
}

/** Planificador (cada 30 s). */
export async function runAutopilot(tenantId: string, now = new Date()): Promise<void> {
  const auto = await getAuto(tenantId, 'autopilot');
  if (!auto.enabled) return;
  const lp = localParts(TZ, now);
  const today = lp.date;
  const weekend = lp.weekday === 'Sat' || lp.weekday === 'Sun';

  // Bajada automática (a diario, una vez por tipo y día).
  if (auto.cfg.autoDemote) {
    for (const s of await getAgentStats(tenantId, 7)) {
      if (!shouldDemote(s)) continue;
      const key = `ap:demote:${s.kind}:${today}`;
      if (await sent(tenantId, key)) continue;
      await setAutonomy(tenantId, s.kind, 'aprobacion');
      await logEvent(tenantId, { actor: { clickupUserId: null, name: 'Piloto automático' }, type: 'autonomia', payload: { kind: s.kind, from: 'autonomo', to: 'aprobacion', approved: s.approved, decided: s.approved + s.corrected + s.rejected } });
      const decided = s.approved + s.corrected + s.rejected;
      await toOwner(
        tenantId,
        key,
        `🛡 <b>He bajado la autonomía de «${escapeHtml(s.label)}»</b> a «${AUTONOMY_LABEL.aprobacion}»: solo el ${Math.round((s.approved / decided) * 100)} % de ${decided} propuestas se aprobaron tal cual en 7 días. Te las propondré antes de actuar. Puedes volver a subirla en Operaciones → Agente.`
      );
    }
  }
  if (weekend || agencyHolidays(await getCalendar(tenantId)).has(today)) return;
  const monday = lp.weekday === 'Mon';

  // Propuesta semanal de subir la autonomía (lunes desde las 8:30, hora de Madrid).
  if (monday && auto.cfg.autonomyWeekly && lp.minutes >= 8 * 60 + 30 && lp.minutes < 13 * 60) {
    const key = `ap:autonomy:${today}`;
    if (!(await sent(tenantId, key))) {
      const p = await autonomyProposal(tenantId);
      if (p) await toOwner(tenantId, key, p.text, p.buttons);
    }
  }

  // Limpieza semanal de vencidas (lunes, 15 min después de la entrada de cada persona).
  if (monday && auto.cfg.weeklyCleanup) {
    const owner = await getOwnerMember(tenantId);
    const days = await getCurrentDays(tenantId, now);
    const minOverdue = num(auto, 'minOverdue');
    for (const [u, d] of days) {
      if (u === owner?.clickupUserId) continue;
      const day = todayIn(d.sch.timezone, now);
      if (!isWorkDay(d.sch, day)) continue;
      const start = scheduledBounds(d.sch, day).start + 15 * 60_000;
      if (now.getTime() < start || now.getTime() > start + 4 * 3600_000) continue;
      const key = `ap:cleanup:${u}:${day}`;
      if (await sent(tenantId, key)) continue;
      // Marca primero (clave única) para no lanzarla dos veces aunque falle a medias; el resultado va en el texto.
      const { getTeamToday } = await import('@/lib/operaciones/team-today');
      const overdue = (await getTeamToday(tenantId)).members.find((m) => m.member.id === u)?.overdue.length ?? 0;
      if (overdue < minOverdue) {
        await enqueueNotification({ tenantId, kind: 'digest', dedupeKey: key, forClickupUserId: owner?.clickupUserId ?? null, forName: 'Piloto automático', payload: { text: '', toOwner: true, skipped: `${overdue} vencidas` }, skipped: true });
        continue;
      }
      await enqueueNotification({ tenantId, kind: 'digest', dedupeKey: key, forClickupUserId: owner?.clickupUserId ?? null, forName: 'Piloto automático', payload: { text: '', toOwner: true, skipped: 'limpieza lanzada' }, skipped: true });
      const { startCleanup } = await import('@/lib/operaciones/cleanup');
      const r = await startCleanup(tenantId, { clickupUserId: u, startedBy: 'Piloto automático (lunes)' });
      if (!r.ok) console.error(`[piloto] limpieza de ${d.person.name}: ${r.error}`);
    }
  }
}

/** Botones ap:… (solo el dueño). */
export async function handleAutopilotCallback(
  tenantId: string,
  cb: TgCallbackQuery,
  presser: OpsTelegramMember,
  answer: (text?: string, alert?: boolean) => Promise<unknown>
): Promise<void> {
  const m = cb.data?.match(AUTOPILOT_CALLBACK_RE);
  if (!m) return void (await answer());
  const owner = await getOwnerMember(tenantId);
  if (!owner || owner.id !== presser.id) {
    await logEvent(tenantId, { actor: { clickupUserId: presser.clickupUserId, name: presser.username }, type: 'button_rejected', payload: { button: `ap:${m[1]}` } });
    return void (await answer('Este botón es solo de quien lleva las operaciones.', true));
  }
  const actor = { clickupUserId: owner.clickupUserId, name: owner.username };

  if (m[1] === 'due') {
    const taskId = m[2];
    const today = todayIn(TZ);
    const due = nextWorkday(today, agencyHolidays(await getCalendar(tenantId)));
    await enqueueOutbox({ tenantId, action: 'set_due', payload: { taskId, dueYmd: due }, dedupeKey: `ap:due:${taskId}:${today}` });
    await logEvent(tenantId, { actor, type: 'autonomia', payload: { kind: 'mover_a_manana', taskId, due } });
    return void (await answer(`📅 Movida al ${due.slice(8, 10)}/${due.slice(5, 7)} en ClickUp.`));
  }

  const kind = m[2];
  if (m[1] === 'as') {
    // «👤 A …» del parte: reasigna en ClickUp por la bandeja de salida; la vigilancia ve el cambio y avisa a la nueva persona.
    const [, , taskId, to, from] = m;
    if (!to || !from) return void (await answer());
    const { getStructure } = await import('@/lib/operaciones/structure');
    const member = (await getStructure(tenantId)).members.find((x) => x.id === to);
    if (!member) return void (await answer('Esa persona ya no está en ClickUp.', true));
    await enqueueOutbox({ tenantId, action: 'set_assignee', payload: { taskId, add: [to], rem: [from] }, dedupeKey: `ap:as:${taskId}:${to}:${todayIn(TZ)}` });
    await logEvent(tenantId, { actor, type: 'autonomia', payload: { kind: 'reasignar', taskId, to, from } });
    return void (await answer(`👤 Reasignada a ${member.username} en ClickUp; el bot le avisará.`));
  }
  if (!isAgentKind(kind) || !AGENT_KINDS[kind as AgentKind].allowed.includes('autonomo')) return void (await answer('Ese tipo no admite autonomía.', true));
  await setAutonomy(tenantId, kind as AgentKind, 'autonomo');
  await logEvent(tenantId, { actor, type: 'autonomia', payload: { kind, from: 'aprobacion', to: 'autonomo', via: 'telegram' } });
  return void (await answer(`⬆️ «${AGENT_KINDS[kind as AgentKind].label}» ahora es autónomo.`));
}

// Cortafuegos de avisos para quien lleva las operaciones: salvo los bloqueos y las revisiones
// URGENTES (que llegan al instante), todo va agrupado en dos resúmenes al día (por defecto 13:00 y
// 18:00, hora de Madrid; configurables): qué se ha completado, qué ha resuelto el agente solo y
// qué necesita de ti. Se inserta primero (dedupe por fecha y hora) para no duplicar ni perder
// el resumen aunque el servidor se reinicie; si estuvo apagado a esa hora, se envía hasta 3 h después.
import { and, desc, eq, gte, inArray, isNull, like } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsNotifications, opsRequestEvents, opsRequests, opsSuggestions, type OpsRequest } from '@/lib/db/schema';
import { enqueueNotification, localParts, toMinutes } from '@/lib/operaciones/notifications';
import { DEF, getAuto, num, renderTemplate } from '@/lib/operaciones/automations';
import { nearestAllowedMinute } from '@/lib/operaciones/quiet';
import { getTelegramConfig, getOwnerMember } from '@/lib/operaciones/telegram-config';
import { escapeHtml } from '@/lib/operaciones/telegram';
import { getInbox, waitLabel } from '@/lib/operaciones/inbox';
import { getOwnerTimezone, getScheduleMap, scheduleOrDefault } from '@/lib/operaciones/team-profiles';
import { getUnanswered } from '@/lib/operaciones/reminders';
import { getClientAlertsToShow, markClientAlertsShown, type ClientAlertItem } from '@/lib/operaciones/client-activity';

const MAX_LIST = 8;
const MAX_BUTTON_ROWS = 5;

const short = (t: string, n = 28) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

async function buildDigest(
  tenantId: string,
  since: Date,
  withClientAlerts = false
): Promise<{ text: string; buttons: { text: string; data: string }[][]; empty: boolean; unansweredIds: string[]; clientAlerts: ClientAlertItem[]; suggestionIds: string[] }> {
  const events = await db
    .select()
    .from(opsRequestEvents)
    .where(
      and(
        eq(opsRequestEvents.tenantId, tenantId),
        gte(opsRequestEvents.createdAt, since),
        inArray(opsRequestEvents.eventType, ['done', 'accepted', 'agent_answered', 'cleanup_finished'])
      )
    )
    .orderBy(opsRequestEvents.createdAt);

  const reqIds = [...new Set(events.map((e) => e.requestId).filter((x): x is string => Boolean(x)))];
  const reqs = reqIds.length
    ? await db.select().from(opsRequests).where(inArray(opsRequests.id, reqIds))
    : [];
  const byId = new Map<string, OpsRequest>(reqs.map((r) => [r.id, r]));

  // Un encargo sale una sola vez por sección (aunque se devolviera y se entregara de nuevo).
  const uniq = <T extends { requestId: string | null }>(list: T[]) => {
    const seen = new Set<string>();
    return list.filter((e) => (e.requestId ? (seen.has(e.requestId) ? false : (seen.add(e.requestId), true)) : true));
  };
  const completed = uniq(events.filter((e) => e.eventType === 'done' || e.eventType === 'accepted').reverse()).reverse();
  const agent = uniq(events.filter((e) => e.eventType === 'agent_answered').reverse()).reverse();
  const inbox = await getInbox(tenantId);

  const sections: string[] = [];
  if (completed.length) {
    const lines = completed.slice(0, MAX_LIST).map((e) => {
      const r = e.requestId ? byId.get(e.requestId) : undefined;
      const who = e.eventType === 'accepted' ? 'aceptado' : (e.personName ?? '—');
      return `• ${escapeHtml(r?.title ?? '(encargo borrado)')} <i>(${escapeHtml(who)})</i>`;
    });
    if (completed.length > MAX_LIST) lines.push(`… y ${completed.length - MAX_LIST} más`);
    sections.push(`✅ <b>Completado (${completed.length})</b>\n${lines.join('\n')}`);
  }
  if (agent.length) {
    const lines = agent.slice(0, MAX_LIST).map((e) => {
      const r = e.requestId ? byId.get(e.requestId) : undefined;
      const src = (e.payload as { source?: string } | null)?.source;
      return `• ${escapeHtml(r?.title ?? '(encargo borrado)')} <i>(${escapeHtml(e.personName ?? '—')}${src ? ` · fuente: ${escapeHtml(src)}` : ''})</i>`;
    });
    sections.push(`🤖 <b>Resuelto por el agente (${agent.length})</b>\n${lines.join('\n')}`);
  }

  // Limpiezas de vencidas terminadas (o paradas) desde el último resumen.
  const cleanups = events.filter((e) => e.eventType === 'cleanup_finished');
  if (cleanups.length) {
    const lines = cleanups.slice(0, MAX_LIST).map((e) => {
      const p = (e.payload ?? {}) as { reviewed?: number; total?: number; closed?: number; rescheduled?: number; discarded?: number; status?: string; simulated?: boolean };
      const flags = [p.status === 'parada' ? 'parada' : '', p.simulated ? 'simulada: no se tocó ClickUp' : ''].filter(Boolean).join(' · ');
      return `• ${escapeHtml(e.personName ?? '—')}: revisó ${p.reviewed ?? 0} de ${p.total ?? 0} (${p.closed ?? 0} cerradas, ${p.rescheduled ?? 0} con nueva fecha, ${p.discarded ?? 0} descartadas)${flags ? ` <i>(${flags})</i>` : ''}`;
    });
    sections.push(`🧹 <b>Limpiezas de vencidas (${cleanups.length})</b>\n${lines.join('\n')}`);
  }

  // Sugerencias del equipo (/sugerencia): solo en el último resumen del día; cada una sale una vez.
  const suggestions = withClientAlerts
    ? await db.select().from(opsSuggestions).where(and(eq(opsSuggestions.tenantId, tenantId), isNull(opsSuggestions.digestShownAt))).orderBy(opsSuggestions.createdAt)
    : [];
  if (suggestions.length) {
    const lines = suggestions.slice(0, MAX_LIST).map(
      (x) => `• <i>${escapeHtml(x.personName)}</i>: ${escapeHtml(x.text.length > 160 ? `${x.text.slice(0, 159)}…` : x.text)}${x.photoFileId ? ' 📷' : ''}`
    );
    if (suggestions.length > MAX_LIST) lines.push(`… y ${suggestions.length - MAX_LIST} más (en la pestaña Piloto)`);
    sections.push(`💡 <b>Sugerencias del equipo (${suggestions.length})</b>\n${lines.join('\n')}`);
  }

  // Encargos recordados que siguen sin empezar al terminar la jornada de su responsable: salen una vez.
  const digestAuto = await getAuto(tenantId, 'digest');
  const alertsAuto = await getAuto(tenantId, 'client_alerts');
  const unanswered = digestAuto.cfg.includeUnanswered ? await getUnanswered(tenantId) : [];
  if (unanswered.length) {
    const lines = unanswered.slice(0, MAX_LIST).map(
      (r) => `• ${escapeHtml(r.title)} <i>(${escapeHtml(r.assigneeName ?? '—')} · sin respuesta desde el ${r.remindedAt!.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' })})</i>`
    );
    if (unanswered.length > MAX_LIST) lines.push(`… y ${unanswered.length - MAX_LIST} más`);
    sections.push(`⏳ <b>Sin respuesta (${unanswered.length})</b>\n${lines.join('\n')}`);
  }

  // Clientes en alerta (solo en el último resumen del día): nuevas, y recordatorio semanal si siguen.
  const clientAlerts = withClientAlerts && alertsAuto.enabled ? await getClientAlertsToShow(tenantId) : [];
  if (clientAlerts.length) {
    const lines = clientAlerts.slice(0, MAX_LIST * 2).map((a) => {
      const icon = a.kind === 'inactive' ? '🔴' : '🟠';
      return `• ${icon} <b>${escapeHtml(a.name)}</b>: ${escapeHtml(a.text)}${a.reminder ? ' <i>(recordatorio semanal)</i>' : ''}`;
    });
    if (clientAlerts.length > MAX_LIST * 2) lines.push(`… y ${clientAlerts.length - MAX_LIST * 2} más (en «Clientes»)`);
    sections.push(renderTemplate(DEF.get('client_alerts')!, alertsAuto.template, { total: String(clientAlerts.length), lista: lines.join('\n') }));
  }

  const buttons: { text: string; data: string }[][] = [];
  if (inbox.length) {
    const lines = inbox.slice(0, MAX_LIST).map((i) => {
      const what = i.kind === 'review' ? '👀 revisión' : '🚫 bloqueo';
      return `• ${what}: ${escapeHtml(i.req.title)} <i>(espera ${waitLabel(i.since)})</i>`;
    });
    if (inbox.length > MAX_LIST) lines.push(`… y ${inbox.length - MAX_LIST} más (en «Mi bandeja»)`);
    sections.push(`🙋 <b>Necesita de ti (${inbox.length})</b>\n${lines.join('\n')}`);
    for (const i of inbox.slice(0, MAX_BUTTON_ROWS)) {
      if (i.kind === 'review') {
        buttons.push([
          { text: `✅ ${short(i.req.title, 20)}`, data: `ok:${i.req.id}` },
          { text: '↩️ Devolver', data: `rt:${i.req.id}` }
        ]);
      } else {
        buttons.push([{ text: `💬 Responder · ${short(i.req.title, 22)}`, data: `rp:${i.blocker.id}` }]);
      }
    }
  }

  return {
    text: sections.length ? renderTemplate(DEF.get('digest')!, digestAuto.template, { secciones: sections.join('\n\n') }) : '',
    buttons,
    empty: sections.length === 0,
    unansweredIds: unanswered.map((r) => r.id),
    clientAlerts,
    suggestionIds: suggestions.map((x) => x.id)
  };
}

async function lastDigestAt(tenantId: string): Promise<Date> {
  const [last] = await db
    .select({ at: opsNotifications.createdAt })
    .from(opsNotifications)
    .where(and(eq(opsNotifications.tenantId, tenantId), eq(opsNotifications.kind, 'digest'), like(opsNotifications.dedupeKey, 'digest:%')))
    .orderBy(desc(opsNotifications.createdAt))
    .limit(1);
  return last?.at ?? new Date(Date.now() - 24 * 3600 * 1000);
}

// Planificador: se llama cada 30 s. De lunes a viernes, a cada hora configurada.
export async function runDigests(tenantId: string, now = new Date()): Promise<void> {
  const cfg = await getTelegramConfig(tenantId);
  if (!cfg) return;
  const auto = await getAuto(tenantId, 'digest');
  if (!auto.enabled) return;
  const owner = await getOwnerMember(tenantId);
  const ownerSch = owner ? scheduleOrDefault(await getScheduleMap(tenantId), owner.clickupUserId) : null;
  const lp = localParts(await getOwnerTimezone(tenantId), now);
  if (lp.weekday === 'Sat' || lp.weekday === 'Sun') return;

  const slots = String(auto.cfg.times)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^\d{1,2}:\d{2}$/.test(s));
  // Si una hora cae en la comida o el silencio del dueño, sale en el momento permitido más cercano.
  const effective = (s: string) => (ownerSch && !cfg.testMode ? nearestAllowedMinute(ownerSch, toMinutes(s)) : toMinutes(s));
  const slot = slots.find((s) => lp.minutes >= effective(s) && lp.minutes < effective(s) + num(auto, 'windowMin'));
  if (!slot) return;

  const key = `digest:${lp.date}:${slot}`;
  const [exists] = await db
    .select({ id: opsNotifications.id })
    .from(opsNotifications)
    .where(and(eq(opsNotifications.tenantId, tenantId), eq(opsNotifications.dedupeKey, key)))
    .limit(1);
  if (exists) return;
  // Las alertas de clientes solo van en el último resumen del día (el de las 18:00 por defecto).
  const lastSlot = [...slots].sort((a, b) => toMinutes(a) - toMinutes(b)).at(-1);
  await queueDigest(tenantId, key, await lastDigestAt(tenantId), slot === lastSlot);
}

async function queueDigest(tenantId: string, key: string, since: Date, withClientAlerts = false): Promise<boolean> {
  const owner = await getOwnerMember(tenantId);
  const d = await buildDigest(tenantId, since, withClientAlerts);
  await enqueueNotification({
    tenantId,
    kind: 'digest',
    dedupeKey: key,
    forClickupUserId: owner?.clickupUserId ?? null,
    forName: owner?.username ?? 'Dueño',
    payload: { text: d.text, toOwner: true, buttons: d.buttons.length ? d.buttons : undefined, skipped: d.empty ? 'sin novedades' : undefined },
    skipped: d.empty
  });
  // Lo que ya salió como «sin respuesta» no se repite en el siguiente resumen.
  if (!d.empty && d.clientAlerts.length) await markClientAlertsShown(d.clientAlerts);
  if (!d.empty && d.suggestionIds.length) {
    await db.update(opsSuggestions).set({ digestShownAt: new Date() }).where(inArray(opsSuggestions.id, d.suggestionIds));
  }
  if (!d.empty && d.unansweredIds.length) {
    await db.update(opsRequests).set({ unansweredListedAt: new Date() }).where(inArray(opsRequests.id, d.unansweredIds));
  }
  return !d.empty;
}

// Botón «Enviar resumen de la bandeja ahora» (pruebas): fuerza un resumen con las últimas 24 h.
export async function sendDigestNow(tenantId: string): Promise<{ sent: boolean }> {
  const sent = await queueDigest(tenantId, `digest-manual:${Date.now()}`, new Date(Date.now() - 24 * 3600 * 1000), true);
  return { sent };
}

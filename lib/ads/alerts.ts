import 'server-only';

// Módulo Google Ads · avisos (diseño §6.4; investigación 7.3). Tarea del planificador «ads avisos» (cada 30 s, líder).
//
//  - MODO SOMBRA por defecto (`alerts_enabled` = falso): los hallazgos se guardan y se ven en Hoy, pero NO se envía nada.
//    Lo enciende un administrador en Ajustes.
//  - Solo por `telegramOutbound().notifyOwner` (la cola de avisos del núcleo, con clave única y reintentos): nunca
//    Telegram directo. Llega al dueño (Enric) hasta que exista `notifyMember` en el núcleo (pendiente, decisión de Enric).
//  - Solo en horario laboral (`alert_hours`, `alert_days`, hora de Madrid). Lo detectado fuera de horario sale al abrir
//    el siguiente día laborable si sigue abierto (los resueltos ya no están abiertos y no salen).
//  - Tope por persona: como mucho `max_interruptions_per_day` interrupciones al día; las demás, juntas en UN mensaje.
//  - Parte de la mañana: un único mensaje al empezar el horario con 5 decisiones + 3 «para que lo sepas» y «N más por
//    debajo del corte».
//  - Las cuentas simuladas nunca avisan. «Nuestra fuente sin datos» (15) va con el bot de Sistema y no cuenta en el tope
//    del gestor. Clave del aviso con el episodio: ads:<tipo>:<causa>:<inicio del episodio>.
import { SYSTEM_BOT, telegramOutbound } from '@/lib/core/capabilities';
import { alertPlan, inAlertWindow, KIND_INFO, morningCut, type FindingKind } from '@/lib/ads/finding-rules';
import { listFindings, patchSettingsState, pendingInterruptions, updateFinding } from '@/lib/ads/findings-store';
import { zonedParts } from '@/lib/ads/rules';
import { getSettingsRow } from '@/lib/ads/store';

export const ADS_ALERTS_TASK = 'ads avisos';

type AlertState = { alerts?: { day: string; sent: number; grouped?: number }; lastParte?: string };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function runAdsAlerts(tenantId: string, now: Date = new Date()): Promise<{ sent: number; grouped: number; parte: boolean; reason?: string }> {
  const settings = await getSettingsRow(tenantId);
  if (!settings || settings.authMode === 'none') return { sent: 0, grouped: 0, parte: false, reason: 'sin configurar' };
  if (!settings.alertsEnabled) return { sent: 0, grouped: 0, parte: false, reason: 'modo sombra' };
  if (settings.authMode === 'sim') return { sent: 0, grouped: 0, parte: false, reason: 'modo simulado: nunca avisa' };
  const madrid = zonedParts(now, 'Europe/Madrid');
  if (!inAlertWindow(madrid, settings.alertHours, settings.alertDays)) return { sent: 0, grouped: 0, parte: false, reason: 'fuera de horario' };
  const out = telegramOutbound();
  if (!out) return { sent: 0, grouped: 0, parte: false, reason: 'sin salida de Telegram' };
  const state = (settings.state ?? {}) as AlertState;
  const today = madrid.date;
  let sentToday = state.alerts?.day === today ? state.alerts.sent : 0;
  let groupedToday = state.alerts?.day === today ? (state.alerts.grouped ?? 0) : 0;

  const pending = (await pendingInterruptions(tenantId)).filter((f) => !f.simulated);
  const tech = pending.filter((f) => f.recipient === 'tecnico');
  const gestor = pending.filter((f) => f.recipient !== 'tecnico');
  let sent = 0;
  // Técnicos: una causa = un aviso. Si cae la MCC entera (agencia), las cuentas sin datos son esa misma causa: no avisan
  // por separado. Varias a la vez van en un solo mensaje (revisor, 28 nov).
  const agencyDown = (await listFindings(tenantId)).some((f) => f.causeKey === 'fuente:mcc' && f.status === 'abierto');
  const techSend = agencyDown ? tech.filter((f) => f.causeKey === 'fuente:mcc') : tech;
  const techSkip = tech.filter((f) => !techSend.includes(f));
  if (techSend.length === 1) {
    const f = techSend[0];
    await out.notifyOwner(tenantId, `ads:${f.kind}:${f.causeKey}:${f.episodeStartedAt.toISOString()}`, alertHtml(f), undefined, { bot: SYSTEM_BOT });
  } else if (techSend.length > 1) {
    const html = `<b>Google Ads · ${techSend.length} cuentas sin datos al día</b>\n${techSend.slice(0, 15).map((f) => `• ${esc(f.accountName ?? '')}: ${esc(f.title)}`).join('\n')}${techSend.length > 15 ? `\n…y ${techSend.length - 15} más` : ''}\nMientras tanto sus reglas dicen «no comprobado». Detalle en Google Ads → Hoy.`;
    await out.notifyOwner(tenantId, `ads:tecnico:${techSend[0].causeKey}:${techSend[0].episodeStartedAt.toISOString()}:${techSend.length}`, html, undefined, { bot: SYSTEM_BOT });
  }
  for (const f of techSend) await updateFinding(tenantId, f.id, { notifiedAt: now, notifyState: 'encolado' });
  for (const f of techSkip) await updateFinding(tenantId, f.id, { notifiedAt: now, notifyState: 'agrupado' });
  const plan = alertPlan(gestor, sentToday, settings.maxInterruptionsPerDay);
  for (const f of plan.send) {
    await out.notifyOwner(tenantId, `ads:${f.kind}:${f.causeKey}:${f.episodeStartedAt.toISOString()}`, alertHtml(f));
    await updateFinding(tenantId, f.id, { notifiedAt: now, notifyState: 'encolado' });
    sent++;
    sentToday++;
  }
  if (plan.group.length) {
    groupedToday++;
    const html = `<b>Google Ads: ${plan.group.length} aviso${plan.group.length > 1 ? 's' : ''} más hoy</b> (tope de ${settings.maxInterruptionsPerDay} al día alcanzado)\n${plan.group
      .slice(0, 10)
      .map((f) => `• ${esc(f.accountName ?? '')}: ${esc(f.title)}`)
      .join('\n')}${plan.group.length > 10 ? `\n…y ${plan.group.length - 10} más` : ''}\nTodos en Google Ads → Hoy.`;
    await out.notifyOwner(tenantId, `ads:agrupado:${today}:${groupedToday}`, html);
    for (const f of plan.group) await updateFinding(tenantId, f.id, { notifiedAt: now, notifyState: 'agrupado' });
  }

  // Parte de la mañana: una vez al día, al empezar el horario.
  let parte = false;
  if (state.lastParte !== today) {
    const open = (await listFindings(tenantId)).filter((f) => f.status === 'abierto' && f.channel === 'parte' && !f.simulated);
    if (open.length) {
      const cut = morningCut(open.map((f) => ({ id: f.id, severity: f.severity, firstSeenAt: f.firstSeenAt, exposure: f.exposure === null ? null : Number(f.exposure), fyi: Boolean((f.evidence as { fyi?: boolean }).fyi), accountName: f.accountName, title: f.title })));
      const line = (f: { accountName: string | null; title: string }) => `• ${esc(f.accountName ?? '')}: ${esc(f.title)}`;
      const html = [
        `<b>Google Ads · parte de hoy</b>`,
        cut.decisions.length ? `\n<b>Por decidir</b>\n${cut.decisions.map(line).join('\n')}` : '',
        cut.fyi.length ? `\n<b>Para que lo sepas</b>\n${cut.fyi.map(line).join('\n')}` : '',
        cut.below.length ? `\n${cut.below.length} más por debajo del corte.` : '',
        '\nResponde en Google Ads → Hoy.'
      ]
        .filter(Boolean)
        .join('\n');
      await out.notifyOwner(tenantId, `ads:parte:${today}`, html);
      parte = true;
    }
  }
  // Solo se escribe si algo cambió (la tarea corre cada 30 s).
  if (sent || plan.group.length || state.lastParte !== today || state.alerts?.day !== today) await patchSettingsState(tenantId, { alerts: { day: today, sent: sentToday, grouped: groupedToday }, lastParte: today });
  return { sent, grouped: plan.group.length, parte };
}

function alertHtml(f: { kind: string; title: string; accountName: string | null; evidence: Record<string, unknown> }): string {
  const lines = ((f.evidence as { lines?: string[] }).lines ?? []).slice(0, 4);
  const info = KIND_INFO[f.kind as FindingKind];
  return `<b>Google Ads · ${esc(info?.label ?? f.kind)}</b>\n${esc(f.accountName ?? '')}: ${esc(f.title)}\n${lines.map((l) => `• ${esc(l)}`).join('\n')}\nResponde en Google Ads → Hoy.`;
}

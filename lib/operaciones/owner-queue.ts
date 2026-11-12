import 'server-only';

// Lo que espera una decisión del dueño (revisión de autonomía, 12 nov 2026). Principio: «toda cola tiene dueño,
// plazo y escalado». Mi bandeja ya tenía revisiones y bloqueos; aquí se añaden las respuestas propuestas a correos
// de clientes (antes solo llegaban en un Telegram y, si se perdía, el cliente se quedaba sin respuesta en silencio)
// y los plazos: pasado el de cada tipo, UN recordatorio con sus botones (clave única por elemento).
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsAgentActions, opsClients, opsInboundEmails } from '@/lib/db/schema';
import { getAuto, num } from '@/lib/operaciones/automations';
import { getInbox, waitLabel, type InboxItem } from '@/lib/operaciones/inbox';
import { enqueueNotification, localParts } from '@/lib/operaciones/notifications';
import { getOwnerMember } from '@/lib/operaciones/telegram-config';
import { getOwnerTimezone } from '@/lib/operaciones/team-profiles';
import { clampMessage, escapeHtml } from '@/lib/operaciones/telegram';

export type PendingEmail = {
  actionId: string;
  emailId: string | null;
  subject: string;
  from: string;
  clientName: string | null;
  top: boolean;
  since: Date;
};

/** Respuestas a correos propuestas por el agente y aún sin decidir (las más antiguas primero). */
export async function getPendingEmailProposals(tenantId: string): Promise<PendingEmail[]> {
  const rows = await db
    .select({
      id: opsAgentActions.id,
      createdAt: opsAgentActions.createdAt,
      summary: opsAgentActions.summary,
      emailId: opsAgentActions.inboundEmailId,
      subject: opsInboundEmails.subject,
      fromName: opsInboundEmails.fromName,
      fromAddress: opsInboundEmails.fromAddress,
      clientId: opsInboundEmails.clientId
    })
    .from(opsAgentActions)
    .leftJoin(opsInboundEmails, eq(opsAgentActions.inboundEmailId, opsInboundEmails.id))
    .where(and(eq(opsAgentActions.tenantId, tenantId), eq(opsAgentActions.kind, 'email_reply'), eq(opsAgentActions.status, 'propuesto')))
    .orderBy(asc(opsAgentActions.createdAt));
  const clientIds = [...new Set(rows.map((r) => r.clientId).filter((x): x is string => Boolean(x)))];
  const clients = clientIds.length
    ? await db.select({ id: opsClients.id, name: opsClients.name, level: opsClients.level }).from(opsClients).where(inArray(opsClients.id, clientIds))
    : [];
  const byId = new Map(clients.map((c) => [c.id, c]));
  return rows.map((r) => {
    const c = r.clientId ? byId.get(r.clientId) : undefined;
    return {
      actionId: r.id,
      emailId: r.emailId,
      subject: r.subject?.trim() || r.summary || '(sin asunto)',
      from: r.fromName?.trim() || r.fromAddress || '—',
      clientName: c?.name ?? null,
      top: c?.level === 'top',
      since: r.createdAt
    };
  });
}

/** Línea de un correo pendiente para los resúmenes (HTML). */
export function emailLine(e: PendingEmail, now = new Date()): string {
  return `• ✉️ correo${e.top ? ' ⭐' : ''}: ${escapeHtml(e.clientName ?? e.from)} — «${escapeHtml(e.subject.slice(0, 60))}» <i>(espera ${waitLabel(e.since, now)})</i>`;
}

export type SlaConfig = { enabled: boolean; reviewH: number; blockerH: number; emailH: number; topEmailH: number };

export async function slaConfig(tenantId: string): Promise<SlaConfig> {
  const a = await getAuto(tenantId, 'owner_sla');
  return { enabled: a.enabled, reviewH: num(a, 'reviewH'), blockerH: num(a, 'blockerH'), emailH: num(a, 'emailH'), topEmailH: num(a, 'topEmailH') };
}

export type Overdue =
  | { kind: 'review'; id: string; title: string; who: string; since: Date; limitH: number }
  | { kind: 'blocker'; id: string; title: string; who: string; since: Date; limitH: number }
  | { kind: 'email'; id: string; title: string; who: string; since: Date; limitH: number };

/** Elementos que han pasado su plazo. Función pura (se prueba sin base de datos). */
export function overdueItems(cfg: SlaConfig, inbox: InboxItem[], emails: PendingEmail[], nowMs: number): Overdue[] {
  const out: Overdue[] = [];
  const over = (since: Date, h: number) => nowMs - since.getTime() >= h * 3600_000;
  for (const i of inbox) {
    if (i.kind === 'review' && over(i.since, cfg.reviewH)) out.push({ kind: 'review', id: i.req.id, title: i.req.title, who: i.req.assigneeName ?? '—', since: i.since, limitH: cfg.reviewH });
    if (i.kind === 'blocker' && over(i.since, cfg.blockerH))
      out.push({ kind: 'blocker', id: i.blocker.id, title: i.req.title, who: i.blocker.askedByName ?? '—', since: i.since, limitH: cfg.blockerH });
  }
  for (const e of emails) {
    const h = e.top ? cfg.topEmailH : cfg.emailH;
    if (over(e.since, h)) out.push({ kind: 'email', id: e.actionId, title: e.subject, who: e.clientName ?? e.from, since: e.since, limitH: h });
  }
  return out;
}

/** ¿Hora de molestar al dueño? De lunes a viernes, de 8:00 a 20:00 en su zona. */
export function ownerAwake(tz: string, now: Date): boolean {
  const lp = localParts(tz, now);
  return lp.weekday !== 'Sat' && lp.weekday !== 'Sun' && lp.minutes >= 8 * 60 && lp.minutes < 20 * 60;
}

const short = (t: string, n = 26) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

/** Planificador: un recordatorio por elemento pasado de plazo (clave única: nunca se repite). */
export async function runOwnerSla(tenantId: string, now = new Date()): Promise<void> {
  const cfg = await slaConfig(tenantId);
  if (!cfg.enabled) return;
  if (!ownerAwake(await getOwnerTimezone(tenantId), now)) return;
  const owner = await getOwnerMember(tenantId);
  if (!owner) return;
  const items = overdueItems(cfg, await getInbox(tenantId), await getPendingEmailProposals(tenantId), now.getTime());
  for (const it of items) {
    let text: string;
    let buttons: { text: string; data: string }[][] = [];
    if (it.kind === 'review') {
      text = `⏰ <b>Revisión esperando ${waitLabel(it.since, now)}</b> (plazo ${it.limitH} h)\n«${escapeHtml(it.title)}» de ${escapeHtml(it.who)}.`;
      buttons = [[{ text: '✅ Aceptar', data: `ok:${it.id}` }, { text: '↩️ Devolver', data: `rt:${it.id}` }]];
    } else if (it.kind === 'blocker') {
      text = `⏰ <b>${escapeHtml(it.who)} sigue bloqueado</b> desde hace ${waitLabel(it.since, now)} (plazo ${it.limitH} h)\n«${escapeHtml(it.title)}».`;
      buttons = [[{ text: `💬 Responder · ${short(it.title, 20)}`, data: `rp:${it.id}` }]];
    } else {
      // Los botones de la propuesta (Enviar, Corregir, Descartar…) se reconstruyen con su estado actual.
      const { renderProposal } = await import('@/lib/operaciones/email-agent');
      const p = await renderProposal(tenantId, it.id);
      if (!p) continue;
      text = `⏰ <b>Correo de ${escapeHtml(it.who)} sin responder</b> desde hace ${waitLabel(it.since, now)} (plazo ${it.limitH} h)\n\n${p.text}`;
      buttons = p.buttons;
    }
    await enqueueNotification({
      tenantId,
      kind: 'digest',
      dedupeKey: `sla:${it.kind}:${it.id}`,
      forClickupUserId: owner.clickupUserId,
      forName: owner.username,
      payload: { text: clampMessage(text), toOwner: true, buttons: buttons.length ? buttons : undefined }
    });
  }
}

import 'server-only';

// Entrada de correos de clientes (paso B1): guardar el correo, ignorar los automáticos y reconocer de qué
// cliente es. Sin IA: aquí no se interpreta nada. Va fuera de un archivo 'use server' a propósito: cada
// función exportada de uno de esos archivos sería un endpoint público.
import { and, count, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsClientSenders, opsInboundEmails, users } from '@/lib/db/schema';

// Nota que marca un correo del equipo (no de un cliente): el agente también le propone respuesta.
export const TEAM_NOTE = 'Del equipo';
import { matchSender } from '@/lib/operaciones/client-memory-rules';
import { detectIgnorable, INBOUND_MAX_PER_HOUR, type InboundPayload } from '@/lib/operaciones/inbound-email-rules';

export type Recognition = {
  clientId: string | null;
  matchedBy: 'email' | 'domain' | 'ninguno' | 'ambiguo';
  status: 'nuevo' | 'sin_cliente';
};

/** ¿De qué cliente es este remitente? Dirección exacta > dominio; si hay duda, no adivina. */
export async function recognizeSender(tenantId: string, fromAddress: string): Promise<Recognition> {
  const senders = await db
    .select({
      clientId: opsClientSenders.clientId,
      kind: opsClientSenders.kind,
      value: opsClientSenders.value,
      active: opsClientSenders.active
    })
    .from(opsClientSenders)
    .where(eq(opsClientSenders.tenantId, tenantId));
  const m = matchSender(senders, fromAddress);
  if (!m) return { clientId: null, matchedBy: 'ninguno', status: 'sin_cliente' };
  if ('ambiguous' in m) return { clientId: null, matchedBy: 'ambiguo', status: 'sin_cliente' };
  return { clientId: m.clientId, matchedBy: m.by, status: 'nuevo' };
}

export type IngestResult =
  | { ok: true; id: string; duplicate: boolean; status: string }
  | { ok: false; code: 'rate' | 'error'; error: string };

// ¿Es alguien del equipo? Un usuario de la herramienta o una dirección del dominio de la agencia.
export const TEAM_DOMAINS = ['kijutech.com'];
export async function isTeamSender(tenantId: string, fromAddress: string): Promise<boolean> {
  const addr = fromAddress.toLowerCase();
  const domain = addr.split('@')[1] ?? '';
  if (TEAM_DOMAINS.includes(domain)) return true;
  const [u] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.email, addr)))
    .limit(1);
  return Boolean(u);
}

export async function ingestInboundEmail(
  tenantId: string,
  email: InboundPayload,
  source: 'cloudflare' | 'pegado' | 'resend',
  extra: { providerEmailId?: string | null; referencesHeader?: string | null } = {}
): Promise<IngestResult> {
  // Mismo correo otra vez (Cloudflare reintenta, Gmail duplica): no se guarda de nuevo.
  const [existing] = await db
    .select({ id: opsInboundEmails.id, status: opsInboundEmails.status })
    .from(opsInboundEmails)
    .where(and(eq(opsInboundEmails.tenantId, tenantId), eq(opsInboundEmails.messageId, email.messageId)))
    .limit(1);
  if (existing) return { ok: true, id: existing.id, duplicate: true, status: existing.status };

  const hourAgo = new Date(Date.now() - 3_600_000);
  const [{ n }] = await db
    .select({ n: count() })
    .from(opsInboundEmails)
    .where(and(eq(opsInboundEmails.tenantId, tenantId), gte(opsInboundEmails.createdAt, hourAgo)));
  if (n >= INBOUND_MAX_PER_HOUR) {
    return { ok: false, code: 'rate', error: 'Demasiados correos en la última hora' };
  }

  const ignorable = detectIgnorable({ from: email.fromAddress, subject: email.subject, headers: email.headers });
  let status: string;
  let statusNote: string | null = null;
  let clientId: string | null = null;
  let matchedBy: string = 'ninguno';
  if (ignorable) {
    status = 'ignorado';
    statusNote = ignorable.note;
  } else if (email.authStatus === 'fail') {
    // Remitente que no pasa la autenticación (SPF/DKIM/DMARC): puede estar falsificado. No se
    // reconoce como cliente ni se interpreta; queda a la vista para que lo revise una persona.
    status = 'sin_cliente';
    statusNote = 'Remitente no autenticado: puede estar falsificado';
  } else {
    const rec = await recognizeSender(tenantId, email.fromAddress);
    status = rec.status;
    clientId = rec.clientId;
    matchedBy = rec.matchedBy;
    if (rec.matchedBy === 'ambiguo') statusNote = 'Dos fichas reclaman este remitente: asígnalo a mano';
    else if (rec.status === 'sin_cliente' && (await isTeamSender(tenantId, email.fromAddress))) {
      status = 'nuevo';
      statusNote = TEAM_NOTE;
    }
  }

  const [row] = await db
    .insert(opsInboundEmails)
    .values({
      tenantId,
      messageId: email.messageId,
      source,
      fromAddress: email.fromAddress,
      fromName: email.fromName || null,
      toAddress: email.toAddress,
      subject: email.subject,
      bodyText: email.bodyText,
      attachments: email.attachments,
      inReplyTo: email.inReplyTo,
      sentAt: email.sentAt,
      authStatus: email.authStatus,
      clientId,
      matchedBy,
      status,
      statusNote,
      providerEmailId: extra.providerEmailId ?? null,
      referencesHeader: extra.referencesHeader ?? null
    })
    .onConflictDoNothing({ target: [opsInboundEmails.tenantId, opsInboundEmails.messageId] })
    .returning({ id: opsInboundEmails.id, status: opsInboundEmails.status });
  if (!row) {
    // Otro aviso idéntico ganó la carrera entre la comprobación y el guardado.
    const [again] = await db
      .select({ id: opsInboundEmails.id, status: opsInboundEmails.status })
      .from(opsInboundEmails)
      .where(and(eq(opsInboundEmails.tenantId, tenantId), eq(opsInboundEmails.messageId, email.messageId)))
      .limit(1);
    if (!again) return { ok: false, code: 'error', error: 'No se pudo guardar el correo' };
    return { ok: true, id: again.id, duplicate: true, status: again.status };
  }
  return { ok: true, id: row.id, duplicate: false, status: row.status };
}

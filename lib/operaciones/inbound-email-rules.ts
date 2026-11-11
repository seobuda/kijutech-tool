// Reglas puras (sin base de datos ni red) de la entrada de correos de clientes: limpieza del texto,
// detección de correos automáticos, firma del aviso que manda Cloudflare y validación de lo recibido.
// Un correo es un dato NO fiable: aquí solo se limpia y se comprueba; nunca se obedece.
import { createHmac, timingSafeEqual } from 'crypto';
import { z } from 'zod';
import { normalizeSender } from '@/lib/operaciones/client-memory-rules';

export const INBOUND_MAX_BODY = 20_000;
export const INBOUND_MAX_REQUEST_BYTES = 1_000_000;
// Tope de correos guardados por hora y cuenta: acota el abuso y el coste si alguien inunda la dirección.
export const INBOUND_MAX_PER_HOUR = 300;
// El aviso firmado caduca: un aviso interceptado no sirve horas después.
export const INBOUND_SIGNATURE_TOLERANCE_MS = 5 * 60_000;

export const INBOUND_STATUSES = [
  'nuevo',
  'ignorado',
  'sin_cliente',
  'informativo',
  'interpretando',
  'propuesto',
  'aprobado',
  'descartado',
  'error'
] as const;
export type InboundStatus = (typeof INBOUND_STATUSES)[number];

export const INBOUND_STATUS_LABELS: Record<InboundStatus, string> = {
  nuevo: 'Reconocido',
  ignorado: 'Ignorado',
  sin_cliente: 'Sin cliente',
  informativo: 'Informativo',
  interpretando: 'Interpretando',
  propuesto: 'Propuesto',
  aprobado: 'Aprobado',
  descartado: 'Descartado',
  error: 'Con error'
};

// --- Texto -------------------------------------------------------------------------------------

// Caracteres invisibles y de control: sirven para esconder instrucciones al ojo humano.
const INVISIBLE_RE = /[​-‏‪-‮⁠-⁤﻿­]/g;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<\/(td|th)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, ent: string) => {
      if (ent[0] === '#') {
        const code = ent[1].toLowerCase() === 'x' ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ' ';
      }
      return ENTITIES[ent.toLowerCase()] ?? m;
    })
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .join('\n');
}

export function cleanEmailText(raw: string, max = INBOUND_MAX_BODY): string {
  const text = raw
    .replace(/\r\n?/g, '\n')
    .replace(INVISIBLE_RE, '')
    .replace(CONTROL_RE, '')
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > max ? `${text.slice(0, max - 20).trimEnd()}\n[…texto recortado]` : text;
}

export function cleanSubject(raw: string): string {
  return raw.replace(INVISIBLE_RE, '').replace(CONTROL_RE, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
}

// --- Direcciones e identificadores ------------------------------------------------------------

/** «Nombre <correo@dominio.com>» o «correo@dominio.com» → dirección en minúsculas y nombre. */
export function parseAddress(raw: string): { address: string; name: string } | null {
  const value = raw.trim();
  const angle = value.match(/^(.*?)<([^>]+)>\s*$/);
  const candidate = angle ? angle[2] : value;
  const norm = normalizeSender('email', candidate);
  if (!norm.ok) return null;
  const name = (angle ? angle[1] : '').replace(/^["'\s]+|["'\s]+$/g, '').slice(0, 255);
  return { address: norm.value, name };
}

export function normalizeMessageId(raw: string): string | null {
  const id = raw.replace(/[\u0000-\u001F\u007F]/g, '').trim().replace(/^<|>$/g, '').trim();
  return id.length > 0 && id.length <= 500 ? id : null;
}

// --- Correos que no hay que interpretar ---------------------------------------------------------

const NO_REPLY_RE = /^(no-?reply|do-?not-?reply|donotreply|mailer-daemon|postmaster|bounces?|notifications?)([-_.+].*)?$/i;
const OUT_OF_OFFICE_RE = /^\s*((respuesta )?autom[aá]tica|auto(matic)?[ -]?reply|out of office|fuera de (la )?oficina)\b/i;

export type Ignorable = { kind: 'gmail_forwarding' | 'automatic'; note: string };

/**
 * ¿Es un correo que no hay que interpretar? La confirmación de reenvío de Gmail se conserva visible
 * (lleva el código que hay que copiar); el resto de automáticos (boletines, rebotes, avisos) se ignoran.
 */
export function detectIgnorable(input: {
  from: string;
  subject: string;
  headers: Record<string, string>;
}): Ignorable | null {
  const from = input.from.toLowerCase();
  if (from === 'forwarding-noreply@google.com') {
    return { kind: 'gmail_forwarding', note: 'Confirmación de reenvío de Gmail: el código está en el texto del correo' };
  }
  const h = input.headers;
  const autoSubmitted = (h['auto-submitted'] ?? '').trim().toLowerCase();
  if (autoSubmitted && autoSubmitted !== 'no') return { kind: 'automatic', note: 'Correo automático (Auto-Submitted)' };
  if (/^(bulk|junk|list|auto_reply)$/i.test((h['precedence'] ?? '').trim())) {
    return { kind: 'automatic', note: 'Correo masivo o de lista (Precedence)' };
  }
  if (h['list-unsubscribe']) return { kind: 'automatic', note: 'Boletín o lista de correo (tiene «darse de baja»)' };
  if (h['x-auto-response-suppress']) return { kind: 'automatic', note: 'Correo automático (X-Auto-Response-Suppress)' };
  const local = from.split('@')[0] ?? '';
  if (NO_REPLY_RE.test(local)) return { kind: 'automatic', note: 'Remitente automático (no-reply)' };
  if (OUT_OF_OFFICE_RE.test(input.subject)) return { kind: 'automatic', note: 'Respuesta automática (fuera de oficina)' };
  return null;
}

// --- Firma del aviso de Cloudflare ----------------------------------------------------------------

/** Secreto de la cuenta para firmar los avisos: derivado de AUTH_SECRET, igual que el del webhook de Telegram. */
export function inboundSecret(tenantId: string): string {
  return createHmac('sha256', process.env.AUTH_SECRET ?? '')
    .update(`email-inbound:${tenantId}`)
    .digest('hex');
}

export function signInbound(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

export function verifyInbound(
  secret: string,
  timestamp: string | null,
  body: string,
  signature: string | null,
  nowMs: number = Date.now()
): boolean {
  if (!secret || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowMs - ts) > INBOUND_SIGNATURE_TOLERANCE_MS) return false;
  const expected = Buffer.from(signInbound(secret, timestamp, body));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

// --- Validación de lo recibido -----------------------------------------------------------------

const HEADER_KEYS = ['auto-submitted', 'precedence', 'list-unsubscribe', 'x-auto-response-suppress'] as const;

const payloadSchema = z.object({
  messageId: z.string().min(1).max(600),
  from: z.string().min(3).max(600),
  to: z.string().max(600).optional(),
  subject: z.string().max(2000).optional(),
  text: z.string().max(400_000).optional(),
  html: z.string().max(800_000).optional(),
  date: z.string().max(100).optional(),
  inReplyTo: z.string().max(600).optional(),
  auth: z.enum(['pass', 'fail', 'none']).optional(),
  headers: z.record(z.string().max(1000)).optional(),
  attachments: z.array(z.object({ name: z.string().max(300) })).max(50).optional()
});

export type InboundPayload = {
  messageId: string;
  fromAddress: string;
  fromName: string;
  toAddress: string | null;
  subject: string;
  bodyText: string;
  sentAt: Date | null;
  inReplyTo: string | null;
  authStatus: 'pass' | 'fail' | 'none';
  headers: Record<string, string>;
  attachments: { name: string }[];
};

export function validateInboundPayload(
  input: unknown
): { ok: true; value: InboundPayload } | { ok: false; error: string } {
  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Formato del correo no válido' };
  const p = parsed.data;

  const messageId = normalizeMessageId(p.messageId);
  if (!messageId) return { ok: false, error: 'Falta el identificador del correo' };
  const from = parseAddress(p.from);
  if (!from) return { ok: false, error: 'El remitente no es una dirección válida' };
  const to = p.to ? parseAddress(p.to) : null;

  // Texto plano si lo hay; si solo viene HTML, se convierte. Siempre limpio.
  const plain = p.text && p.text.trim() ? p.text : p.html ? htmlToText(p.html) : '';
  // Las cabeceras no distinguen mayúsculas (RFC 5322): Gmail las devuelve como
  // «List-Unsubscribe» o «Auto-Submitted». Se normalizan a minúsculas antes de buscar.
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(p.headers ?? {})) {
    if (typeof v === 'string' && !(k.toLowerCase() in lower)) lower[k.toLowerCase()] = v;
  }
  const headers: Record<string, string> = {};
  for (const k of HEADER_KEYS) {
    const v = lower[k.toLowerCase()];
    if (v) headers[k] = v.slice(0, 200);
  }
  const sent = p.date ? new Date(p.date) : null;
  const inReplyTo = p.inReplyTo ? normalizeMessageId(p.inReplyTo) : null;

  return {
    ok: true,
    value: {
      messageId,
      fromAddress: from.address,
      fromName: from.name,
      toAddress: to?.address ?? null,
      subject: cleanSubject(p.subject ?? ''),
      bodyText: cleanEmailText(plain),
      sentAt: sent && !Number.isNaN(sent.getTime()) ? sent : null,
      inReplyTo,
      authStatus: p.auth ?? 'none',
      headers,
      attachments: (p.attachments ?? []).map((a) => ({ name: cleanSubject(a.name).slice(0, 200) }))
    }
  };
}

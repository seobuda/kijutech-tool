import 'server-only';

// Buzón del agente con Resend (paso 3): agente@equipo.kijutech.com.
//  - Recibir: Resend avisa por webhook (firmado al estilo Svix) con el id del correo; el contenido se
//    pide a su API. El webhook no trae cuerpo ni cabeceras.
//  - Enviar: POST /emails con In-Reply-To/References para que la respuesta quede en el mismo hilo y
//    con clave de idempotencia (dos pulsaciones = un solo envío).
// La clave de API y el secreto del webhook se guardan CIFRADOS en ops_settings (como los demás tokens);
// en desarrollo se acepta RESEND_API_KEY del entorno como respaldo.
import { createHmac, timingSafeEqual } from 'crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsSettings, roles, userRoles, users } from '@/lib/db/schema';
import { decrypt, encrypt } from '@/lib/ai/encryption';

const API = 'https://api.resend.com';
export const AGENT_DEFAULT_ADDRESS = 'agente@equipo.kijutech.com';
export const AGENT_DEFAULT_NAME = 'Equipo Kijutech';
export const WEBHOOK_TOLERANCE_S = 5 * 60;

const K = {
  apiKey: 'email_resend_key',
  webhookSecret: 'email_webhook_secret',
  webhookId: 'email_webhook_id',
  address: 'email_address',
  fromName: 'email_from_name',
  bcc: 'email_bcc'
} as const;

async function readSettings(tenantId: string): Promise<Record<string, string>> {
  const rows = await db
    .select({ key: opsSettings.key, value: opsSettings.value })
    .from(opsSettings)
    .where(and(eq(opsSettings.tenantId, tenantId), inArray(opsSettings.key, Object.values(K))));
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

async function writeSetting(tenantId: string, key: string, value: string) {
  await db
    .insert(opsSettings)
    .values({ tenantId, key, value })
    .onConflictDoUpdate({ target: [opsSettings.tenantId, opsSettings.key], set: { value, updatedAt: new Date() } });
}

const seal = (plain: string) => JSON.stringify(encrypt(plain));
function unseal(v: string | undefined): string | null {
  if (!v) return null;
  try {
    const { encrypted, iv } = JSON.parse(v) as { encrypted: string; iv: string };
    return decrypt(encrypted, iv);
  } catch {
    return null;
  }
}

export type EmailConfig = {
  apiKey: string | null;
  webhookSecret: string | null;
  webhookId: string | null;
  address: string;
  fromName: string;
  bcc: string | null;
};

export async function getEmailConfig(tenantId: string): Promise<EmailConfig> {
  const s = await readSettings(tenantId);
  return {
    apiKey: unseal(s[K.apiKey]) ?? process.env.RESEND_API_KEY ?? null,
    webhookSecret: unseal(s[K.webhookSecret]),
    webhookId: s[K.webhookId] ?? null,
    address: s[K.address] || AGENT_DEFAULT_ADDRESS,
    fromName: s[K.fromName] || AGENT_DEFAULT_NAME,
    bcc: s[K.bcc] || (await defaultBcc(tenantId))
  };
}

// Copia oculta de cada respuesta para el dueño: el primer super_admin de la cuenta.
async function defaultBcc(tenantId: string): Promise<string | null> {
  const [row] = await db
    .select({ email: users.email })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(users.tenantId, tenantId), eq(roles.name, 'super_admin')))
    .orderBy(users.id)
    .limit(1);
  return row?.email ?? null;
}

async function call<T>(apiKey: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(20_000),
    cache: 'no-store'
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = `Resend respondió ${res.status}`;
    try {
      const j = JSON.parse(text) as { message?: string };
      if (j.message) msg += `: ${j.message}`;
    } catch {
      /* respuesta no JSON */
    }
    throw new Error(msg.slice(0, 300));
  }
  return (text ? JSON.parse(text) : {}) as T;
}

// --- Conexión (panel de administración) ------------------------------------------------

/**
 * Guarda la clave (cifrada), comprueba que funciona y, si hay una URL pública (https), crea el webhook
 * de «correo recibido» apuntando a esta instalación y guarda su secreto. Idempotente: si ya hay un
 * webhook guardado, no crea otro (el plan gratuito de Resend solo admite uno).
 */
export async function connectResend(
  tenantId: string,
  apiKey: string,
  baseUrl: string | undefined
): Promise<{ webhook: 'creado' | 'existente' | 'sin_url_publica' }> {
  const key = apiKey.trim();
  if (!/^re_[A-Za-z0-9_]{10,}$/.test(key)) throw new Error('La clave de Resend debe empezar por «re_»');
  await call(key, '/domains'); // valida la clave
  await writeSetting(tenantId, K.apiKey, seal(key));

  const s = await readSettings(tenantId);
  if (s[K.webhookId] && unseal(s[K.webhookSecret])) return { webhook: 'existente' };
  if (!baseUrl || !baseUrl.startsWith('https://')) return { webhook: 'sin_url_publica' };

  const endpoint = `${baseUrl.replace(/\/$/, '')}/api/email/resend?t=${tenantId}`;
  const wh = await call<{ id: string; signing_secret: string }>(key, '/webhooks', {
    method: 'POST',
    body: JSON.stringify({ endpoint, events: ['email.received'] })
  });
  if (!wh.id || !wh.signing_secret) throw new Error('Resend no devolvió el secreto del webhook');
  await writeSetting(tenantId, K.webhookId, wh.id);
  await writeSetting(tenantId, K.webhookSecret, seal(wh.signing_secret));
  return { webhook: 'creado' };
}

export async function saveWebhookSecret(tenantId: string, secret: string): Promise<void> {
  if (!/^whsec_[A-Za-z0-9+/=]{10,}$/.test(secret.trim())) throw new Error('El secreto debe empezar por «whsec_»');
  await writeSetting(tenantId, K.webhookSecret, seal(secret.trim()));
}

// --- Firma del webhook (formato Svix) ----------------------------------------------------

/**
 * svix-signature puede traer varias firmas separadas por espacios («v1,<base64>»). Contenido firmado:
 * `${id}.${timestamp}.${cuerpo}`, HMAC-SHA256 con la parte en base64 del secreto tras «whsec_».
 */
export function verifyResendSignature(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  nowS: number = Math.floor(Date.now() / 1000)
): boolean {
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowS - ts) > WEBHOOK_TOLERANCE_S) return false;
  let key: Buffer;
  try {
    key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  } catch {
    return false;
  }
  if (key.length === 0) return false;
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest();
  return signature.split(' ').some((part) => {
    const sig = part.includes(',') ? part.split(',')[1] : part;
    let given: Buffer;
    try {
      given = Buffer.from(sig ?? '', 'base64');
    } catch {
      return false;
    }
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

// --- Leer un correo recibido ---------------------------------------------------------------

export type ReceivedEmail = {
  id: string;
  from: string;
  to: string[];
  subject: string | null;
  text: string | null;
  html: string | null;
  headers: Record<string, string> | null;
  message_id: string | null;
  created_at: string;
  authentication?: { spf?: string; dkim?: string; dmarc?: string } | null;
  attachments?: { filename: string }[] | null;
};

export async function fetchReceivedEmail(apiKey: string, id: string): Promise<ReceivedEmail> {
  if (!/^[A-Za-z0-9-]{8,80}$/.test(id)) throw new Error('Id de correo no válido');
  return call<ReceivedEmail>(apiKey, `/emails/receiving/${id}`);
}

/** «pass» solo si DMARC pasa; «fail» si algo falla; si no hay datos, «none». */
export function authFromResend(a: ReceivedEmail['authentication']): 'pass' | 'fail' | 'none' {
  if (!a) return 'none';
  const vals = [a.spf, a.dkim, a.dmarc].map((v) => (v ?? '').toLowerCase());
  if (vals.some((v) => v === 'fail')) return 'fail';
  if ((a.dmarc ?? '').toLowerCase() === 'pass') return 'pass';
  return 'none';
}

// --- Enviar una respuesta ------------------------------------------------------------------

export async function sendReply(
  cfg: EmailConfig,
  input: {
    to: string;
    subject: string;
    text: string;
    inReplyTo: string | null;
    references: string | null;
    idempotencyKey: string;
  }
): Promise<{ id: string }> {
  if (!cfg.apiKey) throw new Error('El buzón del agente no está conectado');
  const subject = /^re:/i.test(input.subject.trim()) ? input.subject.trim() : `Re: ${input.subject.trim() || '(sin asunto)'}`;
  const msgId = input.inReplyTo ? `<${input.inReplyTo.replace(/^<|>$/g, '')}>` : null;
  const refs = [input.references?.trim(), msgId].filter(Boolean).join(' ');
  return call<{ id: string }>(cfg.apiKey, '/emails', {
    method: 'POST',
    headers: { 'Idempotency-Key': input.idempotencyKey.slice(0, 256) },
    body: JSON.stringify({
      from: `${cfg.fromName} <${cfg.address}>`,
      to: [input.to],
      ...(cfg.bcc ? { bcc: [cfg.bcc] } : {}),
      subject,
      text: input.text,
      ...(msgId ? { headers: { 'In-Reply-To': msgId, References: refs } } : {})
    })
  });
}

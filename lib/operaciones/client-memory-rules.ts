// Reglas puras (sin base de datos) de la memoria de cliente y de sus remitentes. Se usan en las
// acciones del servidor y en las pruebas. Nada de aquí toca datos.

export const MEMORY_KINDS = ['preferencia', 'promesa', 'decision', 'contexto', 'restriccion'] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

export const MEMORY_KIND_LABELS: Record<MemoryKind, string> = {
  preferencia: 'Preferencia',
  promesa: 'Promesa',
  decision: 'Decisión',
  contexto: 'Contexto',
  restriccion: 'Restricción'
};

export const MEMORY_STATUSES = ['propuesto', 'aceptado', 'descartado'] as const;
export type MemoryStatus = (typeof MEMORY_STATUSES)[number];

export const MEMORY_MAX_CHARS = 1000;

// La memoria nunca guarda contraseñas ni accesos (misma regla que las fichas de cliente).
const SECRET_RE = /(contrase[ñn]a|password|passwd|pwd|clave de acceso)\s*[:=]/i;

export function validateMemoryText(raw: string): { ok: true; text: string } | { ok: false; error: string } {
  const text = raw.replace(/\s+/g, ' ').trim();
  if (!text) return { ok: false, error: 'Escribe el dato que quieres recordar' };
  if (text.length > MEMORY_MAX_CHARS) return { ok: false, error: `Máximo ${MEMORY_MAX_CHARS} caracteres` };
  if (SECRET_RE.test(text)) return { ok: false, error: 'La memoria no guarda contraseñas ni accesos: quítalos del texto' };
  return { ok: true, text };
}

export function isMemoryKind(v: string): v is MemoryKind {
  return (MEMORY_KINDS as readonly string[]).includes(v);
}

// Proveedores de correo públicos: dar de alta «gmail.com» como dominio de un cliente haría que
// cualquier persona con Gmail pareciera ese cliente. Solo se admiten como dirección exacta.
export const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'outlook.es', 'hotmail.com', 'hotmail.es', 'live.com',
  'msn.com', 'yahoo.com', 'yahoo.es', 'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com',
  'proton.me', 'protonmail.com', 'gmx.com', 'gmx.es', 'gmx.net', 'zoho.com', 'mail.com', 'yandex.com',
  'telefonica.net', 'movistar.es', 'terra.es', 'orange.es', 'ono.com', 'wanadoo.es'
]);

const EMAIL_RE = /^[a-z0-9._%+'-]{1,64}@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export type SenderKind = 'email' | 'domain';

export function normalizeSender(
  kind: string,
  raw: string
): { ok: true; kind: SenderKind; value: string } | { ok: false; error: string } {
  let value = raw.trim().toLowerCase();
  if (kind === 'email') {
    // Acepta «Nombre <correo@dominio.com>» pegado tal cual.
    const angle = value.match(/<([^>]+)>/);
    if (angle) value = angle[1].trim();
    if (value.length > 254 || !EMAIL_RE.test(value)) return { ok: false, error: 'El correo no es válido' };
    return { ok: true, kind: 'email', value };
  }
  if (kind === 'domain') {
    value = value.replace(/^@/, '').replace(/^www\./, '');
    if (value.length > 253 || !DOMAIN_RE.test(value)) return { ok: false, error: 'El dominio no es válido (ej.: empresa.com)' };
    if (PUBLIC_EMAIL_DOMAINS.has(value)) {
      return { ok: false, error: `«${value}» es un proveedor de correo público: añade la dirección exacta del contacto en vez del dominio` };
    }
    return { ok: true, kind: 'domain', value };
  }
  return { ok: false, error: 'Tipo de remitente no válido' };
}

export type SenderLike = { clientId: string; kind: string; value: string; active: boolean };

/**
 * ¿De qué cliente es quien escribe? La dirección exacta gana al dominio. Si el dominio (o la
 * dirección) lo reclaman varios clientes distintos, no se adivina: devuelve «ambiguous».
 */
export function matchSender(
  senders: SenderLike[],
  fromAddress: string
): { clientId: string; by: 'email' | 'domain' } | { ambiguous: string[] } | null {
  const from = fromAddress.trim().toLowerCase();
  const at = from.lastIndexOf('@');
  if (at < 1) return null;
  const domain = from.slice(at + 1);
  const active = senders.filter((s) => s.active);

  const byEmail = [...new Set(active.filter((s) => s.kind === 'email' && s.value === from).map((s) => s.clientId))];
  if (byEmail.length === 1) return { clientId: byEmail[0], by: 'email' };
  if (byEmail.length > 1) return { ambiguous: byEmail };

  const byDomain = [...new Set(active.filter((s) => s.kind === 'domain' && s.value === domain).map((s) => s.clientId))];
  if (byDomain.length === 1) return { clientId: byDomain[0], by: 'domain' };
  if (byDomain.length > 1) return { ambiguous: byDomain };
  return null;
}

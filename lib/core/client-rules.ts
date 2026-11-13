// Reglas puras (sin base de datos) del cliente del NÚCLEO: estados, contactos, webs y cuentas, competencia, memoria,
// remitentes y completitud de la ficha. Las usan el servidor, las pantallas y las pruebas. Nada de aquí toca datos.
// (Antes lib/operaciones/client-memory-rules.ts, que ahora solo reexporta.)

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
export const SECRET_RE = /(contrase[ñn]a|password|passwd|pwd|clave de acceso)\s*[:=]/i;
export const hasSecret = (...parts: unknown[]): boolean => parts.some((p) => typeof p === 'string' && SECRET_RE.test(p));

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

// --- Ficha del cliente (núcleo) ---------------------------------------------------------------------------------

export const CLIENT_STATUSES = ['prospecto', 'onboarding', 'activo', 'pausado', 'baja'] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];
export const STATUS_LABEL: Record<ClientStatus, string> = {
  prospecto: 'Prospecto',
  onboarding: 'Onboarding',
  activo: 'Activo',
  pausado: 'Pausado',
  baja: 'Baja'
};
export const isClientStatus = (v: string): v is ClientStatus => (CLIENT_STATUSES as readonly string[]).includes(v);
/** Para Operaciones un cliente «está activo» (alertas, avisos, reconocimiento preferente) en onboarding o activo. */
export const isWorkingStatus = (s: string): boolean => s === 'onboarding' || s === 'activo';

export const CONTACT_ROLES = ['decisor', 'facturacion', 'tecnico', 'marketing', 'otro'] as const;
export type ContactRole = (typeof CONTACT_ROLES)[number];
export const CONTACT_ROLE_LABEL: Record<ContactRole, string> = {
  decisor: 'Decide',
  facturacion: 'Facturación',
  tecnico: 'Técnico',
  marketing: 'Marketing',
  otro: 'Otro'
};
export const isContactRole = (v: string): v is ContactRole => (CONTACT_ROLES as readonly string[]).includes(v);
export const CHANNELS = ['email', 'telefono', 'whatsapp', 'otro'] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_LABEL: Record<Channel, string> = { email: 'Correo', telefono: 'Teléfono', whatsapp: 'WhatsApp', otro: 'Otro' };
export const isChannel = (v: string): v is Channel => (CHANNELS as readonly string[]).includes(v);

export const ASSET_KINDS = ['web', 'dominio', 'search_console', 'analytics', 'business_profile', 'google_ads', 'meta', 'instagram', 'tiktok', 'linkedin', 'youtube', 'tienda', 'crm', 'otro'] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];
export const ASSET_KIND_LABEL: Record<AssetKind, string> = {
  web: 'Web',
  dominio: 'Dominio',
  search_console: 'Search Console',
  analytics: 'Google Analytics',
  business_profile: 'Ficha de Google (Business Profile)',
  google_ads: 'Google Ads',
  meta: 'Facebook / Meta',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  tienda: 'Tienda online',
  crm: 'CRM',
  otro: 'Otro'
};
/** Qué pueden hacer los agentes con cada tipo de activo (las integraciones se conectan una vez en Agentes → Integraciones). */
export const ASSET_INTEGRATION: Partial<Record<AssetKind, { provider: string | null; label: string }>> = {
  web: { provider: null, label: 'Lectura y auditoría de la web por los agentes' },
  search_console: { provider: 'google', label: 'Clics, impresiones y posiciones (Search Console)' },
  analytics: { provider: 'google', label: 'Visitas y conversiones (Analytics 4)' },
  business_profile: { provider: 'google', label: 'Ficha de Google (Business Profile)' }
};
export const ACCESS_LEVELS = ['sin_revisar', 'si', 'pendiente', 'no', 'no_aplica'] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];
export const ACCESS_LABEL: Record<AccessLevel, string> = {
  sin_revisar: 'Sin revisar',
  si: 'Tenemos acceso',
  pendiente: 'Pedido, pendiente',
  no: 'Sin acceso',
  no_aplica: 'No hace falta'
};
export const isAssetKind = (v: string): v is AssetKind => (ASSET_KINDS as readonly string[]).includes(v);
export const isAccess = (v: string): v is AccessLevel => (ACCESS_LEVELS as readonly string[]).includes(v);

/** Dominio de una URL o de un dominio escrito a mano («https://www.Ejemplo.com/x» → «ejemplo.com»); null si no lo parece. */
export function domainOf(url: string | null | undefined): string | null {
  const m = String(url ?? '')
    .trim()
    .toLowerCase()
    .replace(/^sc-domain:/, '')
    .replace(/^[a-z]+:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#:\s]/)[0];
  return DOMAIN_RE.test(m) ? m : null;
}

/** URL con protocolo («ejemplo.com» → «https://ejemplo.com»). Deja igual los identificadores que no son una URL. */
export function normalizeUrl(url: string): string {
  const u = url.trim();
  if (!u) return '';
  if (/^[a-z]+:\/\//i.test(u) || /^(sc-domain:|properties\/|accounts\/|locations\/)/i.test(u)) return u;
  return domainOf(u) ? `https://${u.replace(/^\/+/, '')}` : u;
}

/** Correo normalizado (minúsculas, sin «Nombre <…>») o null si no es válido. */
export function normEmail(raw: string | null | undefined): string | null {
  const r = normalizeSender('email', String(raw ?? ''));
  return r.ok ? r.value : null;
}

/** Dominio que puede reconocer los correos de un cliente (nunca un proveedor público). */
export function recognizableDomain(url: string | null | undefined): string | null {
  const d = domainOf(url);
  return d && !PUBLIC_EMAIL_DOMAINS.has(d) ? d : null;
}

// --- Completitud de la ficha --------------------------------------------------------------------------------------

export type SheetForCompleteness = {
  client: { business: string | null; offerings: string | null; area: string | null; audience: string | null; goals: string | null; strategy: string | null };
  contacts: { isPrimary: boolean; email: string | null; phone: string | null; active: boolean }[];
  locations: { address: string | null }[];
  assets: { kind: string; access: string }[];
  competitors: unknown[];
};

export type MissingItem = { key: string; label: string; tab: 'empresa' | 'contactos' | 'webs' | 'competencia' };

/** Qué le falta a la ficha para que el equipo y los agentes trabajen sin preguntar. Lo esencial pesa más. */
export function completeness(s: SheetForCompleteness): { pct: number; missing: MissingItem[] } {
  const has = (v: string | null | undefined) => Boolean(v && v.trim());
  const checks: (MissingItem & { ok: boolean; w: number })[] = [
    { key: 'negocio', label: 'A qué se dedica', tab: 'empresa', ok: has(s.client.business), w: 3 },
    { key: 'objetivos', label: 'Objetivos', tab: 'empresa', ok: has(s.client.goals), w: 3 },
    { key: 'contacto', label: 'Un contacto con correo o teléfono', tab: 'contactos', ok: s.contacts.some((c) => c.active && Boolean(c.email || c.phone)), w: 3 },
    { key: 'web', label: 'Su web', tab: 'webs', ok: s.assets.some((a) => a.kind === 'web'), w: 3 },
    { key: 'oferta', label: 'Qué vende u ofrece', tab: 'empresa', ok: has(s.client.offerings), w: 2 },
    { key: 'publico', label: 'Público objetivo', tab: 'empresa', ok: has(s.client.audience), w: 2 },
    { key: 'estrategia', label: 'Estrategia', tab: 'empresa', ok: has(s.client.strategy), w: 2 },
    { key: 'search_console', label: 'Search Console', tab: 'webs', ok: s.assets.some((a) => a.kind === 'search_console'), w: 2 },
    { key: 'zona', label: 'Zona en la que trabaja', tab: 'empresa', ok: has(s.client.area), w: 1 },
    { key: 'analytics', label: 'Google Analytics', tab: 'webs', ok: s.assets.some((a) => a.kind === 'analytics'), w: 1 },
    { key: 'accesos', label: 'Revisar los accesos de sus webs y cuentas', tab: 'webs', ok: s.assets.length > 0 && s.assets.every((a) => a.access !== 'sin_revisar'), w: 1 },
    { key: 'competencia', label: 'Competidores', tab: 'competencia', ok: s.competitors.length > 0, w: 1 },
    { key: 'direccion', label: 'Dirección o local', tab: 'contactos', ok: s.locations.some((l) => has(l.address)), w: 1 },
    { key: 'principal', label: 'Marcar el contacto principal', tab: 'contactos', ok: s.contacts.some((c) => c.active && c.isPrimary), w: 1 }
  ];
  const total = checks.reduce((n, c) => n + c.w, 0);
  const got = checks.filter((c) => c.ok).reduce((n, c) => n + c.w, 0);
  return { pct: Math.round((got / total) * 100), missing: checks.filter((c) => !c.ok).map(({ key, label, tab }) => ({ key, label, tab })) };
}

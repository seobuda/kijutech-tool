// Núcleo · Leads del cliente: reglas puras (27 nov 2026; docs/DISENO-SEO-CIERRE.md §C). Sin base de datos ni red: se prueban
// en tests/core-conexiones.test.ts. Comprobado con una subcuenta real de GoHighLevel el 27 nov: cada envío de formulario
// trae en others.eventData la página de la web del cliente (page.url, con sus parámetros), el referente, la fuente
// («Social media», «Organic Search»…) y los UTM (url_params). No hace falta pedir el contacto.
// Privacidad: de un envío solo se guarda lo necesario para medir. Nunca nombre, correo, teléfono, IP ni los demás campos.

export const LEAD_CHANNELS = ['organico', 'pago', 'directo', 'social', 'referido', 'otros'] as const;
export type LeadChannel = (typeof LEAD_CHANNELS)[number];
export const CHANNEL_LABEL: Record<LeadChannel, string> = { organico: 'Búsqueda orgánica', pago: 'Anuncios', directo: 'Directo', social: 'Redes sociales', referido: 'Otras webs', otros: 'Otros' };

export type ParsedLead = {
  externalId: string;
  contactRef: string | null;
  formId: string | null;
  submittedAt: Date;
  pageUrl: string | null;
  referrer: string | null;
  channel: LeadChannel;
  utm: Record<string, string>;
  hasGclid: boolean;
};

const str = (v: unknown, max = 500): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/** URL sin parámetros ni fragmento (los UTM se guardan aparte; un parámetro puede llevar datos personales). */
export function cleanUrl(u: unknown): string | null {
  const s = str(u, 2000);
  if (!s) return null;
  try {
    const url = new URL(s);
    if (!/^https?:$/.test(url.protocol)) return null;
    return `${url.protocol}//${url.host.toLowerCase()}${url.pathname}`.slice(0, 500);
  } catch {
    return null;
  }
}

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

/** Canal normalizado a partir de la fuente de GoHighLevel, los UTM y si hay identificador de clic de anuncio. */
export function leadChannel(source: string | null, utm: Record<string, string>, paidClick: boolean): LeadChannel {
  const s = (source ?? '').toLowerCase();
  const medium = (utm.utm_medium ?? '').toLowerCase();
  if (paidClick || /paid|cpc|ppc|ads?\b/.test(medium) || /paid/.test(s)) return 'pago';
  if (/organic/.test(s)) return 'organico';
  if (/social/.test(s)) return 'social';
  if (/referr?al/.test(s)) return 'referido';
  if (/direct/.test(s)) return 'directo';
  return 'otros';
}

/** Lee un envío de /forms/submissions. Devuelve null si no tiene id o fecha. */
export function parseGhlSubmission(raw: unknown): ParsedLead | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id, 100);
  const at = str(r.createdAt, 40);
  const when = at ? new Date(at) : null;
  if (!id || !when || Number.isNaN(when.getTime())) return null;
  const others = (r.others && typeof r.others === 'object' ? r.others : {}) as Record<string, unknown>;
  const ev = (others.eventData && typeof others.eventData === 'object' ? others.eventData : {}) as Record<string, unknown>;
  const page = (ev.page && typeof ev.page === 'object' ? ev.page : {}) as Record<string, unknown>;
  const params = (ev.url_params && typeof ev.url_params === 'object' ? ev.url_params : {}) as Record<string, unknown>;
  const utm: Record<string, string> = {};
  for (const k of UTM_KEYS) {
    const v = str(params[k], 120);
    if (v) utm[k] = v;
  }
  let paidClick = ['gclid', 'gbraid', 'wbraid', 'msclkid', 'fbclid'].some((k) => str(params[k]));
  const rawUrl = str(page.url, 2000);
  if (rawUrl && /[?&](gclid|gbraid|wbraid|msclkid)=/i.test(rawUrl)) paidClick = true;
  const hasGclid = Boolean(str(params.gclid) || (rawUrl && /[?&](gclid|gbraid|wbraid)=/i.test(rawUrl)));
  return {
    externalId: id,
    contactRef: str(r.contactId, 100),
    formId: str(r.formId, 100) ?? str(others.formId, 100),
    submittedAt: when,
    pageUrl: cleanUrl(rawUrl),
    referrer: cleanUrl(ev.referrer) ?? null,
    channel: leadChannel(str(ev.source, 60), utm, paidClick),
    utm,
    hasGclid
  };
}

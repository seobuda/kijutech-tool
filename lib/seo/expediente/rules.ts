// SEO · Expediente provisional del proyecto: reglas PURAS (Hito 1, 23 nov 2026; docs/DISENO-TECNICO-HITO1.md §1).
// El sistema recoge datos solo (ficha del cliente, web, Search Console, archivo de Internet) y cada dato lleva su origen
// y una confianza. Sin IA: extraer de la web (JSON-LD, enlaces tel:, redes), normalizar y comparar entre fuentes.
// La identidad se da por confirmada cuando dos señales independientes coinciden (dominio, teléfono, nombre, dirección).

export type FactSource = 'ficha' | 'web' | 'places' | 'wayback' | 'gsc' | 'busqueda' | 'persona' | 'ia' | 'cliente';

/** Campos del expediente (lista cerrada). «client» = es un dato de la ficha del cliente (se propone allí, no se pisa). */
export const DOSSIER_FIELDS: { field: string; label: string; client: boolean }[] = [
  { field: 'nombre', label: 'Nombre comercial', client: true },
  { field: 'negocio', label: 'A qué se dedica', client: true },
  { field: 'web', label: 'Web', client: true },
  { field: 'telefono', label: 'Teléfono', client: true },
  { field: 'direccion', label: 'Dirección', client: true },
  { field: 'tipo_negocio', label: 'Tipo de negocio', client: true },
  { field: 'perfiles', label: 'Perfiles sociales', client: true },
  { field: 'logo', label: 'Logo', client: true },
  { field: 'servicios', label: 'Servicios principales', client: true },
  { field: 'zona', label: 'Zona donde trabaja', client: true },
  { field: 'publico', label: 'Público (a quién vende)', client: true },
  { field: 'atencion', label: 'Cómo atiende (local, a domicilio, online)', client: false },
  { field: 'idiomas', label: 'Idiomas en los que le buscan', client: false },
  { field: 'titulo_inicio', label: 'Título de la página de inicio', client: false },
  { field: 'primera_fecha_web', label: 'Primera vez archivada en Internet', client: false },
  { field: 'datos_search_console', label: 'Datos en Search Console desde', client: false },
  { field: 'marca_en_google', label: 'Búsquedas de la marca (90 días)', client: false },
  { field: 'paginas_con_impresiones', label: 'Páginas que salen en Google (90 días)', client: false }
];
export const DOSSIER_FIELD_SET = new Set(DOSSIER_FIELDS.map((f) => f.field));

/** Cómo atiende el negocio (alta de la cartera): cambia el sentido de la zona y del mapa de Google. */
export const ATENCION_OPTIONS = [
  { value: 'local', label: 'En su local (los clientes van)' },
  { value: 'domicilio', label: 'A domicilio (va a casa del cliente)' },
  { value: 'ambos', label: 'Las dos cosas' },
  { value: 'online', label: 'Solo online o a distancia' }
] as const;

export type FactDraft = { field: string; value: unknown; source: FactSource; sourceRef?: string | null };

/** Confianza de partida por origen (0-100). Una persona confirma: 100. */
// «cliente» = lo respondió el propio cliente a las 3 preguntas (Hito 2): fiable, pero una persona lo confirma.
const BASE: Record<FactSource, number> = { persona: 100, cliente: 90, gsc: 85, ficha: 70, wayback: 70, places: 75, web: 60, busqueda: 50, ia: 40 };

// --- Normalización -----------------------------------------------------------------------------------------------

export function normPhone(p: unknown): string | null {
  if (typeof p !== 'string' || !p.trim()) return null;
  let d = p.replace(/[^\d+]/g, '');
  if (d.startsWith('0034')) d = `+${d.slice(2)}`;
  if (/^[6789]\d{8}$/.test(d)) d = `+34${d}`;
  return d.length >= 9 ? d : null;
}

export function normText(s: unknown): string {
  return typeof s === 'string'
    ? s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\b(s\.?l\.?u?|s\.?a\.?|sociedad limitada)\b\.?/g, ' ')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
    : '';
}

export function host(u: unknown): string | null {
  if (typeof u !== 'string' || !u.trim()) return null;
  const v = u.trim().replace(/^sc-domain:/i, '');
  try {
    return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

export type Address = { street?: string | null; city?: string | null; postalCode?: string | null; region?: string | null; country?: string | null };

function addrKey(a: unknown): string | null {
  if (!a || typeof a !== 'object') return null;
  const x = a as Address;
  const cp = (x.postalCode ?? '').replace(/\s/g, '');
  const city = normText(x.city ?? '');
  if (!cp && !city) return null;
  return `${cp}|${city}`;
}

/** Dos nombres coinciden si uno contiene al otro tras normalizar (quitando la forma jurídica). */
export function sameName(a: unknown, b: unknown): boolean {
  const x = normText(a);
  const y = normText(b);
  if (x.length < 3 || y.length < 3) return false;
  return x === y || x.includes(y) || y.includes(x) || x.replace(/ /g, '') === y.replace(/ /g, '');
}

/** Valor comparable de un dato (para saber si dos fuentes dicen lo mismo). */
export function factKey(field: string, value: unknown): string | null {
  switch (field) {
    case 'telefono':
      return normPhone(value);
    case 'web':
      return host(value);
    case 'nombre':
      return normText(value) || null;
    case 'direccion':
      return addrKey(value);
    case 'tipo_negocio':
      return typeof value === 'string' ? value : null;
    case 'servicios':
      return Array.isArray(value) ? value.map((x) => normText(x)).filter(Boolean).sort().join('|') || null : null;
    case 'zona':
    case 'negocio':
    case 'publico':
    case 'atencion':
      return normText(value) || null;
    case 'idiomas':
      return Array.isArray(value) ? value.map((x) => String(x).toLowerCase()).sort().join('|') || null : null;
    default:
      return value == null ? null : JSON.stringify(value);
  }
}

/** Confianza de cada dato: la de su origen, +20 si otra fuente dice lo mismo, −15 si otra fuente dice otra cosa. */
export function scoreFacts<T extends FactDraft>(facts: T[]): (T & { confidence: number; agrees: FactSource[]; conflicts: FactSource[] })[] {
  return facts.map((f) => {
    const k = factKey(f.field, f.value);
    const others = facts.filter((o) => o !== f && o.field === f.field && o.source !== f.source);
    const agrees = others.filter((o) => k && (f.field === 'nombre' ? sameName(o.value, f.value) : factKey(o.field, o.value) === k)).map((o) => o.source);
    const conflicts = others.filter((o) => k && factKey(o.field, o.value) && !agrees.includes(o.source)).map((o) => o.source);
    let c = BASE[f.source] ?? 50;
    if (agrees.length) c += 20;
    if (conflicts.length) c -= 15;
    return { ...f, confidence: Math.max(5, Math.min(f.source === 'persona' ? 100 : 95, c)), agrees, conflicts };
  });
}

export type Identity = { status: 'identificado' | 'provisional'; matches: string[]; conflicts: string[] };

/**
 * Identidad del proyecto: «identificado» cuando al menos dos señales independientes coinciden entre la ficha y otra
 * fuente (dominio, teléfono, nombre, dirección). Las diferencias se devuelven para que una persona las mire.
 */
export function identity(facts: FactDraft[]): Identity {
  const matches: string[] = [];
  const conflicts: string[] = [];
  const LABEL: Record<string, string> = { web: 'dominio', telefono: 'teléfono', nombre: 'nombre', direccion: 'dirección' };
  for (const field of ['web', 'telefono', 'nombre', 'direccion']) {
    const ficha = facts.find((f) => f.field === field && f.source === 'ficha');
    const persona = facts.find((f) => f.field === field && f.source === 'persona');
    const ref = persona ?? ficha;
    const others = facts.filter((f) => f.field === field && f !== ref && f.source !== 'persona' && f.source !== 'ficha');
    if (!ref || !others.length) continue;
    const k = factKey(field, ref.value);
    if (!k) continue;
    const ok = others.some((o) => (field === 'nombre' ? sameName(o.value, ref.value) : factKey(field, o.value) === k));
    if (ok) matches.push(`${LABEL[field]} (${others.filter((o) => (field === 'nombre' ? sameName(o.value, ref.value) : factKey(field, o.value) === k)).map((o) => o.source).join(', ')})`);
    else conflicts.push(`${LABEL[field]}: la ficha dice «${display(field, ref.value)}» y ${others[0].source} dice «${display(field, others[0].value)}»`);
  }
  return { status: matches.length >= 2 ? 'identificado' : 'provisional', matches, conflicts };
}

export function display(field: string, v: unknown): string {
  if (v == null) return '—';
  if (field === 'direccion' && typeof v === 'object') {
    const a = v as Address;
    return [a.street, a.postalCode, a.city, a.region].filter(Boolean).join(', ') || '—';
  }
  if (Array.isArray(v)) return v.join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// --- Extracción de la web (sin IA) -------------------------------------------------------------------------------

const SOCIAL_HOSTS = /(^|\.)(facebook\.com|instagram\.com|linkedin\.com|youtube\.com|tiktok\.com|x\.com|twitter\.com|pinterest\.[a-z.]+)$/i;

type Node = Record<string, unknown>;
function nodes(jsonld: unknown): Node[] {
  const out: Node[] = [];
  const walk = (x: unknown) => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (!x || typeof x !== 'object') return;
    const n = x as Node;
    out.push(n);
    if (n['@graph']) walk(n['@graph']);
  };
  walk(jsonld);
  return out;
}
const types = (n: Node): string[] => (Array.isArray(n['@type']) ? (n['@type'] as unknown[]).map(String) : n['@type'] ? [String(n['@type'])] : []);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * Datos de la página de inicio: JSON-LD (nombre, teléfono, dirección, tipo, perfiles, logo), enlaces tel: y enlaces a
 * redes sociales. «businessTypes» = tipos de schema.org que aceptamos como tipo de negocio.
 */
export function extractFromHome(input: { url: string; html: string; jsonld?: unknown; title?: string | null }, businessTypes: Set<string>): FactDraft[] {
  const facts: FactDraft[] = [];
  const ref = input.url;
  const blocks: unknown[] = [];
  if (input.jsonld) blocks.push(input.jsonld);
  for (const m of input.html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      blocks.push(JSON.parse(m[1].trim()));
    } catch {
      /* JSON-LD roto: lo señala la auditoría */
    }
  }
  const all = blocks.flatMap(nodes);
  const org = all.find((n) => types(n).some((t) => businessTypes.has(t) || t === 'Organization' || t === 'LocalBusiness'));
  if (org) {
    const name = str(org.name);
    if (name) facts.push({ field: 'nombre', value: name, source: 'web', sourceRef: ref });
    const tel = normPhone(org.telephone);
    if (tel) facts.push({ field: 'telefono', value: tel, source: 'web', sourceRef: ref });
    const a = org.address as Node | undefined;
    if (a && typeof a === 'object') {
      const addr: Address = { street: str(a.streetAddress), city: str(a.addressLocality), postalCode: str(a.postalCode), region: str(a.addressRegion), country: str(a.addressCountry) };
      if (addr.street || addr.city) facts.push({ field: 'direccion', value: addr, source: 'web', sourceRef: ref });
    }
    const t = types(org).find((x) => businessTypes.has(x) && x !== 'LocalBusiness' && x !== 'Organization');
    if (t) facts.push({ field: 'tipo_negocio', value: t, source: 'web', sourceRef: ref });
    const logo = str(org.logo) ?? str((org.logo as Node | undefined)?.url);
    if (logo) facts.push({ field: 'logo', value: logo, source: 'web', sourceRef: ref });
  }
  if (!facts.some((f) => f.field === 'telefono')) {
    const tels = [...input.html.matchAll(/href=["']tel:([^"']+)["']/gi)].map((m) => normPhone(decodeURIComponent(m[1]))).filter(Boolean) as string[];
    const top = mostCommon(tels);
    if (top) facts.push({ field: 'telefono', value: top, source: 'web', sourceRef: `${ref} (enlace tel:)` });
  }
  if (!facts.some((f) => f.field === 'nombre')) {
    const site = input.html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)?.[1];
    if (site?.trim()) facts.push({ field: 'nombre', value: decodeEntities(site.trim()), source: 'web', sourceRef: `${ref} (og:site_name)` });
  }
  const socials = new Set<string>();
  for (const n of all) for (const s of Array.isArray(n.sameAs) ? n.sameAs : n.sameAs ? [n.sameAs] : []) if (typeof s === 'string') socials.add(s.trim());
  for (const m of input.html.matchAll(/href=["'](https?:\/\/[^"'#?]+)["']/gi)) {
    try {
      const u = new URL(m[1]);
      if (SOCIAL_HOSTS.test(u.hostname) && u.pathname.length > 1 && !/\/(sharer|share|intent|dialog)/i.test(u.pathname)) socials.add(`${u.origin}${u.pathname.replace(/\/$/, '')}`);
    } catch {
      /* ignorar */
    }
  }
  if (socials.size) facts.push({ field: 'perfiles', value: [...socials].slice(0, 12), source: 'web', sourceRef: ref });
  if (input.title?.trim()) facts.push({ field: 'titulo_inicio', value: input.title.trim().slice(0, 300), source: 'web', sourceRef: ref });
  return facts;
}

function mostCommon(xs: string[]): string | null {
  const c = new Map<string, number>();
  for (const x of xs) c.set(x, (c.get(x) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}
function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&#8211;/g, '–');
}

/** Palabras de la marca para reconocer búsquedas de marca (nombre y alias, sin palabras genéricas). */
export function brandTokens(names: string[]): string[] {
  const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'sl', 'sa', 'slu', 'grupo', 'new', 'the']);
  const out = new Set<string>();
  for (const n of names) {
    const t = normText(n);
    if (t.replace(/ /g, '').length >= 4) out.add(t.replace(/ /g, ''));
    for (const w of t.split(' ')) if (w.length >= 4 && !STOP.has(w)) out.add(w);
  }
  return [...out];
}

/** ¿La búsqueda es de marca? (contiene alguna palabra de la marca, con o sin espacios). */
export function isBrandQuery(q: string, tokens: string[]): boolean {
  const n = normText(q);
  const compact = n.replace(/ /g, '');
  return tokens.some((t) => n.split(' ').includes(t) || compact.includes(t));
}

// Rastreador: extracción de una página HTML (cimientos, 23 nov 2026). Pura: recibe el HTML y la URL, no hace red.
// Usa parse5 (analizador HTML estándar del WHATWG, aprobado por Enric) en vez de expresiones regulares: el HTML real
// trae atributos sin comillas, comentarios, scripts con «<» y etiquetas mal cerradas que rompen las regex.
import { createHash } from 'crypto';
import { parse } from 'parse5';

type Node = {
  nodeName: string;
  tagName?: string;
  attrs?: { name: string; value: string }[];
  childNodes?: Node[];
  value?: string;
  content?: Node; // <template>
};

export type ExtractedLink = { url: string; anchor: string; nofollow: boolean; internal: boolean };
export type ExtractedPage = {
  title: string | null;
  metaDescription: string | null;
  h1: string[];
  headings: { h2: string[]; h3: string[] };
  canonical: string | null;
  robotsMeta: string | null;
  lang: string | null;
  hreflang: { lang: string; url: string }[];
  wordCount: number;
  contentHash: string;
  simhash: string;
  links: ExtractedLink[];
  jsonld: unknown[];
  jsonldErrors: number;
  schemaTypes: string[];
  imagesWithoutAlt: number;
  /** Poco texto y muchos scripts: posible web que se pinta con JavaScript (el rastreador no lo ejecuta). */
  maybeJsRendered: boolean;
  /** Hojas de estilo y scripts que carga la página (URLs absolutas, como mucho 40): para ver si robots.txt los bloquea. */
  resources: string[];
};

const attr = (n: Node, name: string) => n.attrs?.find((a) => a.name === name)?.value ?? null;
const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
const SKIP_TEXT = new Set(['script', 'style', 'noscript', 'template', 'svg', 'head']);

function walk(n: Node, fn: (n: Node) => boolean | void): void {
  if (fn(n) === false) return;
  for (const c of n.childNodes ?? []) walk(c, fn);
  if (n.content) walk(n.content, fn);
}

function textOf(n: Node, skip = SKIP_TEXT): string {
  const parts: string[] = [];
  walk(n, (x) => {
    if (x.tagName && skip.has(x.tagName)) return false;
    if (x.nodeName === '#text' && x.value) parts.push(x.value);
  });
  return clean(parts.join(' '));
}

/** Normaliza una URL para rastrear: absoluta, sin fragmento, sin «/» final duplicada. null si no es http(s). */
export function normalizeUrl(href: string, base: string): string | null {
  try {
    const u = new URL(href.trim(), base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    u.hostname = u.hostname.toLowerCase();
    if ((u.protocol === 'http:' && u.port === '80') || (u.protocol === 'https:' && u.port === '443')) u.port = '';
    return u.toString();
  } catch {
    return null;
  }
}

/** Mismo sitio: mismo host, ignorando «www.». */
export function sameSite(a: string, b: string): boolean {
  try {
    const h = (u: string) => new URL(u).hostname.toLowerCase().replace(/^www\./, '');
    return h(a) === h(b);
  } catch {
    return false;
  }
}

export function sha1(s: string): string {
  return createHash('sha1').update(s).digest('hex');
}

/** Huella de similitud de 64 bits (simhash) sobre trigramas de palabras: textos casi iguales dan huellas parecidas. */
export function simhash(text: string): string {
  const words = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const v = new Array<number>(64).fill(0);
  const shingles = words.length < 3 ? [words.join(' ')] : words.slice(0, -2).map((_, i) => `${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  for (const sh of shingles) {
    if (!sh) continue;
    const h = createHash('md5').update(sh).digest();
    for (let bit = 0; bit < 64; bit++) {
      const byte = h[bit >> 3];
      v[bit] += (byte >> (bit & 7)) & 1 ? 1 : -1;
    }
  }
  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    let nib = 0;
    for (let j = 0; j < 4; j++) if (v[i + j] > 0) nib |= 1 << j;
    hex += nib.toString(16);
  }
  return hex;
}

/** Bits distintos entre dos simhash (0 = iguales; ≤ 3 suele ser casi duplicado). */
export function hamming(a: string, b: string): number {
  let n = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      n += x & 1;
      x >>= 1;
    }
  }
  return n;
}

/** Tipos de schema.org de un bloque JSON-LD (incluye @graph y anidados de primer nivel). */
export function schemaTypesOf(block: unknown): string[] {
  const out = new Set<string>();
  const visit = (x: unknown, depth: number) => {
    if (!x || typeof x !== 'object' || depth > 4) return;
    if (Array.isArray(x)) return x.forEach((y) => visit(y, depth + 1));
    const o = x as Record<string, unknown>;
    const t = o['@type'];
    for (const v of Array.isArray(t) ? t : [t]) if (typeof v === 'string') out.add(v.replace(/^https?:\/\/schema\.org\//, ''));
    if (o['@graph']) visit(o['@graph'], depth + 1);
    for (const [k, v] of Object.entries(o)) if (k !== '@graph' && k !== '@context' && typeof v === 'object') visit(v, depth + 1);
  };
  visit(block, 0);
  return [...out];
}

export function extractPage(html: string, pageUrl: string): ExtractedPage {
  const doc = parse(html.slice(0, 2_000_000)) as unknown as Node;
  let title: string | null = null;
  let metaDescription: string | null = null;
  let canonical: string | null = null;
  let robotsMeta: string | null = null;
  let lang: string | null = null;
  const h1: string[] = [];
  const h2: string[] = [];
  const h3: string[] = [];
  const hreflang: { lang: string; url: string }[] = [];
  const links: ExtractedLink[] = [];
  const jsonld: unknown[] = [];
  const resources: string[] = [];
  let jsonldErrors = 0;
  let imagesWithoutAlt = 0;
  let scripts = 0;
  let body: Node | null = null;

  walk(doc, (n) => {
    const tag = n.tagName;
    if (!tag) return;
    if (tag === 'html') lang = attr(n, 'lang');
    else if (tag === 'body') body = n;
    else if (tag === 'title' && title === null) title = clean(textOf(n, new Set())) || null;
    else if (tag === 'meta') {
      const name = (attr(n, 'name') ?? '').toLowerCase();
      if (name === 'description' && metaDescription === null) metaDescription = clean(attr(n, 'content') ?? '') || null;
      if ((name === 'robots' || name === 'googlebot') && robotsMeta === null) robotsMeta = clean(attr(n, 'content') ?? '').toLowerCase() || null;
    } else if (tag === 'link') {
      const rel = (attr(n, 'rel') ?? '').toLowerCase().split(/\s+/);
      const href = attr(n, 'href');
      if (rel.includes('canonical') && href && canonical === null) canonical = normalizeUrl(href, pageUrl);
      if (rel.includes('stylesheet') && href && resources.length < 40) {
        const r = normalizeUrl(href, pageUrl);
        if (r) resources.push(r);
      }
      if (rel.includes('alternate') && attr(n, 'hreflang') && href) {
        const u = normalizeUrl(href, pageUrl);
        if (u) hreflang.push({ lang: (attr(n, 'hreflang') ?? '').toLowerCase(), url: u });
      }
    } else if (tag === 'h1') h1.push(textOf(n).slice(0, 300));
    else if (tag === 'h2' && h2.length < 50) h2.push(textOf(n).slice(0, 200));
    else if (tag === 'h3' && h3.length < 50) h3.push(textOf(n).slice(0, 200));
    else if (tag === 'a') {
      const href = attr(n, 'href');
      const u = href ? normalizeUrl(href, pageUrl) : null;
      if (u && links.length < 2000) {
        const rel = (attr(n, 'rel') ?? '').toLowerCase();
        links.push({ url: u, anchor: textOf(n).slice(0, 200), nofollow: /\bnofollow\b/.test(rel), internal: sameSite(u, pageUrl) });
      }
    } else if (tag === 'img') {
      if (attr(n, 'alt') === null) imagesWithoutAlt++;
    } else if (tag === 'script') {
      scripts++;
      const src = attr(n, 'src');
      if (src && resources.length < 40) {
        const r = normalizeUrl(src, pageUrl);
        if (r) resources.push(r);
      }
      if ((attr(n, 'type') ?? '').toLowerCase().includes('ld+json')) {
        const raw = textOf(n, new Set());
        try {
          jsonld.push(JSON.parse((n.childNodes ?? []).map((c) => c.value ?? '').join('')));
        } catch {
          if (raw) jsonldErrors++;
        }
      }
      return false;
    }
  });

  const text = body ? textOf(body) : '';
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const schemaTypes = [...new Set(jsonld.flatMap(schemaTypesOf))];
  return {
    title,
    metaDescription,
    h1: h1.filter(Boolean),
    headings: { h2: h2.filter(Boolean), h3: h3.filter(Boolean) },
    canonical,
    robotsMeta,
    lang,
    hreflang,
    wordCount: words,
    contentHash: sha1(text.toLowerCase()),
    simhash: simhash(text),
    links,
    jsonld,
    jsonldErrors,
    schemaTypes,
    imagesWithoutAlt,
    maybeJsRendered: words < 50 && scripts >= 5,
    resources: [...new Set(resources)]
  };
}

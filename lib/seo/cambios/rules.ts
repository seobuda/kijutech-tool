// SEO · Registro de cambios y páginas de dinero (parte 6, tanda 6b, 27 nov 2026; docs/DISENO-SEO-TECNICO-2BC.md con dos
// auditorías Opus). Reglas PURAS: comparar dos rastreos, hacer la foto de una página y decidir sus condiciones frente a la
// foto de referencia (baseline). Sin red ni base de datos.
import { hamming, sha1 } from '@/lib/core/crawl-extract';
import type { MoneySnap } from '@/lib/db/schema';
import { jsonldNodes, isOrgNode } from '@/lib/seo/salud/audit-rules';

export const DINERO_SOURCE = 'seo.vigilancia:dinero';
export const DINERO_KINDS = ['seo.money_page_changed', 'seo.money_pages_unreadable'];
export const MAX_ROWS = 500;
const CLIP = 500;
const clip = (s: string | null | undefined) => (s == null ? null : s.slice(0, CLIP));

export type ChangeRow = { url: string; urlHash: string; field: string; before: string | null; after: string | null; extra?: Record<string, unknown> };

/** Página de un rastreo, lo que hace falta para comparar. */
export type DiffPage = {
  url: string;
  statusCode: number | null;
  contentType: string | null;
  title: string | null;
  metaDescription: string | null;
  h1: string[] | null;
  canonical: string | null;
  robotsMeta: string | null;
  xRobots: string | null;
  wordCount: number | null;
  simhash: string | null;
  jsonld: unknown;
  schemaTypes: string[] | null;
};

const noindex = (p: { robotsMeta: string | null; xRobots: string | null }) => /noindex|none/i.test(`${p.robotsMeta ?? ''} ${p.xRobots ?? ''}`);
/** Ruta comparable (minúsculas, sin barra final) y si la URL lleva parámetros. */
export function pathKey(u: string): { host: string; path: string; hasQuery: boolean } {
  try {
    const x = new URL(u);
    return { host: x.hostname.toLowerCase().replace(/^www\./, ''), path: (x.pathname.replace(/\/+$/, '') || '/').toLowerCase(), hasQuery: Boolean(x.search) };
  } catch {
    return { host: '', path: u.toLowerCase(), hasQuery: false };
  }
}
const okStatus = (p: DiffPage) => p.statusCode != null && p.statusCode >= 200 && p.statusCode < 400;
/** Sin respuesta o bloqueada (no dice nada de la página: no se compara). */
const blocked = (p: DiffPage) => p.statusCode == null || p.statusCode === 0 || [401, 403, 429].includes(p.statusCode) || p.statusCode >= 500;
const indexableOf = (p: DiffPage) => p.statusCode != null && p.statusCode >= 200 && p.statusCode < 300 && /html/i.test(p.contentType ?? '') && !noindex(p);
const canonPath = (c: string | null, host: string) => {
  if (!c) return null;
  const k = pathKey(c);
  return k.host === host ? k.path : c;
};
/** El negocio en el schema: tipos y nombre/teléfono/dirección normalizados (no todo el JSON-LD: Yoast cambia fechas). */
export function schemaKey(p: Pick<DiffPage, 'jsonld' | 'schemaTypes'>, typesOnly: boolean): string {
  const types = [...(p.schemaTypes ?? [])].sort().join(',');
  if (typesOnly) return types;
  const org = jsonldNodes(p.jsonld).find(isOrgNode);
  if (!org) return types;
  const addr = org.address && typeof org.address === 'object' ? JSON.stringify(org.address) : String(org.address ?? '');
  return `${types}|${String(org.name ?? '')}|${String(org.telephone ?? '').replace(/\D/g, '')}|${addr.replace(/\s+/g, ' ').toLowerCase()}`;
}

/**
 * Cambios entre el rastreo anterior y el actual. Páginas emparejadas por ruta (sirve también si cambió el host). Con más
 * del 20 % de páginas bloqueadas en cualquiera de los dos, no se compara nada (sería ruido). Un mismo campo que cambia en
 * 20+ páginas y en el 50 %+ de las comunes es un cambio de plantilla: una fila «*» con las URLs en extra, más las filas por
 * URL de las páginas «importantes» (vigiladas o con encargo). Como mucho MAX_ROWS filas, primero las de más clics.
 */
export function diffCrawls(
  prev: DiffPage[],
  cur: DiffPage[],
  opts: { prevTruncated: boolean; curTruncated: boolean; important?: Set<string>; clicks?: Map<string, number> } = { prevTruncated: false, curTruncated: false }
): ChangeRow[] {
  if (!prev.length || !cur.length) return [];
  const share = (ps: DiffPage[]) => ps.filter(blocked).length / ps.length;
  if (share(prev) > 0.2 || share(cur) > 0.2) return [];
  const prevHosts = new Set(prev.map((p) => pathKey(p.url).host));
  const curHosts = new Set(cur.map((p) => pathKey(p.url).host));
  const host = [...curHosts][0] ?? '';
  const prevByPath = new Map(prev.map((p) => [pathKey(p.url).path + (pathKey(p.url).hasQuery ? `?${p.url.split('?')[1]}` : ''), p]));
  const curByPath = new Map(cur.map((p) => [pathKey(p.url).path + (pathKey(p.url).hasQuery ? `?${p.url.split('?')[1]}` : ''), p]));
  const rows: ChangeRow[] = [];
  const hostChanged = ![...curHosts].some((h) => prevHosts.has(h));
  const common = [...curByPath.keys()].filter((k) => prevByPath.has(k));
  // Web distinta (casi nada en común): una sola fila, sin listar altas y bajas.
  if (hostChanged && common.length < Math.min(prevByPath.size, curByPath.size) * 0.3) {
    return [{ url: '*', urlHash: sha1('*host'), field: 'host', before: [...prevHosts].join(', ').slice(0, CLIP), after: [...curHosts].join(', ').slice(0, CLIP) }];
  }
  if (hostChanged) rows.push({ url: '*', urlHash: sha1('*host'), field: 'host', before: [...prevHosts].join(', ').slice(0, CLIP), after: [...curHosts].join(', ').slice(0, CLIP) });

  const perField = new Map<string, ChangeRow[]>();
  const add = (r: ChangeRow) => perField.set(r.field, [...(perField.get(r.field) ?? []), r]);
  for (const k of common) {
    const a = prevByPath.get(k)!;
    const b = curByPath.get(k)!;
    if (blocked(a) || blocked(b)) continue;
    const base = { url: b.url, urlHash: sha1(b.url) };
    if ((a.statusCode ?? 0) !== (b.statusCode ?? 0)) add({ ...base, field: 'status', before: String(a.statusCode), after: String(b.statusCode) });
    if (indexableOf(a) !== indexableOf(b) && okStatus(a) && okStatus(b)) add({ ...base, field: 'indexable', before: indexableOf(a) ? 'sí' : 'no', after: indexableOf(b) ? 'sí' : 'no' });
    if (!(/html/i.test(a.contentType ?? '') && /html/i.test(b.contentType ?? ''))) continue;
    const t = (s: string | null) => (s ?? '').trim();
    if (t(a.title) !== t(b.title)) add({ ...base, field: 'title', before: clip(a.title), after: clip(b.title) });
    if (t(a.metaDescription) !== t(b.metaDescription)) add({ ...base, field: 'meta_description', before: clip(a.metaDescription), after: clip(b.metaDescription) });
    if (t(a.h1?.[0] ?? null) !== t(b.h1?.[0] ?? null)) add({ ...base, field: 'h1', before: clip(a.h1?.[0]), after: clip(b.h1?.[0]) });
    const ca = canonPath(a.canonical, pathKey(a.url).host);
    const cb = canonPath(b.canonical, pathKey(b.url).host);
    if ((ca ?? '') !== (cb ?? '')) add({ ...base, field: 'canonical', before: clip(ca), after: clip(cb) });
    const wa = a.wordCount ?? 0;
    const wb = b.wordCount ?? 0;
    if (Math.max(wa, wb) >= 150 && a.simhash && b.simhash && hamming(a.simhash, b.simhash) >= 10 && Math.abs(wb - wa) / Math.max(wa, 1) >= 0.3) add({ ...base, field: 'content', before: `${wa} palabras`, after: `${wb} palabras` });
    // Si falta el JSON-LD (no se guarda > 200 KB) en un lado, solo los tipos.
    const typesOnly = a.jsonld == null || b.jsonld == null;
    if (schemaKey(a, typesOnly) !== schemaKey(b, typesOnly)) add({ ...base, field: 'schema', before: clip(schemaKey(a, typesOnly)), after: clip(schemaKey(b, typesOnly)) });
  }
  const important = opts.important ?? new Set<string>();
  for (const [field, list] of perField) {
    if (list.length >= 20 && list.length >= common.length * 0.5) {
      const ex = list[0];
      rows.push({ url: '*', urlHash: sha1(`*${field}`), field, before: ex.before, after: ex.after, extra: { pages: list.length, example: ex.url, urls: list.slice(0, MAX_ROWS).map((r) => r.url) } });
      rows.push(...list.filter((r) => important.has(r.url)));
    } else rows.push(...list);
  }
  // Altas y bajas: sin parámetros, con los dos rastreos completos; «baja» solo de páginas que antes eran indexables.
  if (!opts.prevTruncated && !opts.curTruncated) {
    for (const [k, b] of curByPath) if (!prevByPath.has(k) && !pathKey(b.url).hasQuery && indexableOf(b)) rows.push({ url: b.url, urlHash: sha1(b.url), field: 'url_new', before: null, after: clip(b.title) });
    for (const [k, a] of prevByPath) if (!curByPath.has(k) && !pathKey(a.url).hasQuery && indexableOf(a)) rows.push({ url: a.url, urlHash: sha1(a.url), field: 'url_gone', before: clip(a.title), after: 'ya no aparece en el rastreo' });
  }
  const clicks = opts.clicks ?? new Map<string, number>();
  const weight = (r: ChangeRow) => (r.url === '*' ? 1e9 : (important.has(r.url) ? 1e6 : 0) + (clicks.get(r.url) ?? 0));
  return rows.sort((x, y) => weight(y) - weight(x)).slice(0, MAX_ROWS);
}

// --- Páginas de dinero ---------------------------------------------------------------------------------------------

export type Extracted = { title: string | null; h1: string[]; canonical: string | null; robotsMeta: string | null; wordCount: number; simhash: string };
/** Foto estructurada. status 0 = no se pudo leer. */
export function snapOf(status: number, xRobots: string | null, page: Extracted | null, at: Date): MoneySnap {
  return {
    status,
    title: page?.title?.trim() || null,
    h1: page?.h1?.[0]?.trim() || null,
    canonical: page?.canonical ?? null,
    indexable: Boolean(page) && status >= 200 && status < 300 && !/noindex|none/i.test(`${page?.robotsMeta ?? ''} ${xRobots ?? ''}`),
    words: page?.wordCount ?? 0,
    simhash: page?.simhash ?? null,
    at: at.toISOString()
  };
}

/** No concluyente: error de red, bloqueo o error del servidor puntual. Suma fallos, no decide. */
export const inconclusive = (s: MoneySnap) => s.status === 0 || [401, 403, 429].includes(s.status) || s.status >= 500;

export type MoneyCondition = 'estado' | 'redireccion' | 'noindex' | 'canonical' | 'titulo' | 'h1' | 'contenido';
export const MONEY_SEVERITY: Record<MoneyCondition, 'critico' | 'importante'> = { estado: 'critico', redireccion: 'importante', noindex: 'critico', canonical: 'importante', titulo: 'importante', h1: 'importante', contenido: 'importante' };
export const MONEY_LABEL: Record<MoneyCondition, string> = {
  estado: 'ha dejado de responder bien',
  redireccion: 'ahora redirige a otra dirección',
  noindex: 'ahora tiene noindex (Google la quitará)',
  canonical: 'su canonical apunta ahora a otra URL',
  titulo: 'se ha quedado sin título',
  h1: 'se ha quedado sin H1',
  contenido: 'ha perdido más de la mitad del texto'
};

/**
 * Condición grave frente a la referencia: todas relativas («antes bien, ahora no»), así una página que ya era así (y se
 * aceptó) no avisa en bucle. La portada no avisa de estado ni de noindex (lo cubre la vigilancia horaria).
 */
export function moneyCondition(baseline: MoneySnap, now: MoneySnap, isHome: boolean, sameUrlFn: (a: string, b: string) => boolean, url: string): MoneyCondition | null {
  if (inconclusive(now)) return null;
  const okBase = baseline.status >= 200 && baseline.status < 300;
  // Una redirección (no se siguen) es «importante», no crítica: puede ser a propósito (barra final, URL nueva).
  if (okBase && now.status >= 300 && now.status < 400) return isHome ? null : 'redireccion';
  if (okBase && !(now.status >= 200 && now.status < 300)) return isHome ? null : 'estado';
  if (!(now.status >= 200 && now.status < 300)) return null;
  if (baseline.indexable && !now.indexable) return isHome ? null : 'noindex';
  const selfCanon = (c: string | null) => !c || sameUrlFn(c, url);
  if (selfCanon(baseline.canonical) && !selfCanon(now.canonical)) return 'canonical';
  if (baseline.title && !now.title) return 'titulo';
  if (baseline.h1 && !now.h1) return 'h1';
  if (baseline.words >= 150 && now.words < baseline.words * 0.5) return 'contenido';
  return null;
}

/** ¿Puede la referencia avanzar a esta foto? Solo si está sana y el texto no ha cambiado mucho (sin erosión lenta). */
export function canAdvanceBaseline(baseline: MoneySnap, now: MoneySnap): boolean {
  if (inconclusive(now)) return false;
  return Math.abs(now.words - baseline.words) <= Math.max(baseline.words * 0.2, 20);
}

/** Cambios de una foto a otra (para el registro). El contenido se compara con la última versión estable. */
export function snapDiffs(prev: MoneySnap, now: MoneySnap, stable: MoneySnap | null): { field: string; before: string | null; after: string | null }[] {
  if (inconclusive(now) || inconclusive(prev)) return [];
  const out: { field: string; before: string | null; after: string | null }[] = [];
  if (prev.status !== now.status) out.push({ field: 'status', before: String(prev.status), after: String(now.status) });
  if (prev.indexable !== now.indexable) out.push({ field: 'indexable', before: prev.indexable ? 'sí' : 'no', after: now.indexable ? 'sí' : 'no' });
  if ((prev.title ?? '') !== (now.title ?? '')) out.push({ field: 'title', before: clip(prev.title), after: clip(now.title) });
  if ((prev.h1 ?? '') !== (now.h1 ?? '')) out.push({ field: 'h1', before: clip(prev.h1), after: clip(now.h1) });
  if ((prev.canonical ?? '') !== (now.canonical ?? '')) out.push({ field: 'canonical', before: clip(prev.canonical), after: clip(now.canonical) });
  const ref = stable ?? prev;
  // El texto cuenta si ya estaba así en la pasada anterior (persiste) y difiere de la versión estable.
  if (prev.simhash && now.simhash && ref.simhash && hamming(prev.simhash, now.simhash) <= 3 && Math.max(ref.words, now.words) >= 150 && hamming(ref.simhash, now.simhash) >= 10 && Math.abs(now.words - ref.words) / Math.max(ref.words, 1) >= 0.3) {
    out.push({ field: 'content', before: `${ref.words} palabras`, after: `${now.words} palabras` });
  }
  return out;
}

export type MoneyReason = 'home' | 'top' | 'pinned' | 'encargo';
export const REASON_LABEL: Record<MoneyReason, string> = { home: 'Portada', top: 'Más clics', pinned: 'Fijada', encargo: 'Encargo en curso' };

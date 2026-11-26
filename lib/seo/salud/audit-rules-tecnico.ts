// SEO · Salud técnica, parte 1 (técnico completo, 26 nov 2026; docs/DISENO-SEO-PARTE1.md). Reglas PURAS que se suman
// a audit-rules.ts: bucles de redirección, anchors del enlazado interno, hreflang y lang. Sin base de datos ni red.
import { sha1 } from '@/lib/core/crawl-extract';
import type { FindingInput } from '@/lib/core/findings-rules';
import { isIndexable, sameUrl, type AuditPage } from '@/lib/seo/salud/audit-rules';

export type TecnicoPage = AuditPage & { lang?: string | null; hreflang?: { lang: string; url: string }[] | null };
/** Enlaces internos agrupados por destino y texto (n = cuántos enlaces iguales). */
export type TecnicoLink = { toHash: string; anchor: string | null; n: number };

const short = (u: string) => sha1(u).slice(0, 16);
const mk = (kind: string, key: string, f: Omit<FindingInput, 'kind' | 'dedupeKey'> = {}): FindingInput => ({ kind, dedupeKey: `${kind}:${key}`.slice(0, 300), ...f });

function finder(pages: TecnicoPage[]) {
  const byUrl = new Map(pages.map((p) => [p.url, p]));
  return (u: string) => byUrl.get(u) ?? pages.find((p) => sameUrl(p.url, u));
}

/** Redirecciones que acaban volviendo a una URL ya vista (bucle): ni el visitante ni Google llegan a ninguna página. */
export function redirectLoops(pages: TecnicoPage[]): FindingInput[] {
  const find = finder(pages);
  const out: FindingInput[] = [];
  const reported = new Set<string>();
  for (const start of pages) {
    if (!start.redirectTo || !start.statusCode || start.statusCode < 300 || start.statusCode >= 400) continue;
    const chain = [start.url];
    let cur: TecnicoPage | undefined = start;
    while (cur?.redirectTo && chain.length <= 10) {
      const next = find(cur.redirectTo);
      if (!next) break;
      if (chain.some((u) => sameUrl(u, next.url))) {
        const loop = [...chain, next.url];
        // Un solo hallazgo por bucle (el mismo ciclo se ve desde cada una de sus URLs).
        const id = [...new Set(loop.map((u) => short(u)))].sort().join('|');
        if (!reported.has(id)) {
          reported.add(id);
          out.push(mk('seo.redirect_loop', short(id), { url: start.url, metric: 'saltos', value: chain.length, evidence: { chain: loop.slice(0, 11) } }));
        }
        break;
      }
      if (!next.statusCode || next.statusCode < 300 || next.statusCode >= 400) break;
      chain.push(next.url);
      cur = next;
    }
  }
  return out;
}

/** Textos de enlace que no dicen nada de la página de destino (español, catalán e inglés). */
const GENERIC = new Set(
  [
    'aquí', 'aqui', 'clic aquí', 'click aquí', 'haz clic aquí', 'pincha aquí', 'pulsa aquí', 'leer más', 'leer mas', 'ver más', 'ver mas', 'más información',
    'mas informacion', 'más info', '+ info', '+info', 'info', 'saber más', 'saber mas', 'ver', 'enlace', 'link', 'más', 'mas', 'continuar', 'continuar leyendo',
    'descubre más', 'descubrir', 'ver detalles', 'detalles', 'acceder', 'entrar', 'ir', 'siguiente', 'anterior',
    'més informació', 'mes informacio', 'llegir més', 'llegir mes', 'veure més', 'veure mes', 'aquí mateix', 'clica aquí', 'saber-ne més',
    'read more', 'click here', 'here', 'more', 'learn more', 'more info', 'see more', 'details'
  ].map((x) => x.normalize('NFC'))
);
export const isGenericAnchor = (a: string | null): boolean => {
  const t = (a ?? '').normalize('NFC').toLowerCase().replace(/[»›→>.…:!¡]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t === '' || GENERIC.has(t);
};

/**
 * Páginas importantes (indexables, con 3 o más enlaces internos) a las que casi siempre se enlaza con un texto genérico
 * («leer más», «aquí») o vacío: Google usa el texto del enlace para entender de qué trata la página de destino.
 */
export function genericAnchors(pages: TecnicoPage[], links: TecnicoLink[], max = 30): FindingInput[] {
  const byHash = new Map(pages.map((p) => [p.urlHash, p]));
  const stats = new Map<string, { total: number; generic: number; samples: Set<string> }>();
  for (const l of links) {
    const s = stats.get(l.toHash) ?? { total: 0, generic: 0, samples: new Set<string>() };
    s.total += l.n;
    if (isGenericAnchor(l.anchor)) {
      s.generic += l.n;
      if (s.samples.size < 5) s.samples.add((l.anchor ?? '').trim() || '(sin texto)');
    }
    stats.set(l.toHash, s);
  }
  const out: (FindingInput & { n: number })[] = [];
  for (const [hash, s] of stats) {
    const p = byHash.get(hash);
    if (!p || !isIndexable(p) || s.total < 3 || s.generic / s.total < 0.8) continue;
    out.push({ ...mk('seo.anchor_generic', short(p.url), { url: p.url, metric: 'enlaces_genericos_pct', value: Math.round((s.generic / s.total) * 100), evidence: { total: s.total, generic: s.generic, samples: [...s.samples] } }), n: s.total });
  }
  return out
    .sort((a, b) => b.n - a.n)
    .slice(0, max)
    .map(({ n: _n, ...f }) => f);
}

const HREFLANG_RE = /^(x-default|[a-z]{2,3}(-([a-z]{2}|[a-z]{4}|\d{3}))?)$/i;

/**
 * hreflang: códigos no válidos, versiones que no responden 200 o no son indexables, y versiones que no enlazan de
 * vuelta (Google ignora el par si no es recíproco). Solo se juzga la vuelta si la otra versión está en el rastreo.
 */
export function hreflangIssues(pages: TecnicoPage[]): FindingInput[] {
  const find = finder(pages);
  const out: FindingInput[] = [];
  for (const p of pages) {
    const alts = p.hreflang ?? [];
    if (!alts.length || !isIndexable(p)) continue;
    const bad = alts.filter((a) => !HREFLANG_RE.test(a.lang)).map((a) => a.lang);
    if (bad.length) out.push(mk('seo.hreflang_invalid', short(p.url), { url: p.url, evidence: { codes: [...new Set(bad)].slice(0, 10) } }));
    const notBack: string[] = [];
    const broken: string[] = [];
    for (const a of alts) {
      if (sameUrl(a.url, p.url)) continue;
      const other = find(a.url);
      if (!other) continue;
      if (!isIndexable(other)) {
        broken.push(a.url);
        continue;
      }
      if (!(other.hreflang ?? []).some((b) => sameUrl(b.url, p.url))) notBack.push(a.url);
    }
    if (notBack.length) out.push(mk('seo.hreflang_not_reciprocal', short(p.url), { url: p.url, metric: 'versiones', value: notBack.length, evidence: { alternates: notBack.slice(0, 10) } }));
    if (broken.length) out.push(mk('seo.hreflang_broken', short(p.url), { url: p.url, metric: 'versiones', value: broken.length, evidence: { alternates: broken.slice(0, 10) } }));
  }
  return out;
}

/** Páginas indexables sin idioma declarado (<html lang>): un solo hallazgo para la web, con el recuento. */
export function langMissing(rootUrl: string, pages: TecnicoPage[]): FindingInput[] {
  const missing = pages.filter((p) => isIndexable(p) && !(p.lang ?? '').trim());
  if (!missing.length) return [];
  return [mk('seo.lang_missing', short(rootUrl), { url: missing[0].url, metric: 'paginas', value: missing.length, evidence: { samples: missing.slice(0, 10).map((p) => p.url) } })];
}

export type PrevPage = Pick<AuditPage, 'url' | 'statusCode' | 'contentType' | 'robotsMeta' | 'xRobots' | 'canonical'>;

/**
 * Regresiones (auditoría de la parte 1): páginas que en el rastreo anterior eran indexables y en este, al volver a
 * pedirlas, dan error o tienen noindex. Es un ESTADO, no un evento: solo se juzgan las páginas que este rastreo ha vuelto
 * a pedir (una página que no aparece no se da por desaparecida), y el hallazgo sigue abierto mientras la página siga
 * mal y se resuelve solo cuando se arregla. Si el rastreo actual tiene muchos fallos de conexión, no se juzga nada.
 */
export function pageRegressions(current: TecnicoPage[], previous: PrevPage[]): FindingInput[] {
  if (!previous.length || !current.length) return [];
  const fetchErrors = current.filter((p) => !p.statusCode).length;
  if (fetchErrors / current.length > 0.2) return [];
  const prevByUrl = new Map(previous.map((p) => [p.url, p]));
  const out: FindingInput[] = [];
  for (const p of current) {
    if (!p.statusCode) continue;
    const before = prevByUrl.get(p.url) ?? previous.find((x) => sameUrl(x.url, p.url));
    if (!before || !isIndexable(before as AuditPage)) continue;
    const nowNoindex = /noindex|none/i.test(`${p.robotsMeta ?? ''} ${p.xRobots ?? ''}`);
    const now = p.statusCode >= 400 ? `error ${p.statusCode}` : nowNoindex && p.statusCode < 300 ? 'noindex' : null;
    if (!now) continue;
    out.push(mk('seo.page_regressed', short(p.url), { url: p.url, metric: 'status', value: p.statusCode, evidence: { before: `${before.statusCode} indexable`, now } }));
  }
  return out;
}

// SEO · Salud técnica: reglas de auditoría sobre el rastreo (Hito 1, 23 nov 2026; docs/DISENO-MODULO-SEO.md §5 fase 1).
// PURAS: reciben las páginas rastreadas (crawl_pages), los enlaces que recibe cada una y, si hay, las páginas con
// impresiones en Search Console, y devuelven hallazgos tipados (núcleo: findings). Sin IA y sin base de datos, así se
// prueban con casos fijos. Cada tipo lleva su versión de regla: si cambia el criterio, se sube la versión y queda
// constancia en cada hallazgo (findings.rule_version).
import { hamming, sha1 } from '@/lib/core/crawl-extract';
import type { FindingInput } from '@/lib/core/findings-rules';


export type AuditPage = {
  url: string;
  urlHash: string;
  statusCode: number | null;
  redirectTo: string | null;
  contentType: string | null;
  title: string | null;
  metaDescription: string | null;
  h1: string[] | null;
  canonical: string | null;
  robotsMeta: string | null;
  xRobots: string | null;
  wordCount: number | null;
  contentHash: string | null;
  simhash: string | null;
  depth: number | null;
  inSitemap: boolean;
  jsonld: unknown;
  schemaTypes: string[] | null;
  imagesWithoutAlt: number | null;
  error: string | null;
  /** Lo que tardó la respuesta (ms), medido desde nuestro servidor. */
  fetchMs?: number | null;
};

export type AuditInput = {
  rootUrl: string;
  pages: AuditPage[];
  /** Enlaces internos que recibe cada página (por url_hash). */
  inlinks: Map<string, number>;
  /** ¿El rastreo se cortó por el tope de páginas? Rebaja los hallazgos que dependen de haberlo visto todo. */
  truncated: boolean;
  /** Páginas con impresiones en Search Console (últimos 90 días), si el proyecto tiene la propiedad. */
  gscPages?: { url: string; impressions: number; clicks: number }[];
};

const isHtml = (p: AuditPage) => /html/i.test(p.contentType ?? '');
const ok = (p: AuditPage) => p.statusCode != null && p.statusCode >= 200 && p.statusCode < 300;
const noindex = (p: AuditPage) => /noindex|none/i.test(`${p.robotsMeta ?? ''} ${p.xRobots ?? ''}`);
const short = (u: string) => sha1(u).slice(0, 16);

/** Misma URL a efectos de canonical: sin «/» final, sin fragmento, host sin mayúsculas. */
export function sameUrl(a: string, b: string): boolean {
  const norm = (u: string) => {
    try {
      const x = new URL(u);
      x.hash = '';
      return `${x.protocol}//${x.host.toLowerCase()}${x.pathname.replace(/\/+$/, '') || '/'}${x.search}`;
    } catch {
      return u.trim().replace(/\/+$/, '');
    }
  };
  return norm(a) === norm(b);
}

/** Página que Google debería indexar: HTML, 200, sin noindex y con canonical propio (o sin canonical). */
export function isIndexable(p: AuditPage): boolean {
  return isHtml(p) && ok(p) && !noindex(p) && (!p.canonical || sameUrl(p.canonical, p.url));
}

const ORG_TYPES = /^(Organization|Corporation|LocalBusiness|ProfessionalService|Store|Restaurant|Dentist|MedicalBusiness|MedicalClinic|LegalService|Attorney|HomeAndConstructionBusiness|AutomotiveBusiness|HealthAndBeautyBusiness|SportsActivityLocation|FinancialService|RealEstateAgent|LodgingBusiness|FoodEstablishment|EducationalOrganization|.*Business|.*Store|.*Service)$/;

/** Nodos JSON-LD aplanados (raíz, @graph y listas). */
export function jsonldNodes(jsonld: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const visit = (x: unknown, depth: number) => {
    if (depth > 4 || x == null) return;
    if (Array.isArray(x)) return x.forEach((y) => visit(y, depth + 1));
    if (typeof x !== 'object') return;
    const o = x as Record<string, unknown>;
    if (o['@type']) out.push(o);
    if (o['@graph']) visit(o['@graph'], depth + 1);
  };
  visit(jsonld, 0);
  return out;
}
const typesOf = (n: Record<string, unknown>): string[] => (Array.isArray(n['@type']) ? (n['@type'] as unknown[]).map(String) : [String(n['@type'])]);
export const isOrgNode = (n: Record<string, unknown>) => typesOf(n).some((t) => ORG_TYPES.test(t));

/** Las reglas. Devuelve los hallazgos de esta auditoría (cada uno con su clave estable entre ejecuciones). */
export function auditCrawl(input: AuditInput): FindingInput[] {
  const out: FindingInput[] = [];
  const add = (kind: string, key: string, f: Omit<FindingInput, 'kind' | 'dedupeKey'> = {}) => out.push({ kind, dedupeKey: `${kind}:${key}`.slice(0, 300), ...f });
  const byUrl = new Map(input.pages.map((p) => [p.url, p]));
  const findPage = (u: string) => byUrl.get(u) ?? input.pages.find((p) => sameUrl(p.url, u));
  const rootHost = (() => {
    try {
      return new URL(input.rootUrl).origin;
    } catch {
      return input.rootUrl;
    }
  })();

  for (const p of input.pages) {
    const inl = input.inlinks.get(p.urlHash) ?? 0;
    const k = short(p.url);
    if (p.statusCode == null || p.statusCode === 0) {
      if (p.error && !/pintada con JavaScript/.test(p.error)) add('seo.fetch_error', k, { url: p.url, evidence: { error: p.error.slice(0, 200) } });
      continue;
    }
    if (p.statusCode >= 500) add('seo.http_5xx', k, { url: p.url, metric: 'status', value: p.statusCode, evidence: { inlinks: inl } });
    else if (p.statusCode >= 400 && (inl > 0 || p.inSitemap)) add('seo.http_4xx', k, { url: p.url, metric: 'enlaces_internos', value: inl, evidence: { status: p.statusCode, inSitemap: p.inSitemap } });
    if (p.statusCode >= 300 && p.statusCode < 400) {
      if (p.redirectTo) {
        const next = findPage(p.redirectTo);
        if (next && next.statusCode != null && next.statusCode >= 300 && next.statusCode < 400) add('seo.redirect_chain', k, { url: p.url, evidence: { to: p.redirectTo, then: next.redirectTo } });
      }
      if (inl > 0) add('seo.link_to_redirect', k, { url: p.url, metric: 'enlaces_internos', value: inl, evidence: { to: p.redirectTo } });
    }
    if (p.inSitemap && !ok(p)) add('seo.non200_in_sitemap', k, { url: p.url, evidence: { status: p.statusCode, to: p.redirectTo } });
    if (!isHtml(p) || !ok(p)) continue;

    if (p.url.startsWith('http://')) add('seo.not_https', k, { url: p.url });
    if (p.error && /pintada con JavaScript/.test(p.error)) add('seo.js_rendered', k, { url: p.url, metric: 'palabras', value: p.wordCount ?? 0 });
    if (noindex(p)) {
      if (p.inSitemap) add('seo.noindex_in_sitemap', k, { url: p.url, evidence: { robots: p.robotsMeta ?? p.xRobots } });
      continue;
    }
    if (p.canonical && !sameUrl(p.canonical, p.url)) {
      const target = findPage(p.canonical);
      if (target && !ok(target)) add('seo.canonical_broken', k, { url: p.url, evidence: { canonical: p.canonical, status: target.statusCode } });
      else add('seo.canonical_other', k, { url: p.url, evidence: { canonical: p.canonical } });
      continue; // una variante: sus títulos y textos no cuentan como problemas propios
    }
    // A partir de aquí, solo páginas indexables.
    if (!p.title?.trim()) add('seo.title_missing', k, { url: p.url });
    else if (p.title.trim().length > 65) add('seo.title_long', k, { url: p.url, metric: 'caracteres', value: p.title.trim().length, evidence: { title: p.title.slice(0, 200) } });
    if (!p.metaDescription?.trim()) add('seo.meta_description_missing', k, { url: p.url });
    const h1 = (p.h1 ?? []).filter((h) => h.trim());
    if (!h1.length) add('seo.h1_missing', k, { url: p.url });
    else if (h1.length > 1) add('seo.h1_multiple', k, { url: p.url, metric: 'h1', value: h1.length, evidence: { h1: h1.slice(0, 5) } });
    if ((p.wordCount ?? 0) < 200 && !(p.error && /JavaScript/.test(p.error))) add('seo.thin_content', k, { url: p.url, metric: 'palabras', value: p.wordCount ?? 0 });
    if ((p.imagesWithoutAlt ?? 0) > 0) add('seo.images_without_alt', k, { url: p.url, metric: 'imagenes', value: p.imagesWithoutAlt });
    const isHome = sameUrl(p.url, input.rootUrl) || sameUrl(p.url, `${rootHost}/`);
    if (!isHome && p.inSitemap && inl === 0 && !input.truncated) add('seo.orphan_in_sitemap', k, { url: p.url });
    if ((p.depth ?? 0) > 4) add('seo.deep_page', k, { url: p.url, metric: 'clics', value: p.depth });
    // Datos estructurados de la página.
    const nodes = jsonldNodes(p.jsonld);
    if (nodes.some((n) => typesOf(n).includes('FAQPage'))) add('seo.schema_faq', k, { url: p.url });
    const selfReviews = nodes.filter((n) => isOrgNode(n) && (n.aggregateRating || n.review));
    if (selfReviews.length) add('seo.schema_self_reviews', k, { url: p.url });
  }

  const indexable = input.pages.filter(isIndexable);

  // Repetidos entre páginas indexables: un hallazgo por grupo, con la clave del texto repetido.
  const groupBy = (key: (p: AuditPage) => string | null) => {
    const m = new Map<string, AuditPage[]>();
    for (const p of indexable) {
      const v = key(p);
      if (!v) continue;
      m.set(v, [...(m.get(v) ?? []), p]);
    }
    return [...m.entries()].filter(([, ps]) => ps.length > 1);
  };
  for (const [title, ps] of groupBy((p) => p.title?.trim().toLowerCase() || null)) {
    add('seo.title_duplicate', short(title), { url: ps[0].url, metric: 'paginas', value: ps.length, evidence: { title: ps[0].title?.slice(0, 200), urls: ps.slice(0, 20).map((p) => p.url) } });
  }
  for (const [d, ps] of groupBy((p) => p.metaDescription?.trim().toLowerCase() || null)) {
    add('seo.meta_description_duplicate', short(d), { url: ps[0].url, metric: 'paginas', value: ps.length, evidence: { urls: ps.slice(0, 20).map((p) => p.url) } });
  }
  const exactDupHashes = new Set<string>();
  for (const [h, ps] of groupBy((p) => ((p.wordCount ?? 0) >= 50 ? p.contentHash : null))) {
    exactDupHashes.add(h);
    add('seo.duplicate_content', h.slice(0, 16), { url: ps[0].url, metric: 'paginas', value: ps.length, evidence: { urls: ps.slice(0, 20).map((p) => p.url) } });
  }
  // Casi duplicados: simhash a ≤ 3 bits, entre páginas con texto suficiente y no idénticas. O(n²) acotado a 1.500 páginas.
  const sims = indexable.filter((p) => p.simhash && (p.wordCount ?? 0) >= 150 && !exactDupHashes.has(p.contentHash ?? '')).slice(0, 1500);
  const pairSeen = new Set<string>();
  for (let i = 0; i < sims.length; i++) {
    for (let j = i + 1; j < sims.length; j++) {
      if (hamming(sims[i].simhash!, sims[j].simhash!) > 3) continue;
      const [a, b] = [sims[i].url, sims[j].url].sort();
      const key = `${short(a)}-${short(b)}`;
      if (pairSeen.has(key)) continue;
      pairSeen.add(key);
      add('seo.near_duplicate', key, { url: a, evidence: { other: b } });
    }
  }

  // Nivel web.
  const htmlOk = input.pages.filter((p) => isHtml(p) && ok(p));
  if (htmlOk.length && !input.pages.some((p) => p.inSitemap)) add('seo.sitemap_missing', 'web');
  // Servidor lento: mediana del tiempo de respuesta de las páginas HTML (≥ 5 páginas). ≥ 2,5 s aviso; ≥ 5 s importante.
  const times = htmlOk.map((p) => p.fetchMs ?? 0).filter((ms) => ms > 0).sort((a, b) => a - b);
  if (times.length >= 5) {
    const median = times[Math.floor(times.length / 2)];
    if (median >= 2500) add('seo.slow_server', 'web', { url: input.rootUrl, metric: 'ms_mediana', value: median, severity: median >= 5000 ? 'importante' : undefined, evidence: { pages: times.length, p90: times[Math.floor(times.length * 0.9)] } });
  }
  const allNodes = htmlOk.flatMap((p) => jsonldNodes(p.jsonld).map((n) => ({ n, url: p.url })));
  const orgs = allNodes.filter((x) => isOrgNode(x.n));
  if (htmlOk.length && !orgs.length) add('seo.schema_org_missing', 'web', { url: input.rootUrl });
  for (const { n, url } of orgs.slice(0, 20)) {
    const isLocal = typesOf(n).some((t) => t !== 'Organization' && t !== 'Corporation');
    const missing = ['name', 'url', ...(isLocal ? ['address', 'telephone'] : [])].filter((f) => !n[f]);
    if (missing.length) add('seo.schema_fields_missing', `${short(url)}:${typesOf(n)[0]}`, { url, evidence: { type: typesOf(n)[0], missing } });
  }

  // Cruce con Search Console: páginas con impresiones (≥ 10 en 90 días) que el rastreo no vio.
  if (input.gscPages?.length) {
    const crawled = input.pages.map((p) => p.url);
    for (const g of input.gscPages) {
      if (g.impressions < 10) continue;
      if (crawled.some((u) => sameUrl(u, g.url))) continue;
      add('seo.gsc_page_not_crawled', short(g.url), {
        url: g.url,
        metric: 'impresiones_90d',
        value: g.impressions,
        // Si el rastreo se cortó por el tope, puede que simplemente no llegara: se rebaja a informativo.
        severity: input.truncated ? 'info' : undefined,
        evidence: { clicks: g.clicks, truncated: input.truncated }
      });
    }
  }
  return out;
}

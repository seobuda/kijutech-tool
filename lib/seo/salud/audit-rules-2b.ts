// SEO · Salud técnica, parte 6 tanda 6a (técnico 2b, 27 nov 2026; docs/DISENO-SEO-TECNICO-2BC.md con la auditoría Opus).
// Reglas PURAS sobre el rastreo ya guardado: soft 404 (por página y de la web), restos de staging, nofollow interno,
// teléfonos distintos en el schema, tecnología (CMS, tema y plugins) y plugins de SEO en conflicto. Sin red ni base de datos.
import { sha1 } from '@/lib/core/crawl-extract';
import type { FindingInput } from '@/lib/core/findings-rules';
import { normPhone } from '@/lib/seo/expediente/rules';
import { isOrgNode, jsonldNodes, sameUrl, type AuditPage } from '@/lib/seo/salud/audit-rules';
import type { TecnicoPage } from '@/lib/seo/salud/audit-rules-tecnico';

const short = (u: string) => sha1(u).slice(0, 16);
const mk = (kind: string, key: string, f: Omit<FindingInput, 'kind' | 'dedupeKey'> = {}): FindingInput => ({ kind, dedupeKey: `${kind}:${key}`.slice(0, 300), ...f });
const okHtml = (p: AuditPage) => p.statusCode != null && p.statusCode >= 200 && p.statusCode < 300 && /html/i.test(p.contentType ?? '');
const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase();
  } catch {
    return '';
  }
};
const pathOf = (u: string) => {
  try {
    return new URL(u).pathname.toLowerCase();
  } catch {
    return '';
  }
};

// --- Soft 404 ------------------------------------------------------------------------------------------------------------

/** Frases completas de «página no encontrada» (es, ca, en). Sueltas («404», «no existe») darían falsos: Peugeot 404. */
const NOT_FOUND = /(p[aáà]gina no encontrada|no se (ha )?encontr[oó] la p[aáà]gina|la p[aáà]gina que buscas no existe|esta p[aáà]gina no existe|p[aáà]gina no trobada|no s['’]ha trobat la p[aáà]gina|aquesta p[aáà]gina no existeix|page not found|error 404|404 not found|404 error|oops! that page can['’]t be found|nothing (was )?found)/i;

/** Páginas que responden 200 pero dicen «no encontrada» (en el título o el H1, y con poco texto). Un hallazgo por rastreo. */
export function soft404Pages(pages: AuditPage[]): FindingInput[] {
  const hits = pages.filter((p) => okHtml(p) && (p.wordCount ?? 0) < 300 && (NOT_FOUND.test(p.title ?? '') || (p.h1 ?? []).some((h) => NOT_FOUND.test(h))));
  if (!hits.length) return [];
  return [mk('seo.soft_404', 'web', { url: hits[0].url, metric: 'paginas', value: hits.length, evidence: { urls: hits.slice(0, 20).map((p) => p.url) } })];
}

export type ProbeResult = { url: string; status: number; location: string | null; error: string | null };
/**
 * Sonda: dos URLs que no existen. 200, o redirección a la portada, = soft 404 de la web. 401/403/429/5xx o error de red =
 * no se sabe (null: quien llama no toca lo que había). 404/410 = bien ([]).
 */
export function soft404Site(rootUrl: string, probes: ProbeResult[]): FindingInput[] | null {
  if (!probes.length || probes.some((p) => p.error || p.status === 0 || [401, 403, 429].includes(p.status) || p.status >= 500)) return null;
  const toHome = (p: ProbeResult) => p.status >= 300 && p.status < 400 && p.location != null && (sameUrl(p.location, rootUrl) || pathOf(p.location) === '/');
  const bad = probes.filter((p) => (p.status >= 200 && p.status < 300) || toHome(p));
  if (!bad.length) {
    // Otra redirección (p. ej. a https o a otra página): no sabemos qué responde al final → no se decide.
    if (probes.some((p) => p.status >= 300 && p.status < 400)) return null;
    return [];
  }
  return [mk('seo.soft_404_site', 'web', { url: rootUrl, evidence: { probes: bad.map((p) => ({ url: p.url, status: p.status, to: p.location })) } })];
}

// --- Restos de staging --------------------------------------------------------------------------------------------------

const STAGING_HOSTS = /(^|\.)(localhost|127\.0\.0\.1|0\.0\.0\.0)$|\.local$|\.test$|\.(wpengine|wpenginepowered)\.com$|\.kinsta\.cloud$|\.wpcomstaging\.com$|\.cloudwaysapps\.com$|\.flywheelstaging\.com$|\.flywheelsites\.com$|\.pantheonsite\.io$|\.instawp\.xyz$|\.sg-host\.com$|\.hostingersite\.com$|\.myftpupload\.com$/;
const STAGING_SUB = /^(staging\d*|stage|dev|test|pre|preprod|demo|beta)\./;
const STAGING_DIR = /^\/(staging|wp-staging|stagingsite)\//;

/** ¿Es un destino de staging? (subdominio de staging del propio dominio, subcarpeta de WP Staging o hosting temporal). */
export function isStagingUrl(url: string, rootUrl: string): boolean {
  const h = hostOf(url);
  if (!h) return false;
  if (STAGING_HOSTS.test(h)) return true;
  const root = hostOf(rootUrl).replace(/^www\./, '');
  if (root && STAGING_SUB.test(h) && h.endsWith(`.${root}`)) return true;
  if (root && h.replace(/^www\./, '') === root && STAGING_DIR.test(pathOf(url))) return true;
  return false;
}

/** Enlaces, CSS/JS, canonical, hreflang y URLs del JSON-LD que apuntan a staging. Las imágenes no se guardan (límite). */
export function stagingLeftovers(rootUrl: string, pages: TecnicoPage[]): FindingInput[] {
  const targets = new Map<string, Set<string>>();
  const add = (target: string, from: string) => {
    if (!isStagingUrl(target, rootUrl)) return;
    const t = target.split('#')[0].slice(0, 300);
    targets.set(t, (targets.get(t) ?? new Set()).add(from));
  };
  for (const p of pages) {
    if (!okHtml(p)) continue;
    for (const u of [...(p.facts?.ext ?? []), ...(p.facts?.res ?? [])]) add(u, p.url);
    if (p.canonical) add(p.canonical, p.url);
    for (const h of p.hreflang ?? []) add(h.url, p.url);
    for (const n of jsonldNodes(p.jsonld)) for (const f of ['url', '@id', 'logo', 'image']) if (typeof n[f] === 'string') add(n[f] as string, p.url);
    // Los enlaces internos a la subcarpeta de staging del propio dominio no están en ext: se ven por la URL rastreada.
    if (isStagingUrl(p.url, rootUrl)) add(p.url, p.url);
  }
  if (!targets.size) return [];
  const list = [...targets].sort((a, b) => b[1].size - a[1].size);
  return [mk('seo.staging_links', 'web', { url: [...list[0][1]][0], metric: 'destinos', value: list.length, evidence: { targets: list.slice(0, 15).map(([t, from]) => ({ url: t, pages: from.size, example: [...from][0] })) } })];
}

// --- Nofollow interno ---------------------------------------------------------------------------------------------------

/** Páginas a las que es normal (y en España, habitual) enlazar con nofollow: legales, cookies, carrito, cuenta, acceso. */
const NOFOLLOW_OK = /(aviso-legal|avis-legal|legal|privacidad|privacitat|privadesa|privacy|cookies?|galetes|politica|condiciones|condicions|terminos|terms|carrito|cistella|cart|checkout|finalizar-compra|cuenta|compte|my-account|mi-cuenta|login|wp-login|wp-admin|acceder|registro|feed)/i;

/** Enlaces internos con nofollow hacia páginas indexables (sin las legales, carrito ni cuenta). Un hallazgo por rastreo. */
export function internalNofollow(pages: AuditPage[], nofollowIn: Map<string, number>, isIndexable: (p: AuditPage) => boolean): FindingInput[] {
  const hits = pages
    .filter((p) => (nofollowIn.get(p.urlHash) ?? 0) > 0 && isIndexable(p) && !NOFOLLOW_OK.test(pathOf(p.url)))
    .map((p) => ({ url: p.url, n: nofollowIn.get(p.urlHash) ?? 0 }))
    .sort((a, b) => b.n - a.n);
  if (!hits.length) return [];
  return [mk('seo.internal_nofollow', 'web', { url: hits[0].url, metric: 'paginas', value: hits.length, evidence: { top: hits.slice(0, 10) } })];
}

// --- Teléfonos distintos en el schema -----------------------------------------------------------------------------------

/** El JSON-LD del negocio declara teléfonos distintos en distintas páginas. No se aplica con varias sedes (sería normal). */
export function schemaPhoneInconsistent(pages: AuditPage[], multiLocation: boolean): FindingInput[] {
  if (multiLocation) return [];
  const byPhone = new Map<string, string[]>();
  for (const p of pages) {
    if (!okHtml(p)) continue;
    for (const n of jsonldNodes(p.jsonld).filter(isOrgNode)) {
      const tel = typeof n.telephone === 'string' ? normPhone(n.telephone) : null;
      if (tel) byPhone.set(tel, [...(byPhone.get(tel) ?? []), p.url]);
    }
  }
  if (byPhone.size < 2) return [];
  const list = [...byPhone].sort((a, b) => b[1].length - a[1].length);
  return [mk('seo.schema_inconsistent', short(list.map(([t]) => t).sort().join('|')), { url: list[1][1][0], metric: 'telefonos', value: list.length, evidence: { phones: list.slice(0, 5).map(([t, urls]) => ({ phone: t, pages: urls.length, example: urls[0] })) } })];
}

// --- Tecnología ---------------------------------------------------------------------------------------------------------

export type Tech = { cms: string | null; version: string | null; theme: string | null; plugins: string[]; seoPlugins: string[] };
const SEO_PLUGIN_SLUGS: Record<string, string> = { 'wordpress-seo': 'yoast', 'seo-by-rank-math': 'rankmath', 'all-in-one-seo-pack': 'aioseo', 'wp-seopress': 'seopress', autodescription: 'tsf' };
export const SEO_PLUGIN_LABEL: Record<string, string> = { yoast: 'Yoast SEO', rankmath: 'Rank Math', aioseo: 'All in One SEO', seopress: 'SEOPress', tsf: 'The SEO Framework' };

/** CMS, tema y plugins a partir de lo que dejó el rastreo (generator, firmas y rutas de CSS/JS). Indicio, no inventario. */
export function detectTech(pages: Pick<TecnicoPage, 'facts'>[]): Tech {
  const res = pages.flatMap((p) => p.facts?.res ?? []);
  const gens = pages.map((p) => p.facts?.gen).filter((g): g is string => Boolean(g));
  const sigs = new Set(pages.flatMap((p) => p.facts?.sig ?? []));
  const gen = gens[0] ?? '';
  const has = (re: RegExp) => res.some((u) => re.test(u)) || re.test(gen);
  let cms: string | null = null;
  if (/wordpress/i.test(gen) || has(/\/wp-(content|includes)\//i)) cms = 'WordPress';
  else if (has(/cdn\.shopify\.com|shopify/i)) cms = 'Shopify';
  else if (has(/wixstatic\.com|parastorage\.com|\bwix\b/i)) cms = 'Wix';
  else if (has(/squarespace/i)) cms = 'Squarespace';
  else if (has(/webflow/i)) cms = 'Webflow';
  else if (/joomla/i.test(gen) || has(/\/media\/(jui|system)\//i)) cms = 'Joomla';
  else if (/prestashop/i.test(gen) || has(/prestashop|\/themes\/[^/]+\/assets\/cache\//i)) cms = 'PrestaShop';
  else if (/drupal/i.test(gen) || has(/\/sites\/(default|all)\/(files|modules|themes)\//i)) cms = 'Drupal';
  const version = gen.match(/(\d+\.\d+(\.\d+)?)/)?.[1] ?? null;
  const slugs = (re: RegExp) => [...new Set(res.map((u) => u.match(re)?.[1]?.toLowerCase()).filter((x): x is string => Boolean(x)))];
  const plugins = cms === 'WordPress' ? slugs(/\/wp-content\/plugins\/([a-z0-9_-]+)\//i).slice(0, 40) : [];
  const theme = cms === 'WordPress' ? (slugs(/\/wp-content\/themes\/([a-z0-9_-]+)\//i)[0] ?? null) : null;
  for (const pl of plugins) if (SEO_PLUGIN_SLUGS[pl]) sigs.add(SEO_PLUGIN_SLUGS[pl]);
  return { cms, version, theme, plugins, seoPlugins: [...sigs].filter((s) => SEO_PLUGIN_LABEL[s]).sort() };
}

/** Dos o más plugins de SEO a la vez: metas y schema por duplicado. */
export function seoPluginsConflict(rootUrl: string, tech: Tech): FindingInput[] {
  if (tech.seoPlugins.length < 2) return [];
  return [mk('seo.seo_plugins_conflict', 'web', { url: rootUrl, evidence: { plugins: tech.seoPlugins.map((s) => SEO_PLUGIN_LABEL[s]) } })];
}

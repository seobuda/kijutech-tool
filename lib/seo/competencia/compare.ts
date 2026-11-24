// SEO · Comparación de webs con la competencia: reglas PURAS (Hito 2, 24 nov 2026; docs/DISENO-TECNICO-HITO2.md §1 paso 4
// y 5). Sin IA. Sobre el último rastreo de la web del cliente y el rastreo ligero (50 páginas) de cada competidor
// confirmado: qué servicios tienen página propia, qué datos estructurados usan, qué tan rápido responde el servidor y
// cuánto texto tienen sus páginas. Más los huecos: búsquedas donde sale un competidor y la web del cliente no.
import type { SerpResult } from '@/lib/core/capabilities';
import { servicePage, type LocalPage } from '@/lib/seo/local/rules';
import { rootDomain } from '@/lib/seo/competencia/rules';

export const COMPETITOR_PAGES = 50;
export const MAX_CRAWLED_COMPETITORS = 5;
export const RECRAWL_DAYS = 30;

/** Tipos de datos estructurados que conviene comparar (el resto se cuenta pero no se comenta). */
export const SCHEMA_OF_INTEREST = ['LocalBusiness', 'Organization', 'Service', 'Product', 'FAQPage', 'BreadcrumbList', 'AggregateRating', 'Review', 'Article', 'WebSite'];

export type CrawledPage = {
  url: string;
  statusCode: number | null;
  title: string | null;
  h1: string[] | null;
  robotsMeta: string | null;
  canonical: string | null;
  wordCount: number | null;
  schemaTypes: string[] | null;
  fetchMs: number | null;
};

export type SiteProfile = {
  domain: string;
  pages: number;
  medianWords: number | null;
  medianMs: number | null;
  schemaTypes: string[];
  services: Record<string, string | null>;
};

const median = (xs: number[]): number | null => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
};

function indexable(p: CrawledPage): boolean {
  if (!p.statusCode || p.statusCode < 200 || p.statusCode >= 300) return false;
  if (/noindex/i.test(p.robotsMeta ?? '')) return false;
  if (p.canonical) {
    try {
      const a = new URL(p.canonical);
      const b = new URL(p.url);
      if (a.hostname.replace(/^www\./, '') !== b.hostname.replace(/^www\./, '') || a.pathname.replace(/\/$/, '') !== b.pathname.replace(/\/$/, '')) return false;
    } catch {
      /* canonical raro: no se descarta la página */
    }
  }
  return true;
}

/**
 * Los subtipos de LocalBusiness (Dentist, Plumber, HomeAndConstructionBusiness…) cuentan como LocalBusiness: la lista
 * completa de schema.org es larga, así que se reconoce por el sufijo y por los más habituales.
 */
const LOCAL_SUBTYPES = /(?:Business|Store|Restaurant|Dentist|Physician|Plumber|Electrician|Locksmith|RoofingContractor|HVACBusiness|Attorney|LegalService|AutoRepair|Hotel|Clinic|Agency|Bakery|BeautySalon|HairSalon|RealEstateAgent|AccountingService|MovingCompany|HousePainter|GeneralContractor|Notary|Optician|Pharmacy|VeterinaryCare|SportsActivityLocation|ExerciseGym)$/;
export function canonicalSchemaType(t: string): string {
  const x = t.replace(/^https?:\/\/schema\.org\//i, '').trim();
  if (x === 'LocalBusiness' || (x !== 'Organization' && LOCAL_SUBTYPES.test(x))) return 'LocalBusiness';
  return x;
}

/** Archivos de etiquetas, categorías, autores y paginaciones: no son la página de un servicio. */
const ARCHIVE = /\/(?:tag|etiqueta|category|categoria|author|autor|page)\/|[?&](?:s|p|page)=/i;

export function siteProfile(domain: string, pages: CrawledPage[], services: string[]): SiteProfile {
  const ok = pages.filter(indexable);
  const lp: LocalPage[] = ok.filter((p) => !ARCHIVE.test(p.url)).map((p) => ({ url: p.url, title: p.title, h1: p.h1, indexable: true }));
  const types = new Set<string>();
  for (const p of ok) for (const t of p.schemaTypes ?? []) types.add(canonicalSchemaType(t));
  const svc: Record<string, string | null> = {};
  for (const s of services) svc[s] = servicePage(s, lp)?.url ?? null;
  return {
    domain: rootDomain(domain),
    pages: ok.length,
    medianWords: median(ok.map((p) => p.wordCount ?? NaN)),
    medianMs: median(pages.filter((p) => p.statusCode && p.statusCode < 400).map((p) => p.fetchMs ?? NaN)),
    schemaTypes: [...types].sort(),
    services: svc
  };
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);

/**
 * Conclusiones en frases, de más a menos útil. Solo se dice algo cuando hay al menos un competidor rastreado y la web del
 * cliente también lo está; si falta la del cliente, una sola frase que lo explica.
 */
export function compareSites(client: SiteProfile | null, competitors: SiteProfile[], max = 8): string[] {
  if (!competitors.length) return [];
  if (!client) return ['Falta el rastreo de la web del cliente: pasa la auditoría (Proyectos → Salud) para poder compararla.'];
  const out: string[] = [];
  // 1. Servicios con página en la competencia y sin página en el cliente.
  for (const s of Object.keys(client.services)) {
    if (client.services[s]) continue;
    const who = competitors.filter((c) => c.services[s]).map((c) => c.domain);
    if (who.length) out.push(`«${s}»: ${who.length === 1 ? `${who[0]} tiene` : `${list(who)} tienen`} una página propia y la web del cliente no.`);
  }
  // 2. Datos estructurados que usan otros y el cliente no.
  for (const t of SCHEMA_OF_INTEREST) {
    if (client.schemaTypes.includes(t)) continue;
    const who = competitors.filter((c) => c.schemaTypes.includes(t)).map((c) => c.domain);
    if (who.length >= Math.max(1, Math.ceil(competitors.length / 2))) out.push(`Datos estructurados ${t}: ${who.length === 1 ? `los usa ${who[0]}` : `los usan ${list(who)}`}; la web del cliente no.`);
  }
  // 3. Servidor más lento.
  const compMs = median(competitors.map((c) => c.medianMs ?? NaN));
  if (client.medianMs != null && compMs != null && client.medianMs > 800 && client.medianMs > compMs * 1.5) {
    out.push(`El servidor del cliente responde más lento: ${client.medianMs} ms de mediana frente a ${compMs} ms de la competencia.`);
  }
  // 4. Menos texto.
  const compWords = median(competitors.map((c) => c.medianWords ?? NaN));
  if (client.medianWords != null && compWords != null && compWords >= 300 && client.medianWords < compWords * 0.6) {
    out.push(`Las páginas del cliente tienen menos texto: ${client.medianWords} palabras de mediana frente a ${compWords} de la competencia.`);
  }
  return out.slice(0, max);
}

/** Posición de la web del cliente en cada búsqueda (orgánico, top 20; null si no sale). */
export function ownPositions(results: { query: string; serp: SerpResult }[], own: string[]): Record<string, number | null> {
  const ownSet = new Set(own.map(rootDomain));
  const out: Record<string, number | null> = {};
  for (const { query, serp } of results) {
    const hit = serp.organic.slice(0, 20).find((o) => ownSet.has(rootDomain(o.domain)) || [...ownSet].some((d) => rootDomain(o.domain).endsWith(`.${d}`)));
    out[query] = hit?.rank ?? null;
  }
  return out;
}

/** Huecos: búsquedas donde sale el competidor y la web del cliente no sale (o sale por detrás del puesto 20). */
export function gapQueries(competitorQueries: string[], own: Record<string, number | null>): string[] {
  return competitorQueries.filter((q) => q in own && own[q] == null);
}

/** Nombre corto y comparable de un servicio (para títulos de columna). */
export function shortService(s: string): string {
  const t = s.trim();
  return t.length > 28 ? `${t.slice(0, 27)}…` : t;
}

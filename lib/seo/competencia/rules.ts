// SEO · Competencia: reglas PURAS (Hito 2, 24 nov 2026; docs/DISENO-TECNICO-HITO2.md §1). Sin IA.
// A partir de los resultados de Google de las búsquedas semilla: quién sale (orgánico y paquete local), cuántas veces y
// en qué posición. Un dominio que sale en al menos 3 búsquedas (o 2 si hay pocas) es candidato; los directorios y
// marketplaces conocidos se marcan «agregador» (compiten por el clic, pero no son la competencia del negocio).
import type { SerpResult } from '@/lib/core/capabilities';

/** Directorios, marketplaces, redes y medios generalistas habituales en España (ampliable). */
export const AGGREGATORS = [
  'habitissimo.es', 'cronoshare.com', 'paginasamarillas.es', 'tripadvisor.es', 'tripadvisor.com', 'google.com', 'youtube.com', 'facebook.com',
  'instagram.com', 'linkedin.com', 'wikipedia.org', 'es.wikipedia.org', 'amazon.es', 'idealista.com', 'fotocasa.es', 'milanuncios.com',
  'wallapop.com', 'doctoralia.es', 'topdoctors.es', 'infojobs.net', 'indeed.com', 'yelp.es', 'starofservice.es', 'homify.es', 'houzz.es',
  'cylex.es', 'infoisinfo.es', 'einforma.com', 'axesor.es', 'empresite.eleconomista.es', 'reddit.com', 'pinterest.com', 'tiktok.com', 'x.com',
  'elmundo.es', 'elpais.com', 'abc.es', 'lavanguardia.com', '20minutos.es', 'elconfidencial.com', 'xataka.com', 'ocu.org', 'rankia.com'
];
const AGG = new Set(AGGREGATORS);

export function rootDomain(d: string): string {
  return d.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}
export function isAggregator(d: string): boolean {
  const x = rootDomain(d);
  return AGG.has(x) || [...AGG].some((a) => x.endsWith(`.${a}`));
}

export type CompetitorCandidate = {
  domain: string;
  kind: 'directo' | 'agregador';
  appearances: number;
  avgPosition: number | null;
  queries: string[];
  inLocalPack: number;
  localName: string | null;
  rating: number | null;
  reviews: number | null;
};

/**
 * Candidatos a competencia. «own» = dominios del cliente (se excluyen). Orden: más apariciones y mejor posición primero.
 */
export function rankCompetitors(results: { query: string; serp: SerpResult }[], own: string[], minAppearances?: number): CompetitorCandidate[] {
  const ownSet = new Set(own.map(rootDomain));
  const by = new Map<string, { pos: number[]; queries: Set<string>; local: number; localName: string | null; rating: number | null; reviews: number | null }>();
  const get = (d: string) => {
    if (!by.has(d)) by.set(d, { pos: [], queries: new Set(), local: 0, localName: null, rating: null, reviews: null });
    return by.get(d)!;
  };
  for (const { query, serp } of results) {
    const seen = new Set<string>();
    for (const o of serp.organic.slice(0, 20)) {
      const d = rootDomain(o.domain);
      if (!d || ownSet.has(d) || seen.has(d)) continue;
      seen.add(d);
      const x = get(d);
      x.pos.push(o.rank);
      x.queries.add(query);
    }
    for (const l of serp.localPack) {
      if (!l.domain) continue;
      const d = rootDomain(l.domain);
      if (ownSet.has(d)) continue;
      const x = get(d);
      x.local++;
      x.queries.add(query);
      x.localName ??= l.title || null;
      if (l.rating != null) x.rating = l.rating;
      if (l.reviews != null) x.reviews = l.reviews;
    }
  }
  const min = minAppearances ?? (results.length >= 6 ? 3 : 2);
  return [...by.entries()]
    .map(([domain, x]) => ({
      domain,
      kind: (isAggregator(domain) ? 'agregador' : 'directo') as CompetitorCandidate['kind'],
      appearances: x.queries.size,
      avgPosition: x.pos.length ? Math.round((x.pos.reduce((s, p) => s + p, 0) / x.pos.length) * 10) / 10 : null,
      queries: [...x.queries].slice(0, 10),
      inLocalPack: x.local,
      localName: x.localName,
      rating: x.rating,
      reviews: x.reviews
    }))
    .filter((c) => c.appearances >= min || c.inLocalPack >= 2)
    .sort((a, b) => b.appearances - a.appearances || (a.avgPosition ?? 99) - (b.avgPosition ?? 99))
    .slice(0, 25);
}

/** Búsquedas semilla: los temas que más se ven (sin los de marca) y «servicio + población» de la ficha. Sin repetir. */
export function seedQueries(input: { topics: { name: string; isBrand: boolean; impressions: number }[]; services: string[]; city: string | null }, max = 15): string[] {
  const out: string[] = [];
  const add = (q: string) => {
    const k = q.trim().toLowerCase();
    if (k && !out.some((x) => x.toLowerCase() === k)) out.push(q.trim());
  };
  for (const s of input.services.slice(0, 5)) add(input.city ? `${s} ${input.city}` : s);
  for (const t of [...input.topics].filter((t) => !t.isBrand).sort((a, b) => b.impressions - a.impressions)) {
    if (out.length >= max) break;
    add(t.name);
  }
  return out.slice(0, max);
}

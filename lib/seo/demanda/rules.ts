// SEO · Demanda (parte 7, 27 nov 2026; docs/DISENO-SEO-DEMANDA.md con la auditoría Opus). Reglas PURAS: normalizar
// búsquedas, volumen de un tema sin inflar variantes, intención y tipo de página por la SERP real, validar temas con las
// URLs del top 10 y filtrar ideas. Sin red ni base de datos.
import { sha1 } from '@/lib/core/crawl-extract';
import type { FindingInput } from '@/lib/core/findings-rules';
import { normText } from '@/lib/seo/expediente/rules';
import { tokens } from '@/lib/seo/mapa/rules';

export const DEMANDA_SOURCE = 'seo.demanda:serp';
export const DEMANDA_KINDS = ['seo.serp_same_intent', 'seo.demand_no_page'];

/** Forma normalizada (sin tildes, plurales ni orden de palabras): las variantes cercanas comparten clave. */
export function keywordKey(q: string): string {
  return [...tokens(q)].sort().join(' ').slice(0, 200) || normText(q).slice(0, 200);
}

/** Volumen de un tema: por cada forma normalizada, el máximo (Google Ads da el mismo número a las variantes). */
export function topicVolume(queries: string[], volumeOf: (key: string) => number | null | undefined): number | null {
  const keys = [...new Set(queries.map(keywordKey))];
  let total = 0;
  let any = false;
  for (const k of keys) {
    const v = volumeOf(k);
    if (typeof v === 'number') {
      total += v;
      any = true;
    }
  }
  return any ? total : null;
}

// --- Tipo de página e intención por la SERP -------------------------------------------------------------------------

/** Directorios, redes y portales que salen en casi todas las búsquedas locales: no dicen nada de la intención. */
const NOISE = /(^|\.)(paginasamarillas|habitissimo|cronoshare|starofservice|doctoralia|topdoctors|tripadvisor|thefork|yelp|cylex|qdq|infobel|facebook|instagram|youtube|tiktok|linkedin|pinterest|twitter|x|google|wikipedia|milanuncios|wallapop|amazon|idealista|fotocasa|indeed|infojobs)\.[a-z.]+$/i;
const host = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};
export const isNoise = (u: string) => NOISE.test(host(u));

const ARTICLE = /\/(blog|noticias|news|articulos?|guia|guias|consejos|ayuda|preguntas|faq|como-|que-es|cuanto-cuesta|precio-de|20\d\d\/)|\/[a-z0-9-]{40,}\/?$/i;
/** Tipo de una URL: artículo (blog, guía), directorio, o servicio (portada o página comercial). */
export function urlType(u: string): 'articulo' | 'directorio' | 'servicio' {
  if (isNoise(u)) return 'directorio';
  let path = '';
  try {
    path = new URL(u).pathname.toLowerCase();
  } catch {
    return 'servicio';
  }
  return ARTICLE.test(path) ? 'articulo' : 'servicio';
}

const INFO_WORDS = /\b(que|qué|què|como|cómo|com|cuanto|cuánto|quant|por que|per què|porque|guia|guía|consejos|ideas|tipos|diferencia|significado)\b/i;
/** Intención por la SERP: el tipo de página que domina el top 10, el mapa y los productos. «mixta» si nada domina. */
export function serpIntent(top10: string[], features: string[], query: string): { intent: 'local' | 'transaccional' | 'informacional' | 'mixta'; pageType: 'servicio' | 'articulo' | 'directorio' | 'mixto' } {
  const types = top10.slice(0, 10).map(urlType);
  const n = types.length || 1;
  const share = (t: string) => types.filter((x) => x === t).length / n;
  const pageType = share('articulo') >= 0.5 ? 'articulo' : share('servicio') >= 0.5 ? 'servicio' : share('directorio') >= 0.5 ? 'directorio' : 'mixto';
  const f = new Set(features);
  if (f.has('local_pack') || f.has('maps')) return { intent: 'local', pageType };
  if (f.has('shopping') || f.has('popular_products')) return { intent: 'transaccional', pageType };
  if (share('articulo') >= 0.5 || (INFO_WORDS.test(query) && share('articulo') >= 0.3)) return { intent: 'informacional', pageType };
  if (share('servicio') + share('directorio') >= 0.7) return { intent: 'transaccional', pageType };
  return { intent: 'mixta', pageType };
}

// --- Validación de temas con la SERP --------------------------------------------------------------------------------

export type TopicSerp = { topicKey: string; name: string; url: string | null; position: number | null; top10: string[] };
const clean = (urls: string[], clientHost: string) => urls.filter((u) => !isNoise(u) && host(u) !== clientHost && !host(u).endsWith(`.${clientHost}`)).map((u) => u.replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase());

/**
 * Dos temas con páginas distintas de la web que Google trata como la misma búsqueda (comparten 4+ URLs del top 10 sin
 * contar la web del cliente, directorios ni redes). No si las dos ya están en el top 3 (unirlas puede costar) ni si sus
 * URLs ya tienen una canibalización o un «tema sin página clara» abiertos (blocked).
 */
export function sameIntentPairs(topics: TopicSerp[], clientHost: string, blocked: Set<string>, minShared = 4): FindingInput[] {
  const t = topics.filter((x) => x.url && x.top10.length >= 5).map((x) => ({ ...x, set: new Set(clean(x.top10, clientHost)) }));
  const out: FindingInput[] = [];
  for (let i = 0; i < t.length; i++) {
    for (let j = i + 1; j < t.length; j++) {
      const a = t[i];
      const b = t[j];
      if (a.url === b.url) continue;
      if (blocked.has(a.url!) || blocked.has(b.url!)) continue;
      if ((a.position ?? 99) <= 3 && (b.position ?? 99) <= 3) continue;
      const shared = [...a.set].filter((u) => b.set.has(u));
      if (shared.length < minShared) continue;
      const pair = [a.url!, b.url!].sort();
      out.push({ kind: 'seo.serp_same_intent', dedupeKey: `seo.serp_same_intent:${sha1(pair.join('|')).slice(0, 16)}`, url: pair[0], query: a.name, metric: 'urls_compartidas', value: shared.length, evidence: { temas: [a.name, b.name], paginas: pair, compartidas: shared.slice(0, 10) } });
    }
  }
  return out.sort((x, y) => (y.value ?? 0) - (x.value ?? 0)).slice(0, 20);
}

// --- Ideas -----------------------------------------------------------------------------------------------------------

export type Idea = { keyword: string; volume: number | null; cpc: number | null; competition: string | null };
/** Filtra ideas: sin volumen, demasiado largas, con marcas de la competencia o con lo que el cliente no quiere. */
export function filterIdeas(ideas: Idea[], opts: { competitorTokens: string[][]; avoid: string[]; known: Set<string>; max?: number }): Idea[] {
  const avoid = opts.avoid.map((a) => normText(a)).filter((a) => a.length >= 3);
  const seen = new Set<string>();
  return ideas
    .filter((i) => (i.volume ?? 0) > 0 && i.keyword.length <= 80 && i.keyword.split(/\s+/).length <= 10)
    .filter((i) => {
      const n = normText(i.keyword);
      if (avoid.some((a) => n.includes(a))) return false;
      if (opts.competitorTokens.some((toks) => toks.length > 0 && toks.every((t) => n.includes(t)))) return false;
      const k = keywordKey(i.keyword);
      if (opts.known.has(k) || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
    .slice(0, opts.max ?? 100);
}

/** El tema más parecido por palabras (Jaccard ≥ 0,5), o null. */
export function closestTopic(keyword: string, topics: { topicKey: string; queries: string[] }[]): string | null {
  const a = tokens(keyword);
  if (!a.size) return null;
  let best: { key: string; j: number } | null = null;
  for (const t of topics) {
    for (const q of t.queries.slice(0, 20)) {
      const b = tokens(q);
      const inter = [...a].filter((x) => b.has(x)).length;
      const j = inter / (a.size + b.size - inter || 1);
      if (j >= 0.5 && (!best || j > best.j)) best = { key: t.topicKey, j };
    }
  }
  return best?.key ?? null;
}

/** Demanda sin página: ideas con volumen ≥ 20 sin tema con página. Ganancia = volumen × 5 % (CTR de la posición 5). */
export function demandWithoutPage(ideas: { keyword: string; volume: number | null; topicHasPage: boolean; intent: string | null }[], max = 10): FindingInput[] {
  return ideas
    .filter((i) => (i.volume ?? 0) >= 20 && !i.topicHasPage)
    .sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
    .slice(0, max)
    .map((i) => ({ kind: 'seo.demand_no_page', dedupeKey: `seo.demand_no_page:${sha1(keywordKey(i.keyword)).slice(0, 16)}`, query: i.keyword, metric: 'clics_mes', value: Math.max(1, Math.round((i.volume ?? 0) * 0.05)), evidence: { volumen: i.volume, intencion: i.intent } }));
}

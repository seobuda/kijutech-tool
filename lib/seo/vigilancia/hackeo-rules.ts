// SEO · Señales de web hackeada (parte 6, tanda 6a; docs/DISENO-SEO-TECNICO-2BC.md con la auditoría Opus). Reglas PURAS.
// Lista estrecha y con límites de palabra: los críticos falsos (una farmacia, «XXX edició», Ford Escort) cuestan más que
// un hackeo visto una semana tarde. El hackeo japonés suele enseñar la basura solo a Googlebot (cloaking): por eso se mira
// Search Console (lo que Google ya indexó) y no solo el rastreo.
import type { FindingInput } from '@/lib/core/findings-rules';

export const HACKEO_SOURCE = 'seo.vigilancia:hackeo';
export const HACKEO_KINDS = ['seo.hacked_queries', 'seo.hacked_pages'];

const SPAM = /\b(viagra|cialis|levitra|kamagra|tadalafil|sildenafil|replica (watch|watches|rolex|handbags?|bags)|(rolex|louis vuitton|gucci|chanel) replica|slot gacor|judi (online|slot)|togel|casino online|online casino|payday loans?)\b/i;
const JAPANESE = /[぀-ヿ]/; // hiragana y katakana
const HAN = /[一-鿿]/; // ideogramas (chino y kanji)

/** ¿Es una búsqueda (o un texto de URL) típica de un hackeo, para una web que no está en japonés ni en chino? */
export function isSpamText(text: string, siteLangs: Set<string>): boolean {
  if (SPAM.test(text)) return true;
  if (JAPANESE.test(text) && !siteLangs.has('ja')) return true;
  if (HAN.test(text) && !siteLangs.has('ja') && !siteLangs.has('zh')) return true;
  return false;
}

/** Idiomas de la web (2 letras) a partir del lang y el hreflang de sus páginas. */
export function siteLanguages(pages: { lang?: string | null; hreflang?: { lang: string }[] | null }[]): Set<string> {
  const out = new Set<string>();
  for (const p of pages) {
    if (p.lang) out.add(p.lang.toLowerCase().slice(0, 2));
    for (const h of p.hreflang ?? []) out.add(h.lang.toLowerCase().slice(0, 2));
  }
  return out;
}

const decoded = (u: string) => {
  try {
    return decodeURIComponent(u);
  } catch {
    return u;
  }
};

export type NewQuery = { query: string; impressions: number; urls: string[] };
/**
 * Búsquedas NUEVAS (con impresiones en 28 días y ninguna en los 92 anteriores) que parecen basura. Salta con 3 o más, o con
 * 50 impresiones o más. Crítico si alguna de sus URLs no es de la web conocida (ni rastreada ni en el sitemap) o tiene una
 * ruta basura; si no (p. ej. una farmacia de verdad), aviso.
 */
export function hackedQueries(queries: NewQuery[], siteLangs: Set<string>, knownUrls: Set<string>): FindingInput[] {
  const spam = queries.filter((q) => isSpamText(q.query, siteLangs));
  const imps = spam.reduce((s, q) => s + q.impressions, 0);
  if (spam.length < 3 && imps < 50) return [];
  const urls = [...new Set(spam.flatMap((q) => q.urls))];
  const strange = urls.filter((u) => !knownUrls.has(u.replace(/\/+$/, '')) || isSpamText(decoded(u), siteLangs));
  return [
    {
      kind: 'seo.hacked_queries',
      dedupeKey: 'seo.hacked_queries:web',
      url: strange[0] ?? urls[0],
      metric: 'busquedas',
      value: spam.length,
      severity: strange.length ? 'critico' : 'aviso',
      evidence: { impressions: imps, queries: spam.sort((a, b) => b.impressions - a.impressions).slice(0, 15).map((q) => ({ q: q.query.slice(0, 120), imp: q.impressions })), urls: (strange.length ? strange : urls).slice(0, 15) }
    }
  ];
}

/** Páginas con impresiones (Search Console) o rastreadas cuya URL o título parecen basura. Hacen falta 2 o más. */
export function hackedPages(pages: { url: string; title?: string | null }[], siteLangs: Set<string>): FindingInput[] {
  const hits = [...new Map(pages.filter((p) => isSpamText(`${decoded(p.url)} ${p.title ?? ''}`, siteLangs)).map((p) => [p.url, p])).values()];
  if (hits.length < 2) return [];
  return [{ kind: 'seo.hacked_pages', dedupeKey: 'seo.hacked_pages:web', url: hits[0].url, metric: 'paginas', value: hits.length, severity: 'critico', evidence: { urls: hits.slice(0, 20).map((p) => p.url) } }];
}

// SEO · Autoridad: reglas puras (parte 10, 27 nov 2026). Se prueban en tests/seo-autoridad.test.ts.

/** Directorios, redes, buscadores y webs de enlaces masivos: no son oportunidades útiles para una pyme. */
const NOT_USEFUL = /(^|\.)(google|youtube|facebook|instagram|linkedin|twitter|tiktok|pinterest|wikipedia|reddit|tripadvisor|yelp|cylex|paginasamarillas|infoisinfo|guiaempresa|einforma|axesor|empresite|hotfrog|europages|kompass|trustpilot|blogspot|wordpress|wixsite|weebly|tumblr|medium|archive|w3|gravatar|github|apple|bing|yahoo|amazon|ebay)\.[a-z.]+$/i;

/**
 * Huecos útiles: enlazan a 2 o más competidores (o a todos si solo hay 2), con rank 10 o más (escala 0-100), sin
 * directorios ni redes. Como mucho 50, los de más rank primero.
 */
export function filterGap(domains: { domain: string; rank: number | null; linksTo: string[] }[], competitors: number, max = 50): { domain: string; rank: number | null; linksTo: string[] }[] {
  const need = Math.min(2, Math.max(1, competitors));
  const seen = new Set<string>();
  return domains
    .map((d) => ({ ...d, domain: d.domain.toLowerCase().replace(/^www\./, '') }))
    .filter((d) => d.domain && !seen.has(d.domain) && seen.add(d.domain) && d.linksTo.length >= need && (d.rank ?? 0) >= 10 && !NOT_USEFUL.test(d.domain))
    .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))
    .slice(0, max);
}

/** Cobertura: qué parte de los dominios de Search Console encuentra DataForSEO (criterio: 60 % o más). */
export function coverageShare(gsc: string[], dfs: string[]): { share: number | null; found: number; total: number } {
  const norm = (s: string) => s.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  const g = [...new Set(gsc.map(norm).filter(Boolean))];
  const d = new Set(dfs.map(norm));
  if (!g.length) return { share: null, found: 0, total: 0 };
  const found = g.filter((x) => d.has(x)).length;
  return { share: found / g.length, found, total: g.length };
}

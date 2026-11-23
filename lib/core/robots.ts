// robots.txt: lectura y reglas (cimientos, 23 nov 2026). Pura. Sigue el estándar RFC 9309 (el que aplica Google):
// grupo del agente más específico (o «*»), la regla más larga gana y, a igualdad, gana Allow; «*» y «$» como comodines.

export type RobotsRules = { allow: string[]; disallow: string[]; sitemaps: string[]; crawlDelay: number | null };

export function parseRobots(txt: string, userAgent: string): RobotsRules {
  const ua = userAgent.toLowerCase();
  const groups: { agents: string[]; allow: string[]; disallow: string[]; delay: number | null }[] = [];
  const sitemaps: string[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === 'sitemap') {
      if (value) sitemaps.push(value);
      continue;
    }
    if (key === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], allow: [], disallow: [], delay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (key === 'allow' && value) current.allow.push(value);
    else if (key === 'disallow' && value) current.disallow.push(value);
    else if (key === 'crawl-delay') {
      const d = Number(value);
      if (Number.isFinite(d) && d >= 0) current.delay = d;
    }
  }
  // El grupo más específico: el nombre de agente más largo que esté contenido en el nuestro; si no, «*».
  let best: (typeof groups)[number] | null = null;
  let bestLen = -1;
  for (const g of groups) {
    for (const a of g.agents) {
      if (a !== '*' && ua.includes(a) && a.length > bestLen) {
        best = g;
        bestLen = a.length;
      }
    }
  }
  const chosen = best ?? groups.filter((g) => g.agents.includes('*'));
  const list = Array.isArray(chosen) ? chosen : [chosen];
  return {
    allow: list.flatMap((g) => g.allow),
    disallow: list.flatMap((g) => g.disallow),
    sitemaps,
    crawlDelay: list.map((g) => g.delay).find((d) => d !== null) ?? null
  };
}

function patternToRegex(p: string): RegExp {
  const anchored = p.endsWith('$');
  const body = (anchored ? p.slice(0, -1) : p).replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

/** ¿Se puede rastrear esta ruta (pathname + search)? */
export function isAllowed(rules: RobotsRules, pathWithQuery: string): boolean {
  if (pathWithQuery === '/robots.txt') return true;
  let verdict: { len: number; allow: boolean } | null = null;
  const consider = (patterns: string[], allow: boolean) => {
    for (const p of patterns) {
      if (!patternToRegex(p).test(pathWithQuery)) continue;
      const len = p.replace(/\$$/, '').length;
      if (!verdict || len > verdict.len || (len === verdict.len && allow)) verdict = { len, allow };
    }
  };
  consider(rules.disallow, false);
  consider(rules.allow, true);
  return verdict ? (verdict as { allow: boolean }).allow : true;
}

/** URLs de un sitemap (o de un índice de sitemaps): las <loc>. */
export function locsFromSitemap(xml: string): { urls: string[]; sitemaps: string[] } {
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, '&'));
  return /<sitemapindex/i.test(xml) ? { urls: [], sitemaps: locs } : { urls: locs, sitemaps: [] };
}

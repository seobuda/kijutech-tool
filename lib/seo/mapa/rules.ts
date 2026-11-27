// SEO · Mapa de palabras: reglas PURAS (Hito 2, 24 nov 2026; docs/DISENO-TECNICO-HITO2.md §2). Sin IA.
//   1. Cada consulta va al tema de la página que Google más le muestra (su «página dominante»), si es clara: con al
//      menos el 60 % de sus impresiones y en posición media ≤ 30. Así el tema es lo que Google ya decide.
//   2. Las consultas sin página clara se agrupan por parecido: con embeddings si hay (HDBSCAN, fuera de aquí) o, si no,
//      por palabras compartidas (Jaccard ≥ 0,5). Esos temas no tienen URL: piden una página nueva.
//   3. Canibalización con señal temporal: una consulta con ≥ 2 páginas que se turnan el primer puesto semana a semana.
//   4. Clics anónimos: la parte de los clics que Search Console no atribuye a ninguna consulta.
//   Desde el 26 nov 2026 (Palabras A+B):
//   5. La marca nunca pide página nueva: sus búsquedas sin página clara van a un tema «marca» con la página que más ve.
//   6. Un grupo sin página dominante pero con alguna página en el top 20 es «sin página clara» (se refuerza esa página);
//      solo es «página nueva» si ninguna página de la web pasa de la posición 20.
//   7. Oportunidades (salen como hallazgos y van al plan): temas que piden página nueva o elegir página, búsquedas al
//      alcance (posición 4-15) y páginas con CTR muy por debajo de lo esperado para su posición.
//   8. Valor de negocio de cada tema: si trata de un servicio del cliente (y de cuál en su orden de prioridad), si se
//      parece a algo que el cliente dijo que NO quiere, o si coincide con lo que dijo que más le interesa.
//   9. Comparación con el año anterior y meses fuertes, cuando hay un año de datos (gsc_monthly).
import { createHash } from 'crypto';
import { isBrandQuery, normText } from '@/lib/seo/expediente/rules';

export type QueryPageRow = { query: string; page: string; clicks: number; impressions: number; posSum: number; clicksRecent: number; clicksPrev: number };
export type QueryStat = {
  query: string;
  clicks: number;
  impressions: number;
  position: number | null;
  clicksRecent: number;
  clicksPrev: number;
  dominant: string | null;
  share: number;
  /** La página con más impresiones para la búsqueda (aunque no sea dominante) y su posición media. */
  topPage: string;
  topPos: number;
};
export type TopicMetrics = {
  clics: number;
  impresiones: number;
  posicion: number | null;
  ctr: number | null;
  tendenciaPct: number | null;
  consultas: number;
  marca: number;
  /** 1 = el tema de la marca (nunca pide página nueva). */
  esMarca?: number;
  /** Sin página dominante pero con una en el top 20: la que conviene reforzar, y su posición. */
  candidata?: string | null;
  candidataPos?: number | null;
  /** Clics al mes que se podrían ganar (estimación prudente con la curva de CTR). */
  oportunidad?: number | null;
  /** Valor de negocio (0,5 = parece lo que el cliente no quiere; 1 = no es un servicio suyo; 2-3 = servicio, más cuanto más prioritario). */
  valor?: number | null;
  servicio?: string | null;
  aviso?: string | null;
  interanualPct?: number | null;
  mesesFuertes?: string | null;
  /** Parte 7: volumen mensual (Google Ads) e intención y tipo de página por la SERP de su búsqueda principal. */
  volumen?: number | null;
  intencion?: string | null;
  tipoPagina?: string | null;
};
export type TopicDraft = {
  topicKey: string;
  name: string;
  url: string | null;
  origin: 'pagina' | 'parecido';
  queries: QueryStat[];
  metrics: TopicMetrics;
};

export const MIN_IMPRESSIONS = 10;
export const DOMINANT_SHARE = 0.6;
export const MAX_POSITION = 30;
/** Hasta esta posición, una página que ya sale se puede reforzar en vez de crear otra. */
export const CANDIDATE_MAX_POSITION = 20;

const sha = (s: string) => createHash('sha1').update(s).digest('hex');
export const queryHash = (q: string) => sha(q.trim().toLowerCase()).slice(0, 40);

/** Una fila por consulta, con su página dominante (o null si no hay una clara). */
export function queryStats(rows: QueryPageRow[]): QueryStat[] {
  const by = new Map<string, QueryPageRow[]>();
  for (const r of rows) by.set(r.query, [...(by.get(r.query) ?? []), r]);
  const out: QueryStat[] = [];
  for (const [query, list] of by) {
    const impressions = list.reduce((s, r) => s + r.impressions, 0);
    if (impressions < MIN_IMPRESSIONS) continue;
    const clicks = list.reduce((s, r) => s + r.clicks, 0);
    const posSum = list.reduce((s, r) => s + r.posSum, 0);
    const top = [...list].sort((a, b) => b.impressions - a.impressions)[0];
    const share = impressions ? top.impressions / impressions : 0;
    const topPos = top.impressions ? top.posSum / top.impressions : 99;
    // La mejor colocada de las que se ven (para «sin página clara»): posición más baja entre las que tienen ≥ 20 % de impresiones.
    const best = [...list].filter((r) => r.impressions >= impressions * 0.2 && r.impressions > 0).sort((a, b) => a.posSum / a.impressions - b.posSum / b.impressions)[0] ?? top;
    out.push({
      query,
      clicks,
      impressions,
      position: impressions ? posSum / impressions : null,
      clicksRecent: list.reduce((s, r) => s + r.clicksRecent, 0),
      clicksPrev: list.reduce((s, r) => s + r.clicksPrev, 0),
      dominant: share >= DOMINANT_SHARE && topPos <= MAX_POSITION ? top.page : null,
      share,
      topPage: best.page,
      topPos: best.impressions ? best.posSum / best.impressions : 99
    });
  }
  return out.sort((a, b) => b.impressions - a.impressions);
}

const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'con', 'para', 'por', 'a', 'al', 'un', 'una', 'que', 'como', 'mi', 'tu', 'se']);
/** Singular sencillo: «-es» solo tras l, r, n, d o j («industriales» → «industrial», «pintores» → «pintor»); si no, «-s» («naves» → «nave»). */
export const singular = (w: string) => (/[lrndj]es$/.test(w) ? w.slice(0, -2) : w.replace(/s$/, ''));
export const tokens = (q: string) => new Set(normText(q).split(' ').filter((w) => w.length >= 3 && !STOP.has(w)).map(singular));

/** Grupos por palabras compartidas (Jaccard ≥ umbral), con unión de conjuntos. Para cuando no hay embeddings. */
export function lexicalGroups(queries: string[], threshold = 0.5): string[][] {
  const toks = queries.map(tokens);
  const parent = queries.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < queries.length; i++) {
    for (let j = i + 1; j < queries.length; j++) {
      const a = toks[i];
      const b = toks[j];
      if (!a.size || !b.size) continue;
      let inter = 0;
      for (const t of a) if (b.has(t)) inter++;
      if (inter / (a.size + b.size - inter) >= threshold) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, string[]>();
  queries.forEach((q, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), q]));
  return [...groups.values()];
}

function metricsOf(qs: QueryStat[], brandTokens: string[]): TopicMetrics {
  const clics = qs.reduce((s, q) => s + q.clicks, 0);
  const impresiones = qs.reduce((s, q) => s + q.impressions, 0);
  const pos = impresiones ? qs.reduce((s, q) => s + (q.position ?? 0) * q.impressions, 0) / impresiones : null;
  const recent = qs.reduce((s, q) => s + q.clicksRecent, 0);
  const prev = qs.reduce((s, q) => s + q.clicksPrev, 0);
  return {
    clics,
    impresiones,
    posicion: pos !== null ? Math.round(pos * 10) / 10 : null,
    ctr: impresiones ? Math.round((clics / impresiones) * 1000) / 10 : null,
    tendenciaPct: prev >= 5 ? Math.round(((recent - prev) / prev) * 100) : null,
    consultas: qs.length,
    marca: brandTokens.length ? qs.filter((q) => isBrandQuery(q.query, brandTokens)).length : 0
  };
}

/**
 * Temas del proyecto. «similar» agrupa las consultas sin página clara (por defecto, por palabras). Devuelve los temas
 * ordenados por impresiones; los de una sola consulta sin página y con pocas impresiones se descartan (ruido).
 */
export function buildTopics(stats: QueryStat[], opts: { brandTokens?: string[]; similar?: (queries: string[]) => string[][] } = {}): TopicDraft[] {
  const brand = opts.brandTokens ?? [];
  const topics: TopicDraft[] = [];
  const byPage = new Map<string, QueryStat[]>();
  const pool: QueryStat[] = [];
  const brandPool: QueryStat[] = [];
  for (const q of stats) {
    if (q.dominant) byPage.set(q.dominant, [...(byPage.get(q.dominant) ?? []), q]);
    else if (brand.length && isBrandQuery(q.query, brand)) brandPool.push(q);
    else pool.push(q);
  }
  for (const [url, qs] of byPage) {
    topics.push({ topicKey: `p:${sha(url).slice(0, 16)}`, name: qs[0].query, url, origin: 'pagina', queries: qs, metrics: metricsOf(qs, brand) });
  }
  // Marca sin página clara: a la página que más impresiones se lleva de esas búsquedas (casi siempre la portada).
  if (brandPool.length) {
    const byTop = new Map<string, number>();
    for (const q of brandPool) byTop.set(q.topPage, (byTop.get(q.topPage) ?? 0) + q.impressions);
    const url = [...byTop.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const existing = topics.find((t) => t.url === url);
    if (existing) {
      existing.queries = [...existing.queries, ...brandPool].sort((a, b) => b.impressions - a.impressions);
      existing.metrics = metricsOf(existing.queries, brand);
    } else {
      const qs = [...brandPool].sort((a, b) => b.impressions - a.impressions);
      topics.push({ topicKey: `p:${sha(url).slice(0, 16)}`, name: qs[0].query, url, origin: 'pagina', queries: qs, metrics: metricsOf(qs, brand) });
    }
  }
  for (const t of topics) if (t.metrics.marca > 0 && t.metrics.marca >= t.queries.length / 2) t.metrics.esMarca = 1;
  const groups = (opts.similar ?? ((q) => lexicalGroups(q)))(pool.map((q) => q.query));
  const byQuery = new Map(pool.map((q) => [q.query, q]));
  for (const g of groups) {
    const qs = g.map((x) => byQuery.get(x)).filter((x): x is QueryStat => Boolean(x)).sort((a, b) => b.impressions - a.impressions);
    if (!qs.length) continue;
    if (qs.length === 1 && qs[0].impressions < 50) continue;
    const key = qs
      .slice(0, 3)
      .map((q) => normText(q.query))
      .sort()
      .join('|');
    const metrics = metricsOf(qs, brand);
    // ¿Hay ya alguna página de la web en el top 20 para estas búsquedas? Entonces se refuerza esa, no se crea otra.
    const cand = new Map<string, { impr: number; posw: number }>();
    for (const q of qs) {
      if (q.topPos > CANDIDATE_MAX_POSITION) continue;
      const c = cand.get(q.topPage) ?? { impr: 0, posw: 0 };
      c.impr += q.impressions;
      c.posw += q.topPos * q.impressions;
      cand.set(q.topPage, c);
    }
    const best = [...cand.entries()].sort((a, b) => b[1].impr - a[1].impr)[0];
    if (best) {
      metrics.candidata = best[0];
      metrics.candidataPos = Math.round((best[1].posw / best[1].impr) * 10) / 10;
    }
    topics.push({ topicKey: `q:${sha(key).slice(0, 16)}`, name: qs[0].query, url: null, origin: 'parecido', queries: qs, metrics });
  }
  return topics.sort((a, b) => b.metrics.impresiones - a.metrics.impresiones);
}

export type WeekRow = { query: string; page: string; week: string; impressions: number; posSum: number };

/**
 * Canibalización con señal temporal: consultas con al menos 2 páginas que encabezan semanas distintas (la que más
 * impresiones tiene esa semana, en el top 20), con un cambio de líder al menos 2 veces. Devuelve consulta y páginas.
 */
export function cannibalization(rows: WeekRow[], minImpressions = 50): { query: string; pages: string[]; switches: number; weeks: number }[] {
  const byQuery = new Map<string, WeekRow[]>();
  for (const r of rows) byQuery.set(r.query, [...(byQuery.get(r.query) ?? []), r]);
  const out: { query: string; pages: string[]; switches: number; weeks: number }[] = [];
  for (const [query, list] of byQuery) {
    if (list.reduce((s, r) => s + r.impressions, 0) < minImpressions) continue;
    const weeks = [...new Set(list.map((r) => r.week))].sort();
    const leaders: string[] = [];
    for (const w of weeks) {
      const top = list.filter((r) => r.week === w && r.impressions > 0 && r.posSum / r.impressions <= 20).sort((a, b) => b.impressions - a.impressions)[0];
      if (top) leaders.push(top.page);
    }
    let switches = 0;
    for (let i = 1; i < leaders.length; i++) if (leaders[i] !== leaders[i - 1]) switches++;
    const pages = [...new Set(leaders)];
    if (pages.length >= 2 && switches >= 2) out.push({ query, pages, switches, weeks: leaders.length });
  }
  return out.sort((a, b) => b.switches - a.switches);
}

/** Parte de los clics sin consulta conocida (Search Console oculta las consultas poco frecuentes). */
export function anonymousShare(totalClicks: number, queryClicks: number): number | null {
  if (totalClicks <= 0) return null;
  return Math.max(0, Math.min(1, 1 - queryClicks / totalClicks));
}

// --- Oportunidades, valor y temporada (26 nov 2026) ------------------------------------------------------------------

/** CTR orgánico esperado por posición (aproximado y prudente; con resúmenes de IA en la búsqueda suele ser menor). */
const EXPECTED_CTR = [0, 0.27, 0.15, 0.1, 0.07, 0.055, 0.045, 0.035, 0.03, 0.025, 0.02];
export const expectedCtr = (pos: number): number => (pos < 1 ? EXPECTED_CTR[1] : pos > 10 ? 0.01 : EXPECTED_CTR[Math.round(pos)]);

export const OPP = {
  /** Impresiones mínimas (90 días) para que un tema sin página entre en el plan. */
  topicMinImpressions: 300,
  /** Tema «página nueva» importante desde aquí. */
  topicImportantImpressions: 2000,
  strikingFrom: 4,
  strikingTo: 15,
  strikingMinImpressions: 100,
  lowCtrMinImpressions: 300,
  /** CTR por debajo de esta fracción del esperado para su posición. */
  lowCtrRatio: 0.5,
  maxStriking: 60,
  maxLowCtr: 40
} as const;

/** Clics al mes (90 días → mes) que se ganarían pasando de un CTR a otro. */
const perMonth = (impressions: number, gain: number) => Math.max(0, Math.round((impressions * gain) / 3));

export type Opportunity = {
  kind: 'seo.topic_new_page' | 'seo.topic_unclear_page' | 'seo.striking_distance' | 'seo.low_ctr';
  dedupeKey: string;
  severity: 'aviso' | 'importante';
  url: string | null;
  query: string;
  impressions: number;
  /** Clics al mes que se podrían ganar. */
  gain: number;
  valor: number | null;
  evidence: Record<string, unknown>;
};

/** Valor de negocio de un tema con lo que sabemos del cliente (servicios en orden de prioridad, lo que no quiere, lo que más le interesa). */
export type ValueContext = { services: string[]; avoid: string[]; prefer: string[] };

const sigTokens = (text: string) => [...tokens(text)].filter((t) => t.length >= 4);

export function topicValue(t: Pick<TopicDraft, 'name' | 'queries' | 'metrics'>, ctx: ValueContext): { valor: number | null; servicio: string | null; aviso: string | null } {
  if (t.metrics.esMarca) return { valor: null, servicio: null, aviso: null };
  const qTok = new Set<string>();
  for (const q of [t.name, ...t.queries.slice(0, 10).map((x) => x.query)]) for (const w of tokens(q)) qTok.add(w);
  // ¿Se parece a algo que el cliente dijo que no quiere? (palabras de al menos 4 letras en común)
  for (const a of ctx.avoid) {
    const hit = sigTokens(a).find((w) => qTok.has(w));
    if (hit) return { valor: 0.5, servicio: null, aviso: `Puede ser lo que el cliente dijo que no quiere: «${a.slice(0, 120)}»` };
  }
  if (!ctx.services.length) return { valor: null, servicio: null, aviso: null };
  let valor = 1;
  let servicio: string | null = null;
  // El servicio que mejor encaja (más palabras suyas en las búsquedas; a igualdad, el más prioritario). «Reforma» y
  // «reformar», o «industrial» e «industriales», cuentan como la misma palabra (raíz común de 6 letras).
  const has = (w: string) => qTok.has(w) || [...qTok].some((x) => x.length >= 6 && w.length >= 6 && x.slice(0, 6) === w.slice(0, 6));
  let bestRatio = 0;
  for (let i = 0; i < ctx.services.length; i++) {
    const st = [...tokens(ctx.services[i])];
    if (!st.length) continue;
    const ratio = st.filter(has).length / st.length;
    if (ratio >= 0.5 && ratio > bestRatio) {
      bestRatio = ratio;
      valor = i === 0 ? 3 : i === 1 ? 2.5 : 2;
      servicio = ctx.services[i];
    }
  }
  if (ctx.prefer.some((p) => sigTokens(p).some((w) => qTok.has(w)))) valor = Math.min(3, valor + 0.5);
  return { valor, servicio, aviso: null };
}

/**
 * Oportunidades del mapa (salen como hallazgos y van al plan). Nunca de la marca ni de lo que se parece a lo que el
 * cliente no quiere (eso se avisa en el tema, pero no se propone trabajo).
 */
export function opportunities(topics: TopicDraft[], stats: QueryStat[], brand: string[]): Opportunity[] {
  const out: Opportunity[] = [];
  for (const t of topics) {
    const m = t.metrics;
    if (t.url || m.esMarca || m.valor === 0.5 || m.impresiones < OPP.topicMinImpressions) continue;
    const ctrNow = m.impresiones ? m.clics / m.impresiones : 0;
    if (m.candidata) {
      const gain = perMonth(m.impresiones, Math.max(0, expectedCtr(3) - ctrNow));
      out.push({ kind: 'seo.topic_unclear_page', dedupeKey: `seo.topic_unclear_page:${t.topicKey}`, severity: m.impresiones >= OPP.topicImportantImpressions ? 'importante' : 'aviso', url: m.candidata, query: t.name, impressions: m.impresiones, gain, valor: m.valor ?? null, evidence: { tema: t.name, busquedas: t.queries.slice(0, 8).map((q) => q.query), candidata: m.candidata, posicion: m.candidataPos, impresiones: m.impresiones, clicsMes: gain, valor: m.valor ?? null, servicio: m.servicio ?? null } });
    } else {
      const gain = perMonth(m.impresiones, Math.max(0, expectedCtr(5) - ctrNow));
      out.push({ kind: 'seo.topic_new_page', dedupeKey: `seo.topic_new_page:${t.topicKey}`, severity: m.impresiones >= OPP.topicImportantImpressions ? 'importante' : 'aviso', url: null, query: t.name, impressions: m.impresiones, gain, valor: m.valor ?? null, evidence: { tema: t.name, busquedas: t.queries.slice(0, 8).map((q) => q.query), impresiones: m.impresiones, posicion: m.posicion, clicsMes: gain, valor: m.valor ?? null, servicio: m.servicio ?? null } });
    }
  }
  // Valor de cada búsqueda = el de su tema.
  const valueOf = new Map<string, number | null>();
  const serviceOf = new Map<string, string | null>();
  for (const t of topics)
    for (const q of t.queries) {
      valueOf.set(q.query, t.metrics.valor === undefined ? null : t.metrics.valor);
      serviceOf.set(q.query, t.metrics.servicio ?? null);
    }
  const striking: Opportunity[] = [];
  for (const q of stats) {
    // Solo con página clara: si Google reparte la búsqueda entre varias, ya va en «elegir y reforzar una página».
    if (!q.dominant || q.position === null || q.position < OPP.strikingFrom || q.position > OPP.strikingTo || q.impressions < OPP.strikingMinImpressions) continue;
    if ((brand.length && isBrandQuery(q.query, brand)) || valueOf.get(q.query) === 0.5) continue;
    const gain = perMonth(q.impressions, expectedCtr(3) - expectedCtr(q.position));
    if (gain <= 0) continue;
    striking.push({ kind: 'seo.striking_distance', dedupeKey: `seo.striking_distance:${queryHash(q.query).slice(0, 16)}`, severity: 'aviso', url: q.dominant, query: q.query, impressions: q.impressions, gain, valor: valueOf.get(q.query) ?? null, evidence: { posicion: Math.round(q.position * 10) / 10, impresiones: q.impressions, clics: q.clicks, clicsMes: gain, valor: valueOf.get(q.query) ?? null, servicio: serviceOf.get(q.query) ?? null } });
  }
  out.push(...striking.sort((a, b) => b.gain - a.gain).slice(0, OPP.maxStriking));
  // CTR bajo por página (top 10), sin las búsquedas de marca: el título o la descripción no atraen el clic.
  const byPage = new Map<string, { clicks: number; impressions: number; posw: number; top: string; topImpr: number }>();
  for (const q of stats) {
    if (!q.dominant || q.position === null || (brand.length && isBrandQuery(q.query, brand))) continue;
    const p = byPage.get(q.dominant) ?? { clicks: 0, impressions: 0, posw: 0, top: q.query, topImpr: 0 };
    p.clicks += q.clicks;
    p.impressions += q.impressions;
    p.posw += q.position * q.impressions;
    if (q.impressions > p.topImpr) {
      p.top = q.query;
      p.topImpr = q.impressions;
    }
    byPage.set(q.dominant, p);
  }
  const low: Opportunity[] = [];
  for (const [url, p] of byPage) {
    const pos = p.posw / p.impressions;
    if (pos > 10 || p.impressions < OPP.lowCtrMinImpressions) continue;
    const ctr = p.clicks / p.impressions;
    const exp = expectedCtr(pos);
    if (ctr >= exp * OPP.lowCtrRatio) continue;
    const gain = perMonth(p.impressions, exp - ctr);
    low.push({ kind: 'seo.low_ctr', dedupeKey: `seo.low_ctr:${sha(url).slice(0, 16)}`, severity: 'aviso', url, query: p.top, impressions: p.impressions, gain, valor: valueOf.get(p.top) ?? null, evidence: { posicion: Math.round(pos * 10) / 10, ctr: Math.round(ctr * 1000) / 10, ctrEsperado: Math.round(exp * 1000) / 10, impresiones: p.impressions, clicsMes: gain, valor: valueOf.get(p.top) ?? null, servicio: serviceOf.get(p.top) ?? null } });
  }
  out.push(...low.sort((a, b) => b.gain - a.gain).slice(0, OPP.maxLowCtr));
  return out;
}

/** Clics al mes que se podrían ganar en un tema (para ordenar la pantalla). */
export function topicGain(t: TopicDraft): number {
  const m = t.metrics;
  if (m.esMarca || !m.impresiones || m.valor === 0.5) return 0;
  const ctrNow = m.clics / m.impresiones;
  if (!t.url) return perMonth(m.impresiones, Math.max(0, (m.candidata ? expectedCtr(3) : expectedCtr(5)) - ctrNow));
  const pos = m.posicion ?? 99;
  if (pos <= 3) return perMonth(m.impresiones, Math.max(0, expectedCtr(pos) - ctrNow));
  return perMonth(m.impresiones, Math.max(0, expectedCtr(3) - Math.max(ctrNow, expectedCtr(pos))));
}

export type MonthRow = { query: string; month: string; clicks: number; impressions: number };
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * Temporada de un tema con los datos mensuales (último mes completo hacia atrás). Con 12 meses: los meses fuertes (más
 * de un 25 % por encima de la media). Con 15: clics de los 3 últimos meses frente a los mismos del año anterior.
 */
export function seasonality(queries: string[], rows: MonthRow[], lastMonth: string): { interanualPct: number | null; mesesFuertes: string | null } {
  const set = new Set(queries);
  const byMonth = new Map<string, { c: number; i: number }>();
  for (const r of rows) {
    if (!set.has(r.query) || r.month > lastMonth) continue;
    const m = byMonth.get(r.month) ?? { c: 0, i: 0 };
    m.c += r.clicks;
    m.i += r.impressions;
    byMonth.set(r.month, m);
  }
  const back = (n: number) => {
    const d = new Date(`${lastMonth.slice(0, 7)}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - n);
    return d.toISOString().slice(0, 7) + '-01';
  };
  const last12 = Array.from({ length: 12 }, (_, i) => back(i));
  let mesesFuertes: string | null = null;
  if (last12.every((m) => byMonth.has(m))) {
    const vals = last12.map((m) => byMonth.get(m)!.i);
    const avg = vals.reduce((a, b) => a + b, 0) / 12;
    const strong = last12.filter((m) => byMonth.get(m)!.i > avg * 1.25).map((m) => Number(m.slice(5, 7)) - 1).sort((a, b) => a - b);
    if (avg >= 30 && strong.length && strong.length <= 6) mesesFuertes = strong.map((i) => MONTHS[i]).join(', ');
  }
  let interanualPct: number | null = null;
  const now3 = [0, 1, 2].map(back);
  const prev3 = [12, 13, 14].map(back);
  if (prev3.every((m) => byMonth.has(m))) {
    const a = now3.reduce((s, m) => s + (byMonth.get(m)?.c ?? 0), 0);
    const b = prev3.reduce((s, m) => s + (byMonth.get(m)?.c ?? 0), 0);
    if (b >= 10) interanualPct = Math.round(((a - b) / b) * 100);
  }
  return { interanualPct, mesesFuertes };
}

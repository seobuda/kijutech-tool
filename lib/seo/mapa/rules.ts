// SEO · Mapa de palabras: reglas PURAS (Hito 2, 24 nov 2026; docs/DISENO-TECNICO-HITO2.md §2). Sin IA.
//   1. Cada consulta va al tema de la página que Google más le muestra (su «página dominante»), si es clara: con al
//      menos el 60 % de sus impresiones y en posición media ≤ 30. Así el tema es lo que Google ya decide.
//   2. Las consultas sin página clara se agrupan por parecido: con embeddings si hay (HDBSCAN, fuera de aquí) o, si no,
//      por palabras compartidas (Jaccard ≥ 0,5). Esos temas no tienen URL: piden una página nueva.
//   3. Canibalización con señal temporal: una consulta con ≥ 2 páginas que se turnan el primer puesto semana a semana.
//   4. Clics anónimos: la parte de los clics que Search Console no atribuye a ninguna consulta.
import { createHash } from 'crypto';
import { isBrandQuery, normText } from '@/lib/seo/expediente/rules';

export type QueryPageRow = { query: string; page: string; clicks: number; impressions: number; posSum: number; clicksRecent: number; clicksPrev: number };
export type QueryStat = { query: string; clicks: number; impressions: number; position: number | null; clicksRecent: number; clicksPrev: number; dominant: string | null; share: number };
export type TopicDraft = {
  topicKey: string;
  name: string;
  url: string | null;
  origin: 'pagina' | 'parecido';
  queries: QueryStat[];
  metrics: { clics: number; impresiones: number; posicion: number | null; ctr: number | null; tendenciaPct: number | null; consultas: number; marca: number };
};

export const MIN_IMPRESSIONS = 10;
export const DOMINANT_SHARE = 0.6;
export const MAX_POSITION = 30;

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
    out.push({
      query,
      clicks,
      impressions,
      position: impressions ? posSum / impressions : null,
      clicksRecent: list.reduce((s, r) => s + r.clicksRecent, 0),
      clicksPrev: list.reduce((s, r) => s + r.clicksPrev, 0),
      dominant: share >= DOMINANT_SHARE && topPos <= MAX_POSITION ? top.page : null,
      share
    });
  }
  return out.sort((a, b) => b.impressions - a.impressions);
}

const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'en', 'con', 'para', 'por', 'a', 'al', 'un', 'una', 'que', 'como', 'mi', 'tu', 'se']);
export const tokens = (q: string) => new Set(normText(q).split(' ').filter((w) => w.length >= 3 && !STOP.has(w)).map((w) => w.replace(/(es|s)$/, '')));

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

function metricsOf(qs: QueryStat[], brandTokens: string[]): TopicDraft['metrics'] {
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
  for (const q of stats) {
    if (q.dominant) byPage.set(q.dominant, [...(byPage.get(q.dominant) ?? []), q]);
    else pool.push(q);
  }
  for (const [url, qs] of byPage) {
    topics.push({ topicKey: `p:${sha(url).slice(0, 16)}`, name: qs[0].query, url, origin: 'pagina', queries: qs, metrics: metricsOf(qs, brand) });
  }
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
    topics.push({ topicKey: `q:${sha(key).slice(0, 16)}`, name: qs[0].query, url: null, origin: 'parecido', queries: qs, metrics: metricsOf(qs, brand) });
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

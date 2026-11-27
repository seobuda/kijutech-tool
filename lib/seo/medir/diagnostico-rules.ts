// SEO · Diagnóstico de caídas en capas (parte 8; docs/DISENO-SEO-MEDIR.md con la auditoría Opus). Reglas PURAS: ¿hay caída
// (con histéresis) y qué capas tienen evidencia que empezó cerca de la caída? La demanda va primero: si cae la demanda, lo
// demás es coincidencia. Sin IA: textos con plantillas.

export const DIAG_SOURCE = 'seo.vigilancia:diagnostico';
export const DIAG_KIND = 'seo.traffic_drop_diagnosed';
export const MIN_BASE_CLICKS = 200;

export type Totals = { clicks: number; impressions: number };
/** ¿Abrir (−20 % frente al mes anterior Y frente al año anterior si hay) o mantener abierto (sigue peor que −10 %)? */
export function dropState(cur: Totals, prev: Totals, yoy: Totals | null, isOpen: boolean): { drop: boolean; pct: number; yoyPct: number | null } {
  const pct = prev.clicks > 0 ? cur.clicks / prev.clicks - 1 : 0;
  const yoyPct = yoy && yoy.clicks > 0 ? cur.clicks / yoy.clicks - 1 : null;
  if (prev.clicks < MIN_BASE_CLICKS) return { drop: false, pct, yoyPct };
  const lim = isOpen ? -0.1 : -0.2;
  const drop = pct <= lim && (yoyPct === null || yoyPct <= lim);
  return { drop, pct, yoyPct };
}

export type Layer = { capa: 'demanda' | 'tecnica' | 'indexacion' | 'cambios' | 'posiciones' | 'ctr'; texto: string; datos?: Record<string, unknown> };
export type LayerInput = {
  cur: Totals;
  prev: Totals;
  yoy: Totals | null;
  /** Hallazgos abiertos que empezaron cerca de la caída, por tipo. */
  recentFindings: { kind: string; url: string | null }[];
  /** Cambios registrados en la ventana, por campo. */
  changes: Record<string, number>;
};
const pctTxt = (x: number) => `${x > 0 ? '+' : ''}${Math.round(x * 100)} %`;
const TECH = ['seo.site_down', 'seo.home_error', 'seo.home_noindex', 'seo.robots_block_all', 'seo.money_page_changed', 'seo.page_regressed', 'seo.hacked_queries', 'seo.hacked_pages', 'seo.ssl_expiring', 'seo.http_5xx'];
const INDEX = ['seo.not_indexed', 'seo.noindex_in_sitemap', 'seo.canonical_other'];
const RANK = ['seo.rank_drop', 'seo.lost_local_pack', 'seo.geogrid_drop'];

/** Capas con evidencia, en orden (la demanda primero). */
export function diagnoseLayers(i: LayerInput): Layer[] {
  const out: Layer[] = [];
  const impPct = i.prev.impressions > 0 ? i.cur.impressions / i.prev.impressions - 1 : 0;
  const impYoy = i.yoy && i.yoy.impressions > 0 ? i.cur.impressions / i.yoy.impressions - 1 : null;
  const clkPct = i.prev.clicks > 0 ? i.cur.clicks / i.prev.clicks - 1 : 0;
  if (impYoy !== null ? impYoy <= -0.15 && impPct <= -0.15 : impPct <= -0.25) out.push({ capa: 'demanda', texto: `Se ve menos en Google: impresiones ${pctTxt(impPct)} frente al mes anterior${impYoy !== null ? ` y ${pctTxt(impYoy)} frente al año anterior` : ''}. Puede ser menos demanda (temporada) o peores posiciones.`, datos: { impPct, impYoy } });
  const by = (kinds: string[]) => i.recentFindings.filter((f) => kinds.includes(f.kind));
  const t = by(TECH);
  if (t.length) out.push({ capa: 'tecnica', texto: `Hay problemas técnicos recientes (${[...new Set(t.map((f) => f.kind.replace('seo.', '')))].join(', ')}): revisarlos primero.`, datos: { hallazgos: t.slice(0, 10) } });
  const ix = by(INDEX);
  const noidx = i.changes.indexable ?? 0;
  if (ix.length || noidx) out.push({ capa: 'indexacion', texto: `Indexación: ${ix.length} aviso(s) reciente(s)${noidx ? ` y ${noidx} página(s) que cambiaron de indexable` : ''}.`, datos: { hallazgos: ix.slice(0, 10), cambios: noidx } });
  const ch = Object.entries(i.changes).filter(([f, n]) => n > 0 && f !== 'indexable');
  if (ch.length) out.push({ capa: 'cambios', texto: `Cambios en la web en esas semanas: ${ch.map(([f, n]) => `${f} (${n})`).join(', ')}. Ver «Cambios en la web» en Salud.`, datos: Object.fromEntries(ch) });
  const r = by(RANK);
  if (r.length) out.push({ capa: 'posiciones', texto: `Posiciones: ${r.length} búsqueda(s) seguidas cayeron del top 10 o del mapa.`, datos: { hallazgos: r.slice(0, 10) } });
  if (impPct > -0.1 && clkPct <= -0.2) out.push({ capa: 'ctr', texto: `Se ve igual pero se pincha menos (clics ${pctTxt(clkPct)} con impresiones ${pctTxt(impPct)}): puede ser un resumen de IA (AI Overview), anuncios nuevos o un cambio de título.`, datos: { clkPct, impPct } });
  return out;
}

/** Semana (lunes, ISO) de una fecha: identifica el episodio. */
export function weekKey(d: string): string {
  const x = new Date(`${d}T00:00:00Z`);
  const dow = (x.getUTCDay() + 6) % 7;
  return new Date(x.getTime() - dow * 86_400_000).toISOString().slice(0, 10);
}

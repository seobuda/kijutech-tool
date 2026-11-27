// Núcleo: tendencias por técnica entre clientes (SEO parte 11, 27 nov 2026; docs/DISENO-SEO-ORQUESTAR.md con la auditoría
// Opus). Reglas PURAS: elegir un punto de control por intervención, media por cliente y combinación entre clientes con
// efectos aleatorios (DerSimonian-Laird), etiqueta honesta («pocos casos», «tendencia», «aprendizaje») y el factor del plan.

export type CheckpointLite = { days: number; valid?: boolean; effectLog?: number; se?: number; metric?: string; clicksEffectLog?: number; clicksSe?: number; clicksValid?: boolean; confounders?: string[] };
export type InterventionLite = { id: string; clientId: string; technique: string; taxonomyVersion: number; source: string; windowDays: number; checkpoints: CheckpointLite[] };

/** El punto de control que cuenta: el primero ≥ la ventana de la hipótesis (si aún no está medido, ninguno). */
export function pickCheckpoint(i: InterventionLite): CheckpointLite | null {
  const sorted = [...i.checkpoints].sort((a, b) => a.days - b.days);
  const target = [28, 56, 90].find((d) => d >= i.windowDays) ?? 90;
  return sorted.find((c) => c.days === target) ?? null;
}

const SE_FLOOR = 0.05;
type Obs = { y: number; v: number };
/** Combinación con efectos aleatorios (DerSimonian-Laird). */
export function randomEffects(obs: Obs[]): { mu: number; se: number; tau2: number } | null {
  if (!obs.length) return null;
  const w = obs.map((o) => 1 / o.v);
  const sw = w.reduce((a, b) => a + b, 0);
  const muF = obs.reduce((a, o, i) => a + w[i] * o.y, 0) / sw;
  const q = obs.reduce((a, o, i) => a + w[i] * (o.y - muF) ** 2, 0);
  const c = sw - w.reduce((a, b) => a + b * b, 0) / sw;
  const tau2 = obs.length > 1 && c > 0 ? Math.max(0, (q - (obs.length - 1)) / c) : 0;
  const ws = obs.map((o) => 1 / (o.v + tau2));
  const sws = ws.reduce((a, b) => a + b, 0);
  return { mu: obs.reduce((a, o, i) => a + ws[i] * o.y, 0) / sws, se: Math.sqrt(1 / sws), tau2 };
}

export type Trend = { technique: string; metric: string; taxonomyVersion: number; n: number; clients: number; funciono: number; effectPct: number | null; lowPct: number | null; highPct: number | null; label: 'pocos casos' | 'tendencia' | 'aprendizaje'; clicksEffectLog: number | null; clicksSe: number | null; clicksN: number; clicksClients: number };
const pct = (x: number) => Math.round((Math.exp(x) - 1) * 1000) / 10;
/** t de Student al 95 % (dos colas) para k grupos (k − 1 grados de libertad); 1,96 con muchos. */
const T95 = [12.71, 4.3, 3.18, 2.78, 2.57, 2.45, 2.36, 2.31, 2.26, 2.23, 2.2, 2.18, 2.16, 2.14, 2.13, 2.12, 2.11, 2.1, 2.09, 2.09];
const tCrit = (k: number) => (k <= 1 ? T95[0] : k - 2 < T95.length ? T95[k - 2] : 1.96);

/** Agrega por técnica + métrica + versión: un punto por intervención, válido, sin solapes ni Estrategia; media por cliente. */
export function techniqueTrends(list: InterventionLite[]): Trend[] {
  type Row = { i: InterventionLite; c: CheckpointLite };
  const rows: Row[] = [];
  for (const i of list) {
    if (i.source === 'estrategia') continue;
    const c = pickCheckpoint(i);
    if (!c || !c.valid || (c.confounders?.length ?? 0) > 0 || typeof c.effectLog !== 'number') continue;
    rows.push({ i, c });
  }
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const k = `${r.i.technique}|${r.c.metric ?? ''}|${r.i.taxonomyVersion}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const out: Trend[] = [];
  for (const [k, g] of groups) {
    const [technique, metric, ver] = k.split('|');
    const perClient = (pick: (r: Row) => { y: number; se: number } | null): Obs[] => {
      const byClient = new Map<string, { y: number; se: number }[]>();
      for (const r of g) {
        const o = pick(r);
        if (o) byClient.set(r.i.clientId, [...(byClient.get(r.i.clientId) ?? []), o]);
      }
      // Media por cliente (comparten web y control: no son independientes).
      return [...byClient.values()].map((os) => {
        const y = os.reduce((a, o) => a + o.y, 0) / os.length;
        // Sin dividir por n: las intervenciones de un cliente no son independientes (no premia a quien tiene más).
        const v = os.reduce((a, o) => a + Math.max(SE_FLOOR, o.se) ** 2, 0) / os.length;
        return { y, v };
      });
    };
    const main = randomEffects(perClient((r) => ({ y: r.c.effectLog!, se: r.c.se ?? SE_FLOOR })));
    const clkRows = g.filter((r) => r.c.clicksValid && typeof r.c.clicksEffectLog === 'number');
    const clk = randomEffects(perClient((r) => (r.c.clicksValid && typeof r.c.clicksEffectLog === 'number' ? { y: r.c.clicksEffectLog, se: r.c.clicksSe ?? SE_FLOOR } : null)));
    const clients = new Set(g.map((r) => r.i.clientId)).size;
    const n = g.length;
    const label = n < 5 ? 'pocos casos' : n >= 50 && clients >= 10 ? 'aprendizaje' : 'tendencia';
    out.push({
      technique,
      metric,
      taxonomyVersion: Number(ver),
      n,
      clients,
      funciono: g.filter((r) => (r.c.effectLog ?? 0) > Math.log(1.15) && (r.c.effectLog ?? 0) / Math.max(SE_FLOOR, r.c.se ?? SE_FLOOR) >= 2).length,
      effectPct: main ? pct(main.mu) : null,
      // Intervalo del efecto medio (con t de Student si hay pocos clientes).
      lowPct: main ? pct(main.mu - tCrit(clients) * main.se) : null,
      highPct: main ? pct(main.mu + tCrit(clients) * main.se) : null,
      label,
      clicksEffectLog: clk ? clk.mu : null,
      clicksSe: clk ? clk.se : null,
      clicksN: clkRows.length,
      clicksClients: new Set(clkRows.map((r) => r.i.clientId)).size
    });
  }
  return out.sort((a, b) => b.n - a.n);
}

/** Técnicas que nacen de un mal dato (caída, CTR bajo): su mejora posterior se infla (regresión a la media). */
export const TRIGGERED_BY_DROP = new Set(['titulo_reescrito', 'meta_descripcion', 'recuperar_pagina', 'contenido_actualizado', 'optimizar_al_alcance']);

/**
 * Factor del plan por técnica: solo con «aprendizaje», en clics, centrado en la media de esas técnicas y acotado a
 * [0,8, 1,25]. Sin aprendizaje (lo normal durante meses), 1. Solo ordena dentro de cada prioridad.
 */
export function planFactors(trends: Trend[]): Map<string, number> {
  // Una entrada por técnica (la de más casos de clics) y con los mínimos sobre los puntos de clics válidos.
  const best = new Map<string, Trend>();
  for (const t of trends) if (!best.has(t.technique) || t.clicksN > best.get(t.technique)!.clicksN) best.set(t.technique, t);
  const learned = [...best.values()].filter((t) => t.clicksN >= 50 && t.clicksClients >= 10 && t.clicksEffectLog !== null && !TRIGGERED_BY_DROP.has(t.technique));
  const out = new Map<string, number>();
  if (!learned.length) return out;
  const mean = learned.reduce((a, t) => a + t.clicksEffectLog!, 0) / learned.length;
  for (const t of learned) out.set(t.technique, Math.max(0.8, Math.min(1.25, Math.exp(t.clicksEffectLog! - mean))));
  return out;
}

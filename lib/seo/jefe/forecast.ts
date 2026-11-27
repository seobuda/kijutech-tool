// SEO · Jefe SEO, D1: pronóstico (docs/PLAN-SEO-JEFE.md §4). PURO: sin base de datos ni red; se prueba en
// tests/seo-jefe-d1.test.ts. Los números del pronóstico los calcula el CÓDIGO (la IA solo los explica): rango bajo-alto
// con supuestos escritos; sin base suficiente, «sin base para pronosticar». Nunca se manda al cliente como promesa.

/** CTR orgánico por posición (1-20) de referencia [NV: curva media del sector; se sustituye por la del proyecto si hay base]. */
export const DEFAULT_CTR: number[] = [0.28, 0.15, 0.1, 0.07, 0.05, 0.04, 0.03, 0.025, 0.02, 0.018, 0.012, 0.011, 0.01, 0.009, 0.008, 0.007, 0.006, 0.005, 0.005, 0.004];
export const MIN_IMPRESSIONS = 300;
export const MIN_CURVE_IMPRESSIONS = 5000;

export type CtrPoint = { position: number; impressions: number; clicks: number };

/**
 * Curva de CTR del propio proyecto (por posición redondeada, 1-10) si hay base: al menos MIN_CURVE_IMPRESSIONS en total y
 * 200 por punto; los puntos sin base se rellenan con la de referencia escalada por el cociente medio proyecto/referencia.
 */
export function projectCurve(points: CtrPoint[]): { curve: number[]; source: 'proyecto' | 'referencia' } {
  const total = points.reduce((a, p) => a + p.impressions, 0);
  if (total < MIN_CURVE_IMPRESSIONS) return { curve: DEFAULT_CTR, source: 'referencia' };
  const by = new Map<number, { i: number; c: number }>();
  for (const p of points) {
    const k = Math.min(20, Math.max(1, Math.round(p.position)));
    const e = by.get(k) ?? { i: 0, c: 0 };
    e.i += p.impressions;
    e.c += p.clicks;
    by.set(k, e);
  }
  const ratios: number[] = [];
  for (const [k, e] of by) if (e.i >= 200) ratios.push(e.c / e.i / DEFAULT_CTR[k - 1]);
  if (ratios.length < 3) return { curve: DEFAULT_CTR, source: 'referencia' };
  const m = ratios.sort((a, b) => a - b)[Math.floor(ratios.length / 2)];
  const curve = DEFAULT_CTR.map((ref, i) => {
    const e = by.get(i + 1);
    return e && e.i >= 200 ? e.c / e.i : ref * m;
  });
  return { curve, source: 'proyecto' };
}

const ctrAt = (curve: number[], pos: number) => curve[Math.min(20, Math.max(1, Math.round(pos))) - 1] ?? curve[19];

export type Forecast =
  | { kind: 'sin_base'; why: string }
  | { kind: 'rango'; lowClicksMonth: number; midClicksMonth: number; highClicksMonth: number; assumptions: string[] };

/**
 * Página o búsqueda que ya sale (cerca del top): clics/mes extra si pasa de su posición actual a una objetivo. Rango:
 * bajo = mitad del salto de posición; alto = llega al objetivo con la curva del proyecto ×1,2.
 */
export function forecastStriking(input: { impressions90: number; position: number; targetPosition?: number; curve?: number[]; curveSource?: string }): Forecast {
  const curve = input.curve ?? DEFAULT_CTR;
  if (input.impressions90 < MIN_IMPRESSIONS) return { kind: 'sin_base', why: `Menos de ${MIN_IMPRESSIONS} impresiones en 90 días.` };
  const target = Math.max(1, Math.min(input.targetPosition ?? 3, input.position));
  if (input.position <= target) return { kind: 'sin_base', why: 'Ya está en la posición objetivo o mejor.' };
  const impMonth = input.impressions90 / 3;
  const now = ctrAt(curve, input.position);
  const half = ctrAt(curve, (input.position + target) / 2);
  const goal = ctrAt(curve, target);
  const r = (x: number) => Math.max(0, Math.round(x));
  return {
    kind: 'rango',
    lowClicksMonth: r(impMonth * (half - now)),
    midClicksMonth: r(impMonth * (goal - now)),
    highClicksMonth: r(impMonth * (goal * 1.2 - now)),
    assumptions: [
      `Impresiones constantes (${Math.round(impMonth)} al mes, media de 90 días).`,
      `De la posición ${input.position.toFixed(1)} a la ${target}; el bajo supone llegar solo a mitad de camino.`,
      `CTR por posición: ${input.curveSource === 'proyecto' ? 'la curva del propio proyecto' : 'curva media de referencia [sin verificar para este sector]'}.`
    ]
  };
}

/** Contenido nuevo para una búsqueda con volumen: escenarios por posición alcanzada (pesimista 15, medio 8, optimista 4). */
export function forecastNewContent(input: { monthlyVolume: number | null; curve?: number[] }): Forecast {
  const curve = input.curve ?? DEFAULT_CTR;
  if (!input.monthlyVolume || input.monthlyVolume < 30) return { kind: 'sin_base', why: 'Sin volumen de búsqueda medido (o menos de 30 al mes).' };
  const v = input.monthlyVolume;
  const r = (x: number) => Math.max(0, Math.round(x));
  return {
    kind: 'rango',
    lowClicksMonth: r(v * ctrAt(curve, 15)),
    midClicksMonth: r(v * ctrAt(curve, 8)),
    highClicksMonth: r(v * ctrAt(curve, 4)),
    assumptions: [`Volumen de Google Ads: ${v} búsquedas al mes (aproximado).`, 'Escenarios si la página llega al puesto 15, 8 o 4 en 3-6 meses; puede no posicionar.', 'No incluye búsquedas relacionadas (suele haber más tráfico de cola larga).']
  };
}

export function forecastText(f: Forecast): string {
  return f.kind === 'sin_base' ? `sin base para pronosticar (${f.why})` : `+${f.lowClicksMonth}–${f.highClicksMonth} clics/mes (medio ${f.midClicksMonth})`;
}

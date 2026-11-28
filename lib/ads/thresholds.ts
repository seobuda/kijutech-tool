// Módulo Google Ads · umbrales de partida de las reglas del paso 2 (sin importaciones: lo usan también las pantallas del
// navegador, que no pueden cargar node:crypto). Editables en Ajustes dentro de sus límites; se guardan en ads_settings.state.

export type Thresholds = {
  /** Reglas 1 y 4: impresiones mínimas del mismo tramo en las 4 semanas anteriores para llamar «parada» a un cero. */
  paradaMinImpresiones: number;
  /** Regla 4: caída de impresiones frente al mismo día de la semana anterior (0,70 = −70 %) y suelo de impresiones. */
  caidaPct: number;
  caidaSueloImpresiones: number;
  /** Regla 4 desbocada: factor sobre lo típico a esta hora, sobre el presupuesto diario y acumulado de 3 días. */
  desbocadaFactorTipico: number;
  desbocadaFactorPresupuesto: number;
  desbocadaFactor3Dias: number;
  /** Suelo en moneda de la cuenta (por día) para no avisar de céntimos. */
  sueloMoneda: number;
  /** Regla 2: parte del gasto de la cuenta a partir de la cual un rechazo es interrupción. */
  rechazoPctInterrupcion: number;
  /** Regla 6: parte de los leads que aportaba lo pausado y días de pausa antes de avisar. */
  pausadoPct: number;
  pausadoDias: number;
  /** Regla 8: banda del ritmo (0,10 = ±10 %), día del mes desde el que se proyecta y hora del «agotado». */
  ritmoBanda: number;
  ritmoDesdeDia: number;
  agotadoHora: number;
  /** Regla 11: días hacia atrás de cambios ajenos que se miran. */
  cambioDias: number;
  /** Regla 12: conversiones mínimas en 8 semanas, umbral α y k por defecto de la binomial negativa. */
  medicionMinConversiones: number;
  medicionAlfa: number;
  medicionKDefecto: number;
};

export const DEFAULT_THRESHOLDS: Thresholds = {
  paradaMinImpresiones: 20,
  caidaPct: 0.7,
  caidaSueloImpresiones: 100,
  desbocadaFactorTipico: 1.5,
  desbocadaFactorPresupuesto: 1.5,
  desbocadaFactor3Dias: 1.3,
  sueloMoneda: 5,
  rechazoPctInterrupcion: 0.2,
  pausadoPct: 0.1,
  pausadoDias: 3,
  ritmoBanda: 0.1,
  ritmoDesdeDia: 5,
  agotadoHora: 14,
  cambioDias: 7,
  medicionMinConversiones: 30,
  medicionAlfa: 0.001,
  medicionKDefecto: 2
};

/** Límites de cada umbral editable en Ajustes (min, max) y su texto. */
export const THRESHOLD_LIMITS: Record<keyof Thresholds, { min: number; max: number; label: string }> = {
  paradaMinImpresiones: { min: 1, max: 10_000, label: 'Parada: impresiones mínimas del mismo tramo en 4 semanas' },
  caidaPct: { min: 0.3, max: 0.99, label: 'Parada: caída frente a la semana anterior (0,70 = −70 %)' },
  caidaSueloImpresiones: { min: 1, max: 100_000, label: 'Parada: suelo de impresiones de la semana anterior' },
  desbocadaFactorTipico: { min: 1.1, max: 10, label: 'Desbocada: veces lo típico a esta hora' },
  desbocadaFactorPresupuesto: { min: 1, max: 2, label: 'Desbocada: veces el presupuesto diario (sin conversiones)' },
  desbocadaFactor3Dias: { min: 1, max: 2, label: 'Desbocada: veces 3 días de presupuesto' },
  sueloMoneda: { min: 0, max: 10_000, label: 'Suelo de gasto por día (moneda de la cuenta)' },
  rechazoPctInterrupcion: { min: 0.01, max: 1, label: 'Rechazo: parte del gasto para avisar al momento' },
  pausadoPct: { min: 0.01, max: 1, label: 'Pausado: parte de los leads que aportaba' },
  pausadoDias: { min: 1, max: 30, label: 'Pausado: días de pausa antes de avisar' },
  ritmoBanda: { min: 0.02, max: 1, label: 'Ritmo: banda frente al presupuesto (0,10 = ±10 %)' },
  ritmoDesdeDia: { min: 1, max: 28, label: 'Ritmo: día del mes desde el que se proyecta' },
  agotadoHora: { min: 8, max: 22, label: 'Ritmo: «presupuesto agotado antes de las…» (hora)' },
  cambioDias: { min: 1, max: 29, label: 'Cambio ajeno: días hacia atrás' },
  medicionMinConversiones: { min: 5, max: 1000, label: 'Medición: conversiones mínimas en 8 semanas' },
  medicionAlfa: { min: 0.00001, max: 0.05, label: 'Medición: umbral α (probabilidad de un cero así en una cuenta sana)' },
  medicionKDefecto: { min: 0.5, max: 50, label: 'Medición: k por defecto (dispersión)' }
};

/** Umbrales guardados (parciales y quizá mal formados) → umbrales completos dentro de sus límites. */
export function mergeThresholds(saved: unknown): Thresholds {
  const out = { ...DEFAULT_THRESHOLDS };
  if (!saved || typeof saved !== 'object') return out;
  for (const k of Object.keys(DEFAULT_THRESHOLDS) as (keyof Thresholds)[]) {
    const v = Number((saved as Record<string, unknown>)[k]);
    const lim = THRESHOLD_LIMITS[k];
    if (Number.isFinite(v) && v >= lim.min && v <= lim.max) out[k] = v;
  }
  return out;
}

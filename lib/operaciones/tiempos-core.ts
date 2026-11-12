// Tiempos de tarea (paso 5B): cálculo PURO, sin base de datos ni IA, para poder probarlo.
// El tiempo es información para la persona y para el agente, no una nota: aquí no se puntúa la velocidad
// (ver docs/DISENO-RENDIMIENTO-EQUIPO.md). Lo usan el bot, la pestaña Tiempos y Mi panel.
import type { DayState } from '@/lib/operaciones/jornada-core';

export type Verdict = 'dentro' | 'rapido' | 'pasado' | 'sin_margen';

/** Motivos de una tarea fuera de margen (botones del bot). */
export const OVER_REASONS = {
  cl: 'El cliente cambió el encargo',
  gr: 'Era más grande de lo esperado',
  bl: 'Estuve bloqueado',
  it: 'Muchas interrupciones',
  ot: 'Otra cosa'
} as const;
export type OverReason = keyof typeof OVER_REASONS;
export const isOverReason = (x: string): x is OverReason => x in OVER_REASONS;

export const VERDICT_LABEL: Record<Verdict, string> = {
  dentro: 'Dentro del margen',
  rapido: 'Por debajo del mínimo',
  pasado: 'Por encima del máximo',
  sin_margen: 'Sin margen'
};

const ms2min = (ms: number) => Math.max(0, Math.round(ms / 60000));

/**
 * Minutos trabajados con una tarea activa, sumando los días dados y recortando a [from, to]
 * (from = cuando se empezó esta vez, to = cuando se terminó).
 */
export function taskMinutes(days: DayState[], clickupTaskId: string, from: number, to: number): number {
  let total = 0;
  for (const d of days) {
    for (const p of d.taskPieces) {
      if (p.task?.clickupTaskId !== clickupTaskId) continue;
      const a = Math.max(p.start, from);
      const b = Math.min(p.end, to);
      if (b > a) total += b - a;
    }
  }
  return ms2min(total);
}

/** Resultado frente al margen del tipo. */
export function verdictFor(minutes: number, bandMin: number | null, bandMax: number | null): Verdict {
  if (bandMin === null && bandMax === null) return 'sin_margen';
  if (bandMax !== null && minutes > bandMax) return 'pasado';
  if (bandMin !== null && minutes < bandMin) return 'rapido';
  return 'dentro';
}

/**
 * ¿Acertó su propia estimación? Cuenta por los dos lados (quedarse muy corto o muy largo falla), así que
 * inflar la estimación no sirve. Tolerancia: el mayor entre `pct` % de lo estimado y 5 minutos.
 */
export function precisionHit(estimate: number, actual: number, pct: number): boolean {
  const tol = Math.max(5, Math.round((estimate * pct) / 100));
  return Math.abs(actual - estimate) <= tol;
}

const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

/** Tres opciones de estimación alrededor de lo habitual del tipo (mediana real, centro del margen o 30). */
export function estimateOptions(median: number | null, bandMin: number | null, bandMax: number | null): number[] {
  const mid = bandMin !== null && bandMax !== null ? (bandMin + bandMax) / 2 : (bandMax ?? bandMin);
  const base = round5(median ?? mid ?? 30);
  return [...new Set([round5(base * 0.65), base, round5(base * 1.5)])].sort((a, b) => a - b);
}

export function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo));
}

export const median = (values: number[]) => percentile([...values].sort((a, b) => a - b), 0.5);

/** Margen propuesto a partir de lo real (percentiles 25 y 75), solo con suficientes tareas. */
export function suggestBand(values: number[], minSamples: number): { min: number; max: number; n: number } | null {
  if (values.length < minSamples) return null;
  const s = [...values].sort((a, b) => a - b);
  const min = Math.max(0, Math.floor(percentile(s, 0.25)! / 5) * 5);
  const max = Math.max(min + 5, Math.ceil(percentile(s, 0.75)! / 5) * 5);
  return { min, max, n: values.length };
}

/** Texto de cierre para la persona: feedback inmediato, sin tono de falta. */
export function finishFeedback(o: {
  taskName: string;
  minutes: number;
  estimate: number | null;
  hit: boolean | null;
  verdict: Verdict;
  bandMin: number | null;
  bandMax: number | null;
}): string {
  const lines = [`⏱ <b>${o.taskName}</b>: ${o.minutes} min de trabajo.`];
  if (o.estimate !== null) {
    lines.push(o.hit ? `Estimaste ${o.estimate} y han sido ${o.minutes}. ¡Muy cerca! 🎯` : `Estimaste ${o.estimate} y han sido ${o.minutes}. La próxima la clavas.`);
  }
  if (o.verdict === 'pasado') lines.push(`Se ha ido por encima del margen habitual (${o.bandMin ?? 0}–${o.bandMax} min). ¿Qué la complicó? Así ajustamos márgenes y tipos.`);
  return lines.join('\n');
}

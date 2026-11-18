// Módulo Estrategia: reglas puras (sin base de datos ni red). Se prueban en tests/estrategia.test.ts.
//   - catálogo de procesos, frecuencias, planes por defecto y configuración efectiva de cada cliente
//   - objetivos: curva con retraso, partida con estacionalidad, estado («vamos bien»), propuesta de metas
//   - detectores de oportunidades sobre filas de Search Console
//   - comprobaciones de una web (HTML, robots.txt, sitemap) y URLs dentro de una propiedad
// No importa nada de otros módulos (las fechas se repiten aquí a propósito).

// --- Fechas (AAAA-MM-DD) ------------------------------------------------------------------------------------------

export const addDays = (d: string, n: number): string => {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
export const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
export const monthStart = (d: string): string => `${d.slice(0, 7)}-01`;
export const addMonths = (m: string, n: number): string => {
  const t = new Date(`${m.slice(0, 7)}-01T12:00:00Z`);
  t.setUTCMonth(t.getUTCMonth() + n);
  return t.toISOString().slice(0, 10);
};
export const monthEnd = (m: string): string => addDays(addMonths(m, 1), -1);
export const isYmd = (d: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T12:00:00Z`)) && new Date(`${d}T12:00:00Z`).toISOString().slice(0, 10) === d;
export function madridNow(now = new Date()): { date: string; hour: number } {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
export const fmtDay = (d: string): string => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
export const fmtDayYear = (d: string): string => `${fmtDay(d)} ${d.slice(0, 4)}`;

// --- Catálogo de procesos -------------------------------------------------------------------------------------------

export type ProcessKey =
  | 'critico'
  | 'salud'
  | 'velocidad'
  | 'keywords'
  | 'gbp'
  | 'urls'
  | 'detectores'
  | 'objetivos'
  | 'guardian'
  | 'extraccion'
  | 'contenido'
  | 'competencia'
  | 'visibilidad_ia'
  | 'estratega'
  | 'alerta_estratega'
  | 'informe_mensual'
  | 'revision_trimestral';

export type ProcessDef = {
  key: ProcessKey;
  label: string;
  description: string;
  cost: 'gratis' | 'ia_minima' | 'ia' | 'dataforseo';
  /** Frecuencias que se pueden elegir (días). 0 = «por evento» (no tiene frecuencia). */
  frequencies: number[];
  defaultEvery: number;
  /** De qué otros procesos depende para tener sentido. */
  needs: ProcessKey[];
  /** Fase en la que se construye: los de fases posteriores se ven en el panel como «próximamente» y no se ejecutan. */
  phase: 1 | 2 | 3;
};

export const FREQUENCY_LABEL: Record<number, string> = { 0: 'Al cerrar cada encargo', 1: 'Cada día', 3: 'Cada 3 días', 7: 'Cada semana', 15: 'Cada 15 días', 30: 'Cada mes', 90: 'Cada trimestre' };
export const frequencyLabel = (n: number): string => FREQUENCY_LABEL[n] ?? `Cada ${n} días`;
const F = [1, 3, 7, 15, 30, 90];

export const PROCESSES: ProcessDef[] = [
  { key: 'critico', label: 'Vigilancia crítica', description: 'Web caída, errores 5xx, certificado SSL a punto de caducar, «noindex» o robots.txt que bloquean. Avisa al momento (tras confirmarlo una segunda vez).', cost: 'gratis', frequencies: [1, 3, 7], defaultEvery: 1, needs: [], phase: 1 },
  { key: 'salud', label: 'Salud técnica', description: 'Revisa las páginas principales y del sitemap: errores 404, redirecciones, «noindex», títulos y descripciones que faltan, y la indexación en Search Console.', cost: 'gratis', frequencies: F, defaultEvery: 7, needs: [], phase: 1 },
  { key: 'velocidad', label: 'Velocidad y Core Web Vitals', description: 'PageSpeed Insights con datos reales de usuarios (media de 28 días de Google) de la portada y las páginas con más clics. Mirarlo más a menudo no aporta.', cost: 'gratis', frequencies: [7, 15, 30, 90], defaultEvery: 30, needs: [], phase: 1 },
  { key: 'keywords', label: 'Palabras clave posicionadas', description: 'Posición, clics e impresiones de las palabras que sigue el cliente (Search Console). Cada día durante 4 semanas tras cambiar su página, y siempre las marcadas como críticas.', cost: 'gratis', frequencies: [1, 3, 7, 15, 30], defaultEvery: 7, needs: [], phase: 1 },
  { key: 'gbp', label: 'Ficha de Google Business', description: 'Vistas, llamadas, clics a la web y cómo llegar, frente al periodo anterior y al año pasado. Avisa de caídas fuertes.', cost: 'gratis', frequencies: [3, 7, 15, 30], defaultEvery: 7, needs: [], phase: 1 },
  { key: 'urls', label: 'URLs trabajadas', description: 'Sigue cada día las páginas en las que se ha trabajado (con 90 días de «antes») y cuándo Google las vuelve a rastrear. Es la base para medir el impacto.', cost: 'gratis', frequencies: [1], defaultEvery: 1, needs: ['extraccion'], phase: 1 },
  { key: 'detectores', label: 'Detectores de oportunidades', description: 'Consultas al alcance, CTR bajo para su posición, páginas en caída, consultas nuevas sin página, canibalización con pérdida real y embudos rotos.', cost: 'gratis', frequencies: [3, 7, 15, 30], defaultEvery: 7, needs: [], phase: 1 },
  { key: 'objetivos', label: 'Objetivos', description: 'Recalcula cómo va cada objetivo (curva con retraso y estacionalidad) y avisa solo si empeora.', cost: 'gratis', frequencies: [1, 3, 7], defaultEvery: 1, needs: [], phase: 1 },
  { key: 'guardian', label: 'Guardián', description: 'Que el cliente tenga objetivos, trabajo planificado para las próximas 2 semanas, las horas del mes al ritmo del contrato y nada crítico sin atender.', cost: 'gratis', frequencies: [1, 3, 7], defaultEvery: 3, needs: [], phase: 1 },
  { key: 'extraccion', label: 'Datos de cada encargo terminado', description: 'Al cerrarse un encargo: tipo de trabajo, URLs, palabras clave y cifras que debería mover (modelo pequeño, ≈ 0,0001 $). Si falta la URL, pregunta a quien lo hizo.', cost: 'ia_minima', frequencies: [0], defaultEvery: 0, needs: [], phase: 1 },
  { key: 'contenido', label: 'Contenido que pierde tráfico', description: 'Páginas que caen frente al año anterior, filtrando la estacionalidad.', cost: 'gratis', frequencies: [30, 90], defaultEvery: 90, needs: [], phase: 3 },
  { key: 'competencia', label: 'Competencia', description: 'Quién aparece en Google para las palabras del cliente y qué cambia.', cost: 'dataforseo', frequencies: [15, 30, 90], defaultEvery: 30, needs: ['keywords'], phase: 3 },
  { key: 'visibilidad_ia', label: 'Visibilidad en IA', description: 'Impresiones en AI Overviews y AI Mode (informe de IA de Search Console) y, si se contrata, un proveedor para ChatGPT y Perplexity.', cost: 'gratis', frequencies: [15, 30, 90], defaultEvery: 30, needs: [], phase: 3 },
  { key: 'estratega', label: 'Análisis del estratega (Opus)', description: 'Relaciona el rendimiento con el trabajo hecho y propone tareas con evidencias, horas e impacto esperado, dentro de las horas contratadas.', cost: 'ia', frequencies: [7, 15, 30], defaultEvery: 7, needs: ['detectores', 'objetivos'], phase: 2 },
  { key: 'alerta_estratega', label: 'Análisis por alerta', description: 'El estratega actúa al momento ante algo grave (objetivo desviado, caída fuerte, web caída). Como mucho 2 al mes por cliente.', cost: 'ia', frequencies: [0], defaultEvery: 0, needs: ['estratega'], phase: 2 },
  { key: 'informe_mensual', label: 'Informe mensual', description: 'Informe interno y borrador para el cliente (el día 5).', cost: 'ia', frequencies: [30], defaultEvery: 30, needs: ['objetivos'], phase: 3 },
  { key: 'revision_trimestral', label: 'Revisión trimestral de estrategia', description: 'Objetivos y previsión, qué funcionó y plan del trimestre siguiente.', cost: 'ia', frequencies: [90], defaultEvery: 90, needs: ['objetivos'], phase: 3 }
];
export const PROCESS: Record<ProcessKey, ProcessDef> = Object.fromEntries(PROCESSES.map((p) => [p.key, p])) as Record<ProcessKey, ProcessDef>;
export const isProcessKey = (k: string): k is ProcessKey => k in PROCESS;
export const CURRENT_PHASE = 2;
export const isRunnable = (k: ProcessKey) => PROCESS[k].phase <= CURRENT_PHASE;

export type ProcessConfig = Record<string, { on: boolean; every: number }>;
const P = (on: ProcessKey[], every: Partial<Record<ProcessKey, number>> = {}): ProcessConfig =>
  Object.fromEntries(on.map((k) => [k, { on: true, every: every[k] ?? PROCESS[k].defaultEvery }]));

/** Planes de partida (se crean la primera vez en cada cuenta; luego se editan en el panel). */
export const DEFAULT_PLANS: { key: string; name: string; description: string; processes: ProcessConfig }[] = [
  {
    key: 'mantenimiento',
    name: 'Mantenimiento web',
    description: 'SEO básico o mantenimiento: que la web funcione bien. Sin palabras clave ni estrategia.',
    processes: P(['critico', 'salud', 'velocidad', 'guardian'])
  },
  {
    key: 'seo_local',
    name: 'SEO local',
    description: 'Negocios locales con ficha de Google: salud web, ficha, palabras clave, objetivos y oportunidades.',
    processes: P(['critico', 'salud', 'velocidad', 'gbp', 'keywords', 'objetivos', 'detectores', 'guardian', 'extraccion', 'urls', 'estratega', 'informe_mensual', 'revision_trimestral'], { estratega: 15 })
  },
  {
    key: 'seo_estrategico',
    name: 'SEO estratégico',
    description: 'Estrategia orgánica completa: todo el catálogo y el estratega cada semana.',
    processes: P(['critico', 'salud', 'velocidad', 'gbp', 'keywords', 'objetivos', 'detectores', 'guardian', 'extraccion', 'urls', 'contenido', 'competencia', 'visibilidad_ia', 'estratega', 'alerta_estratega', 'informe_mensual', 'revision_trimestral'])
  }
];

export type EffectiveProcess = { key: ProcessKey; on: boolean; every: number; from: 'plan' | 'cliente'; runnable: boolean };

/** Configuración efectiva: la del plan, y encima lo que el cliente tenga ajustado a mano. */
export function effectiveProcesses(plan: ProcessConfig, overrides: ProcessConfig): EffectiveProcess[] {
  return PROCESSES.map((d) => {
    const o = overrides[d.key];
    const p = plan[d.key];
    const src = o ?? p;
    const every = src && d.frequencies.includes(src.every) ? src.every : d.defaultEvery;
    return { key: d.key, on: Boolean(src?.on), every, from: o ? 'cliente' : 'plan', runnable: isRunnable(d.key) };
  });
}

/** Limpia una configuración llegada de un formulario: solo procesos conocidos y frecuencias permitidas. */
export function cleanConfig(input: unknown): ProcessConfig {
  const out: ProcessConfig = {};
  if (!input || typeof input !== 'object') return out;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!isProcessKey(k) || !v || typeof v !== 'object') continue;
    const on = Boolean((v as { on?: unknown }).on);
    const every = Number((v as { every?: unknown }).every);
    out[k] = { on, every: PROCESS[k].frequencies.includes(every) ? every : PROCESS[k].defaultEvery };
  }
  return out;
}

/** Avisos de dependencias: procesos activos a los que les falta otro que necesitan. */
export function dependencyWarnings(eff: EffectiveProcess[]): string[] {
  const on = new Set(eff.filter((e) => e.on).map((e) => e.key));
  const out: string[] = [];
  for (const e of eff) {
    if (!e.on) continue;
    const missing = PROCESS[e.key].needs.filter((n) => !on.has(n));
    if (missing.length) out.push(`«${PROCESS[e.key].label}» necesita ${missing.map((m) => `«${PROCESS[m].label}»`).join(' y ')}.`);
  }
  return out;
}

/** Desplazamiento estable (0-59 min) por cliente y proceso: reparte las ejecuciones para no hacerlo todo a la vez. */
export function jitterMinutes(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % 60;
}

/** Próxima ejecución tras una ejecución terminada (o un fallo, con espera creciente). */
export function nextRunAfter(now: Date, every: number, seed: string, failedTimes = 0): Date {
  if (failedTimes > 0) return new Date(now.getTime() + Math.min(12 * 60, 15 * 2 ** (failedTimes - 1)) * 60_000);
  const days = Math.max(1, every);
  return new Date(now.getTime() + days * 86_400_000 - 30 * 60_000 + jitterMinutes(seed) * 60_000);
}

// --- Objetivos ------------------------------------------------------------------------------------------------------

export type Health = 'en_camino' | 'vigilar' | 'en_riesgo' | 'desviado' | 'logrado' | 'vencido' | 'sin_datos' | 'pendiente';
export const HEALTH_LABEL: Record<Health, string> = {
  en_camino: 'En camino',
  vigilar: 'Vigilar',
  en_riesgo: 'En riesgo',
  desviado: 'Desviado',
  logrado: 'Logrado',
  vencido: 'Fecha pasada',
  sin_datos: 'Sin datos',
  pendiente: 'Pendiente'
};
export const HEALTH_RANK: Record<Health, number> = { logrado: -1, en_camino: 0, pendiente: 0, sin_datos: 0, vigilar: 1, en_riesgo: 2, desviado: 3, vencido: 3 };

/** Curva con retraso (en S): el SEO tarda en notarse y crece a escalones. f(0)=0, f(1)=1. */
export function curveFraction(x: number, curve: 's' | 'lineal'): number {
  const t = Math.max(0, Math.min(1, x));
  if (curve === 'lineal') return t;
  const L = (v: number) => 1 / (1 + Math.exp(-9 * (v - 0.5)));
  return (L(t) - L(0)) / (L(1) - L(0));
}

/** Índice estacional por mes (1-12) a partir de 12 meses de valores: valor del mes / media. null si no hay datos. */
export function seasonalIndex(monthly: { month: string; value: number | null }[]): Record<number, number> | null {
  const vals = monthly.filter((m) => m.value !== null && m.value > 0) as { month: string; value: number }[];
  if (vals.length < 12) return null;
  const last12 = vals.slice(-12);
  const mean = last12.reduce((a, b) => a + b.value, 0) / 12;
  if (mean <= 0) return null;
  const out: Record<number, number> = {};
  for (const m of last12) out[Number(m.month.slice(5, 7))] = m.value / mean;
  return out;
}

export type ObjectiveInput = {
  kind: 'kpi' | 'hito';
  baseline: number | null;
  target: number | null;
  start: string;
  due: string;
  curve: 's' | 'lineal';
  lowerBetter: boolean;
};
export type HealthCfg = { onTrackPct: number; atRiskPct: number; graceDays: number };
export type HealthResult = { health: Health; expected: number | null; progressPct: number | null; adjusted: number | null; note: string };

/**
 * Cómo va un objetivo hoy. «actual» es la cifra de los últimos 28 días en la misma unidad que la meta (al mes en las
 * cifras que se suman). Con índice estacional se compara la cifra desestacionalizada al mes de inicio.
 */
export function objectiveHealth(o: ObjectiveInput, actual: number | null, today: string, cfg: HealthCfg, season: Record<number, number> | null = null): HealthResult {
  if (o.kind === 'hito') return { health: today > o.due ? 'vencido' : 'pendiente', expected: null, progressPct: null, adjusted: null, note: '' };
  if (actual === null || o.baseline === null || o.target === null) return { health: 'sin_datos', expected: null, progressPct: null, adjusted: null, note: 'No hay datos de esta cifra para el cliente (¿falta asignar la propiedad?).' };
  const dir = o.lowerBetter ? -1 : 1;
  let adjusted = actual;
  let note = '';
  if (season) {
    // La partida es la media de los 3 meses completos anteriores al inicio: su índice es la media de esos meses.
    const prevIdx = [1, 2, 3].map((k) => season[((Number(o.start.slice(5, 7)) - 1 - k + 12) % 12) + 1]).filter((x): x is number => typeof x === 'number');
    const s0 = prevIdx.length ? prevIdx.reduce((x, y) => x + y, 0) / prevIdx.length : undefined;
    const s1 = season[Number(today.slice(5, 7))];
    if (s0 && s1 && s1 > 0.05) {
      adjusted = actual * (s0 / s1);
      if (Math.abs(s0 / s1 - 1) >= 0.1) note = `Corregido por temporada (este mes suele ir ${s1 > s0 ? 'más alto' : 'más bajo'} que los meses de la partida).`;
    }
  }
  if ((adjusted - o.target) * dir >= 0) return { health: 'logrado', expected: o.target, progressPct: 100, adjusted, note };
  const total = daysBetween(o.start, o.due);
  const elapsed = daysBetween(o.start, today);
  if (today > o.due) return { health: 'vencido', expected: o.target, progressPct: progress(o.baseline, o.target, adjusted), adjusted, note };
  const frac = curveFraction(total > 0 ? elapsed / total : 1, o.curve);
  const expected = o.baseline + (o.target - o.baseline) * frac;
  const expGain = (expected - o.baseline) * dir;
  const realGain = (adjusted - o.baseline) * dir;
  const fullGain = Math.abs(o.target - o.baseline) || 1;
  const pct = progress(o.baseline, o.target, adjusted);
  // Al principio lo esperado es casi nada: solo se vigila si va claramente hacia atrás.
  if (expGain < fullGain * 0.05) {
    const worse = realGain < -Math.max(fullGain * 0.15, Math.abs(o.baseline) * 0.1);
    return { health: worse ? 'vigilar' : 'en_camino', expected, progressPct: pct, adjusted, note: note || (worse ? 'Va por debajo de la partida; aún es pronto para juzgar.' : 'Aún es pronto: el SEO tarda unos meses en notarse.') };
  }
  const ratio = realGain / expGain;
  let health: Health = ratio * 100 >= cfg.onTrackPct ? 'en_camino' : ratio * 100 >= cfg.atRiskPct ? 'en_riesgo' : 'desviado';
  if (elapsed < cfg.graceDays && (health === 'en_riesgo' || health === 'desviado')) {
    health = 'vigilar';
    note = note || `Antes de ${cfg.graceDays} días no se da por desviado.`;
  }
  return { health, expected, progressPct: pct, adjusted, note };
}

function progress(b: number, t: number, v: number): number | null {
  if (t === b) return null;
  return Math.round(((v - b) / (t - b)) * 100);
}

/** Lleva una cifra de N días a «al mes» (30 días) si se suma; las tasas y la posición se dejan tal cual. */
export const perMonth = (value: number | null, days: number, summable: boolean): number | null => (value === null ? null : summable ? (value * 30) / Math.max(1, days) : value);

/** Metas orientativas a partir de la partida (sin IA): prudente, esperada y ambiciosa, según los meses de plazo. */
export function proposeTargets(baseline: number, months: number, lowerBetter: boolean): { low: number; mid: number; high: number } {
  const k = Math.max(1, months) / 6;
  const rates = [0.1 * k, 0.2 * k, 0.35 * k].map((r) => Math.min(r, 1.5));
  if (lowerBetter) {
    // Posición: mejorar es bajar; se acerca a 1 sin pasarse.
    const gap = Math.max(0, baseline - 1);
    return { low: round2(baseline - gap * Math.min(0.15 * k, 0.9)), mid: round2(baseline - gap * Math.min(0.3 * k, 0.9)), high: round2(baseline - gap * Math.min(0.5 * k, 0.9)) };
  }
  return { low: round2(baseline * (1 + rates[0])), mid: round2(baseline * (1 + rates[1])), high: round2(baseline * (1 + rates[2])) };
}
const round2 = (n: number) => Math.round(n * 100) / 100;

// --- Detectores de oportunidades (filas de Search Console ya agregadas) ---------------------------------------------

export type QP = { query: string; page: string; clicks: number; impressions: number; position: number };
export type Signal = { kind: string; key: string; severity: 'info' | 'aviso' | 'critico'; title: string; detail: string; evidence: Record<string, unknown> };
export type DetectCfg = { strikingFrom: number; strikingTo: number; minImpressions: number };

/** CTR orgánico esperado por posición (aproximado y prudente; con AI Overviews en la consulta suele ser menor). */
const EXPECTED_CTR = [0, 0.27, 0.15, 0.1, 0.07, 0.055, 0.045, 0.035, 0.03, 0.025, 0.02];
export const expectedCtr = (pos: number): number => (pos < 1 ? EXPECTED_CTR[1] : pos > 10 ? 0.01 : EXPECTED_CTR[Math.round(pos)]);

/** Agrupa por consulta: totales y página principal (la de más impresiones). Posición ponderada por impresiones. */
export function byQuery(rows: QP[]): Map<string, { clicks: number; impressions: number; position: number; pages: { page: string; impressions: number; clicks: number; position: number }[] }> {
  const m = new Map<string, { clicks: number; impressions: number; posw: number; pages: { page: string; impressions: number; clicks: number; position: number }[] }>();
  for (const r of rows) {
    const q = m.get(r.query) ?? { clicks: 0, impressions: 0, posw: 0, pages: [] };
    q.clicks += r.clicks;
    q.impressions += r.impressions;
    q.posw += r.position * r.impressions;
    q.pages.push({ page: r.page, impressions: r.impressions, clicks: r.clicks, position: r.position });
    m.set(r.query, q);
  }
  const out = new Map<string, { clicks: number; impressions: number; position: number; pages: { page: string; impressions: number; clicks: number; position: number }[] }>();
  for (const [k, v] of m) out.set(k, { clicks: v.clicks, impressions: v.impressions, position: v.impressions > 0 ? v.posw / v.impressions : 0, pages: v.pages.sort((a, b) => b.impressions - a.impressions) });
  return out;
}

export function byPage(rows: { page: string; clicks: number; impressions: number; position: number }[]): Map<string, { clicks: number; impressions: number; position: number }> {
  const m = new Map<string, { clicks: number; impressions: number; posw: number }>();
  for (const r of rows) {
    const p = m.get(r.page) ?? { clicks: 0, impressions: 0, posw: 0 };
    p.clicks += r.clicks;
    p.impressions += r.impressions;
    p.posw += r.position * r.impressions;
    m.set(r.page, p);
  }
  return new Map([...m].map(([k, v]) => [k, { clicks: v.clicks, impressions: v.impressions, position: v.impressions > 0 ? v.posw / v.impressions : 0 }]));
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);

/** Consultas al alcance: en la franja de posiciones configurada y con impresiones suficientes. Las 15 con más potencial. */
export function strikingDistance(cur: QP[], cfg: DetectCfg): Signal[] {
  const out: Signal[] = [];
  for (const [query, q] of byQuery(cur)) {
    if (q.impressions < cfg.minImpressions || q.position < cfg.strikingFrom || q.position > cfg.strikingTo) continue;
    const top = q.pages[0];
    out.push({
      kind: 'al_alcance',
      key: `al_alcance:${query}`,
      severity: 'info',
      title: `«${query}» está en la posición ${r1(q.position)} con ${q.impressions} impresiones`,
      detail: `Subirla al top 3 podría traer bastantes más clics. Página que posiciona: ${top?.page ?? '—'}.`,
      evidence: { query, page: top?.page ?? null, position: r1(q.position), impressions: q.impressions, clicks: q.clicks, potential: Math.round(q.impressions * (expectedCtr(3) - expectedCtr(q.position))) }
    });
  }
  return out.sort((a, b) => Number(b.evidence.potential) - Number(a.evidence.potential)).slice(0, 15);
}

/** CTR muy por debajo de lo esperado para su posición (top 10). Puede deberse a AI Overviews: se dice. */
export function lowCtr(cur: QP[], cfg: DetectCfg): Signal[] {
  const out: Signal[] = [];
  for (const [query, q] of byQuery(cur)) {
    if (q.impressions < cfg.minImpressions * 2 || q.position > 10) continue;
    const ctr = q.clicks / q.impressions;
    const exp = expectedCtr(q.position);
    if (ctr >= exp * 0.4) continue;
    out.push({
      kind: 'ctr_bajo',
      key: `ctr_bajo:${query}`,
      severity: 'info',
      title: `«${query}»: CTR del ${r1(ctr * 100)} % en la posición ${r1(q.position)}`,
      detail: `Lo habitual en esa posición ronda el ${r1(exp * 100)} %. Revisar el título y la descripción de ${q.pages[0]?.page ?? 'la página'}. Si Google muestra un resumen de IA en esa búsqueda, un CTR bajo puede ser normal.`,
      evidence: { query, page: q.pages[0]?.page ?? null, position: r1(q.position), impressions: q.impressions, clicks: q.clicks, ctr: r1(ctr * 100), expected: r1(exp * 100) }
    });
  }
  return out.sort((a, b) => Number(b.evidence.impressions) - Number(a.evidence.impressions)).slice(0, 10);
}

/**
 * Páginas en caída: pierden clics frente a las 4 semanas anteriores con volumen suficiente. Si el año pasado en las
 * mismas fechas también cayeron, se marca como probablemente estacional (no se descarta).
 */
export function pageDrops(cur: QP[], prev: QP[], yoyCur: Map<string, number> | null, yoyPrev: Map<string, number> | null, minClicks = 30): Signal[] {
  const c = byPage(cur);
  const p = byPage(prev);
  const out: Signal[] = [];
  for (const [page, before] of p) {
    if (before.clicks < minClicks) continue;
    const now = c.get(page) ?? { clicks: 0, impressions: 0, position: 0 };
    const change = pct(now.clicks, before.clicks);
    if (change === null || change > -30) continue;
    const ly = yoyCur && yoyPrev ? pct(yoyCur.get(page) ?? 0, yoyPrev.get(page) ?? 0) : null;
    const seasonal = ly !== null && ly <= change / 2;
    out.push({
      kind: 'pagina_cae',
      key: `pagina_cae:${page}`,
      severity: seasonal ? 'info' : change <= -50 ? 'aviso' : 'info',
      title: `${page} pierde un ${Math.abs(change)} % de clics`,
      detail: `${now.clicks} clics en las últimas 4 semanas frente a ${before.clicks} en las 4 anteriores.${seasonal ? ` El año pasado en estas fechas también bajó (${ly} %): probablemente es temporada.` : ly !== null ? ` El año pasado en estas fechas: ${ly > 0 ? '+' : ''}${ly} %.` : ''}`,
      evidence: { page, clicks: now.clicks, prevClicks: before.clicks, change, position: r1(now.position), prevPosition: r1(before.position), yoyChange: ly, seasonal }
    });
  }
  return out.sort((a, b) => Number(b.evidence.prevClicks) - Number(b.evidence.clicks) - (Number(a.evidence.prevClicks) - Number(a.evidence.clicks))).slice(0, 10);
}

/** Consultas nuevas con impresiones y sin una página que posicione bien (posición > 10): candidatas a contenido. */
export function newQueries(cur: QP[], prev: QP[], cfg: DetectCfg): Signal[] {
  const before = byQuery(prev);
  const out: Signal[] = [];
  for (const [query, q] of byQuery(cur)) {
    if (q.impressions < cfg.minImpressions || q.position <= 10) continue;
    const b = before.get(query);
    if (b && b.impressions >= q.impressions * 0.25) continue;
    out.push({
      kind: 'consulta_nueva',
      key: `consulta_nueva:${query}`,
      severity: 'info',
      title: `Nueva búsqueda: «${query}» (${q.impressions} impresiones, posición ${r1(q.position)})`,
      detail: `Antes apenas aparecía. Ninguna página posiciona bien: puede merecer contenido propio.`,
      evidence: { query, impressions: q.impressions, prevImpressions: b?.impressions ?? 0, position: r1(q.position), page: q.pages[0]?.page ?? null }
    });
  }
  return out.sort((a, b) => Number(b.evidence.impressions) - Number(a.evidence.impressions)).slice(0, 10);
}

/** Canibalización SOLO si hay pérdida real: dos o más páginas se reparten la consulta y los clics caen. */
export function cannibalization(cur: QP[], prev: QP[], cfg: DetectCfg): Signal[] {
  const before = byQuery(prev);
  const out: Signal[] = [];
  for (const [query, q] of byQuery(cur)) {
    if (q.impressions < cfg.minImpressions) continue;
    const shared = q.pages.filter((p) => p.impressions >= q.impressions * 0.2);
    if (shared.length < 2) continue;
    const b = before.get(query);
    if (!b || b.clicks < 20) continue;
    const change = pct(q.clicks, b.clicks);
    if (change === null || change > -30) continue;
    out.push({
      kind: 'canibalizacion',
      key: `canibalizacion:${query}`,
      severity: 'info',
      title: `«${query}»: ${shared.length} páginas se reparten la búsqueda y los clics caen un ${Math.abs(change)} %`,
      detail: `Páginas: ${shared.map((p) => p.page).join(' · ')}. Valorar unificar o diferenciar su intención.`,
      evidence: { query, pages: shared.map((p) => ({ page: p.page, impressions: p.impressions, position: r1(p.position) })), clicks: q.clicks, prevClicks: b.clicks, change }
    });
  }
  return out.slice(0, 5);
}

/** Embudo roto: sube el tráfico y caen las conversiones (o las vistas de la ficha suben y las llamadas caen). */
export function brokenFunnel(label: string, top: { cur: number | null; prev: number | null }, bottom: { cur: number | null; prev: number | null }, minBottom = 10): Signal | null {
  if (top.cur === null || top.prev === null || bottom.cur === null || bottom.prev === null) return null;
  if (top.prev <= 0 || bottom.prev < minBottom) return null;
  const t = pct(top.cur, top.prev)!;
  const b = pct(bottom.cur, bottom.prev)!;
  if (t < 10 || b > -20) return null;
  return {
    kind: 'embudo',
    key: `embudo:${label}`,
    severity: 'aviso',
    title: `${label}: el tráfico sube (${t > 0 ? '+' : ''}${t} %) y la conversión baja (${b} %)`,
    detail: 'Revisar formularios, teléfonos, botones o el seguimiento de conversiones (¿se rompió una etiqueta?).',
    evidence: { label, topCur: top.cur, topPrev: top.prev, bottomCur: bottom.cur, bottomPrev: bottom.prev, topChange: t, bottomChange: b }
  };
}

// --- Comprobaciones de una web --------------------------------------------------------------------------------------

export type PageFacts = { status: number; finalUrl: string; redirects: number; noindex: boolean; title: string | null; description: string | null; canonical: string | null; xRobots: string | null };

const attr = (tag: string, name: string) => (tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i')) ?? [])[1] ?? null;

/** Lo que importa de una página HTML para el SEO (sin dependencias: expresiones regulares tolerantes). */
export function parseHtml(html: string): { noindex: boolean; title: string | null; description: string | null; canonical: string | null } {
  const head = html.slice(0, 200_000);
  const title = (head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ?? [])[1]?.replace(/\s+/g, ' ').trim() || null;
  let noindex = false;
  let description: string | null = null;
  let canonical: string | null = null;
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = (attr(tag, 'name') ?? attr(tag, 'property') ?? '').toLowerCase();
    const content = attr(tag, 'content');
    if ((name === 'robots' || name === 'googlebot') && content && /noindex/i.test(content)) noindex = true;
    if (name === 'description' && content !== null) description = content.trim() || null;
  }
  for (const tag of head.match(/<link\b[^>]*>/gi) ?? []) if ((attr(tag, 'rel') ?? '').toLowerCase() === 'canonical') canonical = attr(tag, 'href');
  return { noindex, title, description, canonical };
}

/** ¿robots.txt bloquea todo el sitio a Google? (User-agent: * o Googlebot con «Disallow: /»). */
export function robotsBlocksAll(txt: string): boolean {
  let agents: string[] = [];
  let inGroup = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const [k, ...rest] = line.split(':');
    const key = k.trim().toLowerCase();
    const val = rest.join(':').trim();
    if (key === 'user-agent') {
      if (inGroup) agents = [];
      inGroup = false;
      agents.push(val.toLowerCase());
    } else {
      inGroup = true;
      if (key === 'disallow' && val === '/' && agents.some((a) => a === '*' || a === 'googlebot')) {
        // Si el mismo grupo deja algo con «Allow: /», no bloquea todo; se simplifica: Disallow: / basta.
        return true;
      }
    }
  }
  return false;
}

export const sitemapsFromRobots = (txt: string): string[] => [...txt.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]).slice(0, 5);
export const locsFromSitemap = (xml: string): { urls: string[]; sitemaps: string[] } => {
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, '&'));
  return /<sitemapindex/i.test(xml) ? { urls: [], sitemaps: locs.slice(0, 20) } : { urls: locs.slice(0, 5000), sitemaps: [] };
};

/** Problemas SEO de una página ya revisada. */
export function pageIssues(url: string, f: PageFacts | { error: string }): { code: string; severity: 'info' | 'aviso' | 'critico'; url: string; detail: string }[] {
  if ('error' in f) return [{ code: 'no_responde', severity: 'aviso', url, detail: `No responde: ${f.error}` }];
  const out: { code: string; severity: 'info' | 'aviso' | 'critico'; url: string; detail: string }[] = [];
  if (f.status >= 500) out.push({ code: 'error_5xx', severity: 'critico', url, detail: `Error del servidor (${f.status}).` });
  else if (f.status === 404 || f.status === 410) out.push({ code: 'error_404', severity: 'aviso', url, detail: `La página no existe (${f.status}).` });
  else if (f.status >= 400) out.push({ code: 'error_4xx', severity: 'aviso', url, detail: `Responde con error ${f.status}.` });
  if (f.status < 400) {
    if (f.redirects > 0 && stripSlash(f.finalUrl) !== stripSlash(url)) out.push({ code: 'redireccion', severity: 'info', url, detail: `Redirige a ${f.finalUrl}${f.redirects > 1 ? ` (${f.redirects} saltos)` : ''}.` });
    if (f.noindex || /noindex/i.test(f.xRobots ?? '')) out.push({ code: 'noindex', severity: 'aviso', url, detail: 'Tiene «noindex»: Google no la mostrará.' });
    if (!f.title) out.push({ code: 'sin_titulo', severity: 'aviso', url, detail: 'No tiene etiqueta <title>.' });
    if (!f.description) out.push({ code: 'sin_descripcion', severity: 'info', url, detail: 'No tiene meta descripción.' });
    if (f.canonical && stripSlash(absUrl(f.canonical, f.finalUrl)) !== stripSlash(f.finalUrl)) out.push({ code: 'canonical_otra', severity: 'info', url, detail: `Su canónica apunta a otra URL: ${absUrl(f.canonical, f.finalUrl)}.` });
  }
  return out;
}

const stripSlash = (u: string) => u.replace(/#.*$/, '').replace(/\/+$/, '').toLowerCase();
export function absUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

/** Dominio sin «www.». */
export const hostOf = (u: string): string | null => {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
};

/** ¿La URL pertenece a la propiedad de Search Console? (sc-domain:dominio o prefijo de URL). */
export function urlInProperty(url: string, property: string): boolean {
  const h = hostOf(url);
  if (!h) return false;
  if (property.startsWith('sc-domain:')) {
    const d = property.slice(10).toLowerCase();
    return h === d || h.endsWith(`.${d}`);
  }
  return url.toLowerCase().startsWith(property.toLowerCase()) || url.toLowerCase().replace('://www.', '://').startsWith(property.toLowerCase().replace('://www.', '://'));
}

/** Clave para comparar dos URLs como «la misma página»: sin protocolo, sin «www.», sin barra final ni ancla. */
export function urlKey(u: string): string | null {
  try {
    const x = new URL(u.trim());
    if (!/^https?:$/.test(x.protocol)) return null;
    const path = x.pathname.replace(/\/+$/, '') || '';
    return `${x.hostname.toLowerCase().replace(/^www\./, '')}${path}${x.search}`;
  } catch {
    return null;
  }
}

/**
 * Versión canónica de una URL trabajada, a partir de la página ya pedida: la etiqueta canonical si la tiene, si no
 * la dirección final tras las redirecciones. Solo se acepta si sigue dentro de la propiedad de Search Console; si
 * la página no responde, se queda la URL escrita (sin ancla).
 */
export function canonicalFromFacts(url: string, f: PageFacts | { error: string }, property: string): string {
  const clean = url.replace(/#.*$/, '');
  if ('error' in f || f.status >= 400) return clean;
  const final = f.finalUrl.replace(/#.*$/, '');
  const canon = f.canonical ? absUrl(f.canonical, final).replace(/#.*$/, '') : null;
  for (const c of [canon, final]) if (c && /^https?:\/\//i.test(c) && urlInProperty(c, property)) return c;
  return clean;
}

/** Entre las páginas que Search Console tiene, la variante de la misma URL con más impresiones (null si ninguna). */
export function pickGscVariant(url: string, pages: { page: string; impressions: number }[]): string | null {
  const key = urlKey(url);
  if (!key) return null;
  let best: { page: string; impressions: number } | null = null;
  for (const p of pages) if (urlKey(p.page) === key && (!best || p.impressions > best.impressions)) best = p;
  return best?.page ?? null;
}

export type WindowSum = { clicks: number; impressions: number; days: number; dataDays: number };

/**
 * Antes y después de una URL trabajada, contando DÍAS DE CALENDARIO (C4): Search Console no devuelve los días
 * sin impresiones, así que dividir entre los días con datos inflaba la media con poco tráfico.
 * - Antes: los 28 días previos al cambio, hasta el último día ya sincronizado.
 * - Después: desde que Google la rastreó (o desde el cambio) hasta el último día sincronizado.
 * Sin sincronizar todavía, 0 días. `dataDays` = días con alguna fila (para saber si hay datos de verdad).
 */
export function beforeAfter(
  daily: { date: string; clicks: number; impressions: number }[],
  t: { changedOn: string; crawledOn: string | null; lastSyncedOn: string | null }
): { before: WindowSum; after: WindowSum } {
  const win = (from: string, to: string): WindowSum => {
    const end = t.lastSyncedOn && t.lastSyncedOn < to ? t.lastSyncedOn : to;
    const days = t.lastSyncedOn && end >= from ? daysBetween(from, end) + 1 : 0;
    const xs = days ? daily.filter((d) => d.date >= from && d.date <= end) : [];
    return { clicks: xs.reduce((s, d) => s + d.clicks, 0), impressions: xs.reduce((s, d) => s + d.impressions, 0), days, dataDays: xs.length };
  };
  const start = t.crawledOn ?? t.changedOn;
  return { before: win(addDays(t.changedOn, -28), addDays(t.changedOn, -1)), after: win(start, t.lastSyncedOn ?? start) };
}

/** URL de la portada de una propiedad o web («sc-domain:x.com» → https://x.com/). */
export function homeOf(value: string): string | null {
  const v = value.trim();
  if (v.startsWith('sc-domain:')) return `https://${v.slice(10)}/`;
  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      return `${u.protocol}//${u.host}/`;
    } catch {
      return null;
    }
  }
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v)) return `https://${v.toLowerCase()}/`;
  return null;
}

// --- Datos de un encargo terminado ----------------------------------------------------------------------------------

export const WORK_CATEGORIES = ['contenido', 'onpage', 'tecnico', 'enlaces', 'gbp', 'web', 'campana', 'informe', 'otro'] as const;
export type WorkCategory = (typeof WORK_CATEGORIES)[number];
export const WORK_CATEGORY_LABEL: Record<WorkCategory, string> = { contenido: 'Contenido nuevo', onpage: 'Optimización on-page', tecnico: 'Técnico', enlaces: 'Enlaces', gbp: 'Ficha de Google', web: 'Web nueva o rediseño', campana: 'Campaña', informe: 'Informe o reunión', otro: 'Otro' };
export const IMPACT_KPIS = ['gsc_clicks', 'gsc_impressions', 'ga4_organic', 'ga4_keyEvents', 'gbp_views', 'gbp_calls', 'gbp_website', 'gbp_directions'];
/** Tipos de trabajo que se hacen sobre una página concreta (si falta la URL, se pregunta). */
export const PAGE_CATEGORIES: WorkCategory[] = ['contenido', 'onpage', 'tecnico'];

export const URL_RE = /https?:\/\/[^\s<>"'()\]]+/gi;

/** Limpia lo que devuelve la IA (o las reglas): categoría conocida, URLs del cliente, palabras y cifras válidas. */
export function cleanExtraction(raw: unknown, domains: string[]): { category: WorkCategory; urls: string[]; keywords: string[]; kpis: string[]; needsUrl: boolean } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const category = (WORK_CATEGORIES as readonly string[]).includes(String(r.categoria)) ? (String(r.categoria) as WorkCategory) : 'otro';
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);
  const urls = [...new Set(list(r.urls).map((u) => u.replace(/[.,;:]+$/, '')))].filter((u) => {
    const h = hostOf(u);
    return Boolean(h) && (!domains.length || domains.some((d) => h === d || h!.endsWith(`.${d}`)));
  });
  const keywords = [...new Set(list(r.palabras_clave).map((k) => k.toLowerCase().slice(0, 120)))].slice(0, 10);
  const kpis = [...new Set(list(r.kpis))].filter((k) => IMPACT_KPIS.includes(k));
  const needsUrl = Boolean(r.necesita_url) && !urls.length && PAGE_CATEGORIES.includes(category);
  return { category, urls: urls.slice(0, 10), keywords, kpis, needsUrl };
}

/** Sin IA (o si falla): las URLs escritas en el encargo y la categoría por palabras. */
export function ruleExtraction(text: string, domains: string[]): { category: WorkCategory; urls: string[]; keywords: string[]; kpis: string[]; needsUrl: boolean } {
  const t = text.toLowerCase();
  const category: WorkCategory = /art[ií]culo|post|blog|contenido nuevo|landing nueva|p[aá]gina nueva/.test(t)
    ? 'contenido'
    : /ficha de google|google business|gbp|perfil de empresa|rese[ñn]as/.test(t)
      ? 'gbp'
      : /t[ií]tulo|meta|optimiz|enlazado interno|h1/.test(t)
        ? 'onpage'
        : /velocidad|indexa|redirecci|404|schema|sitemap|robots/.test(t)
          ? 'tecnico'
          : /informe|reuni[oó]n|auditor/.test(t)
            ? 'informe'
            : 'otro';
  return cleanExtraction({ categoria: category, urls: text.match(URL_RE) ?? [], palabras_clave: [], kpis: category === 'gbp' ? ['gbp_views', 'gbp_calls'] : PAGE_CATEGORIES.includes(category) ? ['gsc_clicks', 'gsc_impressions'] : [], necesita_url: PAGE_CATEGORIES.includes(category) }, domains);
}

/** Escapa una palabra para la expresión regular de Search Console (RE2). */
export const re2Escape = (s: string): string => s.replace(/[\\^$.|?*+()[\]{}]/g, (c) => `\\${c}`);

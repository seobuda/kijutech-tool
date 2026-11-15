// Módulo Rendimiento: reglas puras (sin base de datos ni red) para periodos, cifras, comparaciones, gráficas,
// consultas que suben y bajan, antes y después de un hito y avisos de caídas. Se prueban en tests/rendimiento.test.ts.

export type Source = 'gsc' | 'ga4' | 'gbp';
export const SOURCES: Source[] = ['gsc', 'ga4', 'gbp'];
export const SOURCE_LABEL: Record<Source, string> = { gsc: 'Search Console', ga4: 'Analytics', gbp: 'Business Profile' };

// --- Fechas (AAAA-MM-DD, sin horas) -------------------------------------------------------------------------------

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
export const mondayOf = (d: string): string => {
  const wd = new Date(`${d}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return addDays(d, -((wd + 6) % 7));
};
/** Fecha de hoy y hora en Madrid. */
export function madridNow(now = new Date()): { date: string; hour: number; day: number } {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), day: Number(p.day) };
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
const MONTHS_LONG = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const fmtDay = (d: string): string => `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}`;
export const fmtDayYear = (d: string): string => `${fmtDay(d)} ${d.slice(0, 4)}`;
export const fmtMonth = (d: string): string => `${MONTHS[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
export const fmtMonthLong = (d: string): string => `${MONTHS_LONG[Number(d.slice(5, 7)) - 1]} de ${d.slice(0, 4)}`;

// --- Datos por día ------------------------------------------------------------------------------------------------
// Clave de serie: «fuente|métrica|tipo de desglose|valor del desglose». Los totales llevan desglose vacío.
// Para la posición media se guarda también «gsc|posw||» = posición × impresiones (se pondera al sumar periodos).

export const seriesKey = (source: string, metric: string, dimType = '', dimValue = ''): string => `${source}|${metric}|${dimType}|${dimValue}`;
export type DayMap = Map<string, Map<string, number>>; // fecha → serie → valor

export function buildDayMap(rows: { source: string; date: string; metric: string; dimType: string; dimValue: string; value: number }[]): DayMap {
  const m: DayMap = new Map();
  const pos = new Map<string, number>();
  const imp = new Map<string, number>();
  for (const r of rows) {
    let day = m.get(r.date);
    if (!day) m.set(r.date, (day = new Map()));
    const k = seriesKey(r.source, r.metric, r.dimType, r.dimValue);
    day.set(k, (day.get(k) ?? 0) + Number(r.value));
    if (r.source === 'gsc' && !r.dimType && r.metric === 'position') pos.set(r.date, Number(r.value));
    if (r.source === 'gsc' && !r.dimType && r.metric === 'impressions') imp.set(r.date, Number(r.value));
  }
  for (const [d, p] of pos) m.get(d)!.set(seriesKey('gsc', 'posw'), p * (imp.get(d) ?? 0));
  return m;
}

// --- Cifras --------------------------------------------------------------------------------------------------------

export type Kpi = {
  key: string;
  source: Source;
  label: string;
  short: string;
  /** Series que se suman en el periodo; combine calcula la cifra (null = sin datos suficientes). */
  parts: string[];
  combine: (v: number[]) => number | null;
  format: 'int' | 'pct' | 'dec';
  lowerBetter?: boolean;
  /** Cifra que no se suma entre días (los usuarios únicos de varios días no son la suma de cada día). */
  note?: string;
};

const GBP_VIEWS = ['views_search_mobile', 'views_search_desktop', 'views_maps_mobile', 'views_maps_desktop'].map((m) => seriesKey('gbp', m));
const one = (s: Source, m: string, dt = '', dv = '') => [seriesKey(s, m, dt, dv)];
const first = (v: number[]) => v[0];
const ratio = (v: number[]) => (v[1] > 0 ? (v[0] / v[1]) * 100 : null);

export const KPIS: Kpi[] = [
  { key: 'gsc_clicks', source: 'gsc', label: 'Clics desde Google', short: 'Clics', parts: one('gsc', 'clicks'), combine: first, format: 'int' },
  { key: 'gsc_impressions', source: 'gsc', label: 'Impresiones en Google', short: 'Impresiones', parts: one('gsc', 'impressions'), combine: first, format: 'int' },
  { key: 'gsc_ctr', source: 'gsc', label: 'CTR', short: 'CTR', parts: [...one('gsc', 'clicks'), ...one('gsc', 'impressions')], combine: ratio, format: 'pct' },
  { key: 'gsc_position', source: 'gsc', label: 'Posición media', short: 'Posición', parts: [seriesKey('gsc', 'posw'), ...one('gsc', 'impressions')], combine: (v) => (v[1] > 0 ? v[0] / v[1] : null), format: 'dec', lowerBetter: true },
  { key: 'ga4_organic', source: 'ga4', label: 'Sesiones orgánicas', short: 'Orgánicas', parts: one('ga4', 'sessions', 'channel', 'Organic Search'), combine: first, format: 'int' },
  { key: 'ga4_sessions', source: 'ga4', label: 'Sesiones en la web', short: 'Sesiones', parts: one('ga4', 'sessions'), combine: first, format: 'int' },
  { key: 'ga4_keyEvents', source: 'ga4', label: 'Eventos clave (conversiones)', short: 'Conversiones', parts: one('ga4', 'keyEvents'), combine: first, format: 'int' },
  { key: 'ga4_engagement', source: 'ga4', label: 'Tasa de interacción', short: 'Interacción', parts: [...one('ga4', 'engagedSessions'), ...one('ga4', 'sessions')], combine: ratio, format: 'pct' },
  { key: 'ga4_users', source: 'ga4', label: 'Usuarios (suma de cada día)', short: 'Usuarios', parts: one('ga4', 'totalUsers'), combine: first, format: 'int', note: 'Suma de los usuarios de cada día: un mismo usuario que vuelve otro día cuenta dos veces.' },
  { key: 'gbp_views', source: 'gbp', label: 'Vistas de la ficha de Google', short: 'Vistas ficha', parts: GBP_VIEWS, combine: (v) => v.reduce((a, b) => a + b, 0), format: 'int' },
  { key: 'gbp_calls', source: 'gbp', label: 'Llamadas desde la ficha', short: 'Llamadas', parts: one('gbp', 'calls'), combine: first, format: 'int' },
  { key: 'gbp_website', source: 'gbp', label: 'Clics a la web desde la ficha', short: 'Clics a la web', parts: one('gbp', 'website_clicks'), combine: first, format: 'int' },
  { key: 'gbp_directions', source: 'gbp', label: 'Cómo llegar', short: 'Cómo llegar', parts: one('gbp', 'directions'), combine: first, format: 'int' },
  { key: 'gbp_messages', source: 'gbp', label: 'Mensajes', short: 'Mensajes', parts: one('gbp', 'messages'), combine: first, format: 'int' },
  { key: 'gbp_bookings', source: 'gbp', label: 'Reservas', short: 'Reservas', parts: one('gbp', 'bookings'), combine: first, format: 'int' }
];
export const KPI = Object.fromEntries(KPIS.map((k) => [k.key, k])) as Record<string, Kpi>;

/** Cifras de las tarjetas y de las gráficas, por orden. */
export const TILE_KPIS = ['gsc_clicks', 'gsc_impressions', 'gsc_position', 'ga4_organic', 'ga4_sessions', 'ga4_keyEvents', 'gbp_views', 'gbp_calls', 'gbp_website', 'gbp_directions'];
export const CHART_KPIS = ['gsc_clicks', 'gsc_impressions', 'ga4_sessions', 'ga4_keyEvents', 'gbp_views', 'gbp_calls'];
/** Cifras que vigilan los avisos y que salen en el panel y en los informes. */
export const WATCH_KPIS = ['gsc_clicks', 'ga4_sessions', 'ga4_keyEvents', 'gbp_views', 'gbp_calls'];

/** Cifra de un periodo (null si no hay ni un día con datos de esa fuente). */
export function kpiValue(kpi: Kpi, days: DayMap, from: string, to: string): number | null {
  const sums = kpi.parts.map(() => 0);
  let any = false;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const day = days.get(d);
    if (!day) continue;
    let has = false;
    kpi.parts.forEach((p, i) => {
      const v = day.get(p);
      if (v !== undefined) {
        sums[i] += v;
        has = true;
      }
    });
    // Un día cuenta como «con datos» si la fuente tiene algo ese día (aunque esta serie concreta sea 0).
    if (!has) for (const k of day.keys()) if (k.startsWith(`${kpi.source}|`)) has = true;
    if (has) any = true;
  }
  return any ? kpi.combine(sums) : null;
}

/** Variación en % (null si no hay base). «good» tiene en cuenta si bajar es mejor (posición). */
export function delta(cur: number | null, prev: number | null, lowerBetter = false): { pct: number | null; good: boolean | null; diff: number | null } {
  if (cur === null || prev === null) return { pct: null, good: null, diff: null };
  const diff = cur - prev;
  const pct = prev !== 0 ? (diff / Math.abs(prev)) * 100 : null;
  return { pct, good: diff === 0 ? null : lowerBetter ? diff < 0 : diff > 0, diff };
}

export function formatValue(v: number | null, format: Kpi['format']): string {
  if (v === null || !Number.isFinite(v)) return '—';
  if (format === 'pct') return `${v.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;
  if (format === 'dec') return v.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  return Math.round(v).toLocaleString('es-ES');
}

export function formatDelta(pct: number | null): string {
  if (pct === null || !Number.isFinite(pct)) return '';
  const r = Math.round(pct);
  return `${r > 0 ? '+' : r < 0 ? '−' : '±'}${Math.abs(r)} %`;
}

// --- Periodos y comparaciones -------------------------------------------------------------------------------------

export type PeriodKey = '28' | '90' | '365' | 'all' | 'custom';
export type CompareKey = 'prev' | 'yoy' | 'contract' | 'none';
export const PERIOD_LABEL: Record<PeriodKey, string> = { '28': 'Últimos 28 días', '90': 'Últimos 3 meses', '365': 'Últimos 12 meses', all: 'Todo el histórico', custom: 'A medida' };
export const COMPARE_LABEL: Record<CompareKey, string> = { prev: 'el periodo anterior', yoy: 'el mismo periodo del año pasado', contract: 'antes del inicio del servicio', none: 'sin comparar' };

export type Range = { from: string; to: string };

/**
 * Periodo de una fuente: acaba en su último día con datos (cada fuente llega con su retraso) salvo en «a medida».
 * La comparación tiene la misma duración: justo antes, 52 semanas antes (mismos días de la semana) o justo antes del
 * inicio del servicio.
 */
export function periodRanges(
  period: PeriodKey,
  compare: CompareKey,
  src: { syncedUntil: string | null; historyFrom: string | null },
  opts: { from?: string; to?: string; serviceStart?: string | null; prev?: Range } = {}
): { cur: Range; prev: Range | null } | null {
  if (!src.syncedUntil) return null;
  let to = src.syncedUntil;
  let from: string;
  if (period === 'custom' && opts.from && opts.to && opts.from <= opts.to) {
    from = opts.from;
    to = opts.to < to ? opts.to : to;
    if (from > to) return null;
  } else if (period === 'all') from = src.historyFrom ?? addDays(to, -27);
  else from = addDays(to, -(Number(period === 'custom' ? '28' : period) - 1));
  const len = daysBetween(from, to) + 1;
  let prev: Range | null = null;
  if (compare === 'prev' && period !== 'all') prev = { from: addDays(from, -len), to: addDays(from, -1) };
  else if (compare === 'yoy') prev = { from: addDays(from, -364), to: addDays(to, -364) };
  else if (compare === 'contract' && opts.serviceStart) prev = { from: addDays(opts.serviceStart, -len), to: addDays(opts.serviceStart, -1) };
  // Comparación fija (el informe del mes compara con el mes natural anterior o el mismo mes del año pasado).
  if (opts.prev && compare !== 'none') prev = opts.prev;
  return { cur: { from, to }, prev };
}

/** Tramos de una gráfica: por semanas (lunes) hasta ~13 meses; por meses si es más largo. */
export function buckets(from: string, to: string): { label: string; from: string; to: string }[] {
  const out: { label: string; from: string; to: string }[] = [];
  if (daysBetween(from, to) > 400) {
    for (let m = monthStart(from); m <= to; m = addMonths(m, 1)) out.push({ label: fmtMonth(m), from: m < from ? from : m, to: monthEnd(m) > to ? to : monthEnd(m) });
    return out;
  }
  if (daysBetween(from, to) < 35) {
    for (let d = from; d <= to; d = addDays(d, 1)) out.push({ label: fmtDay(d), from: d, to: d });
    return out;
  }
  for (let w = mondayOf(from); w <= to; w = addDays(w, 7)) out.push({ label: fmtDay(w < from ? from : w), from: w < from ? from : w, to: addDays(w, 6) > to ? to : addDays(w, 6) });
  return out;
}

// --- Consultas y páginas que suben y bajan -------------------------------------------------------------------------

export type TopRow = { key: string; clicks: number; impressions: number; position: number };
export type Mover = { key: string; clicks: number; prevClicks: number; diff: number; position: number; prevPosition: number | null };

export function movers(cur: TopRow[], prev: TopRow[], n = 10): { up: Mover[]; down: Mover[]; fresh: Mover[]; lost: Mover[] } {
  const p = new Map(prev.map((r) => [r.key, r]));
  const c = new Map(cur.map((r) => [r.key, r]));
  const all: Mover[] = cur.map((r) => {
    const b = p.get(r.key);
    return { key: r.key, clicks: r.clicks, prevClicks: b?.clicks ?? 0, diff: r.clicks - (b?.clicks ?? 0), position: r.position, prevPosition: b?.position ?? null };
  });
  const lost: Mover[] = prev
    .filter((r) => !c.has(r.key) && r.clicks > 0)
    .map((r) => ({ key: r.key, clicks: 0, prevClicks: r.clicks, diff: -r.clicks, position: 0, prevPosition: r.position }))
    .sort((a, b) => a.diff - b.diff)
    .slice(0, n);
  return {
    up: all.filter((m) => m.diff > 0 && m.prevPosition !== null).sort((a, b) => b.diff - a.diff).slice(0, n),
    down: [...all.filter((m) => m.diff < 0), ...lost].sort((a, b) => a.diff - b.diff).slice(0, n),
    fresh: all.filter((m) => m.prevPosition === null && m.clicks > 0).sort((a, b) => b.clicks - a.clicks).slice(0, n),
    lost
  };
}

/** Días de un periodo en los que la fuente tiene algún dato. */
export function daysWithData(source: Source, days: DayMap, from: string, to: string): number {
  let n = 0;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const day = days.get(d);
    if (day && [...day.keys()].some((k) => k.startsWith(`${source}|`))) n++;
  }
  return n;
}

// --- Antes y después de un hito ------------------------------------------------------------------------------------

/**
 * Media diaria de las mismas semanas antes y después de una fecha (por defecto 4 semanas). Si aún no han pasado,
 * se compara con los días que hay (y se dice cuántos). Media diaria para que un «después» a medias sea comparable.
 */
export function beforeAfter(kpi: Kpi, days: DayMap, date: string, lastDay: string | null, window = 28): { before: number | null; after: number | null; afterDays: number; pct: number | null; good: boolean | null } {
  const empty = { before: null, after: null, afterDays: 0, pct: null, good: null };
  if (!lastDay || date > lastDay) return empty;
  const afterTo = addDays(date, window - 1) < lastDay ? addDays(date, window - 1) : lastDay;
  const afterDays = daysBetween(date, afterTo) + 1;
  // Media por día CON datos (si Analytics se instaló a mitad, el «antes» no sale artificialmente bajo) y con un
  // mínimo de 7 días; los porcentajes y la posición ya son medias.
  const avg = (from: string, to: string) => {
    const n = daysWithData(kpi.source, days, from, to);
    if (n < Math.min(7, daysBetween(from, to) + 1)) return null;
    const v = kpiValue(kpi, days, from, to);
    if (v === null) return null;
    return kpi.format === 'int' ? v / n : v;
  };
  const before = avg(addDays(date, -window), addDays(date, -1));
  const after = avg(date, afterTo);
  const d = delta(after, before, kpi.lowerBetter);
  return { before, after, afterDays, pct: d.pct, good: d.good };
}

// --- Avisos de caídas y subidas ------------------------------------------------------------------------------------

export type AlertFinding = { kpi: string; label: string; last7: number; baseline: number; pct: number; direction: 'baja' | 'sube'; to: string };

/**
 * Últimos 7 días frente a la media de las 4 semanas anteriores. Solo avisa si la base tiene volumen suficiente
 * (para no alarmar por 3 llamadas que pasan a 1) y todas las semanas tienen datos.
 */
export function detectAlerts(days: DayMap, lastDayBySource: Partial<Record<Source, string | null>>, cfg: { pct: number; rises: boolean; minVolume: number }): AlertFinding[] {
  const out: AlertFinding[] = [];
  for (const key of WATCH_KPIS) {
    const kpi = KPI[key];
    const to = lastDayBySource[kpi.source];
    if (!to) continue;
    const last7 = kpiValue(kpi, days, addDays(to, -6), to);
    if (last7 === null) continue;
    const weeks: number[] = [];
    for (let w = 1; w <= 4; w++) {
      const v = kpiValue(kpi, days, addDays(to, -6 - 7 * w), addDays(to, -7 * w));
      if (v === null) break;
      weeks.push(v);
    }
    if (weeks.length < 4) continue;
    const baseline = weeks.reduce((a, b) => a + b, 0) / 4;
    if (baseline < cfg.minVolume) continue;
    const pct = ((last7 - baseline) / baseline) * 100;
    if (pct <= -cfg.pct) out.push({ kpi: key, label: kpi.label, last7, baseline, pct, direction: 'baja', to });
    else if (cfg.rises && pct >= cfg.pct) out.push({ kpi: key, label: kpi.label, last7, baseline, pct, direction: 'sube', to });
  }
  return out;
}

// --- Hitos ---------------------------------------------------------------------------------------------------------

export const ANNOTATION_KINDS = ['servicio', 'web', 'contenido', 'campana', 'google', 'otro'] as const;
export type AnnotationKind = (typeof ANNOTATION_KINDS)[number];
export const ANNOTATION_KIND_LABEL: Record<AnnotationKind, string> = {
  servicio: 'Servicio',
  web: 'Web',
  contenido: 'Contenido',
  campana: 'Campaña',
  google: 'Cambio de Google',
  otro: 'Otro'
};
export const isAnnotationKind = (k: string): k is AnnotationKind => (ANNOTATION_KINDS as readonly string[]).includes(k);
export const isYmd = (d: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T12:00:00Z`)) && new Date(`${d}T12:00:00Z`).toISOString().slice(0, 10) === d;

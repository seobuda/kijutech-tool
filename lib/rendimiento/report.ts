import 'server-only';

// Módulo Rendimiento: lo que se enseña y se cuenta con los datos guardados (sin llamar a Google ni a la IA):
//   - clientPerformance   pestaña «Rendimiento» de la ficha y herramienta del agente
//   - tenantOverview      panel central de todos los clientes
//   - weeklyLines         apartado del informe semanal de Operaciones (por el registro del núcleo)
//   - monthlyClientText   informe del mes de un cliente (texto para copiar o para el agente)
//   - runPerformanceAlerts / runMonthlySummary  avisos de caídas y subidas, y resumen del mes por Telegram
import { getClient, listCoreClients } from '@/lib/core/clients';
import { externalEvents, telegramOutbound } from '@/lib/core/capabilities';
import {
  ANNOTATION_KIND_LABEL,
  CHART_KPIS,
  KPI,
  SOURCE_LABEL,
  TILE_KPIS,
  WATCH_KPIS,
  addDays,
  addMonths,
  beforeAfter,
  buckets,
  daysBetween,
  delta,
  detectAlerts,
  fmtDay,
  fmtDayYear,
  fmtMonth,
  fmtMonthLong,
  formatDelta,
  formatValue,
  kpiValue,
  madridNow,
  monthEnd,
  monthStart,
  movers,
  periodRanges,
  COMPARE_LABEL,
  PERIOD_LABEL,
  type AnnotationKind,
  type CompareKey,
  type DayMap,
  type Mover,
  type PeriodKey,
  type Range,
  type Source
} from '@/lib/rendimiento/rules';
import { activeBySource, breakdown, getSettings, listAnnotations, listSync, loadDays, loadTenantDays, monthlyTop, monthsWithTop, saveSettingsState, type PropertyRef } from '@/lib/rendimiento/store';
import type { PerfSync } from '@/lib/db/schema';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const BASE_URL = () => (process.env.BASE_URL || '').replace(/\/$/, '');
const minD = (xs: (string | null | undefined)[]) => xs.filter((x): x is string => Boolean(x)).sort()[0] ?? null;
const maxD = (xs: (string | null | undefined)[]) => xs.filter((x): x is string => Boolean(x)).sort().pop() ?? null;

export type SourceStatus = {
  source: Source;
  label: string;
  property: string;
  status: string;
  historyFrom: string | null;
  syncedUntil: string | null;
  lastRunAt: string | null;
  lastError: string | null;
  backfillDone: boolean;
  others: number; // propiedades anteriores (inactivas) de la misma fuente, con su histórico
};

export type KpiView = { key: string; label: string; short: string; source: Source; format: 'int' | 'pct' | 'dec'; lowerBetter: boolean; value: number | null; prev: number | null; pct: number | null; good: boolean | null; range: Range; prevRange: Range | null; note?: string };
export type ChartView = { key: string; label: string; format: 'int' | 'pct' | 'dec'; points: { label: string; from: string; to: string; value: number | null; prev: number | null }[] };
export type AnnotationView = {
  id: string | null;
  date: string;
  kind: string;
  kindLabel: string;
  title: string;
  notes: string;
  source: string;
  virtual: boolean;
  effects: { key: string; label: string; format: 'int' | 'pct' | 'dec'; before: number | null; after: number | null; afterDays: number; pct: number | null; good: boolean | null }[];
};
export type MoversView = { month: string; prevMonth: string; queries: { up: Mover[]; down: Mover[]; fresh: Mover[] }; pages: { up: Mover[]; down: Mover[]; fresh: Mover[] }; topQueries: { key: string; clicks: number; position: number }[] };

export type ClientPerformance = {
  clientId: string;
  name: string;
  period: PeriodKey;
  compare: CompareKey;
  periodLabel: string;
  compareLabel: string;
  serviceStart: string | null;
  sources: SourceStatus[];
  kpis: KpiView[];
  charts: ChartView[];
  annotations: AnnotationView[];
  movers: MoversView | null;
  channels: { key: string; value: number; prev: number | null }[];
  devices: { key: string; value: number }[];
  hasData: boolean;
};

function statusOf(rows: PerfSync[], active: Partial<Record<Source, PerfSync>>): SourceStatus[] {
  const out: SourceStatus[] = [];
  for (const s of ['gsc', 'ga4', 'gbp'] as Source[]) {
    const r = active[s];
    if (!r) continue;
    out.push({
      source: s,
      label: SOURCE_LABEL[s],
      property: r.property,
      status: r.status,
      historyFrom: r.historyFrom,
      syncedUntil: r.syncedUntil,
      lastRunAt: r.lastRunAt ? r.lastRunAt.toISOString() : null,
      lastError: r.lastError,
      backfillDone: r.backfillDone,
      others: rows.filter((x) => x.source === s && x.id !== r.id).length
    });
  }
  return out;
}

/** Cifras, gráficas, hitos (con su antes y después), consultas que suben y bajan, canales y dispositivos. */
export async function clientPerformance(
  tenantId: string,
  clientId: string,
  opts: { period?: PeriodKey; compare?: CompareKey; from?: string; to?: string; isAdmin?: boolean; prevRange?: Range } = {}
): Promise<ClientPerformance | null> {
  const client = await getClient(tenantId, clientId);
  if (!client) return null;
  const period = opts.period ?? '28';
  const compare = opts.compare ?? 'prev';
  const syncRows = await listSync(tenantId, clientId);
  const active = activeBySource(syncRows);
  const sources = statusOf(syncRows, active);
  const serviceStart = client.startedAt ?? (opts.isAdmin ? client.contractStart : null) ?? null;

  const ranges: Partial<Record<Source, { cur: Range; prev: Range | null }>> = {};
  for (const s of sources) {
    const r = periodRanges(period, compare, { syncedUntil: s.syncedUntil, historyFrom: s.historyFrom }, { from: opts.from, to: opts.to, serviceStart, prev: opts.prevRange });
    if (r) ranges[s.source] = r;
  }
  const stored = await listAnnotations(tenantId, clientId);
  const annDates = [...stored.map((a) => a.date), ...(serviceStart ? [serviceStart] : [])];
  const refs: PropertyRef[] = sources.map((s) => ({ source: s.source, property: s.property }));
  const loadFrom = minD([...Object.values(ranges).flatMap((r) => [r!.cur.from, r!.prev?.from]), ...annDates.map((d) => addDays(d, -28))]);
  const loadTo = maxD(sources.map((s) => s.syncedUntil));
  const days: DayMap = loadFrom && loadTo ? await loadDays(tenantId, clientId, refs, loadFrom, loadTo) : new Map();

  const kpis: KpiView[] = [];
  for (const key of TILE_KPIS) {
    const k = KPI[key];
    const r = ranges[k.source];
    if (!r) continue;
    const value = kpiValue(k, days, r.cur.from, r.cur.to);
    const prev = r.prev ? kpiValue(k, days, r.prev.from, r.prev.to) : null;
    const d = delta(value, prev, k.lowerBetter);
    kpis.push({ key, label: k.label, short: k.short, source: k.source, format: k.format, lowerBetter: Boolean(k.lowerBetter), value, prev, pct: d.pct, good: d.good, range: r.cur, prevRange: r.prev, note: k.note });
  }

  const charts: ChartView[] = [];
  for (const key of CHART_KPIS) {
    const k = KPI[key];
    const r = ranges[k.source];
    if (!r) continue;
    const shift = r.prev ? daysBetween(r.cur.from, r.prev.from) : null;
    charts.push({
      key,
      label: k.label,
      format: k.format,
      points: buckets(r.cur.from, r.cur.to).map((b) => ({
        label: b.label,
        from: b.from,
        to: b.to,
        value: kpiValue(k, days, b.from, b.to),
        prev: shift !== null ? kpiValue(k, days, addDays(b.from, shift), addDays(b.to, shift)) : null
      }))
    });
  }

  const lastBySource: Partial<Record<Source, string | null>> = Object.fromEntries(sources.map((s) => [s.source, s.syncedUntil]));
  const effectsFor = (date: string) =>
    WATCH_KPIS.filter((key) => lastBySource[KPI[key].source])
      .map((key) => ({ key, label: KPI[key].short, format: KPI[key].format, ...beforeAfter(KPI[key], days, date, lastBySource[KPI[key].source] ?? null) }))
      .filter((e) => e.before !== null || e.after !== null);
  const annotations: AnnotationView[] = stored.map((a) => ({
    id: a.id,
    date: a.date,
    kind: a.kind,
    kindLabel: ANNOTATION_KIND_LABEL[a.kind as AnnotationKind] ?? a.kind,
    title: a.title,
    notes: a.notes ?? '',
    source: a.source,
    virtual: false,
    effects: effectsFor(a.date)
  }));
  if (serviceStart) annotations.push({ id: null, date: serviceStart, kind: 'servicio', kindLabel: 'Servicio', title: 'Inicio del servicio con Kijutech', notes: 'De la ficha del cliente.', source: 'sistema', virtual: true, effects: effectsFor(serviceStart) });
  // Calendario de la agencia (módulo Estrategia, por el núcleo): actualizaciones de Google e incidencias de datos.
  if (loadFrom && loadTo) {
    for (const ev of await externalEvents(tenantId, loadFrom, loadTo)) {
      if (ev.kind !== 'google' && ev.kind !== 'datos') continue;
      annotations.push({ id: null, date: ev.date, kind: ev.kind === 'google' ? 'google' : 'otro', kindLabel: ev.kind === 'google' ? 'Google' : 'Datos', title: ev.title, notes: `Calendario de la agencia${ev.endDate ? ` (hasta el ${fmtDayYear(ev.endDate)})` : ''}.`, source: 'sistema', virtual: true, effects: effectsFor(ev.date) });
    }
  }
  annotations.sort((a, b) => b.date.localeCompare(a.date));

  let moversView: MoversView | null = null;
  const gsc = active.gsc;
  if (gsc) {
    const months = await monthsWithTop(tenantId, clientId, gsc.property);
    if (months.length) {
      const m = months[0];
      const pm = addMonths(m, -1);
      const [q, pq, p, pp] = await Promise.all([
        monthlyTop(tenantId, clientId, gsc.property, m, 'query'),
        monthlyTop(tenantId, clientId, gsc.property, pm, 'query'),
        monthlyTop(tenantId, clientId, gsc.property, m, 'page'),
        monthlyTop(tenantId, clientId, gsc.property, pm, 'page')
      ]);
      const mq = movers(q, pq, 8);
      const mp = movers(p, pp, 8);
      moversView = {
        month: m,
        prevMonth: pm,
        queries: { up: pq.length ? mq.up : [], down: pq.length ? mq.down : [], fresh: pq.length ? mq.fresh : [] },
        pages: { up: pp.length ? mp.up : [], down: pp.length ? mp.down : [], fresh: pp.length ? mp.fresh : [] },
        topQueries: q.slice(0, 10).map((x) => ({ key: x.key, clicks: x.clicks, position: x.position }))
      };
    }
  }

  let channels: ClientPerformance['channels'] = [];
  if (active.ga4 && ranges.ga4) {
    const ref = { source: 'ga4' as const, property: active.ga4.property };
    const [cur, prev] = await Promise.all([
      breakdown(tenantId, clientId, ref, 'sessions', 'channel', ranges.ga4.cur.from, ranges.ga4.cur.to),
      ranges.ga4.prev ? breakdown(tenantId, clientId, ref, 'sessions', 'channel', ranges.ga4.prev.from, ranges.ga4.prev.to) : Promise.resolve([])
    ]);
    const pm = new Map(prev.map((x) => [x.key, x.value]));
    channels = cur.slice(0, 8).map((x) => ({ key: x.key, value: x.value, prev: ranges.ga4!.prev ? (pm.get(x.key) ?? 0) : null }));
  }
  let devices: ClientPerformance['devices'] = [];
  if (gsc && ranges.gsc) devices = await breakdown(tenantId, clientId, { source: 'gsc', property: gsc.property }, 'clicks', 'device', ranges.gsc.cur.from, ranges.gsc.cur.to);

  return {
    clientId,
    name: client.name,
    period,
    compare,
    periodLabel: PERIOD_LABEL[period],
    compareLabel: COMPARE_LABEL[compare],
    serviceStart,
    sources,
    kpis,
    charts,
    annotations,
    movers: moversView,
    channels,
    devices,
    hasData: kpis.some((k) => k.value !== null)
  };
}

/** Texto para el agente: cifras con su variación, hitos con su efecto y consultas que suben y bajan. */
export function performanceText(p: ClientPerformance): string {
  if (!p.sources.length) return `${p.name} no tiene propiedades de Google en su ficha (Clientes → ${p.name} → Webs y cuentas → «Buscar en Google»). Sin ellas no hay histórico.`;
  const lines: string[] = [`Rendimiento de ${p.name} · ${p.periodLabel.toLowerCase()}${p.compare !== 'none' ? ` frente a ${p.compareLabel}` : ''} (datos guardados, sin coste):`];
  for (const s of p.sources) lines.push(`- ${s.label}: ${s.status === 'error' ? `ERROR (${s.lastError ?? 'sin detalle'})` : s.syncedUntil ? `datos desde ${fmtDayYear(s.historyFrom ?? s.syncedUntil)} hasta ${fmtDayYear(s.syncedUntil)}${s.backfillDone ? '' : ' (aún descargando el histórico)'}` : 'aún sin datos (descargando)'}`);
  if (!p.hasData) return lines.join('\n');
  lines.push('Cifras:');
  for (const k of p.kpis) {
    if (k.value === null) continue;
    lines.push(`- ${k.label}: ${formatValue(k.value, k.format)}${k.prev !== null ? ` (antes ${formatValue(k.prev, k.format)}, ${formatDelta(k.pct) || 'igual'})` : ''} · ${fmtDay(k.range.from)} a ${fmtDayYear(k.range.to)}${k.note ? ` · ${k.note}` : ''}`);
  }
  if (p.channels.length) lines.push(`Sesiones por canal: ${p.channels.map((c) => `${c.key} ${formatValue(c.value, 'int')}${c.prev !== null ? ` (${formatDelta(c.prev ? ((c.value - c.prev) / c.prev) * 100 : null) || 'nuevo'})` : ''}`).join(' · ')}`);
  if (p.annotations.length) {
    lines.push('Hitos (media diaria 4 semanas antes → después):');
    for (const a of p.annotations.slice(0, 8)) {
      const eff = a.effects.map((e) => `${e.label} ${formatValue(e.before, e.format === 'int' ? 'dec' : e.format)}→${formatValue(e.after, e.format === 'int' ? 'dec' : e.format)}${e.pct !== null ? ` (${formatDelta(e.pct)})` : ''}${e.afterDays < 28 ? ` [solo ${e.afterDays} días después]` : ''}`);
      lines.push(`- ${fmtDayYear(a.date)} · ${a.kindLabel}: ${a.title}${eff.length ? ` → ${eff.join(', ')}` : ''}`);
    }
  }
  if (p.movers) {
    const m = p.movers;
    const fmt = (xs: Mover[]) => xs.slice(0, 5).map((x) => `«${x.key}» ${x.prevClicks}→${x.clicks}`).join(', ');
    lines.push(`Consultas de ${fmtMonthLong(m.month)} frente a ${fmtMonthLong(m.prevMonth)}:`);
    if (m.queries.up.length) lines.push(`- Suben: ${fmt(m.queries.up)}`);
    if (m.queries.down.length) lines.push(`- Bajan: ${fmt(m.queries.down)}`);
    if (m.queries.fresh.length) lines.push(`- Nuevas: ${fmt(m.queries.fresh)}`);
    if (m.topQueries.length) lines.push(`- Las que más clics traen: ${m.topQueries.slice(0, 5).map((x) => `«${x.key}» ${x.clicks}`).join(', ')}`);
  }
  return lines.join('\n');
}

// --- Panel central (todos los clientes) -----------------------------------------------------------------------------

export type OverviewRow = {
  clientId: string;
  name: string;
  status: string;
  sources: Source[];
  syncIssue: string | null;
  lastData: string | null;
  kpis: Record<string, { value: number | null; prev: number | null; pct: number | null; good: boolean | null }>;
};

/** Últimos N días (hasta el último dato de cada fuente) frente a los N anteriores, por cliente. */
export async function tenantOverview(tenantId: string, days = 28): Promise<OverviewRow[]> {
  const [clients, syncRows] = await Promise.all([listCoreClients(tenantId), listSync(tenantId)]);
  const byClient = new Map<string, PerfSync[]>();
  for (const r of syncRows) byClient.set(r.clientId, [...(byClient.get(r.clientId) ?? []), r]);
  const actives = new Map<string, Partial<Record<Source, PerfSync>>>();
  for (const [c, rows] of byClient) actives.set(c, activeBySource(rows));
  const refs = [...actives.entries()].flatMap(([clientId, a]) => Object.values(a).map((r) => ({ clientId, source: r!.source as Source, property: r!.property })));
  // El rango sale de las propiedades activas: una antigua (inactiva) no debe arrastrar años de datos en cada carga.
  const all = [...actives.values()].flatMap((a) => Object.values(a) as PerfSync[]);
  const live = all.filter((r) => r.status !== 'inactiva');
  const sus = (live.length ? live : all).map((r) => r.syncedUntil);
  const from = minD(sus);
  const to = maxD(sus);
  const data = from && to ? await loadTenantDays(tenantId, refs, addDays(from, -(2 * days - 1)), to) : new Map<string, DayMap>();
  const out: OverviewRow[] = [];
  for (const c of clients) {
    const a = actives.get(c.id);
    if (!a || !Object.keys(a).length) continue;
    const dm = data.get(c.id) ?? new Map();
    const kpis: OverviewRow['kpis'] = {};
    for (const key of WATCH_KPIS) {
      const k = KPI[key];
      const su = a[k.source]?.syncedUntil;
      if (!su) continue;
      const value = kpiValue(k, dm, addDays(su, -(days - 1)), su);
      const prev = kpiValue(k, dm, addDays(su, -(2 * days - 1)), addDays(su, -days));
      const d = delta(value, prev, k.lowerBetter);
      kpis[key] = { value, prev, pct: d.pct, good: d.good };
    }
    const rows = Object.values(a) as PerfSync[];
    const err = rows.find((r) => r.status === 'error');
    const loading = rows.find((r) => r.status === 'pendiente' || (r.status === 'descargando' && !r.syncedUntil));
    out.push({
      clientId: c.id,
      name: c.name,
      status: c.status,
      sources: rows.filter((r) => r.status !== 'inactiva').map((r) => r.source as Source),
      syncIssue: err ? `${SOURCE_LABEL[err.source as Source]}: ${err.lastError ?? 'error'}` : loading ? 'Descargando el histórico…' : null,
      lastData: maxD(rows.map((r) => r.syncedUntil)),
      kpis
    });
  }
  return out;
}

// --- Informe semanal (apartado de Rendimiento) ----------------------------------------------------------------------

/** Líneas del informe semanal: total de la agencia y los clientes que más caen o suben (7 días frente a los 7 anteriores). */
export async function weeklyLines(tenantId: string): Promise<string[] | null> {
  const cfg = await getSettings(tenantId);
  if (!cfg.weeklySection) return null;
  const rows = await tenantOverview(tenantId, 7);
  if (!rows.length) return null;
  const lines: string[] = [];
  const total = (key: string) => {
    let v = 0;
    let p = 0;
    let n = 0;
    for (const r of rows) {
      const x = r.kpis[key];
      if (x?.value != null && x.prev != null) {
        v += x.value;
        p += x.prev;
        n++;
      }
    }
    return n ? `${formatValue(v, 'int')}${p ? ` (${formatDelta(((v - p) / p) * 100) || 'igual'})` : ''}` : null;
  };
  const tot = [['gsc_clicks', 'clics desde Google'], ['ga4_sessions', 'sesiones'], ['ga4_keyEvents', 'conversiones'], ['gbp_calls', 'llamadas desde la ficha']]
    .map(([k, label]) => {
      const t = total(k);
      return t ? `${label} ${t}` : null;
    })
    .filter(Boolean);
  if (tot.length) lines.push(`• Todos los clientes, 7 días: ${tot.join(' · ')}`);
  const moves: { name: string; label: string; pct: number }[] = [];
  for (const r of rows)
    for (const key of WATCH_KPIS) {
      const x = r.kpis[key];
      if (!x || x.pct === null || x.prev === null || x.prev < cfg.alertMinVolume) continue;
      if (Math.abs(x.pct) >= cfg.alertPct) moves.push({ name: r.name, label: KPI[key].short.toLowerCase(), pct: x.pct });
    }
  moves.sort((a, b) => a.pct - b.pct);
  for (const m of moves.filter((x) => x.pct < 0).slice(0, 5)) lines.push(`   ⬇️ ${esc(m.name)}: ${m.label} ${formatDelta(m.pct)}`);
  for (const m of moves.filter((x) => x.pct > 0).slice(-3).reverse()) lines.push(`   ⬆️ ${esc(m.name)}: ${m.label} ${formatDelta(m.pct)}`);
  const issues = rows.filter((r) => r.syncIssue && !r.syncIssue.startsWith('Descargando'));
  if (issues.length) lines.push(`   ⚠️ Sin datos al día: ${issues.map((r) => esc(r.name)).join(', ')} (Clientes → Rendimiento)`);
  return lines.length ? lines : null;
}

// --- Informe del mes de un cliente ----------------------------------------------------------------------------------

/** Mes cerrado anterior a hoy (AAAA-MM-01). */
export const previousMonth = (today: string) => addMonths(monthStart(today), -1);

/** Informe del mes de un cliente en texto plano (para copiar y enviar, o para el agente). */
export async function monthlyClientText(tenantId: string, clientId: string, month: string, opts: { isAdmin?: boolean } = {}): Promise<string | null> {
  const m = monthStart(month);
  const [vsPrev, vsYear] = await Promise.all([
    clientPerformance(tenantId, clientId, { period: 'custom', compare: 'prev', from: m, to: monthEnd(m), isAdmin: opts.isAdmin, prevRange: { from: addMonths(m, -1), to: monthEnd(addMonths(m, -1)) } }),
    clientPerformance(tenantId, clientId, { period: 'custom', compare: 'yoy', from: m, to: monthEnd(m), isAdmin: opts.isAdmin, prevRange: { from: addMonths(m, -12), to: monthEnd(addMonths(m, -12)) } })
  ]);
  if (!vsPrev || !vsPrev.hasData) return null;
  const yoy = new Map(vsYear?.kpis.map((k) => [k.key, k]) ?? []);
  const lines = [`Informe de ${fmtMonthLong(m)} · ${vsPrev.name}`, ''];
  for (const k of vsPrev.kpis) {
    if (k.value === null) continue;
    const y = yoy.get(k.key);
    const partial = k.range.to < monthEnd(m) ? ` (hasta el ${fmtDay(k.range.to)})` : '';
    lines.push(`• ${k.label}: ${formatValue(k.value, k.format)}${partial}${k.pct !== null ? ` · ${formatDelta(k.pct)} frente al mes anterior` : ''}${y?.pct != null ? ` · ${formatDelta(y.pct)} frente a ${fmtMonth(addMonths(m, -12))}` : ''}`);
  }
  const ms = vsPrev.annotations.filter((a) => a.date >= m && a.date <= monthEnd(m));
  if (ms.length) {
    lines.push('', 'Lo que hicimos este mes:');
    for (const a of ms.reverse()) lines.push(`• ${fmtDay(a.date)}: ${a.title}`);
  }
  if (vsPrev.movers && vsPrev.movers.month === m) {
    const mv = vsPrev.movers;
    if (mv.topQueries.length) lines.push('', `Búsquedas que más clics traen: ${mv.topQueries.slice(0, 5).map((x) => `«${x.key}» (${x.clicks})`).join(', ')}.`);
    if (mv.queries.up.length) lines.push(`Las que más crecen: ${mv.queries.up.slice(0, 5).map((x) => `«${x.key}» (${x.prevClicks} → ${x.clicks})`).join(', ')}.`);
  }
  return lines.join('\n');
}

// --- Avisos y resumen mensual por Telegram (planificador) -----------------------------------------------------------

const ALERT_HOUR = 9;

/**
 * Avisos confirmados: la caída (o subida) tiene que verse también con el día anterior como último día, para no
 * avisar por un solo día raro ni por un día con datos aún incompletos (recomendación de la investigación del 15 nov).
 */
export function confirmedAlerts(dm: DayMap, lastBy: Partial<Record<Source, string | null>>, cfg: { pct: number; rises: boolean; minVolume: number }) {
  const prevBy: Partial<Record<Source, string | null>> = {};
  for (const [k, v] of Object.entries(lastBy)) prevBy[k as Source] = v ? addDays(v, -1) : v;
  const before = new Set(detectAlerts(dm, prevBy, cfg).map((f) => `${f.kpi}:${f.direction}`));
  return detectAlerts(dm, lastBy, cfg).filter((f) => before.has(`${f.kpi}:${f.direction}`));
}

/** Una vez al día (desde las 9:00, cuando la descarga diaria ya ha pasado): caídas y subidas fuertes por cliente. */
export async function runPerformanceAlerts(tenantId: string, now = new Date()): Promise<number> {
  const cfg = await getSettings(tenantId);
  if (!cfg.alertsEnabled) return 0;
  const t = madridNow(now);
  if (t.hour < ALERT_HOUR || cfg.state.lastAlertsOn === t.date) return 0;
  const syncRows = await listSync(tenantId);
  const live = syncRows.filter((r) => r.status !== 'inactiva');
  if (!live.length) return 0;
  // Espera a que la descarga de hoy termine (o hasta las 12:00 como mucho).
  if (t.hour < 12 && live.some((r) => r.status !== 'error' && r.backfillDone && r.lastDailyOn !== t.date)) return 0;
  const clients = new Map((await listCoreClients(tenantId)).map((c) => [c.id, c]));
  const byClient = new Map<string, PerfSync[]>();
  for (const r of syncRows) byClient.set(r.clientId, [...(byClient.get(r.clientId) ?? []), r]);
  const refs: (PropertyRef & { clientId: string })[] = [];
  const lastBy = new Map<string, Partial<Record<Source, string | null>>>();
  for (const [c, rows] of byClient) {
    const a = activeBySource(rows);
    const lb: Partial<Record<Source, string | null>> = {};
    for (const r of Object.values(a)) {
      if (!r || r.status === 'inactiva' || !r.syncedUntil) continue;
      // Solo fuentes al día (si una lleva días sin datos, eso no es una caída: lo dice Salud).
      if (r.syncedUntil < addDays(t.date, -7)) continue;
      lb[r.source as Source] = r.syncedUntil;
      refs.push({ clientId: c, source: r.source as Source, property: r.property });
    }
    lastBy.set(c, lb);
  }
  const all = refs.length ? await loadTenantDays(tenantId, refs, addDays(t.date, -45), t.date) : new Map<string, DayMap>();
  const sent = { ...(cfg.state.sentAlerts ?? {}) };
  for (const [k, d] of Object.entries(sent)) if (d < addDays(t.date, -30)) delete sent[k];
  const lines: string[] = [];
  // Actualizaciones de Google o incidencias de datos en los últimos 10 días: el aviso lo dice (puede no ser culpa del cliente).
  const events = (await externalEvents(tenantId, addDays(t.date, -10), t.date)).filter((e) => e.kind === 'google' || e.kind === 'datos');
  const eventNote = events.length ? ` · coincide con ${events.map((e) => `«${esc(e.title)}»`).join(', ')}` : '';
  const alertCfg = { pct: cfg.alertPct, rises: cfg.alertRises, minVolume: cfg.alertMinVolume };
  for (const [clientId, dm] of all) {
    const c = clients.get(clientId);
    if (!c) continue;
    for (const f of confirmedAlerts(dm, lastBy.get(clientId) ?? {}, alertCfg)) {
      const key = `${clientId}:${f.kpi}:${f.direction}`;
      if (sent[key] && sent[key] > addDays(t.date, -7)) continue; // como mucho un aviso por cifra y semana
      sent[key] = t.date;
      lines.push(`${f.direction === 'baja' ? '🔻' : '🔺'} <b>${esc(c.name)}</b>: ${esc(f.label.toLowerCase())} ${formatDelta(f.pct)} (${formatValue(f.last7, 'int')} en 7 días; lo normal, ${formatValue(f.baseline, 'int')})${eventNote}`);
    }
  }
  await saveSettingsState(tenantId, { ...cfg.state, sentAlerts: sent, lastAlertsOn: t.date });
  if (!lines.length) return 0;
  const base = BASE_URL();
  await telegramOutbound()?.notifyOwner(
    tenantId,
    `perf:alerts:${t.date}`,
    `📈 <b>Rendimiento: cambios fuertes</b>\nÚltimos 7 días frente a la media de las 4 semanas anteriores.\n\n${lines.join('\n')}${base ? `\n\n<a href="${base}/dashboard/rendimiento">Abrir el panel de rendimiento</a>` : '\n\nDetalle en Rendimiento.'}`
  );
  return lines.length;
}

/** El día 5 de cada mes (desde las 9:00): resumen del mes anterior de todos los clientes. */
export async function runMonthlySummary(tenantId: string, now = new Date()): Promise<boolean> {
  const cfg = await getSettings(tenantId);
  if (!cfg.monthlyReport) return false;
  const t = madridNow(now);
  const month = previousMonth(t.date);
  if (t.day < 5 || t.hour < ALERT_HOUR || cfg.state.lastMonthly === month) return false;
  const syncRows = await listSync(tenantId);
  const clients = await listCoreClients(tenantId);
  const byClient = new Map<string, PerfSync[]>();
  for (const r of syncRows) byClient.set(r.clientId, [...(byClient.get(r.clientId) ?? []), r]);
  const refs: (PropertyRef & { clientId: string })[] = [];
  for (const [c, rows] of byClient) for (const r of Object.values(activeBySource(rows))) if (r) refs.push({ clientId: c, source: r.source as Source, property: r.property });
  const prevM = addMonths(month, -1);
  const data = refs.length ? await loadTenantDays(tenantId, refs, prevM, monthEnd(month)) : new Map<string, DayMap>();
  const lines: string[] = [];
  for (const c of clients) {
    const dm = data.get(c.id);
    if (!dm) continue;
    const parts: string[] = [];
    for (const key of ['gsc_clicks', 'ga4_sessions', 'ga4_keyEvents', 'gbp_calls']) {
      const k = KPI[key];
      const v = kpiValue(k, dm, month, monthEnd(month));
      if (v === null) continue;
      const p = kpiValue(k, dm, prevM, monthEnd(prevM));
      parts.push(`${k.short.toLowerCase()} ${formatValue(v, k.format)}${formatDelta(delta(v, p).pct) ? ` (${formatDelta(delta(v, p).pct)})` : ''}`);
    }
    if (parts.length) lines.push(`• <b>${esc(c.name)}</b>: ${parts.join(' · ')}`);
  }
  await saveSettingsState(tenantId, { ...cfg.state, lastMonthly: month });
  if (!lines.length) return false;
  const base = BASE_URL();
  await telegramOutbound()?.notifyOwner(
    tenantId,
    `perf:monthly:${month.slice(0, 7)}`,
    `📅 <b>Rendimiento de ${fmtMonthLong(month)}</b> (frente al mes anterior)\n\n${lines.join('\n')}\n\nEl informe de cada cliente, listo para copiar, está en su ficha → Rendimiento.${base ? `\n<a href="${base}/dashboard/rendimiento">Abrir el panel</a>` : ''}`
  );
  return true;
}

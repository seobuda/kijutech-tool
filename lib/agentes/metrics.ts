import 'server-only';

// Fuente de métricas de Google para el módulo Rendimiento (15 nov 2026). Se registra en el núcleo
// (registerMetricSource) desde register.ts: Rendimiento pide filas diarias ya normalizadas y no sabe de Google.
//   gsc  Search Console: clics, impresiones y posición por día; y por dispositivo. Consultas y páginas del mes.
//   ga4  Analytics 4: sesiones, usuarios, usuarios nuevos, eventos clave, sesiones con interacción y páginas vistas por
//        día; sesiones y eventos clave por canal.
//   gbp  Business Profile: vistas en Búsqueda y Maps (móvil y ordenador), llamadas, clics a la web, cómo llegar,
//        mensajes y reservas por día (un valor ausente es 0, según Google).
import type { MetricRow, MetricSource, MetricTopRow } from '@/lib/core/capabilities';
import { gapiFetch, isConnected } from '@/lib/agentes/integrations';

/** Nombre corto con el que se guarda cada métrica de Business Profile. */
export const GBP_METRIC_KEYS: Record<string, string> = {
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: 'views_search_mobile',
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: 'views_search_desktop',
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: 'views_maps_mobile',
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: 'views_maps_desktop',
  CALL_CLICKS: 'calls',
  WEBSITE_CLICKS: 'website_clicks',
  BUSINESS_DIRECTION_REQUESTS: 'directions',
  MESSAGING_CLICKS: 'messages',
  BUSINESS_BOOKINGS: 'bookings'
};

const GA4_DAILY = ['sessions', 'totalUsers', 'newUsers', 'keyEvents', 'engagedSessions', 'screenPageViews'];
const GA4_CHANNEL = ['sessions', 'keyEvents'];

/** Identificador estable: la URL exacta de Search Console, «properties/123» o «locations/123». */
export function normalizeGoogleProperty(source: string, value: string): string | null {
  const v = String(value ?? '').trim();
  if (!v) return null;
  if (source === 'gsc') return /^(sc-domain:[^\s/]+|https?:\/\/\S+)$/i.test(v) ? v : null;
  if (source === 'ga4') {
    const id = (v.match(/(?:properties\/)?(\d{5,})/) ?? [])[1];
    return id ? `properties/${id}` : null;
  }
  if (source === 'gbp') return (v.match(/locations\/\d+/) ?? [])[0] ?? null;
  return null;
}

const ga4Date = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
const pad = (n: number) => String(n).padStart(2, '0');

type GscRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };
type Ga4Resp = { rows?: { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }[] };
type GbpResp = { multiDailyMetricTimeSeries?: { dailyMetricTimeSeries?: { dailyMetric: string; timeSeries?: { datedValues?: { date: { year: number; month: number; day: number }; value?: string }[] } }[] }[] };

async function gscQuery(tenantId: string, site: string, body: Record<string, unknown>): Promise<GscRow[]> {
  const r = await gapiFetch<{ rows?: GscRow[] }>(tenantId, `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, body);
  return r.rows ?? [];
}

/** Respuesta de Search Console por día (y por día y dispositivo) a filas. Pura: se prueba sin Google. */
export function gscRowsToMetrics(byDate: GscRow[], byDevice: GscRow[]): MetricRow[] {
  const out: MetricRow[] = [];
  for (const r of byDate) {
    const date = r.keys[0];
    out.push({ date, metric: 'clicks', value: r.clicks }, { date, metric: 'impressions', value: r.impressions }, { date, metric: 'position', value: r.position });
  }
  for (const r of byDevice) {
    const [date, device] = r.keys;
    const dimValue = String(device ?? '').toLowerCase().slice(0, 120);
    out.push({ date, metric: 'clicks', dimType: 'device', dimValue, value: r.clicks }, { date, metric: 'impressions', dimType: 'device', dimValue, value: r.impressions });
  }
  return out;
}

/** Respuesta de Analytics (dimensión date, opcionalmente un desglose) a filas. Pura. */
export function ga4RowsToMetrics(r: Ga4Resp, metrics: string[], dimType: '' | 'channel'): MetricRow[] {
  const out: MetricRow[] = [];
  for (const row of r.rows ?? []) {
    const date = ga4Date(row.dimensionValues?.[0]?.value ?? '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const dimValue = dimType ? String(row.dimensionValues?.[1]?.value ?? '(otros)').slice(0, 120) : '';
    metrics.forEach((m, i) => out.push({ date, metric: m, dimType: dimType || undefined, dimValue: dimValue || undefined, value: Number(row.metricValues?.[i]?.value) || 0 }));
  }
  return out;
}

/** Respuesta de Business Profile a filas por día (ausente = 0). Pura. */
export function gbpRowsToMetrics(r: GbpResp): MetricRow[] {
  const out: MetricRow[] = [];
  for (const m of r.multiDailyMetricTimeSeries ?? [])
    for (const s of m.dailyMetricTimeSeries ?? []) {
      const metric = GBP_METRIC_KEYS[s.dailyMetric];
      if (!metric) continue;
      for (const v of s.timeSeries?.datedValues ?? []) out.push({ date: `${v.date.year}-${pad(v.date.month)}-${pad(v.date.day)}`, metric, value: Number(v.value) || 0 });
    }
  return out;
}

async function fetchDaily(tenantId: string, source: string, property: string, from: string, to: string): Promise<MetricRow[]> {
  if (source === 'gsc') {
    const base = { startDate: from, endDate: to, rowLimit: 25000, dataState: 'final' };
    const [byDate, byDevice] = await Promise.all([gscQuery(tenantId, property, { ...base, dimensions: ['date'] }), gscQuery(tenantId, property, { ...base, dimensions: ['date', 'device'] })]);
    return gscRowsToMetrics(byDate, byDevice);
  }
  if (source === 'ga4') {
    const id = property.replace(/\D/g, '');
    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${id}:runReport`;
    const dateRanges = [{ startDate: from, endDate: to }];
    const [daily, channel] = await Promise.all([
      gapiFetch<Ga4Resp>(tenantId, url, { dateRanges, dimensions: [{ name: 'date' }], metrics: GA4_DAILY.map((name) => ({ name })), limit: 100000 }),
      gapiFetch<Ga4Resp>(tenantId, url, { dateRanges, dimensions: [{ name: 'date' }, { name: 'sessionDefaultChannelGroup' }], metrics: GA4_CHANNEL.map((name) => ({ name })), limit: 100000 })
    ]);
    return [...ga4RowsToMetrics(daily, GA4_DAILY, ''), ...ga4RowsToMetrics(channel, GA4_CHANNEL, 'channel')];
  }
  if (source === 'gbp') {
    const q = new URLSearchParams();
    for (const m of Object.keys(GBP_METRIC_KEYS)) q.append('dailyMetrics', m);
    const put = (k: string, d: string) => {
      q.set(`dailyRange.${k}.year`, String(Number(d.slice(0, 4))));
      q.set(`dailyRange.${k}.month`, String(Number(d.slice(5, 7))));
      q.set(`dailyRange.${k}.day`, String(Number(d.slice(8, 10))));
    };
    put('start_date', from);
    put('end_date', to);
    return gbpRowsToMetrics(await gapiFetch<GbpResp>(tenantId, `https://businessprofileperformance.googleapis.com/v1/${property}:fetchMultiDailyMetricsTimeSeries?${q}`));
  }
  return [];
}

async function fetchTop(tenantId: string, source: string, property: string, from: string, to: string, kind: 'query' | 'page', limit: number): Promise<MetricTopRow[]> {
  if (source !== 'gsc') return [];
  const rows = await gscQuery(tenantId, property, { startDate: from, endDate: to, dimensions: [kind], rowLimit: Math.min(Math.max(limit, 1), 25000), dataState: 'final' });
  return rows.map((r) => ({ kind, key: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));
}

export const GOOGLE_METRIC_SOURCE: MetricSource = {
  provider: 'google',
  kinds: [
    // Search Console guarda 16 meses (también por la API).
    { assetKind: 'search_console', source: 'gsc', label: 'Search Console', historyDays: 486, lagDays: 2, chunkDays: 120, monthlyTop: true },
    // Analytics: desde que existe la propiedad (se para al encontrar un año vacío).
    { assetKind: 'analytics', source: 'ga4', label: 'Analytics', historyDays: 365 * 6, lagDays: 1, chunkDays: 365, monthlyTop: false },
    // Business Profile no documenta el límite: se prueba hasta 18 meses y, si Google lo rechaza, se para.
    { assetKind: 'business_profile', source: 'gbp', label: 'Business Profile', historyDays: 548, lagDays: 3, chunkDays: 180, monthlyTop: false }
  ],
  isConnected: (t) => isConnected(t, 'google'),
  normalize: normalizeGoogleProperty,
  fetchDaily,
  fetchTop
};

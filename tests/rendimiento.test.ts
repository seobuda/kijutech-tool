// Módulo Rendimiento (15 nov 2026): reglas puras (periodos, cifras, comparaciones, consultas que suben y bajan, antes y
// después, avisos), conversión de las respuestas de Google y, con la base de datos real (cuenta de prueba propia que se
// borra al terminar), la descarga con una fuente de métricas simulada, la pestaña, el panel, los avisos y las herramientas.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clientAssets, clients, perfAnnotations, perfDaily, perfGscMonthly, perfSync, tenants } from '@/lib/db/schema';
import { registerMetricSource, setTelegramOutbound, type MetricRow, type MetricSource, type ToolContext } from '@/lib/core/capabilities';
import { clientHistory, createCoreClient, deleteCoreClient, saveAsset } from '@/lib/core/clients';
import {
  KPI,
  addDays,
  beforeAfter,
  buckets,
  buildDayMap,
  daysBetween,
  delta,
  detectAlerts,
  formatDelta,
  kpiValue,
  madridNow,
  mondayOf,
  movers,
  periodRanges
} from '@/lib/rendimiento/rules';
import { ga4RowsToMetrics, gbpRowsToMetrics, gscRowsToMetrics, normalizeGoogleProperty } from '@/lib/agentes/metrics';
import { _resetSyncState, discover, nextMonthToFetch, nextUnit, runPerformanceSync } from '@/lib/rendimiento/sync';
import { clientPerformance, monthlyClientText, performanceText, runMonthlySummary, runPerformanceAlerts, tenantOverview, weeklyLines } from '@/lib/rendimiento/report';
import { getSettings, listSync, saveAnnotation, saveSettings } from '@/lib/rendimiento/store';
import { performanceHealth, registerRendimientoCapabilities, RENDIMIENTO_TOOLS } from '@/lib/rendimiento/register';

// --- Reglas puras ---------------------------------------------------------------------------------------------------

const day = (source: string, date: string, metric: string, value: number, dimType = '', dimValue = '') => ({ source, date, metric, dimType, dimValue, value });

describe('rendimiento: reglas puras', () => {
  it('fechas, semanas y tramos de las gráficas', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30);
    expect(mondayOf('2026-11-15')).toBe('2026-11-09'); // domingo → lunes anterior
    expect(buckets('2026-11-01', '2026-11-28')).toHaveLength(28); // menos de 5 semanas: por días
    expect(buckets('2026-01-01', '2026-03-31').length).toBe(14); // por semanas
    expect(buckets('2024-01-01', '2026-03-31').length).toBe(27); // más de 13 meses: por meses
  });

  it('la posición media se pondera por impresiones y el CTR sale de clics e impresiones', () => {
    const m = buildDayMap([day('gsc', '2026-11-01', 'clicks', 10), day('gsc', '2026-11-01', 'impressions', 100), day('gsc', '2026-11-01', 'position', 2), day('gsc', '2026-11-02', 'clicks', 0), day('gsc', '2026-11-02', 'impressions', 300), day('gsc', '2026-11-02', 'position', 10)]);
    expect(kpiValue(KPI.gsc_position, m, '2026-11-01', '2026-11-02')).toBe(8); // (2·100 + 10·300) / 400
    expect(kpiValue(KPI.gsc_ctr, m, '2026-11-01', '2026-11-02')).toBe(2.5);
    expect(kpiValue(KPI.gsc_clicks, m, '2026-11-03', '2026-11-05')).toBeNull(); // sin datos ≠ 0
    // un día con datos de la fuente pero sin esa serie cuenta como 0
    const g = buildDayMap([day('gbp', '2026-11-01', 'views_maps_mobile', 5)]);
    expect(kpiValue(KPI.gbp_calls, g, '2026-11-01', '2026-11-01')).toBe(0);
    expect(kpiValue(KPI.gbp_views, g, '2026-11-01', '2026-11-01')).toBe(5);
  });

  it('periodos: anterior, año pasado (mismos días de la semana), antes del servicio y a medida', () => {
    const src = { syncedUntil: '2026-11-12', historyFrom: '2025-07-01' };
    expect(periodRanges('28', 'prev', src)).toEqual({ cur: { from: '2026-10-16', to: '2026-11-12' }, prev: { from: '2026-09-18', to: '2026-10-15' } });
    expect(periodRanges('28', 'yoy', src)!.prev).toEqual({ from: addDays('2026-10-16', -364), to: addDays('2026-11-12', -364) });
    expect(periodRanges('28', 'contract', src, { serviceStart: '2026-03-01' })!.prev).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(periodRanges('all', 'prev', src)).toEqual({ cur: { from: '2025-07-01', to: '2026-11-12' }, prev: null });
    // C6: mes incompleto (datos hasta el 12) frente a los mismos días del mes anterior; mes entero, contra el mes entero.
    const prevOct = { from: '2026-10-01', to: '2026-10-31' };
    expect(periodRanges('custom', 'prev', src, { from: '2026-11-01', to: '2026-11-30', prev: prevOct })).toEqual({ cur: { from: '2026-11-01', to: '2026-11-12' }, prev: { from: '2026-10-01', to: '2026-10-12' } });
    expect(periodRanges('custom', 'prev', src, { from: '2026-02-01', to: '2026-02-28', prev: { from: '2026-01-01', to: '2026-01-31' } })!.prev).toEqual({ from: '2026-01-01', to: '2026-01-31' });
    expect(periodRanges('custom', 'none', src, { from: '2026-11-01', to: '2026-11-30' })!.cur).toEqual({ from: '2026-11-01', to: '2026-11-12' }); // recortado al último dato
    expect(periodRanges('28', 'prev', { syncedUntil: null, historyFrom: null })).toBeNull();
  });

  it('variación: la posición es mejor si baja', () => {
    expect(delta(12, 10)).toEqual({ pct: 20, good: true, diff: 2 });
    expect(delta(8, 10, true).good).toBe(true);
    expect(delta(5, 0).pct).toBeNull();
    expect(formatDelta(-34.6)).toBe('−35 %');
  });

  it('consultas que suben, bajan, nuevas y perdidas', () => {
    const m = movers(
      [{ key: 'a', clicks: 50, impressions: 1, position: 3 }, { key: 'b', clicks: 5, impressions: 1, position: 9 }, { key: 'nueva', clicks: 7, impressions: 1, position: 4 }],
      [{ key: 'a', clicks: 20, impressions: 1, position: 5 }, { key: 'b', clicks: 25, impressions: 1, position: 4 }, { key: 'perdida', clicks: 30, impressions: 1, position: 2 }]
    );
    expect(m.up.map((x) => x.key)).toEqual(['a']);
    expect(m.down.map((x) => x.key)).toEqual(['perdida', 'b']);
    expect(m.fresh.map((x) => x.key)).toEqual(['nueva']);
  });

  it('antes y después de un hito: media diaria, con un «después» a medias', () => {
    const rows = [];
    for (let i = -28; i < 10; i++) rows.push(day('gsc', addDays('2026-11-01', i), 'clicks', i < 0 ? 10 : 20));
    const r = beforeAfter(KPI.gsc_clicks, buildDayMap(rows), '2026-11-01', '2026-11-10');
    expect(r).toMatchObject({ before: 10, after: 20, afterDays: 10, pct: 100, good: true });
    expect(beforeAfter(KPI.gsc_clicks, buildDayMap(rows), '2026-12-01', '2026-11-10').before).toBeNull(); // hito futuro
    // Analytics instalado 10 días antes del hito: la media es por día con datos (no se divide por 28) …
    const partial = [];
    for (let i = -10; i < 10; i++) partial.push(day('ga4', addDays('2026-11-01', i), 'sessions', 10));
    expect(beforeAfter(KPI.ga4_sessions, buildDayMap(partial), '2026-11-01', '2026-11-10')).toMatchObject({ before: 10, after: 10, pct: 0 });
    // … y con menos de 7 días de «antes» no se compara.
    expect(beforeAfter(KPI.ga4_sessions, buildDayMap(partial.slice(6)), '2026-11-01', '2026-11-10').before).toBeNull();
  });

  it('avisos: caída fuerte con volumen suficiente; no avisa con poco volumen', () => {
    const rows = [];
    for (let i = 0; i < 35; i++) rows.push(day('gbp', addDays('2026-10-08', i), 'calls', i >= 28 ? 1 : 5));
    const m = buildDayMap(rows);
    const found = detectAlerts(m, { gbp: '2026-11-11' }, { pct: 30, rises: true, minVolume: 20 });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ kpi: 'gbp_calls', direction: 'baja', last7: 7, baseline: 35 });
    expect(detectAlerts(m, { gbp: '2026-11-11' }, { pct: 30, rises: true, minVolume: 50 })).toHaveLength(0);
  });

  it('respuestas de Google a filas', () => {
    expect(gscRowsToMetrics([{ keys: ['2026-11-01'], clicks: 3, impressions: 40, ctr: 0.075, position: 7.5 }], [{ keys: ['2026-11-01', 'MOBILE'], clicks: 2, impressions: 30, ctr: 0, position: 0 }])).toEqual([
      { date: '2026-11-01', metric: 'clicks', value: 3 },
      { date: '2026-11-01', metric: 'impressions', value: 40 },
      { date: '2026-11-01', metric: 'position', value: 7.5 },
      { date: '2026-11-01', metric: 'clicks', dimType: 'device', dimValue: 'mobile', value: 2 },
      { date: '2026-11-01', metric: 'impressions', dimType: 'device', dimValue: 'mobile', value: 30 }
    ]);
    const ga = ga4RowsToMetrics({ rows: [{ dimensionValues: [{ value: '20261101' }, { value: 'Organic Search' }], metricValues: [{ value: '12' }, { value: '2' }] }] }, ['sessions', 'keyEvents'], 'channel');
    expect(ga).toEqual([
      { date: '2026-11-01', metric: 'sessions', dimType: 'channel', dimValue: 'Organic Search', value: 12 },
      { date: '2026-11-01', metric: 'keyEvents', dimType: 'channel', dimValue: 'Organic Search', value: 2 }
    ]);
    const gb = gbpRowsToMetrics({ multiDailyMetricTimeSeries: [{ dailyMetricTimeSeries: [{ dailyMetric: 'CALL_CLICKS', timeSeries: { datedValues: [{ date: { year: 2026, month: 11, day: 1 }, value: '4' }, { date: { year: 2026, month: 11, day: 2 } }] } }] }] });
    expect(gb).toEqual([
      { date: '2026-11-01', metric: 'calls', value: 4 },
      { date: '2026-11-02', metric: 'calls', value: 0 } // ausente = 0, según Google
    ]);
    expect(normalizeGoogleProperty('ga4', '123456789')).toBe('properties/123456789');
    expect(normalizeGoogleProperty('gbp', 'accounts/1/locations/987')).toBe('locations/987');
    expect(normalizeGoogleProperty('gsc', 'https://www.x.com/')).toBe('https://www.x.com/');
    expect(normalizeGoogleProperty('gsc', 'x.com')).toBeNull();
    expect(normalizeGoogleProperty('gsc', 'https://cliente.com')).toBe('https://cliente.com/'); // Google exige la «/» final
    expect(normalizeGoogleProperty('gsc', 'sc-domain:Cliente.com')).toBe('sc-domain:cliente.com');
    // Comparación fija: el informe del mes compara con el mes natural anterior
    expect(periodRanges('custom', 'prev', { syncedUntil: '2026-04-10', historyFrom: '2025-01-01' }, { from: '2026-03-01', to: '2026-03-31', prev: { from: '2026-02-01', to: '2026-02-28' } })!.prev).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('qué toca hacer con cada propiedad', () => {
    const kind = { assetKind: 'search_console', source: 'gsc' as const, label: 'SC', historyDays: 486, lagDays: 2, chunkDays: 120, monthlyTop: true };
    const base = { status: 'descargando', backfillDone: false, syncedUntil: null, lastDailyOn: null, historyFrom: null, state: {}, nextAttemptAt: null };
    const now = { date: '2026-11-15', hour: 8 };
    expect(nextUnit(base, kind, now)).toBe('first');
    expect(nextUnit({ ...base, state: { cursor: '2026-07-01' }, lastDailyOn: '2026-11-14' }, kind, now)).toBe('daily');
    expect(nextUnit({ ...base, state: { cursor: '2026-07-01' }, lastDailyOn: '2026-11-14' }, kind, { date: '2026-11-15', hour: 6 })).toBe('backfill'); // antes de las 7, no
    expect(nextUnit({ ...base, status: 'inactiva' }, kind, now)).toBeNull();
    expect(nextUnit({ ...base, nextAttemptAt: new Date(Date.now() + 60_000) }, kind, now)).toBeNull(); // esperando tras un error
    expect(nextMonthToFetch({ historyFrom: '2026-08-10', state: { months: ['2026-10'] } }, kind, '2026-11-15')).toBe('2026-09-01');
    expect(nextMonthToFetch({ historyFrom: '2026-08-10', state: { months: ['2026-10'] } }, kind, '2026-11-02')).toBe('2026-09-01'); // octubre aún no se da por cerrado... pero ya está hecho
    expect(nextMonthToFetch({ historyFrom: '2026-10-10', state: {} }, kind, '2026-11-02')).toBeNull(); // octubre no cerrado hasta el día 3
  });
});

// --- Con la base de datos y una fuente simulada ---------------------------------------------------------------------

const SLUG = 'seg-test-rendimiento';
const NOW = new Date('2026-11-15T09:30:00Z'); // 10:30 en Madrid
const TODAY = madridNow(NOW).date;
const sent: { key: string; html: string }[] = [];
const calls: string[] = [];
let correction = 0;

/** Search Console: 20 clics/día hasta hace 10 días y 8 desde entonces; Analytics desde 2025; Business Profile rechaza > 12 meses. */
const fake: MetricSource = {
  provider: 'google',
  kinds: [
    { assetKind: 'search_console', source: 'gsc', label: 'Search Console', historyDays: 486, lagDays: 2, chunkDays: 120, monthlyTop: true },
    { assetKind: 'analytics', source: 'ga4', label: 'Analytics', historyDays: 365 * 6, lagDays: 1, chunkDays: 365, monthlyTop: false },
    { assetKind: 'business_profile', source: 'gbp', label: 'Business Profile', historyDays: 548, lagDays: 3, chunkDays: 180, monthlyTop: false }
  ],
  isConnected: async () => true,
  normalize: normalizeGoogleProperty,
  async fetchDaily(_t, source, property, from, to) {
    calls.push(`${source}:${from}:${to}`);
    if (property.includes('rota')) throw new Error('Google (403): User does not have sufficient permission');
    if (source === 'gbp' && from < addDays(TODAY, -370)) throw new Error('Google (400): Invalid date range');
    const out: MetricRow[] = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (source === 'gsc') {
        const clicks = d >= addDays(TODAY, -12) ? 8 + correction : 20;
        out.push({ date: d, metric: 'clicks', value: clicks }, { date: d, metric: 'impressions', value: 400 }, { date: d, metric: 'position', value: 6 }, { date: d, metric: 'clicks', dimType: 'device', dimValue: 'mobile', value: clicks / 2 });
      } else if (source === 'ga4' && d >= '2025-01-01') {
        out.push({ date: d, metric: 'sessions', value: 50 }, { date: d, metric: 'keyEvents', value: 2 }, { date: d, metric: 'engagedSessions', value: 30 }, { date: d, metric: 'sessions', dimType: 'channel', dimValue: 'Organic Search', value: 30 });
      } else if (source === 'gbp') out.push({ date: d, metric: 'calls', value: 3 }, { date: d, metric: 'views_maps_mobile', value: 40 });
    }
    return out;
  },
  async fetchTop(_t, _s, _p, from, _to, kind) {
    const m = Number(from.slice(5, 7));
    return [
      { kind, key: kind === 'query' ? 'abogado madrid' : 'https://www.prueba-rend.com/', clicks: 100 + m, impressions: 1000, ctr: 0.1, position: 3 },
      { kind, key: kind === 'query' ? `consulta ${m}` : `https://www.prueba-rend.com/p${m}`, clicks: 10, impressions: 100, ctr: 0.1, position: 8 }
    ];
  }
};

async function cleanup() {
  const [t] = await db.select().from(tenants).where(eq(tenants.slug, SLUG));
  if (t) await db.delete(tenants).where(eq(tenants.id, t.id));
}

async function syncAll(tid: string, now = NOW) {
  for (let i = 0; i < 20; i++) {
    const r = await runPerformanceSync(tid, { budgetMs: 60_000, now });
    if (!r.pending) return r;
  }
  throw new Error('la descarga no termina');
}

describe('rendimiento con la base de datos', () => {
  let tid = '';
  let clientId = '';
  const ctx = (): ToolContext => ({ tenantId: tid, agentKey: 'principal', channel: 'telegram', conversationId: null, actor: { name: 'Enric', isOwner: true, clickupUserId: null } });

  beforeAll(async () => {
    await cleanup();
    const [t] = await db.insert(tenants).values({ name: 'Prueba rendimiento', slug: SLUG }).returning();
    tid = t.id;
    registerMetricSource(fake);
    registerRendimientoCapabilities(); // ejecutor de anotar_hito
    setTelegramOutbound({ sendText: async () => undefined, sendVoice: async () => true, sendTyping: async () => undefined, notifyOwner: async (_t, key, html) => void sent.push({ key, html }) });
    _resetSyncState();
    clientId = await createCoreClient(tid, { name: 'Prueba Rendimiento SL', status: 'activo', startedAt: addDays(TODAY, -60) });
    await saveAsset(tid, clientId, { kind: 'search_console', value: 'sc-domain:prueba-rend.com', access: 'si' });
    await saveAsset(tid, clientId, { kind: 'analytics', value: '123456', access: 'si' });
    await saveAsset(tid, clientId, { kind: 'business_profile', value: 'locations/555', access: 'si' });
  });
  afterAll(cleanup);

  it('descubre las propiedades de la ficha y descarga todo el histórico por tramos', async () => {
    const d = await discover(tid, [fake]);
    expect(d.added).toBe(3);
    const r = await syncAll(tid);
    expect(r.errors).toBe(0);
    const rows = await listSync(tid, clientId);
    const by = Object.fromEntries(rows.map((x) => [x.source, x]));
    expect(by.ga4.property).toBe('properties/123456');
    expect(rows.every((x) => x.status === 'al_dia' && x.backfillDone)).toBe(true);
    expect(by.gsc.historyFrom).toBe(addDays(TODAY, -486)); // los 16 meses de Search Console
    expect(by.gsc.syncedUntil).toBe(addDays(TODAY, -2));
    expect(by.ga4.historyFrom).toBe('2025-01-01'); // se para al encontrar un año vacío
    expect(by.gbp.syncedUntil).toBe(addDays(TODAY, -3)); // retraso de Business Profile
    expect(by.gbp.historyFrom! >= addDays(TODAY, -370)).toBe(true); // Google rechazó lo más antiguo: ese es su límite
    expect(by.gsc.state.months!.length).toBeGreaterThanOrEqual(15); // consultas de cada mes cerrado
    const top = await db.select().from(perfGscMonthly).where(eq(perfGscMonthly.clientId, clientId));
    expect(top.length).toBe(by.gsc.state.months!.length * 4);
    // una segunda vuelta el mismo día no pide nada a Google
    calls.length = 0;
    await runPerformanceSync(tid, { budgetMs: 10_000, now: NOW });
    expect(calls).toEqual([]);
  });

  it('cada día vuelve a pedir los últimos 10 días y guarda encima (Google corrige)', async () => {
    correction = 1;
    calls.length = 0;
    const tomorrow = new Date(NOW.getTime() + 86_400_000);
    await runPerformanceSync(tid, { budgetMs: 30_000, now: tomorrow });
    expect(calls.filter((c) => c.startsWith('gsc:'))).toEqual([`gsc:${addDays(TODAY, -10)}:${addDays(TODAY, -1)}`]);
    const [row] = await db
      .select()
      .from(perfDaily)
      .where(and(eq(perfDaily.clientId, clientId), eq(perfDaily.source, 'gsc'), eq(perfDaily.metric, 'clicks'), eq(perfDaily.dimType, ''), eq(perfDaily.date, addDays(TODAY, -3))));
    expect(row.value).toBe(9);
    correction = 0;
    await runPerformanceSync(tid, { budgetMs: 30_000, now: new Date(NOW.getTime() + 2 * 86_400_000) });
  });

  it('la pestaña: cifras con su variación, gráficas, canales, consultas e hitos con su antes y después', async () => {
    await saveAnnotation(tid, clientId, { date: addDays(TODAY, -12), kind: 'web', title: 'Web nueva publicada' });
    await expect(saveAnnotation(tid, clientId, { date: '2026-02-30', kind: 'web', title: 'x' })).rejects.toThrow();
    const p = (await clientPerformance(tid, clientId, { period: '28', compare: 'prev' }))!;
    expect(p.hasData).toBe(true);
    const clicks = p.kpis.find((k) => k.key === 'gsc_clicks')!;
    expect(clicks.prev).toBe(28 * 20);
    expect(clicks.pct!).toBeLessThan(0);
    expect(clicks.good).toBe(false);
    expect(p.kpis.find((k) => k.key === 'ga4_organic')!.value).toBe(30 * 28);
    expect(p.kpis.find((k) => k.key === 'gsc_position')!.value).toBe(6);
    expect(p.charts.map((c) => c.key)).toContain('gbp_calls');
    expect(p.channels[0]).toMatchObject({ key: 'Organic Search' });
    expect(p.devices[0]).toMatchObject({ key: 'mobile' });
    expect(p.movers?.queries.fresh.length).toBe(1);
    const web = p.annotations.find((a) => a.title === 'Web nueva publicada')!;
    const eff = web.effects.find((e) => e.key === 'gsc_clicks')!;
    expect(eff.before).toBe(20);
    expect(eff.pct!).toBeLessThan(-55); // 8-9 clics/día después frente a 20 antes
    expect(p.annotations.some((a) => a.virtual && a.title.includes('Inicio del servicio'))).toBe(true);
    const all = (await clientPerformance(tid, clientId, { period: 'all', compare: 'contract' }))!;
    expect(all.kpis.find((k) => k.key === 'gsc_clicks')!.prev).not.toBeNull(); // antes del inicio del servicio
    const text = performanceText(p);
    expect(text).toContain('Clics desde Google');
    expect(text).toContain('Web nueva publicada');
  });

  it('panel central, informe semanal e informe del mes', async () => {
    const rows = await tenantOverview(tid, 28);
    expect(rows).toHaveLength(1);
    expect(rows[0].kpis.gsc_clicks.pct!).toBeLessThan(-20);
    const w = await weeklyLines(tid);
    expect(w!.join('\n')).toContain('Todos los clientes');
    const m = await monthlyClientText(tid, clientId, '2026-10-01');
    expect(m).toContain('Informe de octubre de 2026');
    expect(m).toContain('frente al mes anterior');
  });

  it('avisa una vez de una caída fuerte y no repite la misma semana', async () => {
    sent.length = 0;
    const n = await runPerformanceAlerts(tid, new Date(NOW.getTime() + 2 * 86_400_000));
    expect(n).toBeGreaterThan(0);
    expect(sent[0].html).toContain('Prueba Rendimiento SL');
    expect(sent[0].html).toContain('clics desde google');
    expect(await runPerformanceAlerts(tid, new Date(NOW.getTime() + 2 * 86_400_000))).toBe(0); // ya avisado hoy
    expect(await runPerformanceAlerts(tid, new Date(NOW.getTime() + 3 * 86_400_000 + 3 * 3_600_000))).toBe(0); // misma semana: no repite
    await saveSettings(tid, { alertsEnabled: false, alertPct: 500 });
    expect((await getSettings(tid)).alertPct).toBe(90); // tope
    expect(await runMonthlySummary(tid, new Date('2026-12-05T10:00:00Z'))).toBe(true);
    expect(sent.some((s) => s.key === 'perf:monthly:2026-11')).toBe(true);
    expect(await runMonthlySummary(tid, new Date('2026-12-06T10:00:00Z'))).toBe(false); // una vez al mes
  });

  it('herramientas del agente: rendimiento_cliente y anotar_hito', async () => {
    const tool = (name: string) => RENDIMIENTO_TOOLS.find((t) => t.name === name)!;
    const r = await tool('rendimiento_cliente').run(ctx(), { cliente: 'prueba rendimiento' });
    expect(r.ok).toBe(true);
    expect(r.content).toContain('Search Console');
    const mes = await tool('rendimiento_cliente').run(ctx(), { cliente: 'prueba rendimiento', periodo: 'mes' });
    expect(mes.content).toContain('Informe de');
    expect((await tool('rendimiento_cliente').run(ctx(), { cliente: 'no existe' })).ok).toBe(false);
    // Sin el motor de propuestas de Operaciones registrado (esta prueba), el cambio se hace directamente.
    const h = await tool('anotar_hito').run(ctx(), { cliente: 'prueba rendimiento', titulo: 'Campaña de Navidad', tipo: 'campana', fecha: '2026-11-10' });
    expect(h.ok).toBe(true);
    const anns = await db.select().from(perfAnnotations).where(eq(perfAnnotations.clientId, clientId));
    expect(anns.find((a) => a.title === 'Campaña de Navidad')?.source).toBe('agente');
    expect((await tool('anotar_hito').run(ctx(), { cliente: 'prueba rendimiento', titulo: 'x', fecha: 'mañana' })).ok).toBe(false);
  });

  it('cambiar la cuenta principal: la anterior queda inactiva con su histórico; un error se reintenta y sale en Salud', async () => {
    const [old] = await db.select().from(clientAssets).where(and(eq(clientAssets.clientId, clientId), eq(clientAssets.kind, 'search_console')));
    await db.update(clientAssets).set({ value: 'https://rota.prueba-rend.com/' }).where(eq(clientAssets.id, old.id));
    _resetSyncState();
    const r = await runPerformanceSync(tid, { budgetMs: 10_000, now: NOW, force: true });
    expect(r.errors).toBe(1);
    const rows = await listSync(tid, clientId);
    expect(rows.find((x) => x.property === 'sc-domain:prueba-rend.com')?.status).toBe('inactiva');
    const bad = rows.find((x) => x.property.includes('rota'))!;
    expect(bad.status).toBe('error');
    expect(bad.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
    const kept = await db.select().from(perfDaily).where(and(eq(perfDaily.clientId, clientId), eq(perfDaily.property, 'sc-domain:prueba-rend.com'))).limit(1);
    expect(kept).toHaveLength(1);
    // La pestaña enseña el error de la propiedad nueva.
    const p = (await clientPerformance(tid, clientId, {}))!;
    expect(p.sources.find((s) => s.source === 'gsc')!.status).toBe('error');
    await db.update(perfSync).set({ errorCount: 3 }).where(eq(perfSync.id, bad.id));
    const health = await performanceHealth(tid);
    expect(health[0].status).toBe('aviso');
    expect(health[0].detail).toContain('403');
  });

  it('D6: con histórico de Google, no se borra si no está de baja ni sin escribir su nombre', async () => {
    const history = await clientHistory(tid, clientId);
    expect(history.some((h) => h.includes('Rendimiento'))).toBe(true);
    await expect(deleteCoreClient(tid, clientId)).rejects.toThrow(/Dale de baja primero/);
    expect(await db.select().from(clients).where(eq(clients.id, clientId))).toHaveLength(1);
  });

  it('un cliente de baja deja de descargarse; borrarlo escribiendo su nombre borra su histórico', async () => {
    await db.update(clients).set({ status: 'baja' }).where(eq(clients.id, clientId));
    await discover(tid, [fake]);
    expect((await listSync(tid, clientId)).every((x) => x.status === 'inactiva')).toBe(true);
    await expect(deleteCoreClient(tid, clientId, 'Prueba')).rejects.toThrow(/escribe el nombre/);
    await deleteCoreClient(tid, clientId, 'prueba rendimiento sl'); // sin mayúsculas también vale
    expect(await db.select().from(perfDaily).where(eq(perfDaily.clientId, clientId)).limit(1)).toHaveLength(0);
  });
});

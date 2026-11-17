// Módulo Estrategia (15 nov 2026, fase 1): reglas puras (planes y frecuencias, curva de objetivos, estado, metas,
// detectores, comprobaciones de la web, extracción) y, con la base de datos real (cuenta de prueba propia que se borra al
// terminar), planes por cliente y su agenda, detectores, objetivos, palabras clave, URLs trabajadas, extracción de
// encargos con la pregunta de la URL, guardián, calendario, panel, pestaña y herramienta del agente. Google, las
// cifras y los encargos se simulan con las mismas piezas del núcleo que usan los módulos reales.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { estAnalyses, estProcessRuns, estSignals, estSuggestions, estTrackedUrls, estUrlDaily, estWorkFacts, tenants } from '@/lib/db/schema';
import {
  externalEvents,
  getTool,
  registerKpiProvider,
  registerMetricSource,
  registerWorkSource,
  setTelegramOutbound,
  taskAnswerHandler,
  type KpiProvider,
  type MetricSource,
  type SearchQuery,
  type SearchRow,
  type ToolContext,
  type WorkItem
} from '@/lib/core/capabilities';
import { createCoreClient, saveAsset } from '@/lib/core/clients';
import { normalizeGoogleProperty } from '@/lib/agentes/metrics';
import {
  DEFAULT_PLANS,
  PROCESS,
  addDays,
  brokenFunnel,
  cannibalization,
  cleanConfig,
  cleanExtraction,
  curveFraction,
  dependencyWarnings,
  effectiveProcesses,
  homeOf,
  locsFromSitemap,
  lowCtr,
  madridNow,
  newQueries,
  nextRunAfter,
  objectiveHealth,
  pageDrops,
  pageIssues,
  parseHtml,
  proposeTargets,
  re2Escape,
  robotsBlocksAll,
  ruleExtraction,
  seasonalIndex,
  strikingDistance,
  urlInProperty,
  urlKey,
  canonicalFromFacts,
  pickGscVariant,
  type QP
} from '@/lib/estrategia/rules';
import { isPublicUrl } from '@/lib/estrategia/web';
import { addKeywords, clientEffective, getSettings, listKeywords, listObjectives, listPlans, listRuns, listSignals, saveClientOverride, saveEvent, saveObjective, setClientPlan, pauseClient, trackUrl } from '@/lib/estrategia/store';
import { loadCtx, runCritico, runDetectores, runExtraction, runGuardian, runKeywords, runObjetivos, runUrls, answerUrlQuestion } from '@/lib/estrategia/processes';
import { _resetSchedulerState, runEstrategia } from '@/lib/estrategia/scheduler';
import { clientStrategy, strategyOverview, weeklyLines } from '@/lib/estrategia/report';
import { registerEstrategiaCapabilities, strategyHealth } from '@/lib/estrategia/register';
import { decideSuggestion, queueAnalysis, saveStrategistSettings, strategistQuality } from '@/lib/estrategia/strategist';
import { confirmedAlerts } from '@/lib/rendimiento/report';
import { buildDayMap } from '@/lib/rendimiento/rules';

const CFG = { onTrackPct: 90, atRiskPct: 60, graceDays: 90 };

// --- Reglas puras ---------------------------------------------------------------------------------------------------

describe('estrategia: planes y frecuencias', () => {
  it('la configuración efectiva es la del plan con los ajustes del cliente encima', () => {
    const plan = DEFAULT_PLANS.find((p) => p.key === 'seo_local')!.processes;
    const eff = effectiveProcesses(plan, { keywords: { on: true, every: 1 }, salud: { on: false, every: 7 } });
    const by = Object.fromEntries(eff.map((e) => [e.key, e]));
    expect(by.keywords).toMatchObject({ on: true, every: 1, from: 'cliente' });
    expect(by.salud).toMatchObject({ on: false, from: 'cliente' });
    expect(by.gbp).toMatchObject({ on: true, every: 7, from: 'plan' });
    expect(by.estratega).toMatchObject({ on: true, every: 15, runnable: true }); // fase 2 construida (16 nov)
    expect(by.competencia.runnable).toBe(false); // fase 3
    expect(by.competencia.on).toBe(false);
  });

  it('el plan de mantenimiento no lleva palabras clave ni estrategia', () => {
    const p = DEFAULT_PLANS.find((x) => x.key === 'mantenimiento')!.processes;
    expect(Object.keys(p).sort()).toEqual(['critico', 'guardian', 'salud', 'velocidad']);
    expect(p.salud.every).toBe(7);
    expect(p.velocidad.every).toBe(30);
  });

  it('limpia lo que llega de un formulario: procesos y frecuencias permitidas', () => {
    expect(cleanConfig({ keywords: { on: true, every: 2 }, inventado: { on: true, every: 1 }, velocidad: { on: 1, every: 30 } })).toEqual({ keywords: { on: true, every: 7 }, velocidad: { on: true, every: 30 } });
    expect(cleanConfig('nada')).toEqual({});
  });

  it('avisa de dependencias que faltan', () => {
    const eff = effectiveProcesses({ urls: { on: true, every: 1 } }, {});
    expect(dependencyWarnings(eff)[0]).toContain('necesita «Datos de cada encargo terminado»');
  });

  it('la próxima ejecución respeta la frecuencia y reparte; un fallo espera cada vez más', () => {
    const now = new Date('2026-11-15T10:00:00Z');
    const n = nextRunAfter(now, 7, 'c:salud').getTime() - now.getTime();
    expect(n).toBeGreaterThan(6.9 * 86_400_000);
    expect(n).toBeLessThan(7.03 * 86_400_000);
    expect(nextRunAfter(now, 7, 'x', 1).getTime() - now.getTime()).toBe(15 * 60_000);
    expect(nextRunAfter(now, 7, 'x', 3).getTime() - now.getTime()).toBe(60 * 60_000);
    expect(nextRunAfter(now, 7, 'x', 20).getTime() - now.getTime()).toBe(12 * 3_600_000);
  });
});

describe('estrategia: objetivos', () => {
  const base = { kind: 'kpi' as const, baseline: 100, target: 200, start: '2026-01-01', due: '2026-12-31', curve: 's' as const, lowerBetter: false };

  it('la curva SEO avanza poco al principio y lo gordo en medio', () => {
    expect(curveFraction(0, 's')).toBe(0);
    expect(curveFraction(1, 's')).toBeCloseTo(1, 5);
    expect(curveFraction(0.25, 's')).toBeLessThan(0.1);
    expect(curveFraction(0.5, 's')).toBeCloseTo(0.5, 2);
    expect(curveFraction(0.25, 'lineal')).toBe(0.25);
  });

  it('al principio no se juzga; antes de los días de gracia como mucho «vigilar»', () => {
    expect(objectiveHealth(base, 102, '2026-02-01', CFG).health).toBe('en_camino'); // pronto
    expect(objectiveHealth(base, 80, '2026-02-01', CFG).health).toBe('vigilar'); // va hacia atrás
    expect(objectiveHealth({ ...base, curve: 'lineal' }, 100, '2026-03-15', CFG).health).toBe('vigilar'); // desviado, pero en gracia
  });

  it('en camino, en riesgo, desviado, logrado y fecha pasada', () => {
    // A mitad de plazo (curva S) se espera ~150.
    expect(objectiveHealth(base, 148, '2026-07-01', CFG).health).toBe('en_camino');
    expect(objectiveHealth(base, 135, '2026-07-01', CFG).health).toBe('en_riesgo');
    expect(objectiveHealth(base, 110, '2026-07-01', CFG).health).toBe('desviado');
    expect(objectiveHealth(base, 205, '2026-07-01', CFG).health).toBe('logrado');
    expect(objectiveHealth(base, 150, '2027-01-05', CFG).health).toBe('vencido');
    expect(objectiveHealth(base, null, '2026-07-01', CFG).health).toBe('sin_datos');
    expect(objectiveHealth({ ...base, kind: 'hito' }, null, '2026-07-01', CFG).health).toBe('pendiente');
  });

  it('cifras que mejoran bajando (posición)', () => {
    const pos = { ...base, baseline: 12, target: 4, lowerBetter: true };
    expect(objectiveHealth(pos, 3.5, '2026-07-01', CFG).health).toBe('logrado');
    expect(objectiveHealth(pos, 8.2, '2026-07-01', CFG).health).toBe('en_camino');
    expect(objectiveHealth(pos, 11.5, '2026-07-01', CFG).health).toBe('desviado');
  });

  it('corrige por temporada: un mes que siempre es flojo no se lee como fracaso', () => {
    const season = seasonalIndex(Array.from({ length: 12 }, (_, i) => ({ month: `2025-${String(i + 1).padStart(2, '0')}-01`, value: i === 7 ? 50 : 100 })))!;
    expect(season[8]).toBeLessThan(0.6);
    const aug = { ...base, start: '2026-03-01', due: '2027-02-28' };
    const without = objectiveHealth(aug, 80, '2026-08-20', CFG);
    const withS = objectiveHealth(aug, 80, '2026-08-20', CFG, season);
    expect(without.health).not.toBe('en_camino');
    expect(withS.adjusted!).toBeGreaterThan(140);
    expect(withS.note).toContain('temporada');
    expect(seasonalIndex([{ month: '2026-01-01', value: 3 }])).toBeNull();
  });

  it('metas orientativas en rango', () => {
    expect(proposeTargets(100, 6, false)).toEqual({ low: 110, mid: 120, high: 135 });
    expect(proposeTargets(100, 12, false).mid).toBe(140);
    const pos = proposeTargets(11, 6, true);
    expect(pos.low).toBeLessThan(11);
    expect(pos.high).toBeLessThan(pos.low);
    expect(pos.high).toBeGreaterThanOrEqual(1);
  });
});

describe('estrategia: URL canónica de lo trabajado', () => {
  const facts = (o: Partial<{ status: number; finalUrl: string; canonical: string | null }>) => ({ status: 200, finalUrl: 'https://a.com/x', redirects: 0, noindex: false, title: 't', description: null, canonical: null, xRobots: null, ...o });
  it('urlKey trata como la misma página www, barra final, http/https y ancla', () => {
    expect(urlKey('http://www.A.com/blog/x/#top')).toBe(urlKey('https://a.com/blog/x'));
    expect(urlKey('https://a.com/')).toBe('a.com');
    expect(urlKey('https://a.com/x?p=2')).not.toBe(urlKey('https://a.com/x'));
    expect(urlKey('nada')).toBeNull();
  });
  it('canonicalFromFacts: canonical > redirección final > URL escrita, siempre dentro de la propiedad', () => {
    expect(canonicalFromFacts('https://a.com/x', facts({ finalUrl: 'https://www.a.com/x/', canonical: '/x-final' }), 'sc-domain:a.com')).toBe('https://www.a.com/x-final');
    expect(canonicalFromFacts('https://a.com/x', facts({ finalUrl: 'https://www.a.com/x/' }), 'sc-domain:a.com')).toBe('https://www.a.com/x/');
    expect(canonicalFromFacts('https://a.com/x', facts({ canonical: 'https://otro.com/x' }), 'sc-domain:a.com')).toBe('https://a.com/x');
    expect(canonicalFromFacts('https://a.com/x#y', { error: 'tarda' }, 'sc-domain:a.com')).toBe('https://a.com/x');
    expect(canonicalFromFacts('https://a.com/x', facts({ status: 404, finalUrl: 'https://a.com/404' }), 'sc-domain:a.com')).toBe('https://a.com/x');
  });
  it('pickGscVariant elige la variante de la misma página con más impresiones', () => {
    const pages = [
      { page: 'http://a.com/x', impressions: 3 },
      { page: 'https://www.a.com/x/', impressions: 40 },
      { page: 'https://www.a.com/x/otra', impressions: 900 }
    ];
    expect(pickGscVariant('https://a.com/x', pages)).toBe('https://www.a.com/x/');
    expect(pickGscVariant('https://a.com/nada', pages)).toBeNull();
  });
});

describe('estrategia: detectores', () => {
  const cfg = { strikingFrom: 4, strikingTo: 15, minImpressions: 100 };
  const qp = (query: string, page: string, clicks: number, impressions: number, position: number): QP => ({ query, page, clicks, impressions, position });

  it('consultas al alcance (franja y volumen) y CTR bajo para su posición', () => {
    const rows = [qp('abogado madrid', '/a', 20, 900, 7.2), qp('poco volumen', '/b', 0, 20, 6), qp('ya top', '/c', 100, 500, 1.5), qp('ctr malo', '/d', 2, 800, 2.1)];
    const s = strikingDistance(rows, cfg);
    expect(s.map((x) => x.evidence.query)).toEqual(['abogado madrid']);
    const c = lowCtr(rows, cfg);
    expect(c.map((x) => x.evidence.query)).toEqual(['ctr malo']);
    expect(c[0].detail).toContain('resumen de IA');
  });

  it('páginas en caída, marcando la temporada si el año pasado también cayó', () => {
    const cur = [qp('x', '/p', 20, 500, 5), qp('y', '/q', 10, 300, 6)];
    const prev = [qp('x', '/p', 60, 600, 4), qp('y', '/q', 50, 400, 5)];
    const out = pageDrops(cur, prev, new Map([['/q', 10]]), new Map([['/q', 40]]));
    const by = Object.fromEntries(out.map((s) => [s.evidence.page, s]));
    expect(by['/p'].evidence.change).toBe(-67);
    expect(by['/p'].severity).toBe('aviso');
    expect(by['/q'].evidence.seasonal).toBe(true);
    expect(by['/q'].severity).toBe('info');
  });

  it('consultas nuevas sin página y canibalización solo con pérdida real', () => {
    const cur = [qp('nueva', '/z', 0, 300, 25), qp('compartida', '/a', 5, 300, 8), qp('compartida', '/b', 5, 300, 9), qp('repartida sin perder', '/a', 30, 300, 5), qp('repartida sin perder', '/b', 30, 300, 6)];
    const prev = [qp('compartida', '/a', 40, 500, 4), qp('repartida sin perder', '/a', 60, 600, 4)];
    expect(newQueries(cur, prev, cfg).map((s) => s.evidence.query)).toEqual(['nueva']);
    expect(cannibalization(cur, prev, cfg).map((s) => s.evidence.query)).toEqual(['compartida']);
  });

  it('embudo roto: sube el tráfico y caen las conversiones', () => {
    expect(brokenFunnel('Web', { cur: 1200, prev: 1000 }, { cur: 30, prev: 50 })?.kind).toBe('embudo');
    expect(brokenFunnel('Web', { cur: 1200, prev: 1000 }, { cur: 48, prev: 50 })).toBeNull();
    expect(brokenFunnel('Web', { cur: 1200, prev: 1000 }, { cur: 2, prev: 5 })).toBeNull(); // poco volumen
  });
});

describe('estrategia: comprobaciones de la web y extracción', () => {
  it('lee noindex, título, descripción y canónica del HTML', () => {
    const p = parseHtml('<html><head><title> Hola  mundo </title><meta name="robots" content="noindex, follow"><meta content="Desc" name="description"><link rel="canonical" href="/otra"></head></html>');
    expect(p).toEqual({ noindex: true, title: 'Hola mundo', description: 'Desc', canonical: '/otra' });
    expect(parseHtml('<title>x</title>').noindex).toBe(false);
  });

  it('robots.txt que bloquea todo a Google; sitemaps', () => {
    expect(robotsBlocksAll('User-agent: *\nDisallow: /')).toBe(true);
    expect(robotsBlocksAll('User-agent: *\nDisallow: /wp-admin/\nUser-agent: BadBot\nDisallow: /')).toBe(false);
    expect(robotsBlocksAll('User-agent: Googlebot\nDisallow: /')).toBe(true);
    expect(locsFromSitemap('<urlset><url><loc>https://a.com/x</loc></url></urlset>').urls).toEqual(['https://a.com/x']);
    expect(locsFromSitemap('<sitemapindex><sitemap><loc>https://a.com/s1.xml</loc></sitemap></sitemapindex>').sitemaps).toEqual(['https://a.com/s1.xml']);
  });

  it('problemas de una página', () => {
    const ok = { status: 200, finalUrl: 'https://a.com/x', redirects: 0, noindex: false, title: 'T', description: 'D', canonical: null, xRobots: null };
    expect(pageIssues('https://a.com/x', ok)).toEqual([]);
    expect(pageIssues('https://a.com/x', { ...ok, status: 503 }).map((i) => i.code)).toEqual(['error_5xx']);
    expect(pageIssues('https://a.com/x', { ...ok, noindex: true, title: null }).map((i) => i.code)).toEqual(['noindex', 'sin_titulo']);
    expect(pageIssues('https://a.com/x', { error: 'timeout' })[0].code).toBe('no_responde');
  });

  it('URLs dentro de la propiedad, portada y solo direcciones públicas', () => {
    expect(urlInProperty('https://www.a.com/x', 'sc-domain:a.com')).toBe(true);
    expect(urlInProperty('https://blog.a.com/x', 'sc-domain:a.com')).toBe(true);
    expect(urlInProperty('https://b.com/x', 'sc-domain:a.com')).toBe(false);
    expect(urlInProperty('https://a.com/es/x', 'https://a.com/es/')).toBe(true);
    expect(homeOf('sc-domain:a.com')).toBe('https://a.com/');
    expect(homeOf('https://www.a.com/es/')).toBe('https://www.a.com/');
    expect(homeOf('a.com')).toBe('https://a.com/');
    expect(isPublicUrl('https://a.com/')).toBe(true);
    for (const u of ['http://localhost:3000', 'http://127.0.0.1/', 'http://192.168.1.10/', 'http://kijutech_db:5432', 'file:///etc/passwd', 'http://10.0.0.5/']) expect(isPublicUrl(u)).toBe(false);
  });

  it('la extracción solo acepta URLs del cliente y categorías conocidas; sin IA, por reglas', () => {
    const r = cleanExtraction({ categoria: 'contenido', urls: ['https://a.com/blog/x.', 'https://otro.com/y'], palabras_clave: ['Abogado'], kpis: ['gsc_clicks', 'inventada'], necesita_url: true }, ['a.com']);
    expect(r).toEqual({ category: 'contenido', urls: ['https://a.com/blog/x'], keywords: ['abogado'], kpis: ['gsc_clicks'], needsUrl: false });
    expect(cleanExtraction({ categoria: 'raro' }, []).category).toBe('otro');
    const rules = ruleExtraction('Publicar artículo sobre despidos', ['a.com']);
    expect(rules).toMatchObject({ category: 'contenido', needsUrl: true });
    expect(ruleExtraction('Optimizar títulos de https://a.com/servicios', ['a.com']).urls).toEqual(['https://a.com/servicios']);
    expect(re2Escape('c++ (madrid)')).toBe('c\\+\\+ \\(madrid\\)');
  });

  it('los avisos de Rendimiento piden la caída confirmada también el día anterior', () => {
    const rows: { source: string; date: string; metric: string; dimType: string; dimValue: string; value: number }[] = [];
    const last = '2026-11-12';
    for (let i = 0; i < 36; i++) rows.push({ source: 'gsc', date: addDays(last, -i), metric: 'clicks', dimType: '', dimValue: '', value: i === 0 ? 0 : 20 });
    const dm = buildDayMap(rows);
    // Solo el último día es raro: la regla sin confirmar avisaría (−14 %…) con un umbral bajo; confirmada, no.
    expect(confirmedAlerts(dm, { gsc: last }, { pct: 10, rises: false, minVolume: 10 })).toEqual([]);
    const rows2 = rows.map((r) => (r.date > addDays(last, -9) ? { ...r, value: 5 } : r));
    expect(confirmedAlerts(buildDayMap(rows2), { gsc: last }, { pct: 30, rises: false, minVolume: 10 }).map((f) => f.kpi)).toEqual(['gsc_clicks']);
  });
});

// --- Con la base de datos -------------------------------------------------------------------------------------------

const SLUG = 'prueba-estrategia';
const TODAY = madridNow().date;
const sent: { key: string; html: string }[] = [];
const asked: { ref: string; kind: string; html: string }[] = [];
const searches: SearchQuery[] = [];
let detectorRows: SearchRow[] = [];
let completed: WorkItem[] = [];
let workload = { hoursMonth: 2, monthlyHours: 10, upcoming: 0, horizonDays: 14, openTasks: 1 };
const kpiValues: Record<string, number> = { gsc_clicks: 280, ga4_sessions: 1000, ga4_keyEvents: 20 };

const fakeGoogle: MetricSource = {
  provider: 'google',
  kinds: [{ assetKind: 'search_console', source: 'gsc', label: 'Search Console', historyDays: 486, lagDays: 2, chunkDays: 120, monthlyTop: true }],
  isConnected: async () => true,
  normalize: normalizeGoogleProperty,
  fetchDaily: async () => [],
  async search(_t, _s, _p, q) {
    searches.push(q);
    if (q.dimensions.join() === 'query,page') return q.from > addDays(TODAY, -40) ? detectorRows : [];
    if (q.dimensions.join() === 'date,query') return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((i) => ({ keys: [addDays(TODAY, -3 - i), 'abogado madrid'], clicks: 3, impressions: 100, ctr: 0.03, position: i < 7 ? 6 : 9 }));
    if (q.dimensions.join() === 'page' && q.filters?.[0]?.operator === 'contains') return [{ keys: ['https://www.prueba-est.invalid/variante/'], clicks: 2, impressions: 50, ctr: 0.04, position: 8 }, { keys: ['https://www.prueba-est.invalid/variante/otra'], clicks: 9, impressions: 500, ctr: 0.02, position: 5 }];
    if (q.dimensions.join() === 'date' && q.filters?.[0]?.expression === 'https://prueba-est.invalid/variante') return [];
    if (q.dimensions.join() === 'date' && q.filters?.[0]?.dimension === 'page') return [{ keys: [addDays(TODAY, -5), ''], clicks: 4, impressions: 80, ctr: 0.05, position: 7 }];
    if (q.dimensions.join() === 'query') return [{ keys: ['abogado madrid'], clicks: 9, impressions: 900, ctr: 0.01, position: 7 }, { keys: ['despido improcedente'], clicks: 3, impressions: 400, ctr: 0.01, position: 12 }];
    return [];
  },
  async inspectUrl() {
    return { lastCrawl: TODAY, verdict: 'PASS', coverage: 'Enviada e indexada', indexing: null, robots: null, canonical: null };
  }
};

const fakeKpis: KpiProvider = {
  list: () => [
    { key: 'gsc_clicks', label: 'Clics desde Google', short: 'Clics', source: 'gsc', format: 'int', lowerBetter: false, summable: true },
    { key: 'ga4_sessions', label: 'Sesiones', short: 'Sesiones', source: 'ga4', format: 'int', lowerBetter: false, summable: true },
    { key: 'ga4_keyEvents', label: 'Conversiones', short: 'Conversiones', source: 'ga4', format: 'int', lowerBetter: false, summable: true }
  ],
  async values(_t, _c, key, ranges) {
    // 10 al día de clics (280 en 28 días); ga4: tráfico sube y conversiones bajan en el último tramo.
    return ranges.map((r, i) => {
      const days = Math.round((Date.parse(r.to) - Date.parse(r.from)) / 86_400_000) + 1;
      if (key === 'gsc_clicks') return (kpiValues.gsc_clicks / 28) * days;
      if (key === 'ga4_sessions') return i === 0 ? 1300 : 1000;
      if (key === 'ga4_keyEvents') return i === 0 ? 20 : 40;
      return null;
    });
  },
  lastDay: async () => addDays(TODAY, -2)
};

async function cleanup() {
  const [t] = await db.select().from(tenants).where(eq(tenants.slug, SLUG));
  if (t) await db.delete(tenants).where(eq(tenants.id, t.id));
}

describe('estrategia con la base de datos', () => {
  let tid = '';
  let clientId = '';
  let other = '';
  const toolCtx = (): ToolContext => ({ tenantId: tid, agentKey: 'principal', channel: 'telegram', conversationId: null, actor: { name: 'Enric', isOwner: true, clickupUserId: null } });

  beforeAll(async () => {
    await cleanup();
    const [t] = await db.insert(tenants).values({ name: 'Prueba estrategia', slug: SLUG }).returning();
    tid = t.id;
    // Sin análisis por alerta: un análisis en cola lo cogería el planificador de la app y llamaría a Opus de verdad.
    await saveStrategistSettings(tid, { alertsPerMonth: 0 });
    registerMetricSource(fakeGoogle);
    registerKpiProvider(fakeKpis);
    registerWorkSource({
      completedSince: async () => ({ items: completed, cursor: completed.length ? completed[completed.length - 1].doneAt : null }),
      clientCompleted: async () => completed,
      workload: async () => workload,
      askAboutTask: async (_t, ref, kind, html) => {
        asked.push({ ref, kind, html });
        return true;
      }
    });
    registerEstrategiaCapabilities();
    setTelegramOutbound({ sendText: async () => undefined, sendVoice: async () => true, sendTyping: async () => undefined, notifyOwner: async (_t, key, html) => void sent.push({ key, html }) });
    _resetSchedulerState();
    clientId = await createCoreClient(tid, { name: 'Prueba Estrategia SL', status: 'activo' });
    await saveAsset(tid, clientId, { kind: 'search_console', value: 'sc-domain:prueba-est.invalid', access: 'si' });
    await saveAsset(tid, clientId, { kind: 'web', value: 'https://prueba-est.invalid', access: 'si' });
    other = await createCoreClient(tid, { name: 'Sin Plan SA', status: 'activo' });
  });
  afterAll(cleanup);

  it('crea los planes de partida y, al asignar uno, la agenda de sus procesos ejecutables', async () => {
    const plans = await listPlans(tid);
    expect(plans.map((p) => p.key)).toEqual(['mantenimiento', 'seo_local', 'seo_estrategico']);
    await setClientPlan(tid, clientId, plans.find((p) => p.key === 'seo_estrategico')!.id);
    const runs = await listRuns(tid, clientId);
    expect(runs.map((r) => r.process).sort()).toEqual(['critico', 'detectores', 'estratega', 'gbp', 'guardian', 'keywords', 'objetivos', 'salud', 'urls', 'velocidad']); // ni «por evento» ni fase 3
    expect(runs.every((r) => r.nextRunAt.getTime() <= Date.now() + 61 * 60_000)).toBe(true); // en la próxima hora
    expect(await clientEffective(tid, other)).toBeNull(); // sin plan: nada
  });

  it('un ajuste del cliente cambia su frecuencia o apaga el proceso; null vuelve a la del plan', async () => {
    await saveClientOverride(tid, clientId, 'velocidad', { on: false, every: 30 });
    expect((await listRuns(tid, clientId)).some((r) => r.process === 'velocidad')).toBe(false);
    await saveClientOverride(tid, clientId, 'keywords', { on: true, every: 3 });
    expect((await clientEffective(tid, clientId))!.processes.find((p) => p.key === 'keywords')).toMatchObject({ every: 3, from: 'cliente' });
    await saveClientOverride(tid, clientId, 'velocidad', null);
    expect((await listRuns(tid, clientId)).some((r) => r.process === 'velocidad')).toBe(true);
  });

  it('detectores: guarda señales sin repetir, avisa solo de las de gravedad y las resuelve cuando desaparecen', async () => {
    detectorRows = [
      { keys: ['abogado madrid', 'https://prueba-est.invalid/a'], clicks: 20, impressions: 900, ctr: 0.022, position: 7 },
      { keys: ['ctr malo', 'https://prueba-est.invalid/b'], clicks: 1, impressions: 800, ctr: 0.001, position: 2 }
    ];
    const ctx = (await loadCtx(tid, clientId))!;
    expect(ctx.gsc?.property).toBe('sc-domain:prueba-est.invalid');
    const out = await runDetectores(ctx);
    expect(out.summary).toContain('Al alcance: 1');
    const open = await listSignals(tid, clientId, { open: true });
    expect(open.map((s) => s.kind).sort()).toEqual(['al_alcance', 'ctr_bajo', 'embudo']);
    expect(sent.some((m) => m.html.includes('conversión baja'))).toBe(true); // el embudo es «aviso»: avisa
    expect(sent.some((m) => m.html.includes('abogado madrid'))).toBe(false); // las oportunidades no avisan
    await runDetectores(ctx); // misma pasada: no duplica
    expect((await listSignals(tid, clientId)).length).toBe(3);
    detectorRows = [];
    await runDetectores(ctx);
    const after = await listSignals(tid, clientId);
    expect(after.filter((s) => s.kind === 'al_alcance')[0].status).toBe('resuelta');
  });

  it('objetivos: estado con la cifra de Rendimiento y aviso solo cuando empeora', async () => {
    const start = addDays(TODAY, -200);
    await saveObjective(tid, clientId, { title: 'Más clics', kind: 'kpi', kpiKey: 'gsc_clicks', baselineValue: 300, targetValue: 600, startDate: start, dueDate: addDays(start, 365), curve: 'lineal' }, ['gsc_clicks']);
    sent.length = 0;
    const ctx = (await loadCtx(tid, clientId))!;
    const out = await runObjetivos(ctx);
    expect(out.summary).toContain('desviado: 1');
    const [o] = await listObjectives(tid, clientId);
    expect(o.lastHealth).toBe('desviado');
    expect(o.lastValue).toBe(300); // 280 en 28 días → 300 al mes
    expect(sent.some((m) => m.html.includes('objetivos que empeoran'))).toBe(true);
    sent.length = 0;
    await runObjetivos(ctx); // sigue igual: no vuelve a avisar
    expect(sent.length).toBe(0);
  });

  it('palabras clave: historial de Search Console con un solo filtro y resumen semanal', async () => {
    await addKeywords(tid, clientId, ['Abogado Madrid', 'despido improcedente', 'x'], { critical: true });
    const ctx = (await loadCtx(tid, clientId))!;
    searches.length = 0;
    const out = await runKeywords(ctx);
    expect(searches[0].filters?.[0]).toMatchObject({ dimension: 'query', operator: 'includingRegex' });
    expect(searches[0].filters?.[0].expression).toContain('abogado madrid|despido improcedente');
    expect(searches[0].from).toBe(addDays(TODAY, -93)); // la primera vez, 90 días
    const kws = await listKeywords(tid, clientId);
    const a = kws.find((k) => k.keyword === 'abogado madrid')!;
    expect(a.lastPosition).toBeCloseTo(6, 5);
    expect(a.prevPosition).toBeCloseTo(9, 5);
    expect(kws.find((k) => k.keyword === 'despido improcedente')!.lastPosition).toBeNull();
    expect(out.summary).toContain('2 palabra(s)');
  });

  it('extracción: guarda el trabajo, sigue sus URLs y pregunta la URL que falta; la respuesta empieza el seguimiento', async () => {
    const now = new Date();
    completed = [
      { taskId: 'cu-1', ref: '00000000-0000-4000-8000-000000000001', clientId, title: 'Optimizar títulos de servicios', description: 'Cambiar title de https://prueba-est.invalid/servicios y de https://otro.com/no', doneNote: '', workType: null, doneAt: new Date(now.getTime() - 3_600_000).toISOString(), minutes: 90, assigneeName: 'Ana' },
      { taskId: 'cu-2', ref: '00000000-0000-4000-8000-000000000002', clientId, title: 'Publicar artículo sobre despidos', description: 'Redactar y publicar', doneNote: 'Hecho', workType: null, doneAt: new Date(now.getTime() - 1_800_000).toISOString(), minutes: 120, assigneeName: 'Ana' },
      { taskId: 'cu-3', ref: '00000000-0000-4000-8000-000000000003', clientId: other, title: 'Cliente sin plan', description: '', doneNote: '', workType: null, doneAt: now.toISOString(), minutes: null, assigneeName: null }
    ];
    const n = await runExtraction(tid, now);
    expect(n).toBe(2); // el cliente sin plan no se procesa
    const facts = await db.select().from(estWorkFacts).where(eq(estWorkFacts.tenantId, tid));
    const f1 = facts.find((f) => f.taskId === 'cu-1')!;
    expect(f1.urls).toEqual(['https://prueba-est.invalid/servicios']); // la de otro dominio no
    expect(f1.hours).toBe('1.50');
    const f2 = facts.find((f) => f.taskId === 'cu-2')!;
    expect(f2.urlStatus).toBe('preguntada');
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ kind: 'url', ref: '00000000-0000-4000-8000-000000000002' });
    const tracked = await db.select().from(estTrackedUrls).where(eq(estTrackedUrls.clientId, clientId));
    expect(tracked.map((t) => t.url)).toEqual(['https://prueba-est.invalid/servicios']);
    expect(await runExtraction(tid, now)).toBe(0); // ya procesados
    // La respuesta (por Operaciones → núcleo): una ruta del dominio del cliente.
    const handler = taskAnswerHandler('url')!;
    const reply = await handler(tid, 'cu-2', 'está en /blog/despidos', 'Ana');
    expect(reply).toContain('sigo esa página');
    const [f2b] = await db.select().from(estWorkFacts).where(and(eq(estWorkFacts.tenantId, tid), eq(estWorkFacts.taskId, 'cu-2')));
    expect(f2b.urls).toEqual(['https://prueba-est.invalid/blog/despidos']);
    expect(f2b.urlStatus).toBe('respondida');
    expect(await answerUrlQuestion(tid, 'cu-1', null)).toContain('no aplica');
    // Otro dominio o «//otro» no valen: se pide de nuevo y no se guarda nada.
    expect(await handler(tid, 'cu-2', 'https://otro.com/x //malo.com/y', 'Ana')).toContain('Pulsa otra vez');
  });

  it('el cursor de la extracción avanza aunque los encargos leídos no sean de ningún cliente con plan', async () => {
    const before = (await getSettings(tid)).state.lastExtractAt;
    const later = new Date(Date.now() + 5_000);
    completed = [{ taskId: 'cu-9', ref: '00000000-0000-4000-8000-000000000009', clientId: other, title: 'Otro', description: '', doneNote: '', workType: null, doneAt: later.toISOString(), minutes: null, assigneeName: null }];
    expect(await runExtraction(tid, later)).toBe(0);
    const after = (await getSettings(tid)).state.lastExtractAt!;
    expect(after > (before ?? '')).toBe(true);
    completed = [];
  });

  it('URLs trabajadas: 90 días de «antes», datos diarios y fecha de rastreo', async () => {
    const ctx = (await loadCtx(tid, clientId))!;
    searches.length = 0;
    const out = await runUrls(ctx);
    expect(out.summary).toContain('2 URL(s)');
    const t = await db.select().from(estTrackedUrls).where(eq(estTrackedUrls.clientId, clientId));
    const pageQs = searches.filter((q) => q.filters?.[0]?.dimension === 'page');
    expect(pageQs.map((q) => q.from).sort()).toEqual(t.map((x) => addDays(x.changedOn, -90)).sort()); // 90 días antes del cambio
    expect(t.every((x) => x.backfilled && x.crawledOn === TODAY && x.indexState === 'Enviada e indexada')).toBe(true);
    const daily = await db.select().from(estUrlDaily).where(eq(estUrlDaily.trackedUrlId, t[0].id));
    expect(daily).toHaveLength(1);
  });

  it('URLs trabajadas: si Search Console no tiene la URL escrita, se pasa a la variante que sí tiene', async () => {
    const ctx = (await loadCtx(tid, clientId))!;
    await trackUrl(tid, clientId, { url: 'https://prueba-est.invalid/variante', property: ctx.gsc!.property, reason: 'Prueba', workFactId: null, changedOn: TODAY, trackDays: 60 });
    const out = await runUrls(ctx);
    expect(out.summary).toContain('1 corregida(s)');
    const t = await db.select().from(estTrackedUrls).where(eq(estTrackedUrls.clientId, clientId));
    const v = t.find((x) => x.url.includes('variante'))!;
    expect(v.url).toBe('https://www.prueba-est.invalid/variante/');
    expect(await db.select().from(estUrlDaily).where(eq(estUrlDaily.trackedUrlId, v.id))).toHaveLength(1);
    await db.delete(estTrackedUrls).where(eq(estTrackedUrls.id, v.id)); // las pruebas siguientes cuentan 2 URLs
  });

  it('vigilancia crítica: la web que no responde solo avisa si sigue caída en la segunda comprobación', async () => {
    sent.length = 0;
    const ctx = (await loadCtx(tid, clientId))!;
    const out = await runCritico(ctx);
    expect(out.status).toBe('aviso');
    expect(out.retryInMin).toBe(30);
    expect(sent.length).toBe(0);
    await db.update(estSignals).set({ firstSeenAt: new Date(Date.now() - 40 * 60_000) }).where(and(eq(estSignals.clientId, clientId), eq(estSignals.kind, 'critico')));
    await runCritico(ctx);
    expect(sent.some((m) => m.html.includes('problema en la web (confirmado)'))).toBe(true);
  }, 60_000);

  it('la agenda no pisa un reintento de confirmación (la web caída se vuelve a mirar a los 30 min)', async () => {
    const { syncRuns } = await import('@/lib/estrategia/store');
    const soon = new Date(Date.now() + 30 * 60_000);
    await db.update(estProcessRuns).set({ lastRunAt: new Date(), nextRunAt: soon, errorCount: 0 }).where(and(eq(estProcessRuns.clientId, clientId), eq(estProcessRuns.process, 'critico')));
    await syncRuns(tid, clientId);
    const run = (await listRuns(tid, clientId)).find((r) => r.process === 'critico')!;
    expect(Math.abs(run.nextRunAt.getTime() - soon.getTime())).toBeLessThan(2000);
  });

  it('guardián: sin trabajo planificado y pocas horas', async () => {
    const ctx = (await loadCtx(tid, clientId))!;
    const out = await runGuardian(ctx);
    expect(out.summary).toContain('Sin encargos planificados');
    workload = { ...workload, upcoming: 3 };
    await runGuardian(ctx);
    const g = (await listSignals(tid, clientId)).filter((s) => s.kind === 'guardian');
    expect(g.find((s) => s.dedupeKey === 'guardian:sin_trabajo')?.status).toBe('resuelta');
  });

  it('planificador: ejecuta lo que toca, respeta la pausa y deja la próxima fecha', async () => {
    await db.update(estProcessRuns).set({ nextRunAt: new Date(Date.now() + 86_400_000) }).where(eq(estProcessRuns.clientId, clientId));
    await db.update(estProcessRuns).set({ nextRunAt: new Date(Date.now() - 1000) }).where(and(eq(estProcessRuns.clientId, clientId), eq(estProcessRuns.process, 'objetivos')));
    const r = await runEstrategia(tid, { budgetMs: 30_000 });
    expect(r.ran).toBe(1);
    const run = (await listRuns(tid, clientId)).find((x) => x.process === 'objetivos')!;
    expect(run.lastRunAt).not.toBeNull();
    expect(run.nextRunAt.getTime()).toBeGreaterThan(Date.now() + 20 * 3_600_000);
    await pauseClient(tid, clientId, addDays(TODAY, 5));
    await db.update(estProcessRuns).set({ nextRunAt: new Date(Date.now() - 1000) }).where(and(eq(estProcessRuns.clientId, clientId), eq(estProcessRuns.process, 'guardian')));
    await runEstrategia(tid, { budgetMs: 30_000 });
    const g = (await listRuns(tid, clientId)).find((x) => x.process === 'guardian')!;
    expect(g.status).toBe('omitido');
    expect(g.nextRunAt.toISOString().slice(0, 10)).toBe(addDays(TODAY, 6));
    await pauseClient(tid, clientId, null);
  }, 60_000);

  it('calendario: Rendimiento lo lee por el núcleo', async () => {
    await saveEvent(tid, { date: addDays(TODAY, -3), endDate: addDays(TODAY, 5), kind: 'google', title: 'Core update de prueba' });
    const ev = await externalEvents(tid, addDays(TODAY, -1), TODAY);
    expect(ev.map((e) => e.title)).toEqual(['Core update de prueba']);
    expect(await externalEvents(tid, addDays(TODAY, 10), addDays(TODAY, 20))).toEqual([]);
  });

  it('pestaña, panel, informe semanal, Salud y herramienta del agente', async () => {
    const s = (await clientStrategy(tid, clientId))!;
    expect(s.planId).not.toBeNull();
    expect(s.objectives[0]).toMatchObject({ health: 'desviado', kpiLabel: 'Clics desde Google' });
    expect(s.keywords.length).toBe(2);
    expect(s.work.length).toBe(2);
    expect(s.tracked.length).toBe(2);
    expect(s.processes.find((p) => p.key === 'keywords')?.from).toBe('cliente');
    const none = (await clientStrategy(tid, other))!;
    expect(none.planId).toBeNull();
    const ov = await strategyOverview(tid);
    expect(ov.rows.map((r) => r.name)).toEqual(['Prueba Estrategia SL']);
    expect(ov.withoutPlan.map((c) => c.name)).toContain('Sin Plan SA');
    const lines = await weeklyLines(tid);
    expect(lines!.join('\n')).toContain('Prueba Estrategia SL');
    expect((await strategyHealth(tid))[0].status).toBe('ok');
    const tool = getTool('estrategia_cliente')!;
    const r = await tool.run(toolCtx(), { cliente: 'prueba estrategia' });
    expect(r.ok).toBe(true);
    expect(r.content).toContain('Más clics: Desviado');
    expect((await tool.run(toolCtx(), { cliente: 'sin plan' })).content).toContain('no tiene seguimiento');
  });

  // Nunca se deja un análisis «pendiente»: el planificador real de la app lo cogería y llamaría a Opus.
  it('estratega: cola sin duplicados, solo clientes con plan, decisiones sin doble encargo y calidad', async () => {
    expect((await queueAnalysis(tid, other, 'manual')).ok).toBe(false); // sin plan
    const [a] = await db.insert(estAnalyses).values({ tenantId: tid, clientId, trigger: 'manual', status: 'en_curso', startedAt: new Date() }).returning();
    const dup = await queueAnalysis(tid, clientId, 'manual');
    expect(dup).toMatchObject({ ok: false, id: a.id });
    expect((await db.select().from(estAnalyses).where(eq(estAnalyses.tenantId, tid))).map((x) => x.id)).toEqual([a.id]); // ninguna alerta encolada
    await db.update(estAnalyses).set({ status: 'hecho', finishedAt: new Date() }).where(eq(estAnalyses.id, a.id));
    const base = { tenantId: tid, clientId, analysisId: a.id, description: 'Descripción de prueba', category: 'onpage', evidence: [], impact: 6, confidence: 5, hours: '1.00', hoursAi: '1.00', hoursSource: 'ia', ice: '30.000' };
    const [s1, s2, s3] = await db
      .insert(estSuggestions)
      .values([
        { ...base, rank: 1, title: 'Propuesta uno' },
        { ...base, rank: 2, title: 'Propuesta dos' },
        { ...base, rank: 3, title: 'Propuesta tres' }
      ])
      .returning();
    // Aprobar sin Operaciones capaz de crear encargos: no se crea nada, así que la propuesta vuelve a pendiente con el
    // error (se puede reintentar; antes quedaba «aprobada» sin encargo y contaba como aceptada).
    const ok = await decideSuggestion(tid, s1.id, { kind: 'aprobar' }, 'Prueba');
    expect(ok.ok).toBe(false);
    expect(ok.message).toContain('No se pudo crear el encargo');
    expect((await decideSuggestion(tid, s1.id, { kind: 'aprobar' }, 'Prueba')).message).toContain('sigue pendiente');
    expect((await decideSuggestion(tid, s2.id, { kind: 'aplazar' }, 'Prueba')).ok).toBe(true);
    expect((await decideSuggestion(tid, s2.id, { kind: 'aplazar' }, 'Prueba')).message).toContain('Ya está para más adelante');
    expect((await decideSuggestion(tid, s3.id, { kind: 'rechazar', reason: 'ya_hecho' }, 'Prueba')).ok).toBe(true);
    const [row] = await db.select().from(estSuggestions).where(eq(estSuggestions.id, s1.id));
    expect(row).toMatchObject({ status: 'pendiente', decidedBy: null });
    expect(row.taskError).toBeTruthy();
    const q = await strategistQuality(tid, 30);
    expect(q.stats).toMatchObject({ total: 3, pending: 1, accepted: 0, rejected: 1, snoozed: 1, reasons: { ya_hecho: 1 } });
    expect(q.stats.acceptanceRate).toBe(0);
    expect(q.analyses).toMatchObject({ total: 1, done: 1, manual: 1 });
    expect(q.byClient.map((c) => c.clientId)).toEqual([clientId]);
  });

  it('quitar el plan apaga todo pero conserva lo guardado; un plan con clientes no se borra', async () => {
    const settings = await getSettings(tid);
    expect(settings.onTrackPct).toBe(90);
    await setClientPlan(tid, clientId, null);
    expect(await listRuns(tid, clientId)).toEqual([]);
    expect((await listObjectives(tid, clientId)).length).toBe(1);
    expect(PROCESS.critico.defaultEvery).toBe(1);
  });
});

// Módulo Google Ads, paso 2 (28 nov 2026; docs/ads/DISENO-TECNICO-ADS.md v2 §6-7):
//  - reglas puras con sus casos límite (programación de anuncios, día sin fila frente a cero, fuente caída → «no
//    comprobado», binomial negativa frente a Poisson, banda de clics, ritmo con y sin acuerdo, autor de la pausa);
//  - precedencia, tope de atención (5 + 3, «N más por debajo del corte», 2 interrupciones al día), horario, respuestas;
//  - con la base de datos real (cuenta de prueba propia que se borra al terminar): descarga y evaluación completas en
//    modo simulado con sus escenarios deterministas (campaña parada, rechazo, medición rota y cambios ajenos), ciclo de
//    vida (no se resuelve a ciegas), respuestas, revisión, objetivo provisional y modo sombra.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adsAccounts, adsFindings, adsRuleRuns, tenants } from '@/lib/db/schema';
import {
  alertPlan,
  applyPrecedence,
  classifyLanding,
  DEFAULT_THRESHOLDS,
  estimateK,
  inAlertWindow,
  K_MAX,
  lastServiceHours,
  monthReference,
  morningCut,
  nbZeroProbability,
  nextReviewDate,
  provisionalGoal,
  responseEffect,
  ruleAccountCannotServe,
  ruleCampaignStoppedOrRunaway,
  ruleDefs,
  ruleDisapprovedWithSpend,
  ruleForeignChange,
  ruleLandingDown,
  ruleMeasurementBroken,
  rulePacing,
  rulePausedContributor,
  ruleSourceHealth,
  runRule,
  servesAt,
  type AccountInput,
  type CampaignIn,
  type DailyIn,
  type FindingDraft
} from '@/lib/ads/finding-rules';
import { addDays, SOURCES, zonedParts, type AdsSource, type SourceHealth } from '@/lib/ads/rules';
import { mergeThresholds } from '@/lib/ads/thresholds';

const TODAY = '2026-11-25'; // miércoles
const YESTERDAY = '2026-11-24';
const SANA = Object.fromEntries(SOURCES.map((s) => [s, 'sana'])) as Record<AdsSource, SourceHealth>;
const dayOf = (d: Date) => d.toISOString().slice(0, 10);
const lastDays = (n: number, today = TODAY) => Array.from({ length: n }, (_, i) => addDays(today, -(i + 1)));
const cover = (n: number, today = TODAY) => new Set(lastDays(n, today));
const camp = (id: string, over: Partial<CampaignIn> = {}): CampaignIn => ({ nativeId: id, name: `Campaña ${id}`, status: 'ENABLED', servingStatus: 'SERVING', channelType: 'SEARCH', budgetNativeId: `b${id}`, startDate: '2025-01-01', endDate: null, adSchedule: null, ...over });
const row = (campaignNativeId: string, day: string, over: Partial<DailyIn> = {}): DailyIn => ({ campaignNativeId, day, cost: 10, impressions: 500, clicks: 20, conversions: 1, ...over });
const WEEKDAYS_9_19 = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'].map((day) => ({ day, startHour: 9, startMinute: 0, endHour: 19, endMinute: 0 }));

function input(over: Partial<AccountInput> = {}): AccountInput {
  return {
    accountId: 'acc',
    name: 'Cuenta de prueba',
    status: 'ENABLED',
    currency: 'EUR',
    today: TODAY,
    hour: 15,
    now: new Date(`${TODAY}T14:00:00Z`),
    campaigns: [],
    budgets: [],
    daily: [],
    covered: new Set(),
    hourly: [],
    hourlyDays: new Set(),
    hourlyThrough: null,
    policies: [],
    landing: [],
    changes: [],
    conversions: [],
    actions: [],
    goal: null,
    health: { ...SANA },
    t: { ...DEFAULT_THRESHOLDS },
    ...over
  };
}
const defOf = (kind: string) => ruleDefs(dayOf).find((d) => d.kind === kind)!;

describe('ads paso 2: comprobación previa (MED-00) y cero frente a «sin dato»', () => {
  it('con una fuente caída la regla dice «no comprobado» y no afirma nada', () => {
    const a = input({ campaigns: [camp('1')], covered: cover(20), health: { ...SANA, metricas: 'caida' } });
    const r = runRule(defOf('campana_parada_desbocada'), a);
    expect(r.outcome).toBe('no_comprobado');
    expect(r.reason).toMatch(/métricas diarias: caída/);
    expect(r.findings).toEqual([]);
  });

  it('si falta un día de su ventana, tampoco afirma', () => {
    const covered = cover(20);
    covered.delete(addDays(TODAY, -3));
    const r = runRule(defOf('rechazo_con_gasto'), input({ covered }));
    expect(r.outcome).toBe('no_comprobado');
    expect(r.reason).toMatch(/faltan días completos/);
  });

  it('un día cubierto sin fila es un cero (campaña parada); sin cubrir no se sabe', () => {
    const daily = [row('1', addDays(YESTERDAY, -7), { impressions: 600 })];
    const found = ruleCampaignStoppedOrRunaway(input({ campaigns: [camp('1')], daily, covered: cover(10) }));
    expect(found.findings).toHaveLength(1);
    expect(found.findings[0]).toMatchObject({ kind: 'campana_parada_desbocada', channel: 'interrupcion', causeKey: 'parada:acc:1' });
    expect(found.findings[0].title).toMatch(/ni una impresión ayer/);
    const covered = cover(10);
    covered.delete(YESTERDAY);
    expect(ruleCampaignStoppedOrRunaway(input({ campaigns: [camp('1')], daily, covered })).findings).toHaveLength(0);
    expect(runRule(defOf('campana_parada_desbocada'), input({ campaigns: [camp('1')], daily, covered })).outcome).toBe('no_comprobado');
  });

  it('una caída por debajo del suelo de impresiones no es «parada»', () => {
    const daily = [row('1', addDays(YESTERDAY, -7), { impressions: 40 })];
    expect(ruleCampaignStoppedOrRunaway(input({ campaigns: [camp('1')], daily, covered: cover(10) })).findings).toHaveLength(0);
  });
});

describe('ads paso 2: programación de anuncios', () => {
  it('la hora cuenta si el tramo la cubre; fuera de horario no sirve', () => {
    expect(servesAt(WEEKDAYS_9_19, 3, 9)).toBe(true);
    expect(servesAt(WEEKDAYS_9_19, 3, 18)).toBe(true);
    expect(servesAt(WEEKDAYS_9_19, 3, 19)).toBe(false);
    expect(servesAt(WEEKDAYS_9_19, 6, 12)).toBe(false); // sábado
    expect(servesAt(null, 6, 3)).toBe(true); // sin programación: siempre
    expect(lastServiceHours(WEEKDAYS_9_19, 3, 22, 3)).toEqual([16, 17, 18]);
    expect(lastServiceHours(WEEKDAYS_9_19, 3, 9, 3)).toEqual([9]);
  });

  const hourlyFor = (day: string, hours: number[], impressions: number) => hours.map((hour) => ({ campaignNativeId: '1', day, hour, impressions, clicks: 2, cost: 1, conversions: 0 }));
  const refs = [7, 14].map((n) => addDays(TODAY, -n));

  it('parada por horas: 0 impresiones en las 3 últimas horas programadas frente al mismo tramo de 4 semanas', () => {
    const c = camp('1', { adSchedule: WEEKDAYS_9_19 });
    const hourly = refs.flatMap((d) => hourlyFor(d, [10, 11, 12], 10));
    const a = input({ campaigns: [c], hourly, hourlyDays: new Set(refs), hourlyThrough: 12, covered: cover(10), daily: [row('1', YESTERDAY), row('1', addDays(YESTERDAY, -7))] });
    const r = ruleCampaignStoppedOrRunaway(a);
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].data).toMatchObject({ branch: 'horas', hours: [10, 11, 12] });
  });

  it('nunca acusa fuera del horario programado (sábado, o antes de tener 3 horas de servicio)', () => {
    const c = camp('1', { adSchedule: WEEKDAYS_9_19 });
    const sat = '2026-11-28';
    const satRefs = [7, 14].map((n) => addDays(sat, -n));
    const hourly = satRefs.flatMap((d) => hourlyFor(d, [10, 11, 12], 10));
    const onSat = ruleCampaignStoppedOrRunaway(input({ today: sat, campaigns: [c], hourly, hourlyDays: new Set(satRefs), hourlyThrough: 12, covered: cover(10, sat) }));
    expect(onSat.findings).toHaveLength(0);
    const early = ruleCampaignStoppedOrRunaway(input({ campaigns: [c], hourly: refs.flatMap((d) => hourlyFor(d, [9], 50)), hourlyDays: new Set(refs), hourlyThrough: 9, covered: cover(10), daily: [row('1', YESTERDAY), row('1', addDays(YESTERDAY, -7))] }));
    expect(early.findings).toHaveLength(0);
  });

  it('la cuenta que no sirve: estado suspendido, y 0 impresiones de toda la cuenta en horas de servicio', () => {
    expect(ruleAccountCannotServe(input({ status: 'SUSPENDED' })).findings[0]).toMatchObject({ kind: 'cuenta_no_sirve', channel: 'interrupcion' });
    const hourly = refs.flatMap((d) => hourlyFor(d, [10, 11, 12], 10));
    const r = ruleAccountCannotServe(input({ campaigns: [camp('1')], hourly, hourlyDays: new Set(refs), hourlyThrough: 12 }));
    expect(r.findings[0]?.causeKey).toBe('cuenta:acc:sin_impresiones');
    // Sin semanas de referencia no se afirma «sin impresiones».
    expect(ruleAccountCannotServe(input({ campaigns: [camp('1')], hourlyThrough: 12 })).findings).toHaveLength(0);
  });
});

describe('ads paso 2: gasto desbocado, rechazos y páginas caídas', () => {
  it('desbocada: 3 días por encima de 1,3 × su presupuesto (los compartidos cuentan una vez)', () => {
    const budgets = [{ nativeId: 'shared', amount: 10, period: 'DAILY', status: 'ENABLED' }];
    const campaigns = [camp('1', { budgetNativeId: 'shared' }), camp('2', { budgetNativeId: 'shared' })];
    const daily = lastDays(3).flatMap((d) => [row('1', d, { cost: 9 }), row('2', d, { cost: 6 })]);
    const r = ruleCampaignStoppedOrRunaway(input({ campaigns, budgets, daily, covered: cover(10) }));
    expect(r.findings.map((f) => f.causeKey)).toEqual(['desbocada3d:acc:shared']);
    expect(r.findings[0].campaignNativeId).toBe('1');
    const calm = lastDays(3).flatMap((d) => [row('1', d, { cost: 6 }), row('2', d, { cost: 6 })]);
    expect(ruleCampaignStoppedOrRunaway(input({ campaigns, budgets, daily: calm, covered: cover(10) })).findings).toHaveLength(0);
  });

  it('rechazo: interrupción si es lo que más gasta; si no, parte', () => {
    const campaigns = [camp('1'), camp('2')];
    const daily = lastDays(14).flatMap((d) => [row('1', d, { cost: 50 }), row('2', d, { cost: 5 })]);
    const pol = (cid: string, over = {}) => ({ campaignNativeId: cid, adGroupNativeId: `g${cid}`, name: `Grupo ${cid}`, status: 'ENABLED', entityKind: 'ad_group', adsTotal: 2, adsApproved: 0, adsDisapproved: 2, keywordsDisapproved: 0, ...over });
    const r = ruleDisapprovedWithSpend(input({ campaigns, daily, covered: cover(14), policies: [pol('1'), pol('2', { adsApproved: 1, adsDisapproved: 1, keywordsDisapproved: 3 })] }));
    const byCamp = new Map(r.findings.map((f) => [f.campaignNativeId, f]));
    expect(byCamp.get('1')?.channel).toBe('interrupcion');
    expect(byCamp.get('2')?.channel).toBe('parte');
    expect(byCamp.get('2')?.lines.join(' ')).toMatch(/3 palabras clave rechazadas/);
    // Un grupo con algún anuncio aprobado y sin palabras rechazadas no es hallazgo.
    expect(ruleDisapprovedWithSpend(input({ campaigns, daily, covered: cover(14), policies: [pol('1', { adsApproved: 1 })] })).findings).toHaveLength(0);
  });

  it('qué es «caída»: 404, 410, 5xx y errores de red; 403/429 no se puede comprobar', () => {
    expect(classifyLanding({ status: 404 })).toBe('caida');
    expect(classifyLanding({ status: 503 })).toBe('caida');
    expect(classifyLanding({ status: 0, error: 'getaddrinfo ENOTFOUND' })).toBe('caida');
    expect(classifyLanding({ status: 403 })).toBe('no_comprobable');
    expect(classifyLanding({ status: 429 })).toBe('no_comprobable');
    expect(classifyLanding({ status: 0, error: 'Dirección no permitida' })).toBe('no_comprobable');
    expect(classifyLanding({ status: 301 })).toBe('ok');
  });

  it('página caída con gasto solo con dos fallos seguidos', () => {
    const l = { url: 'https://cliente.es/landing', urlNormalized: 'https://cliente.es/landing', cost7d: 140, clicks7d: 50, lastCheckAt: new Date(), lastCheckStatus: '503', lastCheckOk: false, consecutiveFailures: 1, campaignNativeIds: ['1'] };
    expect(ruleLandingDown(input({ landing: [l] })).findings).toHaveLength(0);
    const r = ruleLandingDown(input({ landing: [{ ...l, consecutiveFailures: 2 }] }));
    expect(r.findings[0]).toMatchObject({ kind: 'landing_caida', channel: 'interrupcion', exposure: 20 });
    expect(ruleLandingDown(input({ landing: [{ ...l, lastCheckAt: null, lastCheckOk: null, consecutiveFailures: 0 }] })).outcome).toBe('no_comprobado');
  });
});

describe('ads paso 2: medición rota (binomial negativa, 5.1)', () => {
  it('con k = 2, 5 días a cero con 1 conversión al día no es raro (8,2 %); Poisson lo daría por roto', () => {
    expect(nbZeroProbability(5, 2)).toBeCloseTo((2 / 7) ** 2, 6);
    expect(nbZeroProbability(5, 2)).toBeCloseTo(0.0816, 3);
    expect(Math.exp(-5)).toBeLessThan(0.01);
    expect(nbZeroProbability(5, Infinity)).toBeCloseTo(Math.exp(-5), 6);
  });

  it('la dispersión k se estima con la esperanza de cada día; sin datos, la de partida', () => {
    expect(estimateK([{ x: 1, e: 1 }], 2)).toBe(2);
    const poissonish = Array.from({ length: 56 }, (_, i) => ({ x: [2, 1, 3, 2, 2, 1, 3][i % 7], e: 2 }));
    expect(estimateK(poissonish, 2)).toBe(K_MAX);
    const lumpy = Array.from({ length: 56 }, (_, i) => ({ x: i % 4 === 0 ? 8 : 0, e: 2 }));
    expect(estimateK(lumpy, 2)).toBeLessThan(2);
  });

  const ACTION = 'customers/1/conversionActions/1';
  const scenario = (opts: { convPerDay: number[]; zeroDays: number; clicksRecent?: number }) => {
    const daily: DailyIn[] = [];
    const conversions: { conversionAction: string; day: string; conversionsByConvDate: number }[] = [];
    for (let i = 1; i <= 70; i++) {
      const d = addDays(TODAY, -i);
      const recent = i <= opts.zeroDays;
      daily.push(row('1', d, { clicks: recent && opts.clicksRecent !== undefined ? opts.clicksRecent : 40 }));
      if (!recent) conversions.push({ conversionAction: ACTION, day: d, conversionsByConvDate: opts.convPerDay[i % opts.convPerDay.length] });
    }
    return input({ campaigns: [camp('1')], daily, conversions, covered: cover(70), actions: [{ resourceName: ACTION, name: 'Formulario', primaryForGoal: true, includeInConversions: true, status: 'ENABLED' }] });
  };

  it('8 días a cero con los clics de siempre y ~2 al día antes: rota', () => {
    const r = ruleMeasurementBroken(scenario({ convPerDay: [2, 1, 3, 2, 2, 1, 3], zeroDays: 8 }));
    expect(r.outcome).toBe('hallazgo');
    expect(r.findings[0]).toMatchObject({ kind: 'medicion_rota', channel: 'parte' });
    expect(Number(r.findings[0].data.p0)).toBeLessThan(DEFAULT_THRESHOLDS.medicionAlfa);
  });

  it('con menos de 30 conversiones en 8 semanas: «sin datos para afirmar», nunca «rota»', () => {
    const r = ruleMeasurementBroken(scenario({ convPerDay: [0, 0, 0, 1, 0, 0, 0], zeroDays: 20 }));
    expect(r.outcome).toBe('ok');
    expect(r.reason).toMatch(/^sin datos para afirmar/);
  });

  it('si los clics se hunden, la causa es de entrega y la medición no habla', () => {
    const r = ruleMeasurementBroken(scenario({ convPerDay: [2, 1, 3, 2, 2, 1, 3], zeroDays: 8, clicksRecent: 5 }));
    expect(r.findings).toHaveLength(0);
    expect(r.reason).toMatch(/fuera de su banda/);
  });

  it('pocos días a cero no bastan', () => {
    expect(ruleMeasurementBroken(scenario({ convPerDay: [2, 1, 3, 2, 2, 1, 3], zeroDays: 1 })).findings).toHaveLength(0);
  });

  it('si ayer no está completo, no se comprueba', () => {
    const a = scenario({ convPerDay: [2], zeroDays: 8 });
    a.covered.delete(YESTERDAY);
    expect(ruleMeasurementBroken(a).outcome).toBe('no_comprobado');
  });
});

describe('ads paso 2: ritmo, pausas y cambios ajenos', () => {
  const day20 = '2026-11-20';
  const month = (cost: number) => Array.from({ length: 19 }, (_, i) => row('1', addDays('2026-11-01', i), { cost }));
  const base = (cost: number, goal: AccountInput['goal'] = null, today = day20) =>
    input({ today, goal, campaigns: [camp('1')], budgets: [{ nativeId: 'b1', amount: 10, period: 'DAILY', status: 'ENABLED' }], daily: month(cost), covered: new Set(Array.from({ length: 25 }, (_, i) => addDays('2026-11-01', i))) });

  it('la referencia sin acuerdo es la suma de presupuestos por los días activos del mes', () => {
    expect(monthReference(base(10))).toEqual({ amount: 300, mode: 'presupuestos' });
    expect(monthReference(base(10, { kind: 'acordado', cplMax: null, budgetUsual: 250 }))).toEqual({ amount: 250, mode: 'acuerdo' });
  });

  it('pasarse avisa; quedarse corto solo avisa si hay un presupuesto acordado', () => {
    expect(rulePacing(base(13)).findings[0]?.title).toMatch(/\+30 %/);
    expect(rulePacing(base(7)).findings).toHaveLength(0);
    expect(rulePacing(base(7, { kind: 'acordado', cplMax: null, budgetUsual: 300 })).findings[0]?.title).toMatch(/-30 %/);
    const early = rulePacing(base(20, null, '2026-11-03'));
    expect(early.findings).toHaveLength(0);
    expect(early.reason).toMatch(/antes del día 5/);
  });

  it('presupuesto agotado antes de las 14:00', () => {
    const hourly = [9, 10, 11, 12].map((hour) => ({ campaignNativeId: '1', day: day20, hour, impressions: 10, clicks: 1, cost: 2.6, conversions: 0 }));
    const r = rulePacing({ ...base(10), hourly, hourlyThrough: 13 });
    expect(r.findings.some((f) => f.causeKey === 'agotado:acc:b1')).toBe(true);
  });

  const pauseChange = (actorClass: string, email: string) => ({ changeAt: new Date(`${addDays(TODAY, -5)}T10:00:00Z`), userEmail: email, actorClass, clientType: 'GOOGLE_ADS_WEB_CLIENT', resourceType: 'CAMPAIGN', campaignNativeId: '1', operation: 'UPDATE', changedFields: ['status'], newValue: { campaign: { status: 'PAUSED' } } });
  const paused = (actorClass: string) => {
    const pauseDay = addDays(TODAY, -5);
    const daily = Array.from({ length: 60 }, (_, i) => addDays(pauseDay, -(i + 1))).flatMap((d) => [row('1', d, { conversions: 1 }), row('2', d, { conversions: 2 })]);
    return input({ campaigns: [camp('1', { status: 'PAUSED' }), camp('2')], daily, covered: cover(80), changes: [pauseChange(actorClass, actorClass === 'agencia' ? 'gestor@kijutech.com' : 'dueno@gmail.com')] });
  };

  it('algo pausado que aportaba más del 10 % de los leads avisa a los 3 días, con quién lo pausó', () => {
    const r = rulePausedContributor(paused('cliente'), dayOf);
    expect(r.findings[0]).toMatchObject({ kind: 'pausado_aportaba', fyi: false });
    expect(r.findings[0].lines.join(' ')).toMatch(/dueno@gmail.com/);
    // Si lo pausó la agencia, solo «para que lo sepas».
    expect(rulePausedContributor(paused('agencia'), dayOf).findings[0]).toMatchObject({ fyi: true, severity: 'baja' });
  });

  it('cambio ajeno: del cliente o de Google en algo con gasto; los de la agencia no', () => {
    const daily = lastDays(14).map((d) => row('1', d));
    const ch = (actorClass: string, email: string | null, campaign = '1') => ({ changeAt: new Date(`${YESTERDAY}T10:00:00Z`), userEmail: email, actorClass, clientType: 'GOOGLE_ADS_WEB_CLIENT', resourceType: 'CAMPAIGN_BUDGET', campaignNativeId: campaign, operation: 'UPDATE', changedFields: ['amountMicros'], newValue: null });
    const r = ruleForeignChange(input({ campaigns: [camp('1'), camp('2')], daily, covered: cover(14), changes: [ch('cliente', 'dueno@gmail.com'), ch('agencia', 'gestor@kijutech.com'), ch('google', null)] }), dayOf);
    expect(r.findings.map((f) => f.causeKey).sort()).toEqual(['cambio:acc:dueno@gmail.com', 'cambio:acc:google']);
    expect(r.findings.find((f) => f.causeKey.endsWith('dueno@gmail.com'))?.lines.join(' ')).toMatch(/Usuario nuevo/);
    // En una campaña sin gasto, no.
    const noSpend = ruleForeignChange(input({ campaigns: [camp('1'), camp('2')], daily, covered: cover(14), changes: [ch('cliente', 'dueno@gmail.com', '2')] }), dayOf);
    expect(noSpend.findings).toHaveLength(0);
  });

  it('nuestra fuente sin datos va al responsable técnico', () => {
    const r = ruleSourceHealth(input({ health: { ...SANA, latido: 'caida' } }));
    expect(r.findings[0]).toMatchObject({ kind: 'fuente_sin_datos', recipient: 'tecnico', channel: 'interrupcion' });
    expect(ruleSourceHealth(input()).findings).toHaveLength(0);
  });
});

describe('ads paso 2: precedencia, tope de atención, horario y respuestas', () => {
  const d = (kind: FindingDraft['kind'], scope: FindingDraft['scope'], campaign: string | null, cause: string): FindingDraft => ({ kind, scope, campaignNativeId: campaign, causeKey: cause, channel: 'parte', recipient: 'gestor', severity: 'media', fyi: false, title: cause, lines: [], data: {}, exposure: null, confidence: 'alta' });

  it('lo de rango inferior sobre la misma cuenta o campaña queda dentro del superior', () => {
    const p1 = applyPrecedence([d('fuente_sin_datos', 'cuenta', null, 'fuente'), d('rechazo_con_gasto', 'campana', '1', 'rechazo')]);
    expect(p1.emit.map((x) => x.causeKey)).toEqual(['fuente']);
    expect(p1.suppressed[0]).toMatchObject({ by: 'fuente' });
    const p2 = applyPrecedence([d('campana_parada_desbocada', 'campana', '1', 'parada1'), d('rechazo_con_gasto', 'campana', '1', 'rechazo1'), d('rechazo_con_gasto', 'campana', '2', 'rechazo2'), d('medicion_rota', 'cuenta', null, 'medicion')]);
    expect(p2.emit.map((x) => x.causeKey).sort()).toEqual(['medicion', 'parada1', 'rechazo2']);
  });

  it('parte de la mañana: 5 con decisión + 3 «para que lo sepas» y el resto por debajo del corte', () => {
    const now = Date.now();
    const list = Array.from({ length: 11 }, (_, i) => ({ id: String(i), severity: i % 2 ? 'media' : 'alta', fyi: i >= 7, exposure: i, firstSeenAt: new Date(now - i * 1000) }));
    const cut = morningCut(list);
    expect(cut.decisions).toHaveLength(5);
    expect(cut.fyi).toHaveLength(3);
    expect(cut.below).toHaveLength(3);
    expect(cut.decisions[0].severity).toBe('alta');
  });

  it('tope de 2 interrupciones al día: la tercera y siguientes van juntas', () => {
    expect(alertPlan(['a', 'b', 'c'], 0, 2)).toEqual({ send: ['a', 'b'], group: ['c'] });
    expect(alertPlan(['c', 'd'], 2, 2)).toEqual({ send: [], group: ['c', 'd'] });
  });

  it('solo en horario laboral', () => {
    expect(inAlertWindow({ hour: 10, minute: 0, weekday: 3 }, '09:00-19:00', '1,2,3,4,5')).toBe(true);
    expect(inAlertWindow({ hour: 19, minute: 0, weekday: 3 }, '09:00-19:00', '1,2,3,4,5')).toBe(false);
    expect(inAlertWindow({ hour: 8, minute: 59, weekday: 3 }, '09:00-19:00', '1,2,3,4,5')).toBe(false);
    expect(inAlertWindow({ hour: 12, minute: 0, weekday: 6 }, '09:00-19:00', '1,2,3,4,5')).toBe(false);
    expect(inAlertWindow({ hour: 12, minute: 0, weekday: 0 }, '09:00-19:00', '1,2,3,4,5,6,7')).toBe(true);
  });

  it('respuestas: motivo o fecha cuando toca, y posponer como mucho dos veces', () => {
    const ctx = { now: new Date(`${TODAY}T10:00:00Z`), today: TODAY, postpones: 0 };
    expect(responseEffect('cliente_lo_quiere', {}, ctx)).toMatchObject({ ok: false });
    expect(responseEffect('no_es_problema', { reason: 'es de temporada' }, ctx)).toMatchObject({ ok: true, effect: { status: 'descartado' } });
    expect(responseEffect('esperando_cliente', {}, ctx)).toMatchObject({ ok: false });
    expect(responseEffect('esperando_cliente', { until: addDays(TODAY, 120) }, ctx)).toMatchObject({ ok: false });
    expect(responseEffect('esperando_cliente', { until: addDays(TODAY, 5) }, ctx)).toMatchObject({ ok: true, effect: { status: 'silenciado', until: addDays(TODAY, 5) } });
    expect(responseEffect('posponer', { days: 3 }, ctx)).toMatchObject({ ok: false });
    expect(responseEffect('posponer', { days: 7 }, ctx)).toMatchObject({ ok: true });
    expect(responseEffect('posponer', { days: 7 }, { ...ctx, postpones: 2 })).toMatchObject({ ok: false });
    expect(responseEffect('borrar', {}, ctx)).toMatchObject({ ok: false });
  });

  it('próxima revisión según el nivel y objetivo provisional con mínimo de conversiones', () => {
    expect(nextReviewDate(TODAY, 'A')).toBe(addDays(TODAY, 7));
    expect(nextReviewDate(TODAY, 'C')).toBe(addDays(TODAY, 30));
    expect(nextReviewDate(TODAY, null)).toBe(addDays(TODAY, 14));
    const rows = (conv: number) => Array.from({ length: 100 }, (_, i) => ({ day: addDays(TODAY, -i), cost: 10, conversions: conv }));
    expect(provisionalGoal(rows(0.1), TODAY)).toMatchObject({ ok: false });
    const g = provisionalGoal(rows(1), TODAY);
    expect(g).toMatchObject({ ok: true, to: addDays(TODAY, -8), conversions: 90, cpl: 10 });
  });

  it('umbrales guardados fuera de límites se ignoran', () => {
    expect(mergeThresholds({ ritmoBanda: 5, sueloMoneda: 7, x: 1 })).toMatchObject({ ritmoBanda: DEFAULT_THRESHOLDS.ritmoBanda, sueloMoneda: 7 });
  });
});

// --- Con la base de datos: evaluación completa en modo simulado --------------------------------------------------------

describe('ads paso 2: evaluación completa en modo simulado (base de datos real, cuenta de prueba)', () => {
  const SLUG = 'ads-test-paso2';
  let tid = '';
  let userId = 0;
  const cleanup = async () => {
    const [t] = await db.select().from(tenants).where(eq(tenants.slug, SLUG));
    if (t) await db.delete(tenants).where(eq(tenants.id, t.id));
  };
  // Antes de las 04:00 de Madrid el día de ayer aún no está cerrado (+3 h): las reglas con ventana dicen «no comprobado».
  const madridHour = zonedParts(new Date(), 'Europe/Madrid').hour;
  const dayReady = madridHour >= 4;

  beforeAll(async () => {
    await cleanup();
    const [t] = await db.insert(tenants).values({ name: 'Prueba Google Ads paso 2', slug: SLUG }).returning();
    tid = t.id;
    const [u] = [...(await db.execute<{ id: number }>(sql`SELECT id FROM users ORDER BY id LIMIT 1`))];
    userId = Number(u?.id ?? 0);
  });
  afterAll(cleanup);

  const findings = async () => db.select().from(adsFindings).where(eq(adsFindings.tenantId, tid));
  const accountId = async (customerId: string) => (await db.select().from(adsAccounts).where(and(eq(adsAccounts.tenantId, tid), eq(adsAccounts.customerId, customerId))))[0].id;

  it('descarga, evalúa y encuentra los escenarios del simulado', async () => {
    const { saveCredentials, saveGeneral } = await import('@/lib/ads/settings');
    const { runFullSync } = await import('@/lib/ads/sync');
    const { evaluateAll } = await import('@/lib/ads/findings');
    await saveCredentials(tid, 'SIM', 'prueba');
    await saveGeneral(tid, { syncEnabled: true, historyMonths: 4, agencyEmailDomains: ['kijutech.com'] }, 'prueba');
    const s = await runFullSync(tid);
    expect(s.errors).toEqual([]);
    const r = await evaluateAll(tid, { mode: 'todas' });
    expect(r).toHaveLength(5);
    const runs = await db.select().from(adsRuleRuns).where(eq(adsRuleRuns.tenantId, tid));
    expect(runs.length).toBeGreaterThanOrEqual(5 * 9);
    const f = await findings();
    const by = (kind: string, customer: string) => f.filter((x) => x.kind === kind && x.causeKey.includes(customer));
    const acc1 = await accountId('9990000001');
    const acc2 = await accountId('9990000002');
    const acc3 = await accountId('9990000003');
    const acc4 = await accountId('9990000004');
    // Cambios ajenos: el dueño de Abogados (ayer) y Google en la clínica (hace 2 días). Los de la agencia, no.
    if (dayReady) {
      expect(by('cambio_ajeno', acc3).map((x) => x.causeKey)).toEqual([`cambio:${acc3}:dueno.cliente@gmail.com`]);
      expect(by('cambio_ajeno', acc1).map((x) => x.causeKey)).toEqual([`cambio:${acc1}:google`]);
      // Rechazo con gasto en «Urgencias», la que más gasta: interrupción.
      expect(by('rechazo_con_gasto', acc2)).toHaveLength(1);
      expect(by('rechazo_con_gasto', acc2)[0].channel).toBe('interrupcion');
      // «PMax · Reformas» parada desde ayer: el día cubierto sin fila es un cero.
      expect(by('campana_parada_desbocada', acc4).map((x) => x.causeKey)).toEqual([`parada:${acc4}:4400002`]);
      // El formulario de Fontanería lleva 8 días sin contar con los clics de siempre.
      const med = by('medicion_rota', acc2);
      expect(med).toHaveLength(1);
      expect(med[0].causeKey).toContain('conversionActions/1');
    } else {
      expect(runs.filter((x) => x.rule === 'medicion_rota').every((x) => x.outcome === 'no_comprobado')).toBe(true);
    }
    // Ninguna otra cosa: sin fuentes caídas, sin ritmo, sin pausas, sin páginas caídas.
    expect(f.filter((x) => ['fuente_sin_datos', 'ritmo_gasto', 'pausado_aportaba', 'landing_caida', 'cuenta_no_sirve'].includes(x.kind))).toEqual([]);
    expect(f.every((x) => x.status === 'abierto' && x.notifyState === null)).toBe(true);
  }, 300_000);

  it('repetir la evaluación no duplica (una causa, un hallazgo vivo)', async () => {
    const { evaluateAll } = await import('@/lib/ads/findings');
    const before = (await findings()).length;
    await evaluateAll(tid, { mode: 'todas' });
    expect((await findings()).length).toBe(before);
  }, 120_000);

  it('modo sombra y simulado: no se envía nada', async () => {
    const { runAdsAlerts } = await import('@/lib/ads/alerts');
    expect((await runAdsAlerts(tid)).reason).toBe('modo sombra');
    const { saveAlertSettings } = await import('@/lib/ads/settings');
    await expect(saveAlertSettings(tid, { alertsEnabled: true }, 'prueba')).rejects.toThrow(/simulado/);
    await expect(saveAlertSettings(tid, { thresholds: { ritmoBanda: 7 } }, 'prueba')).rejects.toThrow(/Ritmo/);
    await saveAlertSettings(tid, { alertHours: '08:30-18:00', alertDays: [1, 2, 3], maxInterruptionsPerDay: 3, thresholds: { sueloMoneda: 6 } }, 'prueba');
    const { loadPublicSettings } = await import('@/lib/ads/settings');
    const pub = await loadPublicSettings(tid);
    expect(pub).toMatchObject({ alertsEnabled: false, alertHours: '08:30-18:00', alertDays: '1,2,3', maxInterruptionsPerDay: 3 });
    expect(pub.thresholds.sueloMoneda).toBe(6);
  });

  it('con una fuente caída no se resuelve nada a ciegas y sale «nuestra fuente sin datos»', async () => {
    const store = await import('@/lib/ads/store');
    const { evaluateAccount } = await import('@/lib/ads/findings');
    const acc2 = await accountId('9990000002');
    const openBefore = (await findings()).filter((x) => x.accountId === acc2 && x.status === 'abierto');
    for (let i = 0; i < 3; i++) await store.markSyncFail(tid, acc2, 'metricas', 'prueba');
    await evaluateAccount(tid, acc2, { mode: 'todas' });
    const after = (await findings()).filter((x) => x.accountId === acc2);
    for (const f of openBefore) {
      const now = after.find((x) => x.id === f.id)!;
      expect(now.status).toBe('abierto');
      expect(now.uncheckedSince).not.toBeNull();
    }
    expect(after.find((x) => x.kind === 'fuente_sin_datos')).toMatchObject({ status: 'abierto', recipient: 'tecnico' });
    await store.markSyncOk(tid, acc2, 'metricas');
    await evaluateAccount(tid, acc2, { mode: 'todas' });
    const healed = (await findings()).filter((x) => x.accountId === acc2);
    expect(healed.find((x) => x.kind === 'fuente_sin_datos')?.status).toBe('resuelto');
    expect(healed.filter((x) => x.status === 'abierto' && x.kind !== 'fuente_sin_datos').every((x) => x.uncheckedSince === null)).toBe(true);
  }, 120_000);

  it('respuestas del gestor: posponer dos veces como mucho y «el cliente lo quiere así» no vuelve', async () => {
    const { respondToFinding } = await import('@/lib/ads/decisions');
    const { evaluateAll } = await import('@/lib/ads/findings');
    const who = { id: userId, name: 'Prueba', email: 'prueba@kijutech.com' };
    const open = (await findings()).filter((x) => x.status === 'abierto' && x.kind === 'cambio_ajeno');
    if (!open.length) return; // antes de las 04:00 no hay escenarios (ver arriba)
    const [a, b] = open;
    await respondToFinding(tid, who, a.id, 'posponer', { days: 1 });
    await respondToFinding(tid, who, a.id, 'posponer', { days: 7 });
    await expect(respondToFinding(tid, who, a.id, 'posponer', { days: 1 })).rejects.toThrow(/dos veces|2 veces/);
    await expect(respondToFinding(tid, who, b.id, 'cliente_lo_quiere', {})).rejects.toThrow(/frase/);
    await respondToFinding(tid, who, b.id, 'cliente_lo_quiere', { reason: 'Quiere probar con más presupuesto este mes' });
    await evaluateAll(tid, { mode: 'todas' });
    const all = await findings();
    expect(all.filter((x) => x.causeKey === b.causeKey).map((x) => x.status)).toEqual(['descartado']);
    expect(all.find((x) => x.id === a.id)?.status).toBe('silenciado');
  }, 120_000);

  it('Hoy y Cartera: bandejas y una fila por cuenta; revisión y objetivo provisional', async () => {
    const { todayView, portfolioView, accountDetail } = await import('@/lib/ads/views');
    const t = await todayView(tid);
    expect(t.shadow).toBe(true);
    if (dayReady) expect(t.urgent.length).toBeGreaterThanOrEqual(2); // parada y rechazo
    const p = await portfolioView(tid);
    expect(p.rows).toHaveLength(5);
    const acc2 = await accountId('9990000002');
    if (dayReady) expect(p.rows.find((r) => r.accountId === acc2)?.measurement).toBe('rota');
    expect(p.rows.every((r) => r.target?.kind === 'linea_base')).toBe(true); // sin objetivo: frente a su línea base
    const { reviewAccount, setProvisionalGoal } = await import('@/lib/ads/decisions');
    const who = { id: userId, name: 'Prueba', email: 'prueba@kijutech.com' };
    await expect(reviewAccount(tid, who, acc2, 'x')).rejects.toThrow(/nota/);
    const rv = await reviewAccount(tid, who, acc2, 'Revisado el rechazo de Urgencias');
    expect(rv.next).toBe(addDays(zonedParts(new Date(), 'Europe/Madrid').date, 14)); // sin nivel: 14 días
    await expect(setProvisionalGoal(tid, who, acc2)).rejects.toThrow(/simuladas/);
    const d = await accountDetail(tid, acc2);
    expect(d?.reviews).toHaveLength(1);
    expect(d?.provisional.allowed).toBe(false);
    expect(d?.rules.length).toBeGreaterThanOrEqual(9);
  }, 120_000);
});


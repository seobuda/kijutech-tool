// Módulo Google Ads, paso 3 (28 nov 2026; docs/ads/DISENO-TECNICO-ADS.md §13): auditoría de higiene.
//  - controles puros con sus casos (bien / mal / no comprobado), la ficha vieja que baja un «mal» a «confirmar con el
//    responsable» (NEG-07), la predicción previa solo en R2/R3 (APR-01), lugares fuera de zona, marca y competencia;
//  - vigilancia (corregido / reapareció) y su causa, los 3 del guion y el informe;
//  - traducción de las consultas nuevas (contrato, NO grabadas de una cuenta real);
//  - con la base de datos real (cuenta de prueba propia que se borra al terminar): auditoría de entrada en modo simulado
//    con un caso de cada control, respuestas, vigilancia que ve un regreso y lo lleva al hallazgo 11, Cartera y la
//    auditoría que no se repite sola.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { adsAccounts, adsAuditData, adsAuditItems, adsAudits, adsFindings, tenants } from '@/lib/db/schema';
import {
  auditReportText,
  auditSummary,
  classifyTerm,
  ctlAiMax,
  cplAround,
  ctlAutoApplied,
  ctlBaseline,
  ctlBrandGeneric,
  ctlCallAsset,
  ctlChosenPages,
  ctlContentExclusions,
  ctlConversions,
  ctlFeb2027,
  ctlOutOfZoneTerms,
  ctlPmaxNetworks,
  ctlPresenceOrInterest,
  ctlRealZone,
  ctlRecommendations,
  ctlSearchPartners,
  ctlTextAutomation,
  dataDue,
  factFresh,
  guionTop,
  placesIn,
  poissonCdf,
  regressionCause,
  regulatedSector,
  runAuditControls,
  samePhone,
  vigilanceStep,
  zoneServes,
  type AuditData,
  type AuditDataKind,
  type AuditInput,
  type Ficha
} from '@/lib/ads/audit-rules';
import { AQ, parseAuditCampaigns, parseAutomation, parseCallAssets, parseNetworks, parseSearchTerms } from '@/lib/ads/audit-queries';
import { ruleForeignChange } from '@/lib/ads/finding-rules';
import { DEFAULT_THRESHOLDS } from '@/lib/ads/thresholds';
import { AUDIT_CONTROLS } from '@/lib/ads/audit-labels';
import { addDays, zonedParts } from '@/lib/ads/rules';

const NOW = new Date('2026-11-25T12:00:00Z');
const TODAY = '2026-11-25';
const T = { ...DEFAULT_THRESHOLDS };

const ficha = (over: Partial<Ficha> = {}): Ficha => ({
  source: 'ficha',
  clientName: 'Fontanería Rápida',
  brands: ['Fontanería Rápida'],
  competitors: ['Fontaneros Express'],
  zoneText: 'Madrid capital y Alcobendas',
  phones: ['910 000 002'],
  hours: 'L-V 9:00-19:00',
  sector: 'Fontanería',
  local: true,
  services: 'Urgencias',
  confirmed: { marca: NOW, zona: NOW, telefono: NOW, horario: NOW, competidores: NOW, sector: NOW, servicios: NOW },
  ...over
});
const slot = <K extends AuditDataKind>(rows: AuditData[K], ok = true, error: string | null = null) => ({ ok, error, syncedAt: NOW, from: addDays(TODAY, -30), to: addDays(TODAY, -1), rows });
const input = (over: Partial<AuditInput> = {}): AuditInput => ({
  accountId: 'acc',
  name: 'Cuenta',
  currency: 'EUR',
  today: TODAY,
  now: NOW,
  autoTagging: true,
  campaigns: [
    { nativeId: '1', name: 'Búsqueda · Urgencias', status: 'ENABLED', channelType: 'SEARCH' },
    { nativeId: '2', name: 'PMax', status: 'ENABLED', channelType: 'PERFORMANCE_MAX' }
  ],
  daily: [],
  covered: new Set(),
  actions: [{ resourceName: 'customers/1/conversionActions/1', name: 'Formulario', category: 'SUBMIT_LEAD_FORM', primaryForGoal: true, includeInConversions: true, status: 'ENABLED' }],
  conversions: [],
  landing: [],
  changes: [],
  data: {},
  ficha: ficha(),
  t: T,
  ...over
});
const camp = (id: string, over: Partial<AuditData['campanas'][number]> = {}) => ({ nativeId: id, name: `C${id}`, status: 'ENABLED', channelType: 'SEARCH', channelSubtype: null, targetGoogleSearch: true, targetSearchNetwork: false, targetContentNetwork: false, positiveGeoType: 'PRESENCE', dsaDomain: null, ...over });

describe('ads paso 3: controles puros', () => {
  it('sin datos o con el grupo fallido, el control no afirma nada', () => {
    expect(ctlSearchPartners(input()).status).toBe('no_comprobado');
    const r = ctlSearchPartners(input({ data: { campanas: slot<'campanas'>([], false, 'UNRECOGNIZED_FIELD campaign.x') } }));
    expect(r.status).toBe('no_comprobado');
    expect(r.reason).toContain('UNRECOGNIZED_FIELD');
  });

  it('socios de búsqueda: sin conversiones es «mal» con predicción; avalados por sus datos, «bien»', () => {
    const campanas = slot<'campanas'>([camp('1', { targetSearchNetwork: true })]);
    const bad = ctlSearchPartners(input({ data: { campanas, redes: slot<'redes'>([{ campaignNativeId: '1', channelType: 'SEARCH', network: 'SEARCH', cost: 900, clicks: 300, conversions: 30 }, { campaignNativeId: '1', channelType: 'SEARCH', network: 'SEARCH_PARTNERS', cost: 120, clicks: 60, conversions: 0 }]) } }));
    expect(bad.status).toBe('mal');
    expect(bad.exposure).toBe(120);
    expect(bad.prediction?.ventanaDias).toBe(28);
    const good = ctlSearchPartners(input({ data: { campanas, redes: slot<'redes'>([{ campaignNativeId: '1', channelType: 'SEARCH', network: 'SEARCH', cost: 900, clicks: 300, conversions: 30 }, { campaignNativeId: '1', channelType: 'SEARCH', network: 'SEARCH_PARTNERS', cost: 100, clicks: 60, conversions: 4 }]) } }));
    expect(good.status).toBe('bien');
    expect(ctlSearchPartners(input({ data: { campanas: slot<'campanas'>([camp('1')]) } })).status).toBe('bien');
  });

  it('presencia o interés: «mal» en negocio local; con la zona de la ficha vieja, «confirmar con el responsable»', () => {
    const campanas = slot<'campanas'>([camp('1', { positiveGeoType: 'PRESENCE_OR_INTEREST' })]);
    const r = ctlPresenceOrInterest(input({ data: { campanas } }));
    expect(r).toMatchObject({ status: 'mal', needsConfirmation: false });
    const old = ctlPresenceOrInterest(input({ data: { campanas }, ficha: ficha({ confirmed: { zona: new Date(NOW.getTime() - 200 * 86_400_000) } }) }));
    expect(old).toMatchObject({ status: 'mal', needsConfirmation: true });
    expect(old.lines.join(' ')).toContain('confirmar con el responsable');
    expect(ctlPresenceOrInterest(input({ data: { campanas }, ficha: null })).status).toBe('no_comprobado');
  });

  it('frescura de la ficha (NEG-07): 6 meses por defecto; sin confirmar no vale', () => {
    const f = ficha({ confirmed: { zona: new Date(NOW.getTime() - 150 * 86_400_000), marca: null } });
    expect(factFresh(f, 'zona', NOW, 6)).toBe(true);
    expect(factFresh(f, 'zona', NOW, 4)).toBe(false);
    expect(factFresh(f, 'marca', NOW, 6)).toBe(false);
  });

  it('lugares fuera de la zona: Barcelona no la atiende; Alcobendas sí; «San Sebastián de los Reyes» no es Gipuzkoa', () => {
    expect(placesIn('fontanero san sebastian de los reyes').map((p) => p.name)).toEqual(['San Sebastián de los Reyes']);
    expect(zoneServes('Madrid capital y Alcobendas', { name: 'Getafe', province: 'Madrid' })).toBe(true);
    expect(zoneServes('Bilbao y Getxo', { name: 'Barcelona', province: 'Barcelona' })).toBe(false);
    const terminos = slot<'terminos'>([
      { term: 'fontanero barcelona', campaignNativeId: '1', cost: 40, clicks: 10, conversions: 0 },
      { term: 'fontanero alcobendas', campaignNativeId: '1', cost: 60, clicks: 20, conversions: 2 }
    ]);
    const r = ctlOutOfZoneTerms(input({ data: { terminos } }));
    expect(r).toMatchObject({ status: 'mal', exposure: 40 });
    expect(r.todo[0]).toContain('"barcelona"');
    expect(ctlOutOfZoneTerms(input({ data: { terminos }, ficha: ficha({ zoneText: 'Toda España' }) })).status).toBe('bien');
  });

  it('marca y competencia: la marca dentro de lo genérico es «mal»; una campaña de marca no cuenta', () => {
    expect(classifyTerm('fontaneria rapida telefono', ['Fontanería Rápida'], [])).toBe('marca');
    expect(classifyTerm('fontaneros express precio', ['Fontanería Rápida'], ['Fontaneros Express'])).toBe('competidor');
    const terms = (brandCost: number) => slot<'terminos'>([
      { term: 'fontanero urgente', campaignNativeId: '1', cost: 100, clicks: 10, conversions: 2 },
      { term: 'fontaneria rapida', campaignNativeId: '1', cost: brandCost, clicks: 10, conversions: 2 }
    ]);
    expect(ctlBrandGeneric(input({ data: { terminos: terms(30) } }))).toMatchObject({ status: 'mal' });
    expect(ctlBrandGeneric(input({ data: { terminos: terms(5) } }))).toMatchObject({ status: 'bien' });
    expect(ctlBrandGeneric(input({ data: { terminos: terms(30) }, ficha: ficha({ brands: [] }) })).status).toBe('no_comprobado');
  });

  it('PMax: Display y vídeo desproporcionados sin conversiones; «todo mixto» no se afirma', () => {
    const campanas = slot<'campanas'>([camp('2', { channelType: 'PERFORMANCE_MAX' })]);
    const net = (rows: [string, number, number][]) => slot<'redes'>(rows.map(([network, cost, conversions]) => ({ campaignNativeId: '2', channelType: 'PERFORMANCE_MAX', network, cost, clicks: 1, conversions })));
    expect(ctlPmaxNetworks(input({ data: { campanas, redes: net([['SEARCH', 55, 19], ['CONTENT', 30, 0.5], ['YOUTUBE', 15, 0.5]]) } })).status).toBe('mal');
    expect(ctlPmaxNetworks(input({ data: { campanas, redes: net([['SEARCH', 85, 18], ['CONTENT', 15, 2]]) } })).status).toBe('bien');
    expect(ctlPmaxNetworks(input({ data: { campanas, redes: net([['MIXED', 100, 20]]) } })).status).toBe('no_comprobado');
  });

  it('exclusiones de contenido, febrero de 2027, textos automáticos en sector regulado', () => {
    const campanas = slot<'campanas'>([camp('2', { channelType: 'PERFORMANCE_MAX' })]);
    expect(ctlContentExclusions(input({ data: { campanas, exclusiones: slot<'exclusiones'>([]) } })).status).toBe('mal');
    expect(ctlContentExclusions(input({ data: { campanas, exclusiones: slot<'exclusiones'>([{ type: 'CONTENT_LABEL', value: 'X' }, { type: 'MOBILE_APP_CATEGORY', value: 'Y' }]) } })).status).toBe('bien');
    const feb = ctlFeb2027(input({ data: { campanas: slot<'campanas'>([camp('1')]), tipos_anuncio: slot<'tipos_anuncio'>([{ campaignNativeId: '1', adGroupNativeId: '9', adGroupName: 'g', adGroupType: 'SEARCH_STANDARD', adType: 'CALL_AD' }]) } }));
    expect(feb.status).toBe('mal');
    expect(feb.prediction).not.toBeNull();
    const auto = slot<'automatizacion'>([{ nativeId: '1', aiMax: false, textAutomation: 'OPTED_IN', imageAutomation: null }]);
    expect(regulatedSector('Clínica dental')).toBe(true);
    expect(ctlTextAutomation(input({ data: { automatizacion: auto }, ficha: ficha({ sector: 'Clínica dental' }) })).status).toBe('mal');
    expect(ctlTextAutomation(input({ data: { automatizacion: auto } })).status).toBe('bien');
  });

  it('conversiones, páginas elegidas, autoaplicadas, recomendaciones y recurso de llamada', () => {
    expect(ctlConversions(input({ autoTagging: false })).status).toBe('mal');
    expect(ctlConversions(input()).status).toBe('bien');
    const landing = [
      { url: 'https://x.es/servicio', urlNormalized: 'https://x.es/servicio', origins: ['anuncio'], cost7d: 100, campaignNativeIds: ['2'] },
      { url: 'https://x.es/blog/post', urlNormalized: 'https://x.es/blog/post', origins: ['expandida'], cost7d: 10, campaignNativeIds: ['2'] }
    ];
    expect(ctlChosenPages(input({ landing })).status).toBe('mal');
    expect(ctlAutoApplied(input({ data: { suscripciones: slot<'suscripciones'>([{ type: 'CAMPAIGN_BUDGET', status: 'ENABLED' }]) } })).status).toBe('mal');
    expect(ctlAutoApplied(input({ data: { suscripciones: slot<'suscripciones'>([]) } })).status).toBe('bien');
    expect(ctlRecommendations(input({ data: { recomendaciones: slot<'recomendaciones'>({ list: [{ type: 'SITELINK_ASSET', campaignNativeId: '1' }], score: 0.7 }) } })).status).toBe('mal');
    expect(ctlRecommendations(input({ data: { recomendaciones: slot<'recomendaciones'>({ list: [{ type: 'USE_BROAD_MATCH_KEYWORD', campaignNativeId: '1' }], score: 0.7 }) } })).status).toBe('bien');
    expect(samePhone('+34 910 000 002', '910000002')).toBe(true);
    const call = (phone: string) => slot<'llamadas'>([{ level: 'cuenta', campaignNativeId: null, assetId: '1', phone, country: 'ES', reporting: 'USE_ACCOUNT_LEVEL_CALL_CONVERSION_ACTION', hasSchedule: true }]);
    expect(ctlCallAsset(input({ data: { llamadas: call('+34910000002') } })).status).toBe('bien');
    expect(ctlCallAsset(input({ data: { llamadas: call('+34910999999') } })).status).toBe('mal');
    expect(ctlCallAsset(input({ data: { llamadas: slot<'llamadas'>([]) } })).status).toBe('mal');
  });

  it('AI Max: el CPL de después solo es «peor» si además sobra gasto para tan pocas conversiones (Poisson)', () => {
    const MIG = addDays(TODAY, -30);
    const days = (from: number, to: number, conv: number) => Array.from({ length: to - from + 1 }, (_, i) => ({ campaignNativeId: '1', day: addDays(MIG, from + i), cost: 10, clicks: 10, conversions: conv }));
    // Antes: 28 días, 280 € y 14 conversiones (CPL 20). Después: 28 días, 280 € y 2 conversiones (CPL 140): peor de verdad.
    expect(cplAround({ today: TODAY, daily: [...days(-28, -1, 0.5), ...days(0, 27, 2 / 28)] }, '1', MIG, 1.3).worse).toBe(true);
    // Después con 10 conversiones (CPL 28, 1,4 ×): puede ser ruido con tan pocos datos.
    expect(cplAround({ today: TODAY, daily: [...days(-28, -1, 0.5), ...days(0, 27, 10 / 28)] }, '1', MIG, 1.3).worse).toBe(false);
    expect(poissonCdf(0, 0)).toBe(1);
    // Migrada hace 5 días: aún no hay ventana; «no comprobado» (no «bien»), para que luego no salga un falso «reapareció».
    const recent = ctlAiMax(input({ data: { automatizacion: slot<'automatizacion'>([{ nativeId: '1', aiMax: true, textAutomation: null, imageAutomation: null }]), migraciones: slot<'migraciones'>([{ nativeId: '1', acaMigrationAt: addDays(TODAY, -5), broadMatchMigrationAt: null }]) } }));
    expect(recent.status).toBe('no_comprobado');
  });

  it('zona real y línea base', () => {
    const loc = (outside: number) => slot<'ubicacion_usuario'>([{ campaignNativeId: '1', countryId: '2724', targeting: true, cost: 100 - outside, clicks: 1, conversions: 5 }, { campaignNativeId: '1', countryId: '2724', targeting: false, cost: outside, clicks: 1, conversions: 0 }]);
    expect(ctlRealZone(input({ data: { ubicacion_usuario: loc(22) } })).status).toBe('mal');
    expect(ctlRealZone(input({ data: { ubicacion_usuario: loc(3) } })).status).toBe('bien');
    expect(ctlBaseline(input()).status).toBe('no_comprobado');
    const covered = new Set(Array.from({ length: 90 }, (_, i) => addDays(TODAY, -1 - i)));
    const daily = [...covered].map((day) => ({ campaignNativeId: '1', day, cost: 10, clicks: 5, conversions: 0.5 }));
    expect(ctlBaseline(input({ covered, daily }))).toMatchObject({ status: 'bien', data: { cpl: 20, days: 90 } });
  });

  it('todos los controles: 18, uno por clave; la predicción solo en «mal» R2/R3', () => {
    const all = runAuditControls(input({ autoTagging: false }));
    expect(all.map((r) => r.control)).toEqual([...AUDIT_CONTROLS]);
    for (const r of all) if (r.prediction) expect(r.status).toBe('mal');
    expect(all.find((r) => r.control === 'conversiones')?.prediction).not.toBeNull();
    expect(auditSummary(all).bien + auditSummary(all).mal + auditSummary(all).confirmar + auditSummary(all).no_comprobado).toBe(18);
  });
});

describe('ads paso 3: vigilancia, guion e informe', () => {
  it('corregido, reapareció y «no comprobado» que no cambia nada', () => {
    const s0 = { status: 'mal' as const, fixedAt: null, regressedAt: null, regressionCount: 0 };
    const s1 = vigilanceStep(s0, 'bien', NOW);
    expect(s1).toMatchObject({ status: 'bien', fixed: true, fixedAt: NOW });
    expect(vigilanceStep(s1, 'no_comprobado', NOW)).toMatchObject({ status: 'bien', fixed: false, regressed: false });
    const s2 = vigilanceStep(s1, 'mal', NOW);
    expect(s2).toMatchObject({ status: 'mal', regressed: true, regressionCount: 1 });
  });

  it('la causa de un regreso es el último cambio del cliente o de Google en esas campañas', () => {
    const changes = [
      { changeAt: new Date('2026-11-24T10:00:00Z'), userEmail: 'gestor@kijutech.com', actorClass: 'agencia', clientType: null, resourceType: 'CAMPAIGN', campaignNativeId: '1', changedFields: [] },
      { changeAt: new Date('2026-11-23T10:00:00Z'), userEmail: 'Dueno@Gmail.com', actorClass: 'cliente', clientType: null, resourceType: 'CAMPAIGN', campaignNativeId: '1', changedFields: [] }
    ];
    expect(regressionCause(['1'], changes, new Date('2026-11-20T00:00:00Z'))).toMatchObject({ actor: 'dueno@gmail.com' });
    expect(regressionCause(['7'], changes, new Date('2026-11-20T00:00:00Z'))).toBeNull();
  });

  it('el hallazgo 11 del autor lleva el regreso como evidencia', () => {
    const a = {
      accountId: 'acc', name: 'Cuenta', status: 'ENABLED', currency: 'EUR', today: TODAY, hour: 12, now: NOW,
      campaigns: [{ nativeId: '1', name: 'C1', status: 'ENABLED', servingStatus: 'SERVING', channelType: 'SEARCH', budgetNativeId: null, startDate: null, endDate: null, adSchedule: null }],
      budgets: [], daily: Array.from({ length: 14 }, (_, i) => ({ campaignNativeId: '1', day: addDays(TODAY, -1 - i), cost: 10, impressions: 100, clicks: 5, conversions: 1 })), covered: new Set<string>(), hourly: [], hourlyDays: new Set<string>(), hourlyThrough: null,
      policies: [], landing: [], conversions: [], actions: [], goal: null, health: {},
      changes: [{ changeAt: new Date('2026-11-24T10:00:00Z'), userEmail: 'dueno@gmail.com', actorClass: 'cliente', clientType: null, resourceType: 'CAMPAIGN', campaignNativeId: '1', operation: 'UPDATE', changedFields: ['networkSettings'], newValue: null }],
      auditRegressions: [{ control: 'socios_busqueda', title: 'Socios de búsqueda activos', actor: 'dueno@gmail.com', at: new Date('2026-11-25T06:00:00Z') }],
      t: T
    };
    const r = ruleForeignChange(a, (d) => zonedParts(d, 'Europe/Madrid').date);
    expect(r.findings[0].lines.join(' ')).toContain('Deshace una corrección de la auditoría');
  });

  it('los 3 del guion: lo que reapareció primero; sin «confirmar» ni descartes', () => {
    const it = (control: string, over: Partial<Parameters<typeof guionTop>[0][number]> = {}) => ({ control, status: 'mal' as const, needsConfirmation: false, exposure: 10, regressedAt: null, response: null, ...over });
    const top = guionTop([it('recurso_llamada'), it('socios_busqueda', { exposure: 50 }), it('zona_real', { exposure: 90 }), it('autoaplicadas', { regressedAt: NOW }), it('marca_generico', { needsConfirmation: true }), it('pmax_redes', { response: 'no_aplica' })]);
    expect(top.map((x) => x.control)).toEqual(['autoaplicadas', 'zona_real', 'socios_busqueda']);
  });

  it('informe por tandas y refresco de los datos por su edad', () => {
    const txt = auditReportText({ accountName: 'Cuenta', date: TODAY, currency: 'EUR', items: [{ control: 'socios_busqueda', status: 'mal', needsConfirmation: false, title: 'Socios', lines: [], todo: ['Desmarcar'], exposure: 120, response: null }] });
    expect(txt).toContain('## Tanda 2');
    expect(txt).toContain('Qué hacer: Desmarcar');
    expect(dataDue('terminos', { ok: true, syncedAt: new Date(NOW.getTime() - 2 * 86_400_000) }, NOW)).toBe(false);
    expect(dataDue('campanas', { ok: true, syncedAt: new Date(NOW.getTime() - 2 * 86_400_000) }, NOW)).toBe(true);
    expect(dataDue('terminos', { ok: false, syncedAt: NOW }, NOW)).toBe(true);
  });
});

describe('ads paso 3: traducción de las consultas (contrato, NO grabadas de una cuenta real)', () => {
  it('campañas, automatización, redes, llamadas y términos', () => {
    expect(AQ.searchTerms('2026-10-01', '2026-10-30').gaql).toContain('search_term_view');
    expect(() => AQ.networks('ayer', '2026-10-30')).toThrow();
    expect(AQ.geoNames(['1', 'x;DROP', '2']).gaql).toContain('IN (1, 2)');
    expect(parseAuditCampaigns([{ campaign: { id: '1', networkSettings: { targetSearchNetwork: true }, geoTargetTypeSetting: { positiveGeoTargetType: 'PRESENCE_OR_INTEREST' } } }])[0]).toMatchObject({ targetSearchNetwork: true, positiveGeoType: 'PRESENCE_OR_INTEREST' });
    expect(parseAutomation([{ campaign: { id: '1', aiMaxSetting: { enableAiMax: true }, assetAutomationSettings: [{ assetAutomationType: 'TEXT_ASSET_AUTOMATION', assetAutomationStatus: 'OPTED_IN' }] } }])[0]).toMatchObject({ aiMax: true, textAutomation: 'OPTED_IN' });
    const n = parseNetworks([
      { campaign: { id: '1' }, segments: { adNetworkType: 'SEARCH' }, metrics: { costMicros: '1000000', clicks: '2', conversions: 1 } },
      { campaign: { id: '1' }, segments: { adNetworkType: 'SEARCH' }, metrics: { costMicros: '2000000', clicks: '1', conversions: 0 } }
    ]);
    expect(n).toEqual([{ campaignNativeId: '1', channelType: null, network: 'SEARCH', cost: 3, clicks: 3, conversions: 1 }]);
    expect(parseCallAssets([], [{ asset: { id: '5', callAsset: { phoneNumber: '+34 1', callConversionReportingState: 'DISABLED' } } }])[0]).toMatchObject({ level: 'cuenta', reporting: 'DISABLED', hasSchedule: false });
    expect(parseSearchTerms([{ searchTermView: { searchTerm: 'x' }, campaign: { id: '1' }, metrics: { costMicros: '500000' } }])[0]).toMatchObject({ term: 'x', cost: 0.5 });
  });
});

// --- Con la base de datos: auditoría completa en modo simulado ---------------------------------------------------------

describe('ads paso 3: auditoría en modo simulado (base de datos real, cuenta de prueba)', () => {
  const SLUG = 'ads-test-paso3';
  let tid = '';
  let userId = 0;
  const cleanup = async () => {
    const [t] = await db.select().from(tenants).where(eq(tenants.slug, SLUG));
    if (t) await db.delete(tenants).where(eq(tenants.id, t.id));
  };
  beforeAll(async () => {
    await cleanup();
    const [t] = await db.insert(tenants).values({ name: 'Prueba Google Ads paso 3', slug: SLUG }).returning();
    tid = t.id;
    const [u] = [...(await db.execute<{ id: number }>(sql`SELECT id FROM users ORDER BY id LIMIT 1`))];
    userId = Number(u?.id ?? 0);
  });
  afterAll(cleanup);

  const accountId = async (customerId: string) => (await db.select().from(adsAccounts).where(and(eq(adsAccounts.tenantId, tid), eq(adsAccounts.customerId, customerId))))[0].id;
  const items = async (acc: string) => db.select().from(adsAuditItems).where(and(eq(adsAuditItems.tenantId, tid), eq(adsAuditItems.accountId, acc)));
  const status = async (customer: string, control: string) => (await items(await accountId(customer))).find((i) => i.control === control);

  it('auditoría de entrada: un caso de cada control, guardada con fecha y sin hallazgos nuevos', async () => {
    const { saveCredentials, saveGeneral } = await import('@/lib/ads/settings');
    const { runFullSync, syncSchedules } = await import('@/lib/ads/sync');
    const { runAuditAll } = await import('@/lib/ads/audit');
    await saveCredentials(tid, 'SIM', 'prueba');
    await saveGeneral(tid, { syncEnabled: true, historyMonths: 4, agencyEmailDomains: ['kijutech.com'] }, 'prueba');
    expect((await runFullSync(tid)).errors).toEqual([]);
    await saveGeneral(tid, { syncEnabled: false }, 'prueba');
    await syncSchedules(tid);
    const findingsBefore = (await db.select().from(adsFindings).where(eq(adsFindings.tenantId, tid))).length;
    const r = await runAuditAll(tid);
    expect(r).toHaveLength(5);
    expect(r.every((x) => 'mode' in x && x.mode === 'entrada')).toBe(true);
    expect((await db.select().from(adsAudits).where(eq(adsAudits.tenantId, tid))).length).toBe(5);
    expect((await db.select().from(adsAuditItems).where(eq(adsAuditItems.tenantId, tid))).length).toBe(5 * 18);
    // Ningún grupo de datos falló en el simulado.
    expect((await db.select().from(adsAuditData).where(and(eq(adsAuditData.tenantId, tid), eq(adsAuditData.ok, false)))).length).toBe(0);
    // La auditoría no crea hallazgos visibles (la lista cerrada de 15 no crece).
    expect((await db.select().from(adsFindings).where(eq(adsFindings.tenantId, tid))).length).toBe(findingsBefore);

    const expectStatus = async (customer: string, control: string, st: string, confirm = false) => {
      const i = await status(customer, control);
      expect(i?.status, `${customer} ${control}`).toBe(st);
      if (st === 'mal') expect(i?.needsConfirmation, `${customer} ${control} confirmar`).toBe(confirm);
    };
    await expectStatus('9990000002', 'socios_busqueda', 'mal');
    await expectStatus('9990000001', 'socios_busqueda', 'bien');
    await expectStatus('9990000001', 'display_en_busqueda', 'mal');
    await expectStatus('9990000001', 'textos_automaticos', 'mal');
    await expectStatus('9990000001', 'ai_max', 'mal');
    await expectStatus('9990000005', 'ai_max', 'bien');
    await expectStatus('9990000001', 'autoaplicadas', 'mal');
    await expectStatus('9990000001', 'marca_generico', 'mal');
    await expectStatus('9990000001', 'exclusiones_contenido', 'bien');
    await expectStatus('9990000004', 'exclusiones_contenido', 'mal');
    await expectStatus('9990000004', 'pmax_redes', 'mal');
    await expectStatus('9990000004', 'conversiones', 'mal');
    await expectStatus('9990000003', 'presencia_interes', 'mal', true);
    await expectStatus('9990000003', 'zona_real', 'mal');
    await expectStatus('9990000003', 'lugares_fuera_zona', 'mal', true);
    await expectStatus('9990000002', 'lugares_fuera_zona', 'mal');
    await expectStatus('9990000003', 'caduca_feb_2027', 'mal');
    await expectStatus('9990000002', 'caduca_feb_2027', 'mal');
    await expectStatus('9990000005', 'caduca_feb_2027', 'bien');
    await expectStatus('9990000002', 'recurso_llamada', 'mal');
    await expectStatus('9990000005', 'recurso_llamada', 'mal', true);
    await expectStatus('9990000003', 'recurso_llamada', 'bien');
    await expectStatus('9990000002', 'recomendaciones', 'mal');
    await expectStatus('9990000003', 'recomendaciones', 'bien');
    await expectStatus('9990000005', 'propiedad_accesos', 'no_comprobado');
    // La predicción previa solo en «mal» R2/R3.
    const all = await db.select().from(adsAuditItems).where(eq(adsAuditItems.tenantId, tid));
    expect(all.filter((i) => i.prediction).every((i) => i.status === 'mal' && (i.risk === 'R2' || i.risk === 'R3'))).toBe(true);
    expect(all.find((i) => i.control === 'socios_busqueda' && i.status === 'mal')?.prediction).toBeTruthy();
  }, 300_000);

  it('repetir la pasada no crea otra auditoría: es vigilancia', async () => {
    const { runAuditAll } = await import('@/lib/ads/audit');
    const r = await runAuditAll(tid);
    expect(r.every((x) => 'mode' in x && x.mode === 'vigilancia')).toBe(true);
    expect((await db.select().from(adsAudits).where(eq(adsAudits.tenantId, tid))).length).toBe(5);
  }, 120_000);

  it('respuestas: «hecho» aprueba la predicción; los descartes piden motivo', async () => {
    const { respondToAuditItem } = await import('@/lib/ads/audit');
    const user = { id: userId, name: 'Prueba', email: 'prueba@kijutech.com' };
    const socios = (await status('9990000002', 'socios_busqueda'))!;
    await expect(respondToAuditItem(tid, user, socios.id, 'no_aplica', '')).rejects.toThrow(/motivo/);
    await respondToAuditItem(tid, user, socios.id, 'hecho', null);
    const after = (await status('9990000002', 'socios_busqueda'))!;
    expect(after.response).toBe('hecho');
    expect((after.history[0] as { approvedPrediction?: unknown }).approvedPrediction).toBeTruthy();
  });

  it('vigilancia: un control corregido que vuelve es «reapareció» y lleva el cambio ajeno al hallazgo 11', async () => {
    const { runAudit } = await import('@/lib/ads/audit');
    const { evaluateAccount } = await import('@/lib/ads/findings');
    // La clínica tiene «autoaplicadas» mal y un cambio de Google hace 2 días. Se simula que estaba corregida ayer.
    const acc1 = await accountId('9990000001');
    const it = (await status('9990000001', 'autoaplicadas'))!;
    await db.update(adsAuditItems).set({ status: 'bien', fixedAt: new Date(Date.now() - 3 * 86_400_000), checkedAt: new Date(Date.now() - 3 * 86_400_000) }).where(eq(adsAuditItems.id, it.id));
    const r = await runAudit(tid, acc1);
    expect('regressed' in r && r.regressed).toContain('autoaplicadas');
    const back = (await status('9990000001', 'autoaplicadas'))!;
    expect(back).toMatchObject({ status: 'mal', regressionCount: 1 });
    expect(back.initialStatus).toBe('mal');
    expect(back.regressionCause).toContain('Google');
    await evaluateAccount(tid, acc1, { mode: 'todas' });
    const f = (await db.select().from(adsFindings).where(and(eq(adsFindings.tenantId, tid), eq(adsFindings.kind, 'cambio_ajeno'), eq(adsFindings.accountId, acc1))))[0];
    const madridHour = zonedParts(new Date(), 'Europe/Madrid').hour;
    if (f || madridHour >= 4) expect(((f?.evidence as { lines?: string[] })?.lines ?? []).join(' ')).toContain('Deshace una corrección de la auditoría');
  }, 120_000);

  it('Cartera: auditoría pendiente hasta leerla; «Repetir» deja la anterior como sustituida', async () => {
    const { portfolioView } = await import('@/lib/ads/views');
    const { markAuditRead, runAudit } = await import('@/lib/ads/audit');
    const acc2 = await accountId('9990000002');
    let row = (await portfolioView(tid)).rows.find((x) => x.accountId === acc2)!;
    expect(row.audit.state).toBe('por_leer');
    const [a] = await db.select().from(adsAudits).where(and(eq(adsAudits.tenantId, tid), eq(adsAudits.accountId, acc2)));
    await markAuditRead(tid, { id: userId, name: 'Prueba', email: 'p@kijutech.com' }, a.id);
    row = (await portfolioView(tid)).rows.find((x) => x.accountId === acc2)!;
    expect(row.audit.state).toBe('leida');
    const r = await runAudit(tid, acc2, { fresh: true, userId });
    expect('mode' in r && r.mode).toBe('entrada');
    const audits = await db.select().from(adsAudits).where(and(eq(adsAudits.tenantId, tid), eq(adsAudits.accountId, acc2)));
    expect(audits).toHaveLength(2);
    expect(audits.filter((x) => x.supersededAt === null)).toHaveLength(1);
    row = (await portfolioView(tid)).rows.find((x) => x.accountId === acc2)!;
    expect(row.audit.state).toBe('por_leer');
  }, 120_000);
});

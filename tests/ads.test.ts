// Módulo Google Ads, paso 1 (28 nov 2026; docs/ads/DISENO-TECNICO-ADS.md v2):
//  - cálculos puros (ids, zonas y horas, cobertura «cero frente a sin dato», salud de las fuentes, autores, URL, clave);
//  - cliente de la API sin red (JWT firmado y traducción de errores de Google);
//  - contrato GOO-07 con respuestas ESCRITAS DESDE LA DOCUMENTACIÓN (tests/fixtures/ads/, no grabadas de una cuenta real);
//  - modo simulado determinista;
//  - con la base de datos real (cuenta de prueba propia que se borra al terminar): descarga completa en modo simulado,
//    cobertura, salud, procesos de la cola, vínculo con la ficha, barreras del modo simulado y cupo propio.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createPublicKey, generateKeyPairSync, createVerify } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adsAccounts,
  adsAdGroupPolicyDaily,
  adsApiUsage,
  adsCampaignStatusDaily,
  adsCampaigns,
  adsChangeEvents,
  adsConfigVersions,
  adsConversionActions,
  adsDailyCampaign,
  adsDailyConversion,
  adsDailyCoverage,
  adsHourlyCampaign,
  adsLandingUrls,
  adsSyncState,
  jobSchedules,
  tenants
} from '@/lib/db/schema';
import {
  addDays,
  classifyActor,
  controlMatches,
  coverageVerdict,
  dayClosed,
  formatCustomerId,
  historyChunks,
  idFromResource,
  localToUtc,
  normalizeCustomerId,
  normalizeLandingUrl,
  pacificDay,
  parseServiceAccountKey,
  retryDelayMs,
  sourceHealth,
  windowCoverage,
  zonedParts
} from '@/lib/ads/rules';
import {
  followableAccounts,
  parseCampaignDaily,
  parseCampaigns,
  parseChangeEvents,
  parseConversionDaily,
  parseCustomerClients,
  Q,
  type ApiRow
} from '@/lib/ads/queries';
import { AdsApiError, runQuery, signServiceAccountJwt, translateApiError } from '@/lib/ads/client';
import { simQuery, SIM_MCC } from '@/lib/ads/sim';
import { connectionFor, publicSettings, saveCredentials, saveGeneral } from '@/lib/ads/settings';
import { linkAccountsToClients, runFullSync, syncHistoryChunk, syncSchedules } from '@/lib/ads/sync';
import { coverageSummary, adsHealth, sourceHealthFor } from '@/lib/ads/health';
import * as store from '@/lib/ads/store';
import { createCoreClient, saveAsset } from '@/lib/core/clients';

const FIX = path.resolve(__dirname, 'fixtures/ads');
const fixture = (name: string) => JSON.parse(fs.readFileSync(path.join(FIX, name), 'utf8')) as { _nota: string; body: unknown };
const results = (name: string) => (fixture(name).body as { results: ApiRow[] }[]).flatMap((b) => b.results);

function testKey() {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const json = JSON.stringify({ type: 'service_account', project_id: 'kiju-ads', private_key_id: 'abcdef1234567890', private_key: pem, client_email: 'lector@kiju-ads.iam.gserviceaccount.com', token_uri: 'https://oauth2.googleapis.com/token' });
  return { json, publicKey };
}

// --- Cálculos puros ---------------------------------------------------------------------------------------------------

describe('ads: cálculos puros', () => {
  it('id de cuenta a 10 dígitos', () => {
    expect(normalizeCustomerId('123-456-7890')).toBe('1234567890');
    expect(normalizeCustomerId(' 123 456 7890 ')).toBe('1234567890');
    expect(normalizeCustomerId('1234567890')).toBe('1234567890');
    expect(normalizeCustomerId('Cuenta 123-456-7890 (principal)')).toBe('1234567890');
    expect(normalizeCustomerId('12345')).toBeNull();
    expect(normalizeCustomerId('https://ads.google.com/aw/overview?ocid=98765')).toBeNull();
    expect(formatCustomerId('1234567890')).toBe('123-456-7890');
    expect(idFromResource('customers/1/campaigns/22')).toBe('22');
  });

  it('hora local de la cuenta a instante real, también en los cambios de horario', () => {
    expect(localToUtc('2026-07-01 12:00:00', 'Europe/Madrid')!.toISOString()).toBe('2026-07-01T10:00:00.000Z');
    expect(localToUtc('2026-12-01 12:00:00.500000', 'Europe/Madrid')!.toISOString()).toBe('2026-12-01T11:00:00.500Z');
    // Hora repetida de octubre (02:30 existe dos veces): se elige la primera (aún en verano, +2).
    expect(localToUtc('2026-10-25 02:30:00', 'Europe/Madrid')!.toISOString()).toBe('2026-10-25T00:30:00.000Z');
    // Hueco de marzo (02:30 no existe): no falla.
    expect(localToUtc('2026-03-29 02:30:00', 'Europe/Madrid')).not.toBeNull();
    expect(localToUtc('no es fecha', 'Europe/Madrid')).toBeNull();
  });

  it('el cupo cuenta en el día del Pacífico', () => {
    expect(pacificDay(new Date('2026-11-28T07:30:00Z'))).toBe('2026-11-27');
    expect(pacificDay(new Date('2026-11-28T09:00:00Z'))).toBe('2026-11-28');
    expect(zonedParts(new Date('2026-11-28T23:30:00Z'), 'Europe/Madrid')).toMatchObject({ date: '2026-11-29', hour: 0 });
  });

  it('cobertura: un día solo es completo si cerró y el control cuadra (cero frente a «sin dato»)', () => {
    const tz = 'Europe/Madrid';
    expect(dayClosed('2026-11-20', tz, new Date('2026-11-21T01:00:00Z'))).toBe(false); // 02:00 de Madrid: falta el retraso
    expect(dayClosed('2026-11-20', tz, new Date('2026-11-21T02:30:00Z'))).toBe(true);
    expect(controlMatches({ cost: 100, impressions: 1000 }, { cost: 100.5, impressions: 1005 })).toBe(true);
    expect(controlMatches({ cost: 100, impressions: 1000 }, { cost: 90, impressions: 1000 })).toBe(false);
    const at = new Date('2026-11-25T12:00:00Z');
    expect(coverageVerdict({ day: '2026-11-20', timeZone: tz, syncedAt: at, control: { cost: 0, impressions: 0 }, rows: { cost: 0, impressions: 0 } }).complete).toBe(true);
    expect(coverageVerdict({ day: '2026-11-25', timeZone: tz, syncedAt: at, control: { cost: 5, impressions: 50 }, rows: { cost: 5, impressions: 50 } })).toEqual({ complete: false, note: 'día sin cerrar' });
    expect(coverageVerdict({ day: '2026-11-20', timeZone: tz, syncedAt: at, control: { cost: 50, impressions: 500 }, rows: { cost: 0, impressions: 0 } }).complete).toBe(false);
    expect(coverageVerdict({ day: '2026-11-20', timeZone: tz, syncedAt: at, control: null, rows: { cost: 0, impressions: 0 } }).complete).toBe(false);
    const w = windowCoverage([{ day: '2026-11-01', complete: true }, { day: '2026-11-02', complete: false }], '2026-11-01', '2026-11-03');
    expect(w).toEqual({ complete: false, missing: ['2026-11-02', '2026-11-03'] });
  });

  it('MED-00: salud de cada fuente', () => {
    const now = new Date('2026-11-28T12:00:00Z');
    const ago = (min: number) => new Date(now.getTime() - min * 60_000);
    expect(sourceHealth(null, now).health).toBe('sin_datos');
    expect(sourceHealth({ source: 'metricas', lastOkAt: ago(300), consecutiveFailures: 0 }, now).health).toBe('sana');
    expect(sourceHealth({ source: 'metricas', lastOkAt: ago(800), consecutiveFailures: 0 }, now).health).toBe('atrasada');
    expect(sourceHealth({ source: 'metricas', lastOkAt: ago(800), consecutiveFailures: 1 }, now).health).toBe('caida');
    expect(sourceHealth({ source: 'metricas', lastOkAt: ago(10), consecutiveFailures: 3 }, now).health).toBe('caida');
    expect(sourceHealth({ source: 'latido', lastOkAt: ago(200), consecutiveFailures: 0 }, now, { localHour: 13 }).health).toBe('atrasada');
    expect(sourceHealth({ source: 'latido', lastOkAt: ago(200), consecutiveFailures: 0 }, now, { localHour: 6 }).health).toBe('sana'); // fuera de horario
    expect(sourceHealth({ source: 'cambios', lastOkAt: ago(8 * 1440), consecutiveFailures: 0 }, now).critical).toBe(true);
  });

  it('autor de cada cambio: agencia, cliente, Google o herramienta', () => {
    const agency = { domains: ['kijutech.com'], emails: ['eury.personal@gmail.com'] };
    expect(classifyActor('gestor@kijutech.com', 'GOOGLE_ADS_WEB_CLIENT', agency)).toBe('agencia');
    expect(classifyActor('Eury.Personal@gmail.com', 'GOOGLE_ADS_WEB_CLIENT', agency)).toBe('agencia');
    expect(classifyActor('dueno@gmail.com', 'GOOGLE_ADS_WEB_CLIENT', agency)).toBe('cliente');
    expect(classifyActor('', 'GOOGLE_ADS_RECOMMENDATIONS_SUBSCRIPTION', agency)).toBe('google');
    expect(classifyActor('gestor@kijutech.com', 'GOOGLE_ADS_SCRIPTS', agency)).toBe('herramienta');
    expect(classifyActor(null, null, agency)).toBe('desconocido');
  });

  it('URL de destino normalizada y tramos del histórico', () => {
    expect(normalizeLandingUrl('https://Ejemplo.com/servicio/?utm_source=google&gclid=x&b=2&a=1#form')).toBe('https://ejemplo.com/servicio?a=1&b=2');
    expect(normalizeLandingUrl('ftp://x.com')).toBeNull();
    const chunks = historyChunks('2026-11-18', 37);
    expect(chunks[0]).toEqual({ from: '2026-08-21', to: '2026-11-18' });
    expect(chunks.length).toBeGreaterThanOrEqual(12);
    expect(chunks[chunks.length - 1].from).toBe(addDays('2026-11-18', -Math.round(37 * 30.44)));
    for (let i = 1; i < chunks.length; i++) expect(chunks[i].to).toBe(addDays(chunks[i - 1].from, -1));
  });

  it('valida la clave de la cuenta de servicio sin aceptar cualquier JSON', () => {
    expect(parseServiceAccountKey('')).toMatchObject({ ok: false });
    expect(parseServiceAccountKey('{no json')).toMatchObject({ ok: false });
    expect(parseServiceAccountKey(JSON.stringify({ type: 'authorized_user' }))).toMatchObject({ ok: false });
    expect(parseServiceAccountKey('x'.repeat(20_000))).toMatchObject({ ok: false });
    const r = parseServiceAccountKey(testKey().json);
    expect(r.ok).toBe(true);
    expect(retryDelayMs('7s')).toBe(7000);
    expect(retryDelayMs('1.5s')).toBe(1500);
    expect(retryDelayMs('9999s')).toBe(60_000);
  });
});

// --- Cliente de la API (sin red) --------------------------------------------------------------------------------------

describe('ads: cliente de la API', () => {
  it('firma el JWT de la cuenta de servicio con RS256, kid y sin sub', () => {
    const { json, publicKey } = testKey();
    const parsed = parseServiceAccountKey(json);
    if (!parsed.ok) throw new Error(parsed.error);
    const jwt = signServiceAccountJwt(parsed.key, 1_800_000_000);
    const [h, c, s] = jwt.split('.');
    const header = JSON.parse(Buffer.from(h, 'base64url').toString());
    const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
    expect(header).toEqual({ alg: 'RS256', typ: 'JWT', kid: 'abcdef1234567890' });
    expect(claims).toEqual({ iss: 'lector@kiju-ads.iam.gserviceaccount.com', scope: 'https://www.googleapis.com/auth/adwords', aud: 'https://oauth2.googleapis.com/token', iat: 1_800_000_000, exp: 1_800_003_600 });
    const v = createVerify('RSA-SHA256');
    v.update(`${h}.${c}`);
    expect(v.verify(createPublicKey(publicKey.export({ type: 'spki', format: 'pem' })), Buffer.from(s, 'base64url'))).toBe(true);
  });

  it('traduce los errores de Google a español con el código literal (contrato)', () => {
    const perm = translateApiError(403, fixture('error_permission.json').body);
    expect(perm.code).toBe('permiso');
    expect(perm.googleCode).toBe('authorizationError.USER_PERMISSION_DENIED');
    expect(perm.message).toMatch(/MCC/);
    expect(perm.message).toMatch(/login-customer-id/); // el literal de Google llega a «Probar conexión»
    const day = translateApiError(429, fixture('error_quota_day.json').body);
    expect(day.code).toBe('cupo_dia');
    expect(day.retryable).toBe(false); // el cupo del día no se reintenta
    const rate = translateApiError(429, fixture('error_quota_rate.json').body);
    expect(rate.code).toBe('ritmo');
    expect(rate.retryable).toBe(true);
    expect(rate.retryAfterMs).toBe(7000);
    const q = translateApiError(400, fixture('error_query.json').body);
    expect(q.code).toBe('consulta');
    expect(q.googleCode).toBe('queryError.UNRECOGNIZED_FIELD');
    expect(translateApiError(400, { error: { details: [{ errors: [{ errorCode: { authorizationError: 'DEVELOPER_TOKEN_NOT_APPROVED' } }] }] } }).code).toBe('token_desarrollador');
    expect(translateApiError(503, null).code).toBe('red');
  });

  it('las consultas no admiten fechas mal formadas (nada de texto libre en GAQL)', () => {
    expect(() => Q.campaignDaily("2026-01-01' OR 1=1 --", '2026-01-02')).toThrow();
    expect(() => Q.changeEvents('2026-01-01', '2026-01-02 00:00:00')).toThrow();
    expect(Q.changeEvents('2026-01-01 00:00:00', '2026-01-02 00:00:00').gaql).toMatch(/ORDER BY change_event\.change_date_time LIMIT 10000$/);
  });
});

// --- Contrato GOO-07 (respuestas escritas desde la documentación) -----------------------------------------------------

describe('ads: traducción de respuestas de la API (contrato, NO grabadas de una cuenta real)', () => {
  it('cada archivo lleva la marca de que no es una respuesta real', () => {
    for (const f of fs.readdirSync(FIX)) expect(fixture(f)._nota, f).toMatch(/NO está grabada de una cuenta real/);
  });

  it('cuentas de la MCC: sin la propia MCC, sin sub-MCC ni cuentas de prueba', () => {
    const all = parseCustomerClients(results('customer_clients.json'));
    expect(all).toHaveLength(5);
    const ok = followableAccounts(all);
    expect(ok.map((a) => a.customerId)).toEqual(['4445556666', '7778889999']);
    expect(ok[1].status).toBe('CANCELED');
  });

  it('campañas: objetivo de puja de maximizar conversiones y estrategia de cartera', () => {
    const [a, b] = parseCampaigns(results('campaigns.json'));
    expect(a).toMatchObject({ nativeId: '111', targetCpa: 35, budgetNativeId: '900', primaryStatus: 'LIMITED', primaryStatusReasons: ['BUDGET_CONSTRAINED'], startDate: '2024-03-01' });
    expect(b).toMatchObject({ nativeId: '222', biddingStrategyNativeId: '555', targetCpa: null });
  });

  it('métricas diarias: micros a euros, conversiones fraccionarias y campañas eliminadas', () => {
    const rows = parseCampaignDaily(results('campaign_daily.json'));
    expect(rows[0]).toMatchObject({ nativeId: '111', day: '2026-11-20', cost: 12.35, impressions: 1500, clicks: 42, conversions: 2.5, allConversions: 3.5, conversionsByConvDate: 2 });
    expect(rows[0].ext.searchImpressionShare).toBe(0.45);
    expect(rows[1]).toMatchObject({ nativeId: '333', status: 'REMOVED', conversions: null }); // sin dato ≠ 0
  });

  it('conversiones por acción, también las de la MCC', () => {
    const rows = parseConversionDaily(results('conversion_daily.json'));
    expect(rows.map((r) => r.conversionAction)).toEqual(['customers/4445556666/conversionActions/1', 'customers/1112223333/conversionActions/777']);
    expect(rows[1].conversions).toBe(0.5);
  });

  it('historial de cambios: campos cambiados, campaña y recurso del evento', () => {
    const [a, b] = parseChangeEvents(results('change_events.json'));
    expect(a).toMatchObject({ eventResourceName: 'customers/4445556666/changeEvents/1732700000000000~1~0', campaignNativeId: '111', changedFields: ['amountMicros'], operation: 'UPDATE' });
    expect(a.oldValue).toEqual({ campaignBudget: { amountMicros: '30000000' } });
    expect(b.changedFields).toEqual(['keyword.text', 'keyword.matchType']);
    expect(b.oldValue).toBeNull();
  });
});

// --- Modo simulado ----------------------------------------------------------------------------------------------------

describe('ads: modo simulado', () => {
  const now = new Date('2026-11-28T15:00:00Z');
  it('es determinista y con la forma de la API', () => {
    const a = simQuery('9990000002', Q.campaignDaily('2026-11-01', '2026-11-10'), now);
    const b = simQuery('9990000002', Q.campaignDaily('2026-11-01', '2026-11-10'), now);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
    expect(typeof (a[0].metrics as { costMicros: unknown }).costMicros).toBe('string');
    expect(parseCampaignDaily(a).length).toBe(a.length);
  });

  it('un día sin impresiones no devuelve fila (como la API) y el control cuadra con las campañas', () => {
    // Campaña de lunes a viernes: el sábado 21 y el domingo 22 de noviembre no tiene fila.
    const rows = parseCampaignDaily(simQuery('9990000001', Q.campaignDaily('2026-11-20', '2026-11-23'), now)).filter((r) => r.nativeId === '1100001');
    expect(rows.map((r) => r.day)).toEqual(['2026-11-20', '2026-11-23']);
    const control = simQuery('9990000001', Q.customerDaily('2026-11-20', '2026-11-20'), now);
    const sum = parseCampaignDaily(simQuery('9990000001', Q.campaignDaily('2026-11-20', '2026-11-20'), now)).reduce((s, r) => s + r.cost, 0);
    expect(Number((control[0].metrics as { costMicros: string }).costMicros) / 1e6).toBeCloseTo(sum, 1);
  });

  it('la MCC simulada lista sus cuentas, una sub-MCC y una de prueba', () => {
    const list = parseCustomerClients(simQuery(SIM_MCC, Q.customerClients(), now));
    expect(followableAccounts(list).filter((c) => c.customerId !== SIM_MCC)).toHaveLength(6);
  });
});

// --- Con la base de datos: descarga completa en modo simulado ---------------------------------------------------------

describe('ads: descarga completa en modo simulado (base de datos real, cuenta de prueba)', () => {
  const SLUG = 'ads-test-paso1';
  let tid = '';
  const cleanup = async () => {
    const [t] = await db.select().from(tenants).where(eq(tenants.slug, SLUG));
    if (t) await db.delete(tenants).where(eq(tenants.id, t.id));
  };
  beforeAll(async () => {
    await cleanup();
    const [t] = await db.insert(tenants).values({ name: 'Prueba Google Ads', slug: SLUG }).returning();
    tid = t.id;
  });
  afterAll(cleanup);

  const count = async (table: typeof adsDailyCampaign | typeof adsCampaigns | typeof adsChangeEvents | typeof adsDailyConversion | typeof adsHourlyCampaign | typeof adsLandingUrls | typeof adsConfigVersions | typeof adsAdGroupPolicyDaily | typeof adsCampaignStatusDaily | typeof adsConversionActions) => {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(table).where(eq(table.tenantId, tid));
    return Number(r.n);
  };

  it('sin configurar no hay conexión y la pantalla no ve secretos', async () => {
    const c = await connectionFor(tid);
    expect(c.conn).toBeNull();
    expect(publicSettings(null)).toMatchObject({ authMode: 'none', hasCredentials: false });
    await expect(saveGeneral(tid, { syncEnabled: true }, 'prueba')).rejects.toThrow(/credencial/);
  });

  it('descarga todo (cuentas, estructura, métricas, cobertura, histórico, cambios, latido) sin salir a internet', async () => {
    await saveCredentials(tid, 'SIM', 'prueba');
    await saveGeneral(tid, { syncEnabled: true, historyMonths: 8, agencyEmailDomains: ['kijutech.com'] }, 'prueba');
    const r = await runFullSync(tid);
    expect(r.errors).toEqual([]);
    expect(r.accounts).toBe(5); // 6 simuladas menos la cancelada; sin sub-MCC ni la de prueba
    const accounts = await store.listAccounts(tid);
    expect(accounts).toHaveLength(6);
    expect(accounts.every((a) => a.simulated)).toBe(true);
    expect(accounts.find((a) => a.status === 'CANCELED')?.tracked).toBe(false);
    expect(accounts.every((a) => a.clientId === null)).toBe(true); // las simuladas nunca se vinculan

    expect(await count(adsCampaigns)).toBeGreaterThanOrEqual(9);
    // La campaña eliminada hace 200 días aparece por sus métricas del histórico (R5 I10).
    const [removed] = await db.select().from(adsCampaigns).where(and(eq(adsCampaigns.tenantId, tid), eq(adsCampaigns.nativeId, '1100003')));
    expect(removed?.status).toBe('REMOVED');
    expect(await count(adsDailyCampaign)).toBeGreaterThan(500);
    expect(await count(adsDailyConversion)).toBeGreaterThan(100);
    const mccAction = await db.select().from(adsConversionActions).where(and(eq(adsConversionActions.tenantId, tid), eq(adsConversionActions.resourceName, `customers/${SIM_MCC}/conversionActions/777`)));
    expect(mccAction).toHaveLength(1); // acción de la MCC dada de alta al verla en las métricas
    expect(await count(adsHourlyCampaign)).toBeGreaterThan(0);
    expect(await count(adsCampaignStatusDaily)).toBeGreaterThan(0);
    expect(await count(adsConfigVersions)).toBeGreaterThan(0);
    expect(await count(adsLandingUrls)).toBeGreaterThan(0);
    const urls = await db.select().from(adsLandingUrls).where(eq(adsLandingUrls.tenantId, tid));
    expect(urls.every((u) => !u.urlNormalized.includes('utm_'))).toBe(true);
    const broken = await db.select().from(adsAdGroupPolicyDaily).where(and(eq(adsAdGroupPolicyDaily.tenantId, tid), eq(adsAdGroupPolicyDaily.adGroupNativeId, '22000012')));
    expect(broken[0]).toMatchObject({ adsApproved: 0, adsDisapproved: 3, keywordsDisapproved: 1 });

    const changes = await db.select().from(adsChangeEvents).where(eq(adsChangeEvents.tenantId, tid));
    expect(changes.length).toBeGreaterThan(0);
    expect(new Set(changes.map((c) => c.actorClass))).toEqual(new Set(changes.map((c) => classifyActor(c.userEmail, c.clientType, { domains: ['kijutech.com'], emails: [] }))));

    // Cobertura: los días cerrados del histórico, completos; hoy, no.
    const cov = await db.select().from(adsDailyCoverage).where(eq(adsDailyCoverage.tenantId, tid));
    expect(cov.filter((c) => c.complete).length).toBeGreaterThan(200);
    const today = zonedParts(new Date(), 'Europe/Madrid').date;
    expect(cov.filter((c) => c.day === today).every((c) => !c.complete)).toBe(true);

    // El histórico terminó en todas las cuentas seguidas.
    const hist = await db.select().from(adsSyncState).where(and(eq(adsSyncState.tenantId, tid), eq(adsSyncState.source, 'historico')));
    expect(hist).toHaveLength(5);
    expect(hist.every((h) => (h.cursor as { done?: boolean }).done)).toBe(true);
  }, 240_000);

  it('repetir la descarga no duplica nada', async () => {
    const before = await count(adsDailyCampaign);
    const changes = await count(adsChangeEvents);
    const r = await runFullSync(tid);
    expect(r.errors).toEqual([]);
    expect(await count(adsDailyCampaign)).toBe(before);
    expect(await count(adsChangeEvents)).toBe(changes);
  }, 240_000);

  it('MED-00: la cabecera dice cuántas cuentas se han comprobado y Salud no ve problemas', async () => {
    const s = await coverageSummary(tid);
    expect(s.total).toBe(5);
    expect(s.checked).toBe(5);
    expect(s.headline).toMatch(/Comprobadas 5 de 5 cuentas/);
    expect(s.usage.operations).toBeGreaterThan(50);
    const checks = await adsHealth(tid);
    expect(checks[0]).toMatchObject({ key: 'ads', status: 'ok' });
    const acc = (await store.listAccounts(tid, { trackedOnly: true }))[0];
    const yesterday = addDays(zonedParts(new Date(), acc.timeZone ?? 'Europe/Madrid').date, -1);
    expect((await sourceHealthFor(tid, acc.id, ['metricas', 'estructura'], { from: addDays(yesterday, -7), to: addDays(yesterday, -1) })).ok).toBe(true);
    // Si una fuente falla tres veces, la cuenta deja de contar como comprobada (nunca «bien» a ciegas).
    for (let i = 0; i < 3; i++) await store.markSyncFail(tid, acc.id, 'metricas', 'prueba');
    const s2 = await coverageSummary(tid);
    expect(s2.checked).toBe(4);
    expect((await sourceHealthFor(tid, acc.id, ['metricas'])).ok).toBe(false);
    await store.markSyncOk(tid, acc.id, 'metricas');
  });

  it('procesos de la cola por cuenta: se dan de alta y se apagan con la descarga', async () => {
    await syncSchedules(tid);
    const rows = await db.select().from(jobSchedules).where(eq(jobSchedules.tenantId, tid));
    const keys = new Set(rows.filter((r) => r.enabled).map((r) => r.processKey));
    for (const k of ['ads.descubrir', 'ads.estructura', 'ads.sincronizar', 'ads.cambios', 'ads.latido']) expect(keys.has(k), k).toBe(true);
    expect(rows.filter((r) => r.processKey === 'ads.latido' && r.enabled)).toHaveLength(5);
    await saveGeneral(tid, { syncEnabled: false }, 'prueba');
    await syncSchedules(tid);
    const off = await db.select().from(jobSchedules).where(and(eq(jobSchedules.tenantId, tid), eq(jobSchedules.enabled, true)));
    expect(off.filter((r) => r.processKey.startsWith('ads.'))).toHaveLength(0);
  });

  it('el tope propio de operaciones corta la descarga', async () => {
    const { conn } = await connectionFor(tid);
    const day = pacificDay();
    await db.update(adsApiUsage).set({ operations: 5000 }).where(and(eq(adsApiUsage.tenantId, tid), eq(adsApiUsage.day, day)));
    await expect(runQuery(conn!, SIM_MCC, Q.customerClients())).rejects.toMatchObject({ code: 'cupo_propio' });
    await db.update(adsApiUsage).set({ operations: 0 }).where(and(eq(adsApiUsage.tenantId, tid), eq(adsApiUsage.day, day)));
    expect(new AdsApiError('cupo_propio', 'x').retryable).toBe(false);
  });

  it('si se suben los meses de histórico, el histórico terminado se reabre y baja lo que falta', async () => {
    const acc = (await store.listAccounts(tid, { trackedOnly: true })).find((a) => a.customerId === '9990000001')!;
    const before = (await store.getSyncState(tid, acc.id, 'historico'))!.cursor as { oldest: string; done: boolean };
    expect(before.done).toBe(true);
    await saveGeneral(tid, { historyMonths: 11 }, 'prueba');
    let r = (await syncHistoryChunk(tid, acc.id)) as { done: boolean };
    for (let i = 0; i < 5 && !r.done; i++) r = (await syncHistoryChunk(tid, acc.id)) as { done: boolean };
    const after = (await store.getSyncState(tid, acc.id, 'historico'))!.cursor as { oldest: string; done: boolean; months: number };
    expect(after).toMatchObject({ done: true, months: 11 });
    expect(after.oldest < before.oldest).toBe(true);
  }, 60_000);

  it('vínculo con la ficha: 10 dígitos, conflicto si dos fichas la reclaman y el manual se respeta', async () => {
    const real = await store.upsertAccount(tid, { customerId: '1234567890', name: 'Real', currency: 'EUR', timeZone: 'Europe/Madrid', status: 'ENABLED', isTest: false, simulated: false });
    const c1 = await createCoreClient(tid, { name: 'Cliente Ads Uno', status: 'activo' });
    await saveAsset(tid, c1, { kind: 'google_ads', value: '123-456-7890' });
    expect(await linkAccountsToClients(tid)).toBe(1);
    expect((await store.getAccount(tid, real.account.id))).toMatchObject({ clientId: c1, linkedBy: 'ficha' });
    const c2 = await createCoreClient(tid, { name: 'Cliente Ads Dos', status: 'activo' });
    await saveAsset(tid, c2, { kind: 'google_ads', value: '1234567890' });
    await linkAccountsToClients(tid);
    const conflict = await store.getAccount(tid, real.account.id);
    expect(conflict?.clientId).toBeNull();
    expect(conflict?.linkNote).toMatch(/varias fichas/);
    await store.updateAccount(tid, real.account.id, { clientId: c2, linkedBy: 'manual', linkNote: null });
    await linkAccountsToClients(tid);
    expect((await store.getAccount(tid, real.account.id))?.clientId).toBe(c2);
  });

  it('barreras del modo simulado: no se activa con cuentas reales y la clave real oculta las simuladas', async () => {
    await expect(saveCredentials(tid, 'sim', 'prueba')).rejects.toThrow(/cuentas reales/);
    const { json } = testKey();
    const r = await saveCredentials(tid, json, 'prueba');
    expect(r.mode).toBe('service_account');
    expect(r.hint).not.toContain('lector@kiju-ads'); // enmascarado
    const sims = await db.select().from(adsAccounts).where(and(eq(adsAccounts.tenantId, tid), eq(adsAccounts.simulated, true)));
    expect(sims.length).toBe(6);
    expect(sims.every((a) => !a.tracked)).toBe(true); // ocultas, no borradas
    const pub = publicSettings(await store.getSettingsRow(tid));
    expect(JSON.stringify(pub)).not.toMatch(/PRIVATE KEY|credentialsEncrypted/);
    expect(pub).toMatchObject({ authMode: 'service_account', hasCredentials: true, mccCustomerId: null });
  });
});

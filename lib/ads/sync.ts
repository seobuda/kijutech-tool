import 'server-only';

// Módulo Google Ads · descarga (paso 1; diseño §4). SOLO LECTURA de Google Ads.
//
//  - descubrir: cuentas bajo la MCC, alta o actualización y vínculo con la ficha del cliente (client_assets google_ads).
//  - estructura (diaria): cuenta, campañas, presupuestos, estrategias de cartera, programación, acciones de conversión,
//    políticas por grupo de anuncios, palabras rechazadas, URL de destino con gasto; versiones de configuración.
//  - métricas (cada 6 h, 10 días): campaña × día, conversiones por acción, CONSULTA DE CONTROL y cobertura por día
//    (cero frente a «sin dato», R5 G1) y foto de estado del día.
//  - cambios (cada 6 h): change_event desde el cursor menos 1 día, LIMIT 10.000 con continuación.
//  - latido (cada hora, 07:00-23:00 de la cuenta): hoy por horas (R5 G3).
//  - histórico: tramos de 90 días hacia atrás hasta `history_months`, sin parar en un tramo vacío.
// Cada fuente deja su estado en ads_sync_state (MED-00).
import { addDays, classifyActor, coverageVerdict, gaqlDateTime, historyChunks, localToUtc, normalizeCustomerId, normalizeLandingUrl, SERVICE_HOURS, zonedParts, type AdsSource } from '@/lib/ads/rules';
import {
  followableAccounts,
  parseAdPolicies,
  parseAdSchedules,
  parseBiddingStrategies,
  parseBudgets,
  parseCampaignDaily,
  parseCampaignHourly,
  parseCampaignStatus,
  parseCampaigns,
  parseChangeEvents,
  parseConversionActions,
  parseConversionDaily,
  parseCustomer,
  parseCustomerClients,
  parseCustomerDaily,
  parseLandingPages,
  Q,
  STRUCTURE_RESOURCE_TYPES
} from '@/lib/ads/queries';
import { AdsApiError, runQuery, type AdsConnection } from '@/lib/ads/client';
import { connectionFor } from '@/lib/ads/settings';
import * as store from '@/lib/ads/store';
import { reportError } from '@/lib/core/errors';
import { disableSchedule, enqueueJob, ensureScheduleIfMissing, listSchedulesForScope, pauseSchedule, stableOffsetMinutes } from '@/lib/core/jobs';
import type { AdsAccount } from '@/lib/db/schema';

export const ADS_JOB = {
  descubrir: 'ads.descubrir',
  estructura: 'ads.estructura',
  sincronizar: 'ads.sincronizar',
  cambios: 'ads.cambios',
  latido: 'ads.latido',
  historico: 'ads.historico'
} as const;

/** Procesos periódicos por cuenta de Ads (scopeType «cuenta», scopeId = id de ads_accounts) y su frecuencia. */
export const ACCOUNT_PROCESSES: { key: string; every: number; label: string }[] = [
  { key: ADS_JOB.estructura, every: 1440, label: 'Google Ads: estructura, configuración, políticas y URL (diaria)' },
  { key: ADS_JOB.sincronizar, every: 360, label: 'Google Ads: métricas de 10 días, cobertura y foto de estado' },
  { key: ADS_JOB.cambios, every: 360, label: 'Google Ads: historial de cambios' },
  { key: ADS_JOB.latido, every: 60, label: 'Google Ads: latido horario (07:00-23:00 de la cuenta)' }
];

export type SyncCtx = { now?: Date; signal?: AbortSignal; heartbeat?: () => Promise<void> };

const DEFAULT_TZ = 'Europe/Madrid';
const tzOf = (a: AdsAccount) => a.timeZone || DEFAULT_TZ;

async function needConn(tenantId: string): Promise<{ conn: AdsConnection; agency: { domains: string[]; emails: string[] }; historyMonths: number }> {
  const { conn, reason, row } = await connectionFor(tenantId);
  if (!conn) throw new AdsApiError('auth', reason ?? 'Google Ads no está configurado.');
  return { conn, agency: { domains: row?.agencyEmailDomains ?? [], emails: row?.agencyUserEmails ?? [] }, historyMonths: row?.historyMonths ?? 37 };
}

async function needAccount(tenantId: string, accountId: string): Promise<AdsAccount> {
  const a = await store.getAccount(tenantId, accountId);
  if (!a) throw new Error('Esa cuenta de Google Ads ya no existe.');
  return a;
}

/**
 * Envoltorio de cada fuente: anota éxito o fallo en ads_sync_state. El cupo agotado no es un fallo del proceso (se para
 * hasta mañana y MED-00 lo dice). A partir del tercer fallo seguido, el error va al registro central (área ads).
 */
async function tracked<T>(tenantId: string, accountId: string | null, source: AdsSource, fn: () => Promise<T>): Promise<T | { skipped: string }> {
  try {
    return await fn();
  } catch (e) {
    const msg = e instanceof AdsApiError ? e.message : e instanceof Error ? e.message : String(e);
    const failures = await store.markSyncFail(tenantId, accountId, source, msg);
    if (e instanceof AdsApiError && (e.code === 'cupo_dia' || e.code === 'cupo_propio')) return { skipped: msg };
    if (failures >= 3) reportError({ source: 'ads', area: source, tenantId, message: `Google Ads: falla la descarga de ${source} (${failures} veces seguidas)`, error: msg, severity: 'aviso' });
    throw e;
  }
}

// --- Descubrir cuentas y vincular con la ficha ------------------------------------------------------------------------

export async function discoverAccounts(tenantId: string, ctx: SyncCtx = {}): Promise<{ found: number; added: number; linked: number } | { skipped: string }> {
  return tracked(tenantId, null, 'descubrir', async () => {
    const { conn } = await needConn(tenantId);
    const all = parseCustomerClients(await runQuery(conn, conn.mccId, Q.customerClients(), ctx));
    const list = followableAccounts(all).filter((c) => c.customerId !== conn.mccId);
    let added = 0;
    for (const c of list) {
      const r = await store.upsertAccount(tenantId, { customerId: c.customerId, name: c.name, currency: c.currency, timeZone: c.timeZone, status: c.status, isTest: c.test, simulated: conn.mode === 'sim' });
      if (r.created) added++;
    }
    const linked = conn.mode === 'sim' ? 0 : await linkAccountsToClients(tenantId);
    await store.markSyncOk(tenantId, null, 'descubrir');
    await syncSchedules(tenantId);
    return { found: list.length, added, linked };
  });
}

/**
 * Vínculo con la ficha (R5 menor 9): el id de cada activo «Google Ads» se normaliza a 10 dígitos; si dos fichas reclaman
 * la misma cuenta no se vincula y se anota; el vínculo manual se respeta; las cuentas simuladas nunca se vinculan.
 */
export async function linkAccountsToClients(tenantId: string): Promise<number> {
  const claims = new Map<string, Map<string, string>>();
  for (const a of await store.googleAdsAssets(tenantId)) {
    const id = normalizeCustomerId(a.value);
    if (!id) continue;
    (claims.get(id) ?? claims.set(id, new Map()).get(id)!).set(a.clientId, a.clientName);
  }
  let linked = 0;
  for (const acc of await store.listAccounts(tenantId, { simulated: false })) {
    if (acc.linkedBy === 'manual') continue;
    const who = claims.get(acc.customerId);
    if (who && who.size === 1) {
      const [clientId] = [...who.keys()];
      if (acc.clientId !== clientId || acc.linkedBy !== 'ficha' || acc.linkNote) await store.updateAccount(tenantId, acc.id, { clientId, linkedBy: 'ficha', linkNote: null });
      linked++;
    } else if (who && who.size > 1) {
      await store.updateAccount(tenantId, acc.id, { clientId: null, linkedBy: null, linkNote: `La reclaman varias fichas: ${[...who.values()].join(', ')}. Deja el id solo en la correcta o vincúlala a mano.` });
    } else if (acc.linkedBy === 'ficha' || acc.linkNote) {
      await store.updateAccount(tenantId, acc.id, { clientId: null, linkedBy: null, linkNote: null });
    }
  }
  return linked;
}

/**
 * Procesos de la cola: la MCC (descubrir) y, por cada cuenta seguida, estructura, métricas, cambios y latido. Las cuentas
 * que se dejan de seguir (o con la descarga apagada) se apagan «por el sistema»; las nuevas encolan su histórico.
 */
export async function syncSchedules(tenantId: string): Promise<void> {
  const row = await store.getSettingsRow(tenantId);
  const on = Boolean(row?.syncEnabled && row.authMode !== 'none' && row.mccCustomerId);
  const simulatedMode = row?.authMode === 'sim';
  if (on) await ensureScheduleIfMissing(tenantId, ADS_JOB.descubrir, '', 1440, new Date());
  else await disableSchedule(tenantId, ADS_JOB.descubrir, '', true);
  for (const acc of await store.listAccounts(tenantId)) {
    // En modo simulado solo se siguen las simuladas; con la credencial real, nunca las simuladas.
    const follow = on && acc.tracked && acc.simulated === simulatedMode;
    const existing = new Map((await listSchedulesForScope(tenantId, acc.id)).map((s) => [s.processKey, s]));
    for (const p of ACCOUNT_PROCESSES) {
      const s = existing.get(p.key);
      if (!follow) {
        if (s?.enabled) await disableSchedule(tenantId, p.key, acc.id, true);
        continue;
      }
      const offset = stableOffsetMinutes(`${p.key}:${acc.id}`, Math.min(p.every, 60));
      if (!s) await ensureScheduleIfMissing(tenantId, p.key, acc.id, p.every, new Date(Date.now() + offset * 60_000));
      else if (!s.enabled && s.lastStatus === 'apagado') await pauseSchedule(tenantId, p.key, acc.id, { enabled: true });
    }
    if (follow) {
      const h = await store.getSyncState(tenantId, acc.id, 'historico');
      if (!(h?.cursor as { done?: boolean } | undefined)?.done) await enqueueHistory(tenantId, acc.id);
    }
  }
}

export async function enqueueHistory(tenantId: string, accountId: string): Promise<void> {
  await enqueueJob({ tenantId, kind: ADS_JOB.historico, payload: { accountId }, scopeType: 'cuenta', scopeId: accountId, priority: 8, dedupeKey: `${ADS_JOB.historico}:${accountId}` });
}

/** Encola ya la descarga de todas las cuentas seguidas («Descargar ahora» y la de las 06:30). */
export async function enqueueAccountSyncs(tenantId: string, kinds: string[] = [ADS_JOB.estructura, ADS_JOB.sincronizar, ADS_JOB.cambios, ADS_JOB.latido], tag = 'ahora'): Promise<number> {
  const row = await store.getSettingsRow(tenantId);
  const simulatedMode = row?.authMode === 'sim';
  let n = 0;
  for (const acc of await store.listAccounts(tenantId, { trackedOnly: true })) {
    if (acc.simulated !== simulatedMode) continue;
    for (const kind of kinds) {
      const r = await enqueueJob({ tenantId, kind, payload: { accountId: acc.id }, scopeType: 'cuenta', scopeId: acc.id, priority: 5, dedupeKey: `${kind}:${acc.id}:${tag}` });
      if (r.created) n++;
    }
  }
  return n;
}

// --- Estructura (diaria) ----------------------------------------------------------------------------------------------

export async function syncStructure(tenantId: string, accountId: string, ctx: SyncCtx = {}) {
  return tracked(tenantId, accountId, 'estructura', async () => {
    const { conn } = await needConn(tenantId);
    const acc = await needAccount(tenantId, accountId);
    const cid = acc.customerId;
    const run = (q: Parameters<typeof runQuery>[2]) => runQuery(conn, cid, q, ctx);
    const now = ctx.now ?? new Date();

    const customer = parseCustomer(await run(Q.customer()));
    if (customer) {
      await store.updateAccount(tenantId, accountId, { name: customer.name, currency: customer.currency, timeZone: customer.timeZone, status: customer.status, autoTagging: customer.autoTagging });
      await store.saveConfigVersion(tenantId, accountId, 'cuenta', cid, { ...customer });
    }
    const tz = customer?.timeZone || tzOf(acc);
    const today = zonedParts(now, tz).date;

    const strategies = parseBiddingStrategies(await run(Q.biddingStrategies()));
    for (const s of strategies) await store.saveConfigVersion(tenantId, accountId, 'estrategia', s.nativeId, { ...s });
    const budgets = parseBudgets(await run(Q.budgets()));
    await store.upsertBudgets(tenantId, accountId, budgets);
    for (const b of budgets) await store.saveConfigVersion(tenantId, accountId, 'presupuesto', b.nativeId, { ...b });
    const schedules = parseAdSchedules(await run(Q.adSchedules()));
    const campaigns = parseCampaigns(await run(Q.campaigns()));
    const ids = await store.upsertCampaigns(tenantId, accountId, campaigns, schedules, new Map(strategies.map((s) => [s.nativeId, { cpa: s.targetCpa, roas: s.targetRoas }])));
    for (const c of campaigns) await store.saveConfigVersion(tenantId, accountId, 'campana', c.nativeId, { ...c, adSchedule: schedules.get(c.nativeId) ?? null });
    const actions = parseConversionActions(await run(Q.conversionActions()));
    await store.upsertConversionActions(tenantId, accountId, actions);
    for (const a of actions) await store.saveConfigVersion(tenantId, accountId, 'accion_conversion', a.resourceName, { ...a });
    await ctx.heartbeat?.();

    const policies = parseAdPolicies(await run(Q.adPolicies()), await run(Q.keywordPolicies()));
    await store.upsertPolicyDaily(tenantId, accountId, today, policies, ids);

    // URL de destino con gasto en los 7 días cerrados (la campaña no tiene URL final: van por anuncio y expandidas).
    const from = addDays(today, -7);
    const to = addDays(today, -1);
    const pages = parseLandingPages(await run(Q.landingPages(from, to)), await run(Q.expandedLandingPages(from, to)));
    const byUrl = new Map<string, { urlNormalized: string; url: string; origins: Set<string>; campaigns: Set<string>; cost: number; clicks: number }>();
    for (const p of pages) {
      const n = normalizeLandingUrl(p.url);
      if (!n) continue;
      const cur = byUrl.get(n) ?? byUrl.set(n, { urlNormalized: n, url: p.url, origins: new Set(), campaigns: new Set(), cost: 0, clicks: 0 }).get(n)!;
      cur.origins.add(p.origin);
      cur.campaigns.add(p.campaignNativeId);
      cur.cost += p.cost;
      cur.clicks += p.clicks;
    }
    await store.upsertLandingUrls(
      tenantId,
      accountId,
      [...byUrl.values()].map((u) => ({ urlNormalized: u.urlNormalized, url: u.url, origins: [...u.origins], campaignNativeIds: [...u.campaigns], cost7d: Math.round(u.cost * 100) / 100, clicks7d: u.clicks }))
    );
    await store.markSyncOk(tenantId, accountId, 'estructura', { lastDataDate: today });
    return { campaigns: campaigns.length, budgets: budgets.length, actions: actions.length, adGroups: policies.length, urls: byUrl.size };
  });
}

// --- Métricas, conversiones y cobertura -------------------------------------------------------------------------------

/** Tres consultas (campaña × día, conversiones por acción y control) y la cobertura de cada día del tramo. */
async function pullRange(tenantId: string, acc: AdsAccount, conn: AdsConnection, from: string, to: string, ctx: SyncCtx): Promise<{ rows: number; complete: string[] }> {
  const run = (q: Parameters<typeof runQuery>[2]) => runQuery(conn, acc.customerId, q, ctx);
  const daily = parseCampaignDaily(await run(Q.campaignDaily(from, to)));
  const ids = await store.ensureCampaignStubs(tenantId, acc.id, daily);
  await store.upsertDailyCampaign(tenantId, acc.id, daily, ids);
  const conv = parseConversionDaily(await run(Q.conversionDaily(from, to)));
  await store.ensureConversionActionStubs(tenantId, acc.id, conv.map((c) => c.conversionAction));
  await store.upsertDailyConversion(tenantId, acc.id, conv, ids);
  const control = parseCustomerDaily(await run(Q.customerDaily(from, to)));
  // Las dos respuestas llegaron: una campaña con fila guardada que ya no sale ese día es 0 (Google corrige días recientes).
  await store.clearMissingDaily(acc.id, from, to, new Set(daily.map((d) => `${d.nativeId}|${d.day}`)), ids);
  const syncedAt = ctx.now ?? new Date();
  const tz = tzOf(acc);
  const sums = new Map<string, { cost: number; impressions: number }>();
  for (const d of daily) {
    const s = sums.get(d.day) ?? sums.set(d.day, { cost: 0, impressions: 0 }).get(d.day)!;
    s.cost += d.cost;
    s.impressions += d.impressions;
  }
  const ctl = new Map(control.map((c) => [c.day, c]));
  const coverage = [];
  const complete: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const rows = sums.get(day) ?? { cost: 0, impressions: 0 };
    rows.cost = Math.round(rows.cost * 100) / 100;
    // Sin fila de control ese día: la cuenta entera no tuvo impresiones (la consulta respondió).
    const c = ctl.get(day) ?? { cost: 0, impressions: 0 };
    const v = coverageVerdict({ day, timeZone: tz, syncedAt, control: c, rows });
    coverage.push({ day, complete: v.complete, controlCost: c.cost, controlImpressions: c.impressions, rowsCost: rows.cost, rowsImpressions: rows.impressions, note: v.note });
    if (v.complete) complete.push(day);
  }
  await store.upsertCoverage(tenantId, acc.id, coverage);
  return { rows: daily.length, complete };
}

/** Métricas de los últimos 10 días (Google corrige días recientes), cobertura y foto de estado del día. */
export async function syncMetrics(tenantId: string, accountId: string, ctx: SyncCtx = {}) {
  return tracked(tenantId, accountId, 'metricas', async () => {
    const { conn } = await needConn(tenantId);
    const acc = await needAccount(tenantId, accountId);
    const today = zonedParts(ctx.now ?? new Date(), tzOf(acc)).date;
    const r = await pullRange(tenantId, acc, conn, addDays(today, -9), today, ctx);
    const status = parseCampaignStatus(await runQuery(conn, acc.customerId, Q.campaignStatus(), ctx));
    const ids = await store.ensureCampaignStubs(tenantId, accountId, status);
    await store.upsertStatusDaily(tenantId, accountId, today, status, ids);
    const lastComplete = r.complete.sort().pop() ?? null;
    await store.markSyncOk(tenantId, accountId, 'metricas', { lastDataDate: lastComplete });
    return { rows: r.rows, completeDays: r.complete.length, campaignsWithStatus: status.length };
  });
}

/** Un tramo del histórico (90 días hacia atrás). Devuelve si ya terminó. */
export async function syncHistoryChunk(tenantId: string, accountId: string, ctx: SyncCtx = {}) {
  return tracked(tenantId, accountId, 'historico', async () => {
    const { conn, historyMonths } = await needConn(tenantId);
    const acc = await needAccount(tenantId, accountId);
    const state = await store.getSyncState(tenantId, accountId, 'historico');
    const cursor = (state?.cursor ?? {}) as { nextTo?: string; done?: boolean; oldest?: string; chunks?: number };
    if (cursor.done) return { done: true, chunks: cursor.chunks ?? 0 };
    const today = zonedParts(ctx.now ?? new Date(), tzOf(acc)).date;
    // Lo de los últimos 10 días lo trae la descarga de métricas; el histórico empieza justo antes.
    const latest = cursor.nextTo ?? addDays(today, -10);
    const chunks = historyChunks(addDays(today, -10), historyMonths);
    const oldest = chunks[chunks.length - 1].from;
    if (latest < oldest) {
      await store.markSyncOk(tenantId, accountId, 'historico', { cursor: { ...cursor, done: true, oldest } });
      return { done: true, chunks: cursor.chunks ?? 0 };
    }
    const from = addDays(latest, -89) < oldest ? oldest : addDays(latest, -89);
    const r = await pullRange(tenantId, acc, conn, from, latest, ctx);
    // No se para en un tramo vacío (un cliente de temporada puede tener meses parados): solo al llegar a history_months.
    const done = from <= oldest;
    const next = { nextTo: addDays(from, -1), done, oldest, chunks: (cursor.chunks ?? 0) + 1 };
    await store.markSyncOk(tenantId, accountId, 'historico', { cursor: next, lastDataDate: from });
    return { done, chunks: next.chunks, rows: r.rows };
  });
}

// --- Historial de cambios ---------------------------------------------------------------------------------------------

export async function syncChanges(tenantId: string, accountId: string, ctx: SyncCtx = {}) {
  return tracked(tenantId, accountId, 'cambios', async () => {
    const { conn, agency } = await needConn(tenantId);
    const acc = await needAccount(tenantId, accountId);
    const tz = tzOf(acc);
    const now = ctx.now ?? new Date();
    const state = await store.getSyncState(tenantId, accountId, 'cambios');
    const cursor = (state?.cursor ?? {}) as { lastLocal?: string };
    // La API solo da 30 días: se pide desde el cursor menos 1 día de solape, nunca más atrás de 29 días.
    const floor = gaqlDateTime(new Date(now.getTime() - 29 * 86_400_000), tz);
    const fromCursor = cursor.lastLocal ? gaqlDateTime(new Date((localToUtc(cursor.lastLocal, tz) ?? now).getTime() - 86_400_000), tz) : floor;
    let from = fromCursor < floor ? floor : fromCursor;
    const to = gaqlDateTime(now, tz);
    let inserted = 0;
    let lastLocal = cursor.lastLocal ?? null;
    let structural = false;
    for (let page = 0; page < 10; page++) {
      const rows = parseChangeEvents(await runQuery(conn, acc.customerId, Q.changeEvents(from, to), ctx));
      const values = rows.flatMap((e) => {
        const at = localToUtc(e.changeAtLocal, tz);
        if (!at) return [];
        if (e.resourceType && STRUCTURE_RESOURCE_TYPES.has(e.resourceType)) structural = true;
        return [
          {
            tenantId,
            accountId,
            eventResourceName: e.eventResourceName.slice(0, 300),
            changeAt: at,
            changeAtLocal: e.changeAtLocal.slice(0, 32),
            userEmail: e.userEmail?.slice(0, 255) ?? null,
            clientType: e.clientType?.slice(0, 60) ?? null,
            actorClass: classifyActor(e.userEmail, e.clientType, agency),
            resourceType: e.resourceType?.slice(0, 60) ?? null,
            changedResource: e.changedResource?.slice(0, 300) ?? null,
            campaignNativeId: e.campaignNativeId,
            operation: e.operation?.slice(0, 20) ?? null,
            changedFields: e.changedFields.slice(0, 100),
            oldValue: e.oldValue,
            newValue: e.newValue
          }
        ];
      });
      inserted += await store.insertChangeEvents(values);
      const last = rows[rows.length - 1]?.changeAtLocal?.slice(0, 19);
      if (last && (!lastLocal || last > lastLocal)) lastLocal = last;
      // 10.000 filas: hay más; se sigue desde la última hora vista (la clave única deduplica el solape).
      if (rows.length < 10_000 || !last || last <= from) break;
      from = last;
    }
    if (structural && inserted > 0) await enqueueJob({ tenantId, kind: ADS_JOB.estructura, payload: { accountId }, scopeType: 'cuenta', scopeId: accountId, priority: 6, dedupeKey: `${ADS_JOB.estructura}:${accountId}:cambio` });
    await store.markSyncOk(tenantId, accountId, 'cambios', { cursor: { lastLocal: lastLocal ?? to }, lastDataDate: (lastLocal ?? to).slice(0, 10) });
    return { inserted };
  });
}

// --- Latido horario ---------------------------------------------------------------------------------------------------

export async function syncHourly(tenantId: string, accountId: string, ctx: SyncCtx & { force?: boolean } = {}) {
  return tracked(tenantId, accountId, 'latido', async () => {
    const acc = await needAccount(tenantId, accountId);
    const local = zonedParts(ctx.now ?? new Date(), tzOf(acc));
    if (!ctx.force && (local.hour < SERVICE_HOURS.from || local.hour >= SERVICE_HOURS.to)) return { skipped: 'fuera del horario de servicio de la cuenta' };
    const { conn } = await needConn(tenantId);
    const rows = parseCampaignHourly(await runQuery(conn, acc.customerId, Q.campaignHourly(local.date), ctx));
    const ids = await store.ensureCampaignStubs(tenantId, accountId, rows);
    const n = await store.upsertHourly(tenantId, accountId, local.date, rows, ids);
    await store.purgeHourly(accountId, addDays(local.date, -60));
    await store.markSyncOk(tenantId, accountId, 'latido', { lastDataDate: local.date });
    return { rows: n, hour: local.hour };
  });
}

// --- Todo de una vez (pruebas y «Descargar ahora» en simulado) --------------------------------------------------------

/** Descarga completa de todas las cuentas seguidas, en este proceso. Para pruebas y verificación; la normal va por la cola. */
export async function runFullSync(tenantId: string, ctx: SyncCtx = {}): Promise<{ accounts: number; historyChunks: number; errors: string[] }> {
  const errors: string[] = [];
  const d = await discoverAccounts(tenantId, ctx).catch((e) => {
    errors.push(`descubrir: ${e instanceof Error ? e.message : e}`);
    return null;
  });
  if (!d) return { accounts: 0, historyChunks: 0, errors };
  const row = await store.getSettingsRow(tenantId);
  const simulatedMode = row?.authMode === 'sim';
  const accounts = (await store.listAccounts(tenantId, { trackedOnly: true })).filter((a) => a.simulated === simulatedMode);
  let historyChunksDone = 0;
  for (const a of accounts) {
    for (const [name, fn] of [
      ['estructura', () => syncStructure(tenantId, a.id, ctx)],
      ['metricas', () => syncMetrics(tenantId, a.id, ctx)],
      ['cambios', () => syncChanges(tenantId, a.id, ctx)],
      ['latido', () => syncHourly(tenantId, a.id, { ...ctx, force: true })]
    ] as const) {
      await (fn as () => Promise<unknown>)().catch((e) => errors.push(`${a.name ?? a.customerId} · ${name}: ${e instanceof Error ? e.message : e}`));
    }
    for (let i = 0; i < 30; i++) {
      const r = (await syncHistoryChunk(tenantId, a.id, ctx).catch((e) => {
        errors.push(`${a.name ?? a.customerId} · histórico: ${e instanceof Error ? e.message : e}`);
        return { done: true };
      })) as { done?: boolean; skipped?: string };
      historyChunksDone++;
      if (r.done || r.skipped) break;
    }
  }
  return { accounts: accounts.length, historyChunks: historyChunksDone, errors };
}

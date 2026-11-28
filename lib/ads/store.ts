import 'server-only';

// Módulo Google Ads · lectura y escritura de las tablas ads_* (sin lógica de negocio). Todo se guarda con su tenant_id y,
// salvo los ajustes y el cupo, colgado de una cuenta de Ads (ads_accounts). Las escrituras son «guardar encima» (claves
// únicas): repetir una descarga no duplica nada.
import { and, asc, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adsAccounts,
  adsAdGroupPolicyDaily,
  adsApiUsage,
  adsBudgets,
  adsCampaignStatusDaily,
  adsCampaigns,
  adsChangeEvents,
  adsClients,
  adsConfigVersions,
  adsConversionActions,
  adsDailyCampaign,
  adsDailyConversion,
  adsDailyCoverage,
  adsHourlyCampaign,
  adsLandingUrls,
  adsSettings,
  adsSyncState,
  clientAssets,
  clients,
  type AdsAccount,
  type AdsSettingsRow,
  type AdsSyncStateRow
} from '@/lib/db/schema';
import { EXPECTED_MINUTES, snapshotHash, type AdsSource } from '@/lib/ads/rules';
import type { AdGroupPolicy, BudgetInfo, CampaignInfo, CampaignStub, ConversionActionInfo, DailyCampaignRow, DailyConversionRow, HourlyRow, ScheduleSlot, StatusRow } from '@/lib/ads/queries';

const money = (v: number | null | undefined) => (v === null || v === undefined ? null : v.toFixed(2));
const roasText = (v: number | null) => (v === null ? null : v.toFixed(4));
const dec4 = (v: number | null | undefined) => (v === null || v === undefined ? null : v.toFixed(4));
const chunk = <T,>(list: T[], n = 500): T[][] => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

// --- Ajustes ----------------------------------------------------------------------------------------------------------

export async function getSettingsRow(tenantId: string): Promise<AdsSettingsRow | null> {
  const [row] = await db.select().from(adsSettings).where(eq(adsSettings.tenantId, tenantId)).limit(1);
  return row ?? null;
}

export async function upsertSettings(tenantId: string, patch: Partial<typeof adsSettings.$inferInsert>): Promise<void> {
  const values = { ...patch, tenantId, updatedAt: new Date() };
  await db.insert(adsSettings).values(values).onConflictDoUpdate({ target: adsSettings.tenantId, set: { ...patch, updatedAt: new Date() } });
}

export async function tenantsWithAds(): Promise<string[]> {
  const rows = await db.select({ t: adsSettings.tenantId }).from(adsSettings).where(and(eq(adsSettings.syncEnabled, true), sql`${adsSettings.authMode} <> 'none'`));
  return rows.map((r) => r.t);
}

// --- Cupo de la API ---------------------------------------------------------------------------------------------------

/** Suma una operación al día (del Pacífico) y devuelve cuántas van. */
export async function bumpUsage(tenantId: string, day: string): Promise<number> {
  const rows = await db.execute<{ operations: number }>(sql`
    INSERT INTO ads_api_usage (tenant_id, day, operations, updated_at) VALUES (${tenantId}, ${day}, 1, now())
    ON CONFLICT (tenant_id, day) DO UPDATE SET operations = ads_api_usage.operations + 1, updated_at = now()
    RETURNING operations`);
  return Number([...rows][0]?.operations ?? 0);
}

export async function recordUsageError(tenantId: string, day: string, message: string): Promise<void> {
  await db.execute(sql`
    INSERT INTO ads_api_usage (tenant_id, day, errors, last_error, updated_at) VALUES (${tenantId}, ${day}, 1, ${message.slice(0, 500)}, now())
    ON CONFLICT (tenant_id, day) DO UPDATE SET errors = ads_api_usage.errors + 1, last_error = ${message.slice(0, 500)}, updated_at = now()`);
}

export async function getUsage(tenantId: string, day: string): Promise<{ operations: number; errors: number; lastError: string | null }> {
  const [row] = await db.select().from(adsApiUsage).where(and(eq(adsApiUsage.tenantId, tenantId), eq(adsApiUsage.day, day))).limit(1);
  return { operations: row?.operations ?? 0, errors: row?.errors ?? 0, lastError: row?.lastError ?? null };
}

// --- Cuentas ----------------------------------------------------------------------------------------------------------

export async function listAccounts(tenantId: string, opts: { simulated?: boolean; trackedOnly?: boolean } = {}): Promise<AdsAccount[]> {
  const where = [eq(adsAccounts.tenantId, tenantId)];
  if (opts.simulated !== undefined) where.push(eq(adsAccounts.simulated, opts.simulated));
  if (opts.trackedOnly) where.push(eq(adsAccounts.tracked, true));
  return db.select().from(adsAccounts).where(and(...where)).orderBy(asc(adsAccounts.name));
}

export async function getAccount(tenantId: string, id: string): Promise<AdsAccount | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db.select().from(adsAccounts).where(and(eq(adsAccounts.tenantId, tenantId), eq(adsAccounts.id, id))).limit(1);
  return row ?? null;
}

/** Alta o actualización de una cuenta vista en la MCC. Una cuenta nueva se sigue si está activa. */
export async function upsertAccount(
  tenantId: string,
  a: { customerId: string; name: string | null; currency: string | null; timeZone: string | null; status: string | null; isTest: boolean; simulated: boolean }
): Promise<{ account: AdsAccount; created: boolean }> {
  const [existing] = await db
    .select()
    .from(adsAccounts)
    .where(and(eq(adsAccounts.tenantId, tenantId), eq(adsAccounts.platform, 'google'), eq(adsAccounts.customerId, a.customerId)))
    .limit(1);
  if (existing) {
    const [row] = await db
      .update(adsAccounts)
      .set({ name: a.name, currency: a.currency, timeZone: a.timeZone, status: a.status, isTest: a.isTest, simulated: a.simulated, lastSeenAt: new Date(), updatedAt: new Date(), ...(a.status !== 'ENABLED' ? { tracked: false } : existing.status !== 'ENABLED' ? { tracked: true } : {}) })
      .where(eq(adsAccounts.id, existing.id))
      .returning();
    return { account: row, created: false };
  }
  const [row] = await db
    .insert(adsAccounts)
    .values({ tenantId, customerId: a.customerId, name: a.name, currency: a.currency, timeZone: a.timeZone, status: a.status, isTest: a.isTest, simulated: a.simulated, tracked: a.status === 'ENABLED' })
    .returning();
  return { account: row, created: true };
}

export async function updateAccount(tenantId: string, id: string, patch: Partial<Pick<AdsAccount, 'clientId' | 'linkedBy' | 'linkNote' | 'tracked' | 'autoTagging' | 'currency' | 'timeZone' | 'status' | 'name'>>): Promise<void> {
  await db.update(adsAccounts).set({ ...patch, updatedAt: new Date() }).where(and(eq(adsAccounts.tenantId, tenantId), eq(adsAccounts.id, id)));
}

/** Cuentas simuladas: se ocultan (nunca se borran) al pasar a la credencial real (diseño §3.4). */
export async function hideSimulatedAccounts(tenantId: string): Promise<void> {
  await db.update(adsAccounts).set({ tracked: false, updatedAt: new Date() }).where(and(eq(adsAccounts.tenantId, tenantId), eq(adsAccounts.simulated, true)));
}

export async function countRealAccounts(tenantId: string): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(adsAccounts).where(and(eq(adsAccounts.tenantId, tenantId), eq(adsAccounts.simulated, false)));
  return Number(r?.n ?? 0);
}

/** Activos «Google Ads» de las fichas de clientes que no están de baja (todos, no solo el principal). */
export async function googleAdsAssets(tenantId: string): Promise<{ clientId: string; clientName: string; value: string }[]> {
  const rows = await db
    .select({ clientId: clients.id, clientName: clients.name, value: clientAssets.value })
    .from(clientAssets)
    .innerJoin(clients, eq(clients.id, clientAssets.clientId))
    .where(and(eq(clientAssets.tenantId, tenantId), eq(clientAssets.kind, 'google_ads'), sql`${clients.status} <> 'baja'`));
  return rows.filter((r) => r.value?.trim()).map((r) => ({ clientId: r.clientId, clientName: r.clientName, value: r.value!.trim() }));
}

export async function clientNames(tenantId: string, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const rows = await db.select({ id: clients.id, name: clients.name }).from(clients).where(and(eq(clients.tenantId, tenantId), inArray(clients.id, ids)));
  return new Map(rows.map((r) => [r.id, r.name]));
}

export async function listClientsForLink(tenantId: string): Promise<{ id: string; name: string }[]> {
  return db.select({ id: clients.id, name: clients.name }).from(clients).where(and(eq(clients.tenantId, tenantId), sql`${clients.status} <> 'baja'`)).orderBy(asc(clients.name));
}

export async function clientBelongs(tenantId: string, clientId: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(clientId)) return false;
  const [r] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.tenantId, tenantId), eq(clients.id, clientId))).limit(1);
  return Boolean(r);
}

// --- Nivel del cliente (A/B/C) ----------------------------------------------------------------------------------------

export async function clientLevels(tenantId: string): Promise<Map<string, string | null>> {
  const rows = await db.select({ clientId: adsClients.clientId, level: adsClients.level }).from(adsClients).where(eq(adsClients.tenantId, tenantId));
  return new Map(rows.map((r) => [r.clientId, r.level]));
}

export async function setClientLevel(tenantId: string, clientId: string, level: 'A' | 'B' | 'C' | null, by: string): Promise<void> {
  await db
    .insert(adsClients)
    .values({ tenantId, clientId, level, updatedBy: by })
    .onConflictDoUpdate({ target: [adsClients.tenantId, adsClients.clientId], set: { level, updatedBy: by, updatedAt: new Date() } });
}

// --- Estado de la descarga (MED-00) -----------------------------------------------------------------------------------

export async function getSyncState(tenantId: string, scopeKey: string, source: AdsSource): Promise<AdsSyncStateRow | null> {
  const [row] = await db
    .select()
    .from(adsSyncState)
    .where(and(eq(adsSyncState.tenantId, tenantId), eq(adsSyncState.scopeKey, scopeKey), eq(adsSyncState.source, source)))
    .limit(1);
  return row ?? null;
}

export async function listSyncStates(tenantId: string): Promise<AdsSyncStateRow[]> {
  return db.select().from(adsSyncState).where(eq(adsSyncState.tenantId, tenantId));
}

async function upsertSync(tenantId: string, accountId: string | null, source: AdsSource, set: Partial<typeof adsSyncState.$inferInsert>): Promise<void> {
  const scopeKey = accountId ?? '';
  await db
    .insert(adsSyncState)
    .values({ tenantId, scopeKey, accountId, source, expectedEveryMinutes: EXPECTED_MINUTES[source] || 360, ...set, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [adsSyncState.tenantId, adsSyncState.scopeKey, adsSyncState.source], set: { ...set, updatedAt: new Date() } });
}

export async function markSyncOk(tenantId: string, accountId: string | null, source: AdsSource, extra: { lastDataDate?: string | null; cursor?: Record<string, unknown> } = {}): Promise<void> {
  const now = new Date();
  await upsertSync(tenantId, accountId, source, {
    lastOkAt: now,
    lastAttemptAt: now,
    consecutiveFailures: 0,
    lastError: null,
    ...(extra.lastDataDate !== undefined ? { lastDataDate: extra.lastDataDate } : {}),
    ...(extra.cursor !== undefined ? { cursor: extra.cursor } : {})
  });
}

export async function markSyncFail(tenantId: string, accountId: string | null, source: AdsSource, error: string): Promise<number> {
  const prev = await getSyncState(tenantId, accountId ?? '', source);
  const failures = (prev?.consecutiveFailures ?? 0) + 1;
  await upsertSync(tenantId, accountId, source, { lastAttemptAt: new Date(), consecutiveFailures: failures, lastError: error.slice(0, 1000) });
  return failures;
}

/** Anota un intento sin contarlo como fallo (cupo agotado). */
export async function markSyncNote(tenantId: string, accountId: string | null, source: AdsSource, note: string): Promise<void> {
  await upsertSync(tenantId, accountId, source, { lastAttemptAt: new Date(), lastError: note.slice(0, 1000) });
}

/** ¿Hay un trabajo de esa clase abierto para esa cuenta? (para no encolar dos cadenas del histórico). */
export async function hasOpenJob(tenantId: string, kind: string, scopeId: string): Promise<boolean> {
  const rows = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM jobs WHERE tenant_id = ${tenantId} AND kind = ${kind} AND scope_id = ${scopeId} AND status IN ('pendiente', 'en_curso')`);
  return Number([...rows][0]?.n ?? 0) > 0;
}

export async function setSyncCursor(tenantId: string, accountId: string, source: AdsSource, cursor: Record<string, unknown>): Promise<void> {
  await upsertSync(tenantId, accountId, source, { cursor });
}

// --- Estructura -------------------------------------------------------------------------------------------------------

/** Ids internos de las campañas de una cuenta por su id nativo. */
export async function campaignIdMap(accountId: string): Promise<Map<string, string>> {
  const rows = await db.select({ id: adsCampaigns.id, nativeId: adsCampaigns.nativeId }).from(adsCampaigns).where(eq(adsCampaigns.accountId, accountId));
  return new Map(rows.map((r) => [r.nativeId, r.id]));
}

/** Da de alta las campañas que aparecen en las métricas y no conocemos (también las ya eliminadas, R5 I10). */
export async function ensureCampaignStubs(tenantId: string, accountId: string, stubs: CampaignStub[]): Promise<Map<string, string>> {
  const map = await campaignIdMap(accountId);
  const missing = [...new Map(stubs.filter((s) => !map.has(s.nativeId)).map((s) => [s.nativeId, s])).values()];
  for (const part of chunk(missing)) {
    await db
      .insert(adsCampaigns)
      .values(part.map((s) => ({ tenantId, accountId, nativeId: s.nativeId, name: s.name, status: s.status, channelType: s.channelType })))
      .onConflictDoNothing();
  }
  return missing.length ? campaignIdMap(accountId) : map;
}

export async function upsertCampaigns(tenantId: string, accountId: string, list: CampaignInfo[], schedules: Map<string, ScheduleSlot[]>, strategyTargets: Map<string, { cpa: number | null; roas: number | null }>): Promise<Map<string, string>> {
  const now = new Date();
  for (const part of chunk(list)) {
    await db
      .insert(adsCampaigns)
      .values(
        part.map((c) => {
          const portfolio = c.biddingStrategyNativeId ? strategyTargets.get(c.biddingStrategyNativeId) : undefined;
          return {
            tenantId,
            accountId,
            nativeId: c.nativeId,
            name: c.name,
            channelType: c.channelType,
            channelSubtype: c.channelSubtype,
            status: c.status,
            servingStatus: c.servingStatus,
            primaryStatus: c.primaryStatus,
            biddingStrategyType: c.biddingStrategyType,
            biddingStrategyNativeId: c.biddingStrategyNativeId,
            budgetNativeId: c.budgetNativeId,
            targetCpa: money(c.targetCpa ?? portfolio?.cpa ?? null),
            targetRoas: roasText(c.targetRoas ?? portfolio?.roas ?? null),
            startDate: c.startDate,
            endDate: c.endDate,
            adSchedule: schedules.get(c.nativeId) ?? null,
            attrs: { primaryStatusReasons: c.primaryStatusReasons },
            lastSeenAt: now
          };
        })
      )
      .onConflictDoUpdate({
        target: [adsCampaigns.accountId, adsCampaigns.nativeId],
        set: {
          name: sql`excluded.name`,
          channelType: sql`excluded.channel_type`,
          channelSubtype: sql`excluded.channel_subtype`,
          status: sql`excluded.status`,
          servingStatus: sql`excluded.serving_status`,
          primaryStatus: sql`excluded.primary_status`,
          biddingStrategyType: sql`excluded.bidding_strategy_type`,
          biddingStrategyNativeId: sql`excluded.bidding_strategy_native_id`,
          budgetNativeId: sql`excluded.budget_native_id`,
          targetCpa: sql`excluded.target_cpa`,
          targetRoas: sql`excluded.target_roas`,
          startDate: sql`excluded.start_date`,
          endDate: sql`excluded.end_date`,
          adSchedule: sql`excluded.ad_schedule`,
          attrs: sql`excluded.attrs`,
          lastSeenAt: sql`excluded.last_seen_at`
        }
      });
  }
  // Las que ya no salen en la lista (eliminadas): se quedan con su histórico, marcadas como eliminadas.
  const seen = list.map((c) => c.nativeId);
  await db
    .update(adsCampaigns)
    .set({ status: 'REMOVED' })
    .where(and(eq(adsCampaigns.accountId, accountId), seen.length ? sql`${adsCampaigns.nativeId} NOT IN (${sql.join(seen.map((s) => sql`${s}`), sql`, `)})` : sql`true`, sql`${adsCampaigns.status} IS DISTINCT FROM 'REMOVED'`));
  return campaignIdMap(accountId);
}

export async function upsertBudgets(tenantId: string, accountId: string, list: BudgetInfo[]): Promise<void> {
  const now = new Date();
  for (const part of chunk(list)) {
    await db
      .insert(adsBudgets)
      .values(part.map((b) => ({ tenantId, accountId, nativeId: b.nativeId, name: b.name, amount: money(b.amount), period: b.period, explicitlyShared: b.explicitlyShared, deliveryMethod: b.deliveryMethod, status: b.status, referenceCount: b.referenceCount, lastSeenAt: now })))
      .onConflictDoUpdate({
        target: [adsBudgets.accountId, adsBudgets.nativeId],
        set: { name: sql`excluded.name`, amount: sql`excluded.amount`, period: sql`excluded.period`, explicitlyShared: sql`excluded.explicitly_shared`, deliveryMethod: sql`excluded.delivery_method`, status: sql`excluded.status`, referenceCount: sql`excluded.reference_count`, lastSeenAt: sql`excluded.last_seen_at` }
      });
  }
}

export async function upsertConversionActions(tenantId: string, accountId: string, list: ConversionActionInfo[]): Promise<void> {
  const now = new Date();
  for (const part of chunk(list)) {
    await db
      .insert(adsConversionActions)
      .values(part.map((a) => ({ tenantId, accountId, resourceName: a.resourceName, nativeId: a.nativeId, ownerCustomerId: a.ownerCustomerId, name: a.name, category: a.category, type: a.type, status: a.status, primaryForGoal: a.primaryForGoal, includeInConversions: a.includeInConversions, countingType: a.countingType, lastSeenAt: now })))
      .onConflictDoUpdate({
        target: [adsConversionActions.accountId, adsConversionActions.resourceName],
        set: { nativeId: sql`excluded.native_id`, ownerCustomerId: sql`excluded.owner_customer_id`, name: sql`excluded.name`, category: sql`excluded.category`, type: sql`excluded.type`, status: sql`excluded.status`, primaryForGoal: sql`excluded.primary_for_goal`, includeInConversions: sql`excluded.include_in_conversions`, countingType: sql`excluded.counting_type`, lastSeenAt: sql`excluded.last_seen_at` }
      });
  }
}

/** Acciones vistas en las métricas que no salen al listar la cuenta (las de la MCC, R5 I5): alta mínima. */
export async function ensureConversionActionStubs(tenantId: string, accountId: string, resourceNames: string[]): Promise<void> {
  const unique = [...new Set(resourceNames)].filter(Boolean);
  for (const part of chunk(unique)) {
    await db
      .insert(adsConversionActions)
      .values(part.map((r) => ({ tenantId, accountId, resourceName: r, nativeId: r.split('/').pop() ?? null, ownerCustomerId: r.split('/')[1] ?? null })))
      .onConflictDoNothing();
  }
}

/** Versión de configuración: si cambió, cierra la vigente y abre otra. Devuelve si hubo cambio. */
export async function saveConfigVersion(tenantId: string, accountId: string, entityType: 'cuenta' | 'campana' | 'presupuesto' | 'estrategia' | 'accion_conversion', entityNativeId: string, snapshot: Record<string, unknown>): Promise<boolean> {
  const hash = snapshotHash(snapshot);
  const [current] = await db
    .select({ id: adsConfigVersions.id, hash: adsConfigVersions.hash })
    .from(adsConfigVersions)
    .where(and(eq(adsConfigVersions.accountId, accountId), eq(adsConfigVersions.entityType, entityType), eq(adsConfigVersions.entityNativeId, entityNativeId), isNull(adsConfigVersions.validTo)))
    .limit(1);
  if (current?.hash === hash) return false;
  const now = new Date();
  await db.transaction(async (tx) => {
    if (current) await tx.update(adsConfigVersions).set({ validTo: now }).where(eq(adsConfigVersions.id, current.id));
    await tx.insert(adsConfigVersions).values({ tenantId, accountId, entityType, entityNativeId, validFrom: now, snapshot, hash });
  });
  return true;
}

// --- Métricas ---------------------------------------------------------------------------------------------------------

export async function upsertDailyCampaign(tenantId: string, accountId: string, rows: DailyCampaignRow[], ids: Map<string, string>): Promise<number> {
  const now = new Date();
  const values = rows
    .filter((r) => ids.has(r.nativeId))
    .map((r) => ({
      tenantId,
      accountId,
      campaignId: ids.get(r.nativeId)!,
      day: r.day,
      cost: money(r.cost)!,
      impressions: r.impressions,
      clicks: r.clicks,
      conversions: dec4(r.conversions),
      conversionsValue: money(r.conversionsValue),
      allConversions: dec4(r.allConversions),
      conversionsByConvDate: dec4(r.conversionsByConvDate),
      ext: r.ext,
      syncedAt: now
    }));
  for (const part of chunk(values)) {
    await db
      .insert(adsDailyCampaign)
      .values(part)
      .onConflictDoUpdate({
        target: [adsDailyCampaign.campaignId, adsDailyCampaign.day],
        set: { cost: sql`excluded.cost`, impressions: sql`excluded.impressions`, clicks: sql`excluded.clicks`, conversions: sql`excluded.conversions`, conversionsValue: sql`excluded.conversions_value`, allConversions: sql`excluded.all_conversions`, conversionsByConvDate: sql`excluded.conversions_by_conv_date`, ext: sql`excluded.ext`, syncedAt: sql`excluded.synced_at` }
      });
  }
  return values.length;
}

/**
 * Para un día con filas resincronizadas, una campaña que tenía fila y ya no sale tiene 0 (Google corrige días recientes):
 * se borra su fila de ese día dentro de la ventana pedida. Solo días con la consulta de control respondida.
 */
export async function clearMissingDaily(accountId: string, days: string[], seenKeys: Set<string>, ids: Map<string, string>): Promise<void> {
  if (!days.length) return;
  const existing = await db
    .select({ id: adsDailyCampaign.id, campaignId: adsDailyCampaign.campaignId, day: adsDailyCampaign.day })
    .from(adsDailyCampaign)
    .where(and(eq(adsDailyCampaign.accountId, accountId), inArray(adsDailyCampaign.day, days)));
  const back = new Map([...ids.entries()].map(([n, id]) => [id, n]));
  const stale = existing.filter((r) => !seenKeys.has(`${back.get(r.campaignId)}|${r.day}`)).map((r) => r.id);
  for (const part of chunk(stale)) await db.delete(adsDailyCampaign).where(inArray(adsDailyCampaign.id, part));
}

/**
 * Lo mismo para las conversiones por acción (paso 2): en un día comprobado, una fila guardada (campaña × acción) que ya no
 * sale es 0 (Google corrigió o la acción dejó de contar). Sin esto, la regla de medición rota vería conversiones viejas.
 */
export async function clearMissingConversions(accountId: string, days: string[], seenKeys: Set<string>, ids: Map<string, string>): Promise<void> {
  if (!days.length) return;
  const existing = await db
    .select({ id: adsDailyConversion.id, campaignId: adsDailyConversion.campaignId, action: adsDailyConversion.conversionAction, day: adsDailyConversion.day })
    .from(adsDailyConversion)
    .where(and(eq(adsDailyConversion.accountId, accountId), inArray(adsDailyConversion.day, days)));
  const back = new Map([...ids.entries()].map(([n, id]) => [id, n]));
  const stale = existing.filter((r) => !seenKeys.has(`${back.get(r.campaignId)}|${r.action}|${r.day}`)).map((r) => r.id);
  for (const part of chunk(stale)) await db.delete(adsDailyConversion).where(inArray(adsDailyConversion.id, part));
}

export async function upsertDailyConversion(tenantId: string, accountId: string, rows: DailyConversionRow[], ids: Map<string, string>): Promise<number> {
  const now = new Date();
  const values = rows
    .filter((r) => ids.has(r.campaignNativeId))
    .map((r) => ({
      tenantId,
      accountId,
      campaignId: ids.get(r.campaignNativeId)!,
      conversionAction: r.conversionAction.slice(0, 200),
      day: r.day,
      conversions: dec4(r.conversions),
      allConversions: dec4(r.allConversions),
      conversionsValue: money(r.conversionsValue),
      conversionsByConvDate: dec4(r.conversionsByConvDate),
      allConversionsByConvDate: dec4(r.allConversionsByConvDate),
      syncedAt: now
    }));
  for (const part of chunk(values)) {
    await db
      .insert(adsDailyConversion)
      .values(part)
      .onConflictDoUpdate({
        target: [adsDailyConversion.campaignId, adsDailyConversion.conversionAction, adsDailyConversion.day],
        set: { conversions: sql`excluded.conversions`, allConversions: sql`excluded.all_conversions`, conversionsValue: sql`excluded.conversions_value`, conversionsByConvDate: sql`excluded.conversions_by_conv_date`, allConversionsByConvDate: sql`excluded.all_conversions_by_conv_date`, syncedAt: sql`excluded.synced_at` }
      });
  }
  return values.length;
}

export async function upsertCoverage(tenantId: string, accountId: string, rows: { day: string; complete: boolean; controlCost: number | null; controlImpressions: number | null; rowsCost: number; rowsImpressions: number; note: string | null }[]): Promise<void> {
  const now = new Date();
  for (const part of chunk(rows)) {
    await db
      .insert(adsDailyCoverage)
      .values(part.map((r) => ({ tenantId, accountId, day: r.day, syncedAt: now, complete: r.complete, controlCost: money(r.controlCost), controlImpressions: r.controlImpressions, rowsCost: money(r.rowsCost), rowsImpressions: r.rowsImpressions, note: r.note })))
      .onConflictDoUpdate({
        target: [adsDailyCoverage.accountId, adsDailyCoverage.day],
        set: { syncedAt: sql`excluded.synced_at`, complete: sql`excluded.complete`, controlCost: sql`excluded.control_cost`, controlImpressions: sql`excluded.control_impressions`, rowsCost: sql`excluded.rows_cost`, rowsImpressions: sql`excluded.rows_impressions`, note: sql`excluded.note` }
      });
  }
}

export async function coverageRows(accountId: string, from: string, to: string): Promise<{ day: string; complete: boolean }[]> {
  return db
    .select({ day: adsDailyCoverage.day, complete: adsDailyCoverage.complete })
    .from(adsDailyCoverage)
    .where(and(eq(adsDailyCoverage.accountId, accountId), gte(adsDailyCoverage.day, from), sql`${adsDailyCoverage.day} <= ${to}`));
}

export async function upsertHourly(tenantId: string, accountId: string, day: string, rows: HourlyRow[], ids: Map<string, string>): Promise<number> {
  const now = new Date();
  const values = rows
    .filter((r) => ids.has(r.nativeId))
    .map((r) => ({ tenantId, accountId, campaignId: ids.get(r.nativeId)!, day, hour: r.hour, impressions: r.impressions, clicks: r.clicks, cost: money(r.cost)!, conversions: dec4(r.conversions), syncedAt: now }));
  for (const part of chunk(values)) {
    await db
      .insert(adsHourlyCampaign)
      .values(part)
      .onConflictDoUpdate({
        target: [adsHourlyCampaign.campaignId, adsHourlyCampaign.day, adsHourlyCampaign.hour],
        set: { impressions: sql`excluded.impressions`, clicks: sql`excluded.clicks`, cost: sql`excluded.cost`, conversions: sql`excluded.conversions`, syncedAt: sql`excluded.synced_at` }
      });
  }
  return values.length;
}

/** El dato horario se guarda 60 días. */
export async function purgeHourly(accountId: string, before: string): Promise<void> {
  await db.delete(adsHourlyCampaign).where(and(eq(adsHourlyCampaign.accountId, accountId), lt(adsHourlyCampaign.day, before)));
}

// --- Fotos de estado y políticas (la peor del día, R5 menor 15) ------------------------------------------------------

const RANK: Record<string, number> = { NOT_ELIGIBLE: 4, REMOVED: 4, PAUSED: 3, LIMITED: 2, LEARNING: 1, PENDING: 1, ELIGIBLE: 0 };
export function worseStatus(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return (RANK[b] ?? 0) > (RANK[a] ?? 0) ? b : a;
}

export async function upsertStatusDaily(tenantId: string, accountId: string, day: string, rows: StatusRow[], ids: Map<string, string>): Promise<void> {
  const existing = await db
    .select({ campaignId: adsCampaignStatusDaily.campaignId, worst: adsCampaignStatusDaily.worstPrimaryStatus })
    .from(adsCampaignStatusDaily)
    .where(and(eq(adsCampaignStatusDaily.accountId, accountId), eq(adsCampaignStatusDaily.day, day)));
  const prevWorst = new Map(existing.map((e) => [e.campaignId, e.worst]));
  const now = new Date();
  const values = rows
    .filter((r) => ids.has(r.nativeId))
    .map((r) => {
      const campaignId = ids.get(r.nativeId)!;
      return { tenantId, accountId, campaignId, day, status: r.status, primaryStatus: r.primaryStatus, primaryStatusReasons: r.primaryStatusReasons, servingStatus: r.servingStatus, biddingStatus: r.biddingStatus, budgetAmount: money(r.budgetAmount), observations: 1, worstPrimaryStatus: worseStatus(prevWorst.get(campaignId) ?? null, r.primaryStatus), updatedAt: now };
    });
  for (const part of chunk(values)) {
    await db
      .insert(adsCampaignStatusDaily)
      .values(part)
      .onConflictDoUpdate({
        target: [adsCampaignStatusDaily.campaignId, adsCampaignStatusDaily.day],
        set: {
          status: sql`excluded.status`,
          primaryStatus: sql`excluded.primary_status`,
          primaryStatusReasons: sql`excluded.primary_status_reasons`,
          servingStatus: sql`excluded.serving_status`,
          biddingStatus: sql`excluded.bidding_status`,
          budgetAmount: sql`excluded.budget_amount`,
          observations: sql`${adsCampaignStatusDaily.observations} + 1`,
          worstPrimaryStatus: sql`excluded.worst_primary_status`,
          updatedAt: sql`excluded.updated_at`
        }
      });
  }
}

export async function upsertPolicyDaily(tenantId: string, accountId: string, day: string, rows: AdGroupPolicy[], ids: Map<string, string>): Promise<void> {
  const now = new Date();
  const values = rows.map((r) => ({
    tenantId,
    accountId,
    campaignId: ids.get(r.campaignNativeId) ?? null,
    entityKind: 'ad_group',
    adGroupNativeId: r.adGroupNativeId,
    name: r.name,
    adGroupStatus: r.status,
    day,
    adsTotal: r.adsTotal,
    adsApproved: r.adsApproved,
    adsLimited: r.adsLimited,
    adsDisapproved: r.adsDisapproved,
    keywordsDisapproved: r.keywordsDisapproved,
    updatedAt: now
  }));
  for (const part of chunk(values)) {
    await db
      .insert(adsAdGroupPolicyDaily)
      .values(part)
      .onConflictDoUpdate({
        target: [adsAdGroupPolicyDaily.accountId, adsAdGroupPolicyDaily.entityKind, adsAdGroupPolicyDaily.adGroupNativeId, adsAdGroupPolicyDaily.day],
        set: {
          name: sql`excluded.name`,
          adGroupStatus: sql`excluded.ad_group_status`,
          adsTotal: sql`GREATEST(${adsAdGroupPolicyDaily.adsTotal}, excluded.ads_total)`,
          adsApproved: sql`LEAST(${adsAdGroupPolicyDaily.adsApproved}, excluded.ads_approved)`,
          adsLimited: sql`GREATEST(${adsAdGroupPolicyDaily.adsLimited}, excluded.ads_limited)`,
          adsDisapproved: sql`GREATEST(${adsAdGroupPolicyDaily.adsDisapproved}, excluded.ads_disapproved)`,
          keywordsDisapproved: sql`GREATEST(${adsAdGroupPolicyDaily.keywordsDisapproved}, excluded.keywords_disapproved)`,
          updatedAt: sql`excluded.updated_at`
        }
      });
  }
}

// --- Historial de cambios ---------------------------------------------------------------------------------------------

export async function insertChangeEvents(rows: (typeof adsChangeEvents.$inferInsert)[]): Promise<number> {
  let n = 0;
  for (const part of chunk(rows)) {
    const r = await db.insert(adsChangeEvents).values(part).onConflictDoNothing().returning({ id: adsChangeEvents.id });
    n += r.length;
  }
  return n;
}

export async function lastChangeEvents(tenantId: string, limit = 20): Promise<{ accountName: string | null; changeAt: Date; userEmail: string | null; actorClass: string; resourceType: string | null; operation: string | null }[]> {
  return db
    .select({ accountName: adsAccounts.name, changeAt: adsChangeEvents.changeAt, userEmail: adsChangeEvents.userEmail, actorClass: adsChangeEvents.actorClass, resourceType: adsChangeEvents.resourceType, operation: adsChangeEvents.operation })
    .from(adsChangeEvents)
    .innerJoin(adsAccounts, eq(adsAccounts.id, adsChangeEvents.accountId))
    .where(eq(adsChangeEvents.tenantId, tenantId))
    .orderBy(desc(adsChangeEvents.changeAt))
    .limit(limit);
}

// --- URL de destino ---------------------------------------------------------------------------------------------------

export async function upsertLandingUrls(tenantId: string, accountId: string, rows: { urlNormalized: string; url: string; origins: string[]; campaignNativeIds: string[]; cost7d: number; clicks7d: number }[]): Promise<void> {
  const now = new Date();
  for (const part of chunk(rows)) {
    await db
      .insert(adsLandingUrls)
      .values(part.map((r) => ({ tenantId, accountId, urlNormalized: r.urlNormalized, url: r.url, origins: r.origins, campaignNativeIds: r.campaignNativeIds, cost7d: money(r.cost7d), clicks7d: r.clicks7d, lastSeenAt: now })))
      .onConflictDoUpdate({
        target: [adsLandingUrls.accountId, adsLandingUrls.urlNormalized],
        set: { url: sql`excluded.url`, origins: sql`excluded.origins`, campaignNativeIds: sql`excluded.campaign_native_ids`, cost7d: sql`excluded.cost_7d`, clicks7d: sql`excluded.clicks_7d`, lastSeenAt: sql`excluded.last_seen_at` }
      });
  }
  // Las que ya no tienen gasto en 7 días se quedan (con su historia), con gasto 0.
  const seen = rows.map((r) => r.urlNormalized);
  await db
    .update(adsLandingUrls)
    .set({ cost7d: '0.00', clicks7d: 0 })
    .where(and(eq(adsLandingUrls.accountId, accountId), seen.length ? sql`${adsLandingUrls.urlNormalized} NOT IN (${sql.join(seen.map((s) => sql`${s}`), sql`, `)})` : sql`true`));
}

// --- Resúmenes para pantallas y salud ---------------------------------------------------------------------------------

export async function accountTotals(tenantId: string): Promise<Map<string, { campaigns: number; days: number; firstDay: string | null; lastDay: string | null; cost30: number; lastCoverage: string | null }>> {
  const rows = await db.execute<{ account_id: string; campaigns: number; days: number; first_day: string | null; last_day: string | null; cost30: string | null; last_cov: string | null }>(sql`
    SELECT a.id AS account_id,
      (SELECT count(*)::int FROM ads_campaigns c WHERE c.account_id = a.id) AS campaigns,
      (SELECT count(DISTINCT d.day)::int FROM ads_daily_campaign d WHERE d.account_id = a.id) AS days,
      (SELECT min(d.day)::text FROM ads_daily_campaign d WHERE d.account_id = a.id) AS first_day,
      (SELECT max(d.day)::text FROM ads_daily_campaign d WHERE d.account_id = a.id) AS last_day,
      (SELECT sum(d.cost)::text FROM ads_daily_campaign d WHERE d.account_id = a.id AND d.day >= (current_date - 30)) AS cost30,
      (SELECT max(v.day)::text FROM ads_daily_coverage v WHERE v.account_id = a.id AND v.complete) AS last_cov
    FROM ads_accounts a WHERE a.tenant_id = ${tenantId}`);
  return new Map([...rows].map((r) => [r.account_id, { campaigns: Number(r.campaigns), days: Number(r.days), firstDay: r.first_day, lastDay: r.last_day, cost30: Number(r.cost30 ?? 0), lastCoverage: r.last_cov }]));
}

import 'server-only';

// Módulo Google Ads · lectura y escritura de lo del paso 2 (sin lógica de negocio): la foto de una cuenta para evaluar sus
// reglas, hallazgos (ads_findings), respuestas del gestor, resultado de cada regla (ads_rule_runs), revisiones de cuenta,
// objetivos (ads_goals) y la parte del estado de ajustes que usan los avisos. Todo filtrado por tenant_id.
import { and, asc, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adsAccountReviews,
  adsAccounts,
  adsAdGroupPolicyDaily,
  adsBudgets,
  adsCampaigns,
  adsChangeEvents,
  adsConversionActions,
  adsDailyCampaign,
  adsDailyConversion,
  adsDailyCoverage,
  adsFindingResponses,
  adsFindings,
  adsGoals,
  adsHourlyCampaign,
  adsLandingUrls,
  adsRuleRuns,
  users
} from '@/lib/db/schema';
import type { ActionIn, BudgetIn, CampaignIn, ChangeIn, ConversionIn, DailyIn, HourlyIn, LandingIn, PolicyIn } from '@/lib/ads/finding-rules';

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const nOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

// --- Foto de una cuenta ------------------------------------------------------------------------------------------------

export type AccountRaw = {
  campaigns: CampaignIn[];
  budgets: BudgetIn[];
  daily: DailyIn[];
  covered: Set<string>;
  hourly: HourlyIn[];
  policies: PolicyIn[];
  landing: LandingIn[];
  changes: ChangeIn[];
  conversions: ConversionIn[];
  actions: ActionIn[];
};

/** Todo lo que necesitan las reglas de una cuenta, desde `from` (días) y desde `hourlyFrom` (horas). */
export async function loadAccountRaw(accountId: string, from: string, hourlyFrom: string, changesSince: Date): Promise<AccountRaw> {
  const camps = await db.select().from(adsCampaigns).where(eq(adsCampaigns.accountId, accountId));
  const nativeOf = new Map(camps.map((c) => [c.id, c.nativeId]));
  const budgets = await db.select().from(adsBudgets).where(eq(adsBudgets.accountId, accountId));
  const daily = await db
    .select({ campaignId: adsDailyCampaign.campaignId, day: adsDailyCampaign.day, cost: adsDailyCampaign.cost, impressions: adsDailyCampaign.impressions, clicks: adsDailyCampaign.clicks, conversions: adsDailyCampaign.conversions })
    .from(adsDailyCampaign)
    .where(and(eq(adsDailyCampaign.accountId, accountId), gte(adsDailyCampaign.day, from)));
  const cov = await db.select({ day: adsDailyCoverage.day }).from(adsDailyCoverage).where(and(eq(adsDailyCoverage.accountId, accountId), gte(adsDailyCoverage.day, from), eq(adsDailyCoverage.complete, true)));
  const hourly = await db.select().from(adsHourlyCampaign).where(and(eq(adsHourlyCampaign.accountId, accountId), gte(adsHourlyCampaign.day, hourlyFrom)));
  // Políticas: la foto del último día guardado (la peor del día).
  const [lastPol] = await db.select({ day: sql<string>`max(${adsAdGroupPolicyDaily.day})::text` }).from(adsAdGroupPolicyDaily).where(eq(adsAdGroupPolicyDaily.accountId, accountId));
  const policies = lastPol?.day ? await db.select().from(adsAdGroupPolicyDaily).where(and(eq(adsAdGroupPolicyDaily.accountId, accountId), eq(adsAdGroupPolicyDaily.day, lastPol.day))) : [];
  const landing = await db.select().from(adsLandingUrls).where(eq(adsLandingUrls.accountId, accountId));
  const changes = await db.select().from(adsChangeEvents).where(and(eq(adsChangeEvents.accountId, accountId), gte(adsChangeEvents.changeAt, changesSince)));
  const conv = await db
    .select({ action: adsDailyConversion.conversionAction, day: adsDailyConversion.day, v: sql<string>`sum(${adsDailyConversion.conversionsByConvDate})` })
    .from(adsDailyConversion)
    .where(and(eq(adsDailyConversion.accountId, accountId), gte(adsDailyConversion.day, from)))
    .groupBy(adsDailyConversion.conversionAction, adsDailyConversion.day);
  const actions = await db.select().from(adsConversionActions).where(eq(adsConversionActions.accountId, accountId));
  return {
    campaigns: camps.map((c) => ({ nativeId: c.nativeId, name: c.name, status: c.status, servingStatus: c.servingStatus, channelType: c.channelType, budgetNativeId: c.budgetNativeId, startDate: c.startDate, endDate: c.endDate, adSchedule: c.adSchedule ?? null })),
    budgets: budgets.map((b) => ({ nativeId: b.nativeId, amount: nOrNull(b.amount), period: b.period, status: b.status })),
    daily: daily.map((d) => ({ campaignNativeId: nativeOf.get(d.campaignId) ?? d.campaignId, day: d.day, cost: n(d.cost), impressions: n(d.impressions), clicks: n(d.clicks), conversions: n(d.conversions) })),
    covered: new Set(cov.map((c) => c.day)),
    hourly: hourly.map((h) => ({ campaignNativeId: nativeOf.get(h.campaignId) ?? h.campaignId, day: h.day, hour: h.hour, impressions: n(h.impressions), clicks: n(h.clicks), cost: n(h.cost), conversions: n(h.conversions) })),
    policies: policies.map((p) => ({ campaignNativeId: p.campaignId ? (nativeOf.get(p.campaignId) ?? null) : null, adGroupNativeId: p.adGroupNativeId, name: p.name, status: p.adGroupStatus, entityKind: p.entityKind, adsTotal: p.adsTotal, adsApproved: p.adsApproved, adsDisapproved: p.adsDisapproved, keywordsDisapproved: p.keywordsDisapproved })),
    landing: landing.map((l) => ({ url: l.url, urlNormalized: l.urlNormalized, cost7d: n(l.cost7d), clicks7d: n(l.clicks7d), lastCheckAt: l.lastCheckAt, lastCheckStatus: l.lastCheckStatus, lastCheckOk: l.lastCheckOk, consecutiveFailures: l.consecutiveFailures, campaignNativeIds: l.campaignNativeIds ?? [] })),
    changes: changes.map((c) => ({ changeAt: c.changeAt, userEmail: c.userEmail, actorClass: c.actorClass, clientType: c.clientType, resourceType: c.resourceType, campaignNativeId: c.campaignNativeId, operation: c.operation, changedFields: c.changedFields ?? [], newValue: c.newValue ?? null })),
    conversions: conv.map((c) => ({ conversionAction: c.action, day: c.day, conversionsByConvDate: n(c.v) })),
    actions: actions.map((a) => ({ resourceName: a.resourceName, name: a.name, primaryForGoal: a.primaryForGoal, includeInConversions: a.includeInConversions, status: a.status }))
  };
}

/** Id interno de una campaña por su id nativo. */
export async function campaignInternalIds(accountId: string): Promise<Map<string, string>> {
  const rows = await db.select({ id: adsCampaigns.id, nativeId: adsCampaigns.nativeId }).from(adsCampaigns).where(eq(adsCampaigns.accountId, accountId));
  return new Map(rows.map((r) => [r.nativeId, r.id]));
}

// --- Resultado de cada regla -------------------------------------------------------------------------------------------

export async function upsertRuleRun(tenantId: string, accountId: string | null, rule: string, outcome: string, reason: string | null, dataThrough: string | null, at: Date): Promise<void> {
  const scopeKey = accountId ?? '';
  const values = { tenantId, scopeKey, accountId, rule, outcome, reason: reason?.slice(0, 1000) ?? null, dataThrough, evaluatedAt: at };
  await db.insert(adsRuleRuns).values(values).onConflictDoUpdate({ target: [adsRuleRuns.tenantId, adsRuleRuns.scopeKey, adsRuleRuns.rule], set: { outcome, reason: values.reason, dataThrough, evaluatedAt: at, accountId } });
}

export type RuleRunRow = typeof adsRuleRuns.$inferSelect;
export async function listRuleRuns(tenantId: string, accountId?: string): Promise<RuleRunRow[]> {
  return db
    .select()
    .from(adsRuleRuns)
    .where(and(eq(adsRuleRuns.tenantId, tenantId), accountId ? eq(adsRuleRuns.scopeKey, accountId) : sql`true`));
}

// --- Hallazgos ---------------------------------------------------------------------------------------------------------

export type FindingRow = typeof adsFindings.$inferSelect;

/** Hallazgos vivos (abiertos o silenciados) de una cuenta; con `accountId` null, los de agencia. */
export async function liveFindings(tenantId: string, accountId: string | null): Promise<FindingRow[]> {
  return db
    .select()
    .from(adsFindings)
    .where(and(eq(adsFindings.tenantId, tenantId), accountId ? eq(adsFindings.accountId, accountId) : isNull(adsFindings.accountId), inArray(adsFindings.status, ['abierto', 'silenciado'])));
}

/** ¿Hay un descarte vigente de esa causa? («el cliente lo quiere así» o «no es un problema» con su caducidad). */
export async function activeDiscard(tenantId: string, causeKey: string, now: Date): Promise<boolean> {
  const [r] = await db
    .select({ id: adsFindings.id })
    .from(adsFindings)
    .where(and(eq(adsFindings.tenantId, tenantId), eq(adsFindings.causeKey, causeKey), eq(adsFindings.status, 'descartado'), gte(adsFindings.silencedUntil, now)))
    .limit(1);
  return Boolean(r);
}

export async function insertFinding(values: typeof adsFindings.$inferInsert): Promise<string | null> {
  // El índice único parcial (tenant, causa) entre los vivos evita duplicados si dos evaluaciones coinciden.
  const rows = await db.insert(adsFindings).values(values).onConflictDoNothing().returning({ id: adsFindings.id });
  return rows[0]?.id ?? null;
}

export async function updateFinding(tenantId: string, id: string, patch: Partial<typeof adsFindings.$inferInsert>): Promise<void> {
  await db.update(adsFindings).set(patch).where(and(eq(adsFindings.tenantId, tenantId), eq(adsFindings.id, id)));
}

export async function getFinding(tenantId: string, id: string): Promise<FindingRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [r] = await db.select().from(adsFindings).where(and(eq(adsFindings.tenantId, tenantId), eq(adsFindings.id, id))).limit(1);
  return r ?? null;
}

export type FindingListRow = FindingRow & { accountName: string | null; customerId: string | null; simulated: boolean | null; clientId: string | null; campaignName: string | null };

/** Hallazgos para las pantallas: vivos (y los resueltos o descartados de los últimos `recentDays` si se piden). */
export async function listFindings(tenantId: string, opts: { accountId?: string; includeClosedDays?: number } = {}): Promise<FindingListRow[]> {
  const live = inArray(adsFindings.status, ['abierto', 'silenciado']);
  const status = opts.includeClosedDays ? or(live, gte(adsFindings.lastSeenAt, new Date(Date.now() - opts.includeClosedDays * 86_400_000))) : live;
  const rows = await db
    .select({ f: adsFindings, accountName: adsAccounts.name, customerId: adsAccounts.customerId, simulated: adsAccounts.simulated, clientId: adsAccounts.clientId, campaignName: adsCampaigns.name })
    .from(adsFindings)
    .leftJoin(adsAccounts, eq(adsAccounts.id, adsFindings.accountId))
    .leftJoin(adsCampaigns, eq(adsCampaigns.id, adsFindings.campaignId))
    .where(and(eq(adsFindings.tenantId, tenantId), opts.accountId ? eq(adsFindings.accountId, opts.accountId) : sql`true`, status))
    .orderBy(desc(adsFindings.firstSeenAt))
    .limit(500);
  return rows.map((r) => ({ ...r.f, accountName: r.accountName, customerId: r.customerId, simulated: r.simulated, clientId: r.clientId, campaignName: r.campaignName }));
}

/** Interrupciones abiertas aún sin avisar (para la tarea de avisos). */
export async function pendingInterruptions(tenantId: string): Promise<(FindingRow & { simulated: boolean | null; accountName: string | null })[]> {
  const rows = await db
    .select({ f: adsFindings, simulated: adsAccounts.simulated, accountName: adsAccounts.name })
    .from(adsFindings)
    .leftJoin(adsAccounts, eq(adsAccounts.id, adsFindings.accountId))
    .where(and(eq(adsFindings.tenantId, tenantId), eq(adsFindings.status, 'abierto'), eq(adsFindings.channel, 'interrupcion'), isNull(adsFindings.notifyState)))
    .orderBy(asc(adsFindings.firstSeenAt));
  return rows.map((r) => ({ ...r.f, simulated: r.simulated, accountName: r.accountName }));
}

// --- Respuestas del gestor ---------------------------------------------------------------------------------------------

export async function insertResponse(values: typeof adsFindingResponses.$inferInsert): Promise<void> {
  await db.insert(adsFindingResponses).values(values);
}

export async function countResponses(findingId: string, response: string): Promise<number> {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(adsFindingResponses).where(and(eq(adsFindingResponses.findingId, findingId), eq(adsFindingResponses.response, response)));
  return Number(r?.n ?? 0);
}

export type ResponseRow = { findingId: string; response: string; reason: string | null; until: string | null; createdAt: Date; userName: string | null };
export async function responsesFor(tenantId: string, findingIds: string[]): Promise<ResponseRow[]> {
  if (!findingIds.length) return [];
  return db
    .select({ findingId: adsFindingResponses.findingId, response: adsFindingResponses.response, reason: adsFindingResponses.reason, until: adsFindingResponses.until, createdAt: adsFindingResponses.createdAt, userName: sql<string | null>`coalesce(${users.name}, ${users.email})` })
    .from(adsFindingResponses)
    .leftJoin(users, eq(users.id, adsFindingResponses.userId))
    .where(and(eq(adsFindingResponses.tenantId, tenantId), inArray(adsFindingResponses.findingId, findingIds)))
    .orderBy(asc(adsFindingResponses.createdAt));
}

// --- Revisiones de cuenta ----------------------------------------------------------------------------------------------

export async function insertReview(values: typeof adsAccountReviews.$inferInsert): Promise<void> {
  await db.insert(adsAccountReviews).values(values);
}

export type ReviewRow = { accountId: string; note: string | null; reviewedAt: Date; nextReviewOn: string | null; reviewer: string | null };
export async function listReviews(tenantId: string, accountId?: string, limit = 50): Promise<ReviewRow[]> {
  return db
    .select({ accountId: adsAccountReviews.accountId, note: adsAccountReviews.note, reviewedAt: adsAccountReviews.reviewedAt, nextReviewOn: adsAccountReviews.nextReviewOn, reviewer: sql<string | null>`coalesce(${users.name}, ${users.email})` })
    .from(adsAccountReviews)
    .leftJoin(users, eq(users.id, adsAccountReviews.reviewedBy))
    .where(and(eq(adsAccountReviews.tenantId, tenantId), accountId ? eq(adsAccountReviews.accountId, accountId) : sql`true`))
    .orderBy(desc(adsAccountReviews.reviewedAt))
    .limit(limit);
}

/** Última revisión de cada cuenta. */
export async function lastReviews(tenantId: string): Promise<Map<string, ReviewRow>> {
  const rows = await db.execute<{ account_id: string; note: string | null; reviewed_at: Date; next_review_on: string | null; reviewer: string | null }>(sql`
    SELECT DISTINCT ON (r.account_id) r.account_id, r.note, r.reviewed_at, r.next_review_on::text AS next_review_on, coalesce(u.name, u.email) AS reviewer
    FROM ads_account_reviews r LEFT JOIN users u ON u.id = r.reviewed_by
    WHERE r.tenant_id = ${tenantId}
    ORDER BY r.account_id, r.reviewed_at DESC`);
  return new Map([...rows].map((r) => [r.account_id, { accountId: r.account_id, note: r.note, reviewedAt: new Date(r.reviewed_at), nextReviewOn: r.next_review_on, reviewer: r.reviewer }]));
}

// --- Objetivos (ads_goals) ---------------------------------------------------------------------------------------------

export type GoalRow = typeof adsGoals.$inferSelect;
export async function latestGoal(tenantId: string, clientId: string): Promise<GoalRow | null> {
  const [r] = await db.select().from(adsGoals).where(and(eq(adsGoals.tenantId, tenantId), eq(adsGoals.clientId, clientId))).orderBy(desc(adsGoals.version)).limit(1);
  return r ?? null;
}

export async function latestGoals(tenantId: string): Promise<Map<string, GoalRow>> {
  const rows = await db.select().from(adsGoals).where(eq(adsGoals.tenantId, tenantId)).orderBy(asc(adsGoals.version));
  return new Map(rows.map((r) => [r.clientId, r]));
}

export async function insertGoal(values: typeof adsGoals.$inferInsert): Promise<void> {
  await db.insert(adsGoals).values(values);
}

// --- Datos diarios de las cuentas de un cliente (objetivo provisional) ------------------------------------------------

export async function dailyTotalsByAccount(accountIds: string[], from: string, to: string): Promise<{ accountId: string; day: string; cost: number; conversions: number; clicks: number }[]> {
  if (!accountIds.length) return [];
  const rows = await db
    .select({ accountId: adsDailyCampaign.accountId, day: adsDailyCampaign.day, cost: sql<string>`sum(${adsDailyCampaign.cost})`, conversions: sql<string>`sum(coalesce(${adsDailyCampaign.conversions}, 0))`, clicks: sql<string>`sum(${adsDailyCampaign.clicks})` })
    .from(adsDailyCampaign)
    .where(and(inArray(adsDailyCampaign.accountId, accountIds), gte(adsDailyCampaign.day, from), lte(adsDailyCampaign.day, to)))
    .groupBy(adsDailyCampaign.accountId, adsDailyCampaign.day);
  return rows.map((r) => ({ accountId: r.accountId, day: r.day, cost: n(r.cost), conversions: n(r.conversions), clicks: n(r.clicks) }));
}

/** Cuentas vinculadas a un cliente. */
export async function accountsOfClient(tenantId: string, clientId: string): Promise<(typeof adsAccounts.$inferSelect)[]> {
  return db.select().from(adsAccounts).where(and(eq(adsAccounts.tenantId, tenantId), eq(adsAccounts.clientId, clientId)));
}

/** Coberturas de una lista de cuentas en un tramo (días completos). */
export async function coveredDaysByAccount(accountIds: string[], from: string, to: string): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (!accountIds.length) return out;
  const rows = await db
    .select({ accountId: adsDailyCoverage.accountId, day: adsDailyCoverage.day })
    .from(adsDailyCoverage)
    .where(and(inArray(adsDailyCoverage.accountId, accountIds), gte(adsDailyCoverage.day, from), lte(adsDailyCoverage.day, to), eq(adsDailyCoverage.complete, true)));
  for (const r of rows) (out.get(r.accountId) ?? out.set(r.accountId, new Set()).get(r.accountId)!).add(r.day);
  return out;
}

/** Último cambio de cada cuenta con su autor. */
export async function lastChangeByAccount(tenantId: string): Promise<Map<string, { changeAt: Date; userEmail: string | null; actorClass: string; resourceType: string | null }>> {
  const rows = await db.execute<{ account_id: string; change_at: Date; user_email: string | null; actor_class: string; resource_type: string | null }>(sql`
    SELECT DISTINCT ON (account_id) account_id, change_at, user_email, actor_class, resource_type
    FROM ads_change_events WHERE tenant_id = ${tenantId}
    ORDER BY account_id, change_at DESC`);
  return new Map([...rows].map((r) => [r.account_id, { changeAt: new Date(r.change_at), userEmail: r.user_email, actorClass: r.actor_class, resourceType: r.resource_type }]));
}

/** Cambios de una cuenta (línea de tiempo del expediente). */
export async function changesOf(accountId: string, limit = 60): Promise<{ changeAt: Date; userEmail: string | null; actorClass: string; resourceType: string | null; operation: string | null; campaignNativeId: string | null; changedFields: string[] }[]> {
  const rows = await db
    .select({ changeAt: adsChangeEvents.changeAt, userEmail: adsChangeEvents.userEmail, actorClass: adsChangeEvents.actorClass, resourceType: adsChangeEvents.resourceType, operation: adsChangeEvents.operation, campaignNativeId: adsChangeEvents.campaignNativeId, changedFields: adsChangeEvents.changedFields })
    .from(adsChangeEvents)
    .where(eq(adsChangeEvents.accountId, accountId))
    .orderBy(desc(adsChangeEvents.changeAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, changedFields: r.changedFields ?? [] }));
}

// --- Páginas de destino (comprobación) --------------------------------------------------------------------------------

export async function landingToCheck(accountId: string, limit = 20): Promise<(typeof adsLandingUrls.$inferSelect)[]> {
  return db
    .select()
    .from(adsLandingUrls)
    .where(and(eq(adsLandingUrls.accountId, accountId), sql`${adsLandingUrls.cost7d} > 0`))
    .orderBy(desc(adsLandingUrls.cost7d))
    .limit(limit);
}

export async function updateLanding(id: string, patch: Partial<typeof adsLandingUrls.$inferInsert>): Promise<void> {
  await db.update(adsLandingUrls).set(patch).where(eq(adsLandingUrls.id, id));
}

// --- Estado de los avisos (en ads_settings.state, fusionado para no pisar otras claves) --------------------------------

export async function patchSettingsState(tenantId: string, patch: Record<string, unknown>): Promise<void> {
  await db.execute(sql`UPDATE ads_settings SET state = coalesce(state, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb, updated_at = now() WHERE tenant_id = ${tenantId}`);
}

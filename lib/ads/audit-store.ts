import 'server-only';

// Módulo Google Ads · lectura y escritura de la auditoría de higiene (paso 3; diseño §13.4). Sin lógica de negocio. Todo
// filtrado por tenant_id. La ficha del cliente se lee del núcleo (clients, client_locations, client_competitors) sin
// cambiarlo; la fecha de confirmación de cada dato vive en ads_client_facts (NEG-07).
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  adsAuditData,
  adsAuditItems,
  adsAudits,
  adsCampaigns,
  adsChangeEvents,
  adsClientFacts,
  adsConversionActions,
  adsDailyCampaign,
  adsDailyConversion,
  adsDailyCoverage,
  adsLandingUrls,
  clientCompetitors,
  clientLocations,
  clients,
  type AdsAuditDataRow,
  type AdsAuditItemRow,
  type AdsAuditRow
} from '@/lib/db/schema';
import type { AuditInput } from '@/lib/ads/audit-rules';
import type { FichaFact } from '@/lib/ads/audit-labels';

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

// --- Datos de la auditoría --------------------------------------------------------------------------------------------

export async function auditDataRows(tenantId: string, accountId: string): Promise<AdsAuditDataRow[]> {
  return db.select().from(adsAuditData).where(and(eq(adsAuditData.tenantId, tenantId), eq(adsAuditData.accountId, accountId)));
}

/** Guarda un grupo. Si falló, se conserva el dato anterior pero queda marcado «no ok» (los controles no afirman nada). */
export async function saveAuditData(tenantId: string, accountId: string, kind: string, r: { ok: boolean; error?: string | null; from?: string | null; to?: string | null; data?: unknown }, at: Date): Promise<void> {
  const base = { ok: r.ok, error: r.error?.slice(0, 1000) ?? null, syncedAt: at };
  const withData = r.ok ? { ...base, dataFrom: r.from ?? null, dataTo: r.to ?? null, data: r.data ?? [] } : base;
  await db
    .insert(adsAuditData)
    .values({ tenantId, accountId, kind, ...withData, ...(r.ok ? {} : { data: [] }) })
    .onConflictDoUpdate({ target: [adsAuditData.accountId, adsAuditData.kind], set: withData });
}

// --- Foto de la cuenta para los controles -------------------------------------------------------------------------------

export async function loadAuditBase(tenantId: string, accountId: string, from: string, changesSince: Date): Promise<Pick<AuditInput, 'campaigns' | 'daily' | 'covered' | 'actions' | 'conversions' | 'landing' | 'changes'>> {
  // Defensa en profundidad: la cuenta debe ser de esta cuenta de la herramienta (quien llama ya la leyó con su tenant).
  const camps = await db.select().from(adsCampaigns).where(and(eq(adsCampaigns.tenantId, tenantId), eq(adsCampaigns.accountId, accountId)));
  const nativeOf = new Map(camps.map((c) => [c.id, c.nativeId]));
  const daily = await db
    .select({ campaignId: adsDailyCampaign.campaignId, day: adsDailyCampaign.day, cost: adsDailyCampaign.cost, clicks: adsDailyCampaign.clicks, conversions: adsDailyCampaign.conversions })
    .from(adsDailyCampaign)
    .where(and(eq(adsDailyCampaign.accountId, accountId), gte(adsDailyCampaign.day, from)));
  const cov = await db.select({ day: adsDailyCoverage.day }).from(adsDailyCoverage).where(and(eq(adsDailyCoverage.accountId, accountId), gte(adsDailyCoverage.day, from), eq(adsDailyCoverage.complete, true)));
  const actions = await db.select().from(adsConversionActions).where(eq(adsConversionActions.accountId, accountId));
  const conv = await db
    .select({ action: adsDailyConversion.conversionAction, day: adsDailyConversion.day, v: sql<string>`sum(${adsDailyConversion.conversionsByConvDate})` })
    .from(adsDailyConversion)
    .where(and(eq(adsDailyConversion.accountId, accountId), gte(adsDailyConversion.day, from)))
    .groupBy(adsDailyConversion.conversionAction, adsDailyConversion.day);
  const landing = await db.select().from(adsLandingUrls).where(eq(adsLandingUrls.accountId, accountId));
  const changes = await db.select().from(adsChangeEvents).where(and(eq(adsChangeEvents.accountId, accountId), gte(adsChangeEvents.changeAt, changesSince)));
  return {
    campaigns: camps.map((c) => ({ nativeId: c.nativeId, name: c.name, status: c.status, channelType: c.channelType })),
    daily: daily.map((d) => ({ campaignNativeId: nativeOf.get(d.campaignId) ?? d.campaignId, day: d.day, cost: n(d.cost), clicks: n(d.clicks), conversions: n(d.conversions) })),
    covered: new Set(cov.map((c) => c.day)),
    actions: actions.map((a) => ({ resourceName: a.resourceName, name: a.name, category: a.category, primaryForGoal: a.primaryForGoal, includeInConversions: a.includeInConversions, status: a.status })),
    conversions: conv.map((c) => ({ conversionAction: c.action, day: c.day, conversionsByConvDate: n(c.v) })),
    landing: landing.map((l) => ({ url: l.url, urlNormalized: l.urlNormalized, origins: l.origins ?? [], cost7d: n(l.cost7d), campaignNativeIds: l.campaignNativeIds ?? [] })),
    changes: changes.map((c) => ({ changeAt: c.changeAt, userEmail: c.userEmail, actorClass: c.actorClass, clientType: c.clientType, resourceType: c.resourceType, campaignNativeId: c.campaignNativeId, changedFields: c.changedFields ?? [] }))
  };
}

// --- Ficha del cliente (núcleo, solo lectura) y su confirmación (NEG-07) ----------------------------------------------

export type ClientFichaRaw = {
  name: string;
  aliases: string[];
  area: string | null;
  offerings: string | null;
  sector: string | null;
  businessType: string | null;
  locations: { city: string | null; region: string | null; phone: string | null; hours: string | null }[];
  competitors: { name: string; domain: string | null }[];
  facts: Map<string, { confirmedAt: Date; by: string | null }>;
};

export async function loadClientFicha(tenantId: string, clientId: string): Promise<ClientFichaRaw | null> {
  const [c] = await db.select().from(clients).where(and(eq(clients.id, clientId), eq(clients.tenantId, tenantId))).limit(1);
  if (!c) return null;
  const locs = await db.select().from(clientLocations).where(and(eq(clientLocations.clientId, clientId), eq(clientLocations.tenantId, tenantId)));
  const comps = await db
    .select({ name: clientCompetitors.name, domain: clientCompetitors.domain })
    .from(clientCompetitors)
    .where(and(eq(clientCompetitors.clientId, clientId), eq(clientCompetitors.tenantId, tenantId), eq(clientCompetitors.status, 'confirmado')));
  const facts = await listFacts(tenantId, clientId);
  return {
    name: c.name,
    aliases: c.aliases ?? [],
    area: c.area,
    offerings: c.offerings,
    sector: c.sector,
    businessType: c.businessType,
    locations: locs.map((l) => ({ city: l.city, region: l.region, phone: l.phone, hours: l.hours })),
    competitors: comps,
    facts
  };
}

export async function listFacts(tenantId: string, clientId: string): Promise<Map<string, { confirmedAt: Date; by: string | null }>> {
  const rows = await db
    .select({ fact: adsClientFacts.fact, at: adsClientFacts.confirmedAt, by: sql<string | null>`(SELECT coalesce(u.name, u.email) FROM users u WHERE u.id = ${adsClientFacts.confirmedBy})` })
    .from(adsClientFacts)
    .where(and(eq(adsClientFacts.tenantId, tenantId), eq(adsClientFacts.clientId, clientId)));
  return new Map(rows.map((r) => [r.fact, { confirmedAt: r.at, by: r.by }]));
}

export async function confirmFact(tenantId: string, clientId: string, fact: FichaFact, userId: number | null, snapshot: string, at: Date): Promise<void> {
  await db
    .insert(adsClientFacts)
    .values({ tenantId, clientId, fact, confirmedAt: at, confirmedBy: userId, valueSnapshot: snapshot.slice(0, 2000) })
    .onConflictDoUpdate({ target: [adsClientFacts.clientId, adsClientFacts.fact], set: { confirmedAt: at, confirmedBy: userId, valueSnapshot: snapshot.slice(0, 2000) } });
}

// --- Auditorías y controles ---------------------------------------------------------------------------------------------

export async function currentAudit(tenantId: string, accountId: string): Promise<AdsAuditRow | null> {
  const [r] = await db
    .select()
    .from(adsAudits)
    .where(and(eq(adsAudits.tenantId, tenantId), eq(adsAudits.accountId, accountId), isNull(adsAudits.supersededAt)))
    .orderBy(desc(adsAudits.createdAt))
    .limit(1);
  return r ?? null;
}

export async function getAudit(tenantId: string, auditId: string): Promise<AdsAuditRow | null> {
  const [r] = await db.select().from(adsAudits).where(and(eq(adsAudits.tenantId, tenantId), eq(adsAudits.id, auditId))).limit(1);
  return r ?? null;
}

export async function listAudits(tenantId: string, accountId: string): Promise<AdsAuditRow[]> {
  return db.select().from(adsAudits).where(and(eq(adsAudits.tenantId, tenantId), eq(adsAudits.accountId, accountId))).orderBy(desc(adsAudits.createdAt));
}

/** Crea una auditoría con sus controles (y deja la anterior como sustituida), en una transacción. */
export async function createAudit(audit: typeof adsAudits.$inferInsert, items: Omit<typeof adsAuditItems.$inferInsert, 'auditId'>[], at: Date): Promise<string> {
  return db.transaction(async (tx) => {
    await tx
      .update(adsAudits)
      .set({ supersededAt: at })
      .where(and(eq(adsAudits.tenantId, audit.tenantId), eq(adsAudits.accountId, audit.accountId), isNull(adsAudits.supersededAt)));
    const [row] = await tx.insert(adsAudits).values(audit).returning({ id: adsAudits.id });
    if (items.length) await tx.insert(adsAuditItems).values(items.map((i) => ({ ...i, auditId: row.id })));
    return row.id;
  });
}

export async function updateAudit(tenantId: string, auditId: string, patch: Partial<typeof adsAudits.$inferInsert>): Promise<void> {
  await db.update(adsAudits).set(patch).where(and(eq(adsAudits.tenantId, tenantId), eq(adsAudits.id, auditId)));
}

export async function listItems(tenantId: string, auditId: string): Promise<AdsAuditItemRow[]> {
  return db.select().from(adsAuditItems).where(and(eq(adsAuditItems.tenantId, tenantId), eq(adsAuditItems.auditId, auditId))).orderBy(asc(adsAuditItems.tanda), asc(adsAuditItems.control));
}

export async function getItem(tenantId: string, itemId: string): Promise<AdsAuditItemRow | null> {
  const [r] = await db.select().from(adsAuditItems).where(and(eq(adsAuditItems.tenantId, tenantId), eq(adsAuditItems.id, itemId))).limit(1);
  return r ?? null;
}

export async function updateItem(tenantId: string, itemId: string, patch: Partial<typeof adsAuditItems.$inferInsert>): Promise<void> {
  await db.update(adsAuditItems).set(patch).where(and(eq(adsAuditItems.tenantId, tenantId), eq(adsAuditItems.id, itemId)));
}

/** Para Cartera: la auditoría vigente de cada cuenta con sus cuentas de «mal», «por confirmar» y «reapareció». */
export async function auditStatusByAccount(tenantId: string, accountIds: string[]): Promise<Map<string, { auditId: string; createdAt: Date; readAt: Date | null; mal: number; confirmar: number; regressed: number; pending: number }>> {
  if (!accountIds.length) return new Map();
  const rows = await db
    .select({
      accountId: adsAudits.accountId,
      auditId: adsAudits.id,
      createdAt: adsAudits.createdAt,
      readAt: adsAudits.readAt,
      mal: sql<number>`count(*) FILTER (WHERE ${adsAuditItems.status} = 'mal' AND NOT ${adsAuditItems.needsConfirmation})::int`,
      confirmar: sql<number>`count(*) FILTER (WHERE ${adsAuditItems.status} = 'mal' AND ${adsAuditItems.needsConfirmation})::int`,
      regressed: sql<number>`count(*) FILTER (WHERE ${adsAuditItems.status} = 'mal' AND ${adsAuditItems.regressedAt} IS NOT NULL)::int`,
      pending: sql<number>`count(*) FILTER (WHERE ${adsAuditItems.status} = 'mal' AND NOT ${adsAuditItems.needsConfirmation} AND (${adsAuditItems.response} IS NULL OR ${adsAuditItems.response} IN ('mas_tarde', 'hecho')))::int`
    })
    .from(adsAudits)
    .leftJoin(adsAuditItems, eq(adsAuditItems.auditId, adsAudits.id))
    .where(and(eq(adsAudits.tenantId, tenantId), inArray(adsAudits.accountId, accountIds), isNull(adsAudits.supersededAt)))
    .groupBy(adsAudits.accountId, adsAudits.id, adsAudits.createdAt, adsAudits.readAt);
  return new Map(rows.map((r) => [r.accountId, { auditId: r.auditId, createdAt: r.createdAt, readAt: r.readAt, mal: Number(r.mal), confirmar: Number(r.confirmar), regressed: Number(r.regressed), pending: Number(r.pending) }]));
}

/** Para el hallazgo 11: lo que reapareció hace poco en una cuenta, con el autor del cambio que lo explica. */
export async function recentRegressions(accountId: string, since: Date): Promise<{ control: string; title: string; actor: string | null; cause: string | null; campaignNativeIds: string[]; at: Date }[]> {
  const rows = await db
    .select()
    .from(adsAuditItems)
    .innerJoin(adsAudits, eq(adsAudits.id, adsAuditItems.auditId))
    .where(and(eq(adsAuditItems.accountId, accountId), isNull(adsAudits.supersededAt), eq(adsAuditItems.status, 'mal'), isNotNull(adsAuditItems.regressedAt), gte(adsAuditItems.regressedAt, since)));
  return rows.map(({ ads_audit_items: i }) => {
    const ev = (i.evidence ?? {}) as { campaignNativeIds?: string[]; regressionActor?: string | null };
    return { control: i.control, title: i.title, actor: ev.regressionActor ?? null, cause: i.regressionCause, campaignNativeIds: Array.isArray(ev.campaignNativeIds) ? ev.campaignNativeIds.map(String) : [], at: i.regressedAt! };
  });
}

import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { aiClusteringExamples, aiClusteringFeedback, aiIntentModifiers, aiJobs } from '@/lib/db/schema';
import { getAiJobsMonthlyTotals } from '@/lib/ai/queries';

// ai_intent_modifiers no tiene tenant_id (lib/db/schema.ts) — son patrones
// de idioma compartidos entre tenants, no datos propios de un tenant.
export async function getIntentModifiersStats() {
  const [row] = await db
    .select({
      total: sql<number>`count(*)`,
      humanConfirmed: sql<number>`count(*) filter (where ${aiIntentModifiers.source} = 'human_confirmed')`,
      aiClassified: sql<number>`count(*) filter (where ${aiIntentModifiers.source} = 'ai_classified')`,
      humanCorrected: sql<number>`count(*) filter (where ${aiIntentModifiers.source} = 'human_corrected')`,
    })
    .from(aiIntentModifiers);

  return {
    total: Number(row?.total ?? 0),
    humanConfirmed: Number(row?.humanConfirmed ?? 0),
    aiClassified: Number(row?.aiClassified ?? 0),
    humanCorrected: Number(row?.humanCorrected ?? 0),
  };
}

export async function getClusteringExamplesStats(tenantId: string) {
  const [row] = await db
    .select({ total: sql<number>`count(*)` })
    .from(aiClusteringExamples)
    .where(eq(aiClusteringExamples.tenantId, tenantId));

  return { total: Number(row?.total ?? 0) };
}

export async function getClusteringFeedbackStats(tenantId: string) {
  const [row] = await db
    .select({
      total: sql<number>`count(*)`,
      confirmed: sql<number>`count(*) filter (where ${aiClusteringFeedback.feedbackType} = 'confirmed')`,
      edited: sql<number>`count(*) filter (where ${aiClusteringFeedback.feedbackType} = 'edited')`,
      deleted: sql<number>`count(*) filter (where ${aiClusteringFeedback.feedbackType} = 'deleted')`,
      keywordMoved: sql<number>`count(*) filter (where ${aiClusteringFeedback.feedbackType} = 'keyword_moved')`,
      intentChanged: sql<number>`count(*) filter (where ${aiClusteringFeedback.feedbackType} = 'intent_changed')`,
    })
    .from(aiClusteringFeedback)
    .where(eq(aiClusteringFeedback.tenantId, tenantId));

  return {
    total: Number(row?.total ?? 0),
    confirmed: Number(row?.confirmed ?? 0),
    edited: Number(row?.edited ?? 0),
    deleted: Number(row?.deleted ?? 0),
    keywordMoved: Number(row?.keywordMoved ?? 0),
    intentChanged: Number(row?.intentChanged ?? 0),
  };
}

export type TokenUsageByFunction = {
  function: string;
  totalInput: number;
  totalOutput: number;
  totalTokens: number;
  totalCost: number;
  totalCalls: number;
  failedCalls: number;
};

export async function getTokenUsageByFunction(tenantId: string): Promise<TokenUsageByFunction[]> {
  const rows = await db
    .select({
      function: aiJobs.function,
      totalInput: sql<number>`coalesce(sum(${aiJobs.inputTokens}), 0)`,
      totalOutput: sql<number>`coalesce(sum(${aiJobs.outputTokens}), 0)`,
      totalTokens: sql<number>`coalesce(sum(coalesce(${aiJobs.inputTokens}, 0) + coalesce(${aiJobs.outputTokens}, 0)), 0)`,
      totalCost: sql<string>`coalesce(sum(${aiJobs.estimatedCost}), 0)`,
      totalCalls: sql<number>`count(*)`,
      failedCalls: sql<number>`count(*) filter (where ${aiJobs.status} = 'failed')`,
    })
    .from(aiJobs)
    .where(eq(aiJobs.tenantId, tenantId))
    .groupBy(aiJobs.function)
    .orderBy(desc(sql`coalesce(sum(${aiJobs.estimatedCost}), 0)`));

  return rows.map((r) => ({
    function: r.function,
    totalInput: Number(r.totalInput),
    totalOutput: Number(r.totalOutput),
    totalTokens: Number(r.totalTokens),
    totalCost: Number(r.totalCost),
    totalCalls: Number(r.totalCalls),
    failedCalls: Number(r.failedCalls),
  }));
}

// Mismo cálculo que getAiJobsMonthlyTotals() en lib/ai/queries.ts (ya
// usado por el monitor de uso de IA & Modelos) — se reutiliza en vez de
// duplicar la query, solo se renombra el campo "count" a "totalCalls"
// para que coincida con el resto de nombres de este archivo.
export async function getTokenUsageThisMonth(tenantId: string) {
  const totals = await getAiJobsMonthlyTotals(tenantId);
  return {
    totalTokens: totals.totalTokens,
    totalCost: totals.totalCost,
    totalCalls: totals.count,
  };
}

export type RecentAIJob = {
  id: string;
  function: string;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number;
  estimatedCost: number | null;
  status: string;
  createdAt: Date;
};

export async function getRecentAIJobs(tenantId: string, limit = 10): Promise<RecentAIJob[]> {
  const rows = await db
    .select({
      id: aiJobs.id,
      function: aiJobs.function,
      inputTokens: aiJobs.inputTokens,
      outputTokens: aiJobs.outputTokens,
      totalTokens: sql<number>`coalesce(${aiJobs.inputTokens}, 0) + coalesce(${aiJobs.outputTokens}, 0)`,
      estimatedCost: aiJobs.estimatedCost,
      status: aiJobs.status,
      createdAt: aiJobs.createdAt,
    })
    .from(aiJobs)
    .where(eq(aiJobs.tenantId, tenantId))
    .orderBy(desc(aiJobs.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    function: r.function,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    totalTokens: Number(r.totalTokens),
    estimatedCost: r.estimatedCost !== null ? Number(r.estimatedCost) : null,
    status: r.status,
    createdAt: r.createdAt,
  }));
}

import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { aiClusteringExamples, aiClusteringFeedback, aiIntentModifiers } from '@/lib/db/schema';

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

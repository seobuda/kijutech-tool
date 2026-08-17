import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  seoAuditFindings,
  seoKickoffAnswers,
  seoKnowledgeCards,
  seoOnboardingChecklist,
  seoSettings,
  seoStageProgress,
  type SeoKnowledgeCard
} from '@/lib/db/schema';

export async function getKnowledgeCardsByStage() {
  const cards = await db
    .select()
    .from(seoKnowledgeCards)
    .orderBy(asc(seoKnowledgeCards.stageKey), asc(seoKnowledgeCards.order));

  const grouped: Record<string, SeoKnowledgeCard[]> = {};
  for (const card of cards) {
    if (!grouped[card.stageKey]) {
      grouped[card.stageKey] = [];
    }
    grouped[card.stageKey].push(card);
  }

  return grouped;
}

export async function getKnowledgeCardById(id: string) {
  const [card] = await db
    .select()
    .from(seoKnowledgeCards)
    .where(eq(seoKnowledgeCards.id, id))
    .limit(1);

  return card ?? null;
}

export async function getStageProgress(projectId: string) {
  return db
    .select()
    .from(seoStageProgress)
    .where(eq(seoStageProgress.projectId, projectId));
}

export async function getKickoffAnswers(projectId: string) {
  return db
    .select()
    .from(seoKickoffAnswers)
    .where(eq(seoKickoffAnswers.projectId, projectId));
}

export async function getAuditFindings(projectId: string) {
  return db
    .select()
    .from(seoAuditFindings)
    .where(eq(seoAuditFindings.projectId, projectId));
}

export async function getOnboardingChecklist(projectId: string) {
  return db
    .select()
    .from(seoOnboardingChecklist)
    .where(eq(seoOnboardingChecklist.projectId, projectId));
}

export async function getAllSeoSettings() {
  return db.select().from(seoSettings).orderBy(asc(seoSettings.label));
}

export async function getSeoSettingValue(key: string) {
  const [setting] = await db
    .select({ value: seoSettings.value })
    .from(seoSettings)
    .where(eq(seoSettings.key, key))
    .limit(1);

  return setting?.value ?? null;
}

import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { seoKnowledgeCards, type SeoKnowledgeCard } from '@/lib/db/schema';

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

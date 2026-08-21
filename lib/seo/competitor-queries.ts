import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { seoClusterCompetitors, seoCompetitorAnalysis } from '@/lib/db/schema';
import type { ScrapedData } from './competitor-scraper';

export async function getCompetitorsByCluster(clusterId: string, tenantId: string) {
  return db
    .select()
    .from(seoClusterCompetitors)
    .where(
      and(
        eq(seoClusterCompetitors.clusterId, clusterId),
        eq(seoClusterCompetitors.tenantId, tenantId)
      )
    )
    .orderBy(asc(seoClusterCompetitors.position));
}

export async function upsertCompetitorUrl(data: {
  id?: string;
  clusterId: string;
  tenantId: string;
  url: string;
  position: number;
}) {
  if (data.id) {
    const [row] = await db
      .update(seoClusterCompetitors)
      .set({
        url: data.url,
        position: data.position,
        scrapeStatus: 'pending',
        scrapedAt: null,
        rawScrapedData: null,
      })
      .where(
        and(eq(seoClusterCompetitors.id, data.id), eq(seoClusterCompetitors.tenantId, data.tenantId))
      )
      .returning();
    return row ?? null;
  }

  const [row] = await db
    .insert(seoClusterCompetitors)
    .values({
      clusterId: data.clusterId,
      tenantId: data.tenantId,
      url: data.url,
      position: data.position,
    })
    .returning();
  return row;
}

export async function deleteCompetitorUrl(id: string, tenantId: string) {
  await db
    .delete(seoClusterCompetitors)
    .where(and(eq(seoClusterCompetitors.id, id), eq(seoClusterCompetitors.tenantId, tenantId)));
}

export async function updateScrapeResult(
  id: string,
  status: 'pending' | 'scraping' | 'done' | 'failed',
  data: ScrapedData | { error: string } | null
) {
  await db
    .update(seoClusterCompetitors)
    .set({
      scrapeStatus: status,
      scrapedAt: status === 'done' || status === 'failed' ? new Date() : null,
      rawScrapedData: data,
    })
    .where(eq(seoClusterCompetitors.id, id));
}

export async function getCompetitorAnalysis(clusterId: string, tenantId: string) {
  const [row] = await db
    .select()
    .from(seoCompetitorAnalysis)
    .where(
      and(
        eq(seoCompetitorAnalysis.clusterId, clusterId),
        eq(seoCompetitorAnalysis.tenantId, tenantId)
      )
    )
    .orderBy(desc(seoCompetitorAnalysis.createdAt))
    .limit(1);

  return row ?? null;
}

export async function saveCompetitorAnalysis(data: {
  clusterId: string;
  tenantId: string;
  analysisJson: unknown;
  modelUsed?: string | null;
  tokensUsed?: number | null;
  costEstimate?: string | null;
}) {
  const [row] = await db.insert(seoCompetitorAnalysis).values(data).returning();
  return row;
}

export async function deleteCompetitorAnalysis(clusterId: string, tenantId: string) {
  await db
    .delete(seoCompetitorAnalysis)
    .where(
      and(
        eq(seoCompetitorAnalysis.clusterId, clusterId),
        eq(seoCompetitorAnalysis.tenantId, tenantId)
      )
    );
}

import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  seoKwClusterKeywords,
  seoKwClusters,
  seoKwCompetitors,
  seoKwProgress,
  seoKwRaw,
  seoShareTokens,
  type SeoKwCluster,
  type SeoKwClusterKeyword
} from '@/lib/db/schema';

export async function getKwCompetitors(projectId: string) {
  return db
    .select()
    .from(seoKwCompetitors)
    .where(eq(seoKwCompetitors.projectId, projectId))
    .orderBy(asc(seoKwCompetitors.order), asc(seoKwCompetitors.createdAt));
}

export async function getKwProgress(projectId: string) {
  return db
    .select()
    .from(seoKwProgress)
    .where(eq(seoKwProgress.projectId, projectId));
}

export async function getKwStepProgress(projectId: string, step: string) {
  const [row] = await db
    .select()
    .from(seoKwProgress)
    .where(and(eq(seoKwProgress.projectId, projectId), eq(seoKwProgress.step, step)))
    .limit(1);

  return row ?? null;
}

export async function getKwTargetKeyword(projectId: string) {
  const progress = await getKwStepProgress(projectId, 'competitors');
  return progress?.targetKeyword ?? null;
}

export async function getKwRaw(projectId: string) {
  return db
    .select()
    .from(seoKwRaw)
    .where(eq(seoKwRaw.projectId, projectId))
    .orderBy(desc(seoKwRaw.createdAt));
}

export async function getKwRawStats(projectId: string) {
  const rows = await getKwRaw(projectId);
  const total = rows.length;
  const assigned = rows.filter((r) => r.assigned).length;

  return { total, assigned, unassigned: total - assigned };
}

export type SeoKwClusterWithKeywords = SeoKwCluster & {
  keywords: SeoKwClusterKeyword[];
};

function sortClusterKeywords(keywords: SeoKwClusterKeyword[]) {
  return [...keywords].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) {
      return a.isPrimary ? -1 : 1;
    }
    return (b.monthlyVolume ?? 0) - (a.monthlyVolume ?? 0);
  });
}

export async function getKwClusters(
  projectId: string
): Promise<SeoKwClusterWithKeywords[]> {
  const clusters = await db
    .select()
    .from(seoKwClusters)
    .where(eq(seoKwClusters.projectId, projectId))
    .orderBy(asc(seoKwClusters.priority), asc(seoKwClusters.createdAt));

  if (clusters.length === 0) {
    return [];
  }

  const clusterIds = clusters.map((c) => c.id);
  const allKeywords = await db
    .select()
    .from(seoKwClusterKeywords)
    .where(inArray(seoKwClusterKeywords.clusterId, clusterIds));

  const keywordsByCluster = new Map<string, SeoKwClusterKeyword[]>();
  for (const kw of allKeywords) {
    if (!keywordsByCluster.has(kw.clusterId)) {
      keywordsByCluster.set(kw.clusterId, []);
    }
    keywordsByCluster.get(kw.clusterId)!.push(kw);
  }

  return clusters.map((c) => ({
    ...c,
    keywords: sortClusterKeywords(keywordsByCluster.get(c.id) ?? [])
  }));
}

export async function getKwClusterById(
  id: string
): Promise<SeoKwClusterWithKeywords | null> {
  const [cluster] = await db
    .select()
    .from(seoKwClusters)
    .where(eq(seoKwClusters.id, id))
    .limit(1);

  if (!cluster) {
    return null;
  }

  const keywords = await db
    .select()
    .from(seoKwClusterKeywords)
    .where(eq(seoKwClusterKeywords.clusterId, id));

  return { ...cluster, keywords: sortClusterKeywords(keywords) };
}

export async function getShareToken(projectId: string) {
  const [row] = await db
    .select()
    .from(seoShareTokens)
    .where(eq(seoShareTokens.projectId, projectId))
    .limit(1);

  return row ?? null;
}

export async function getProjectIdByShareToken(token: string) {
  const [row] = await db
    .select({ projectId: seoShareTokens.projectId })
    .from(seoShareTokens)
    .where(eq(seoShareTokens.token, token))
    .limit(1);

  return row?.projectId ?? null;
}

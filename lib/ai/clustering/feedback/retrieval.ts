import { sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { aiClusteringExamples } from '@/lib/db/schema';
import type { ClusteringExample } from '../types';

const MIN_EXAMPLES_TO_SEARCH = 5;

function centroid(vectors: number[][]): number[] {
  const dims = vectors[0]?.length ?? 0;
  const sums = new Array(dims).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dims; i++) {
      sums[i] += v[i];
    }
  }
  return sums.map((s) => s / vectors.length);
}

export async function findSimilarExamples(
  groupEmbeddings: number[][],
  tenantId: string,
  limit: number = 5
): Promise<ClusteringExample[]> {
  if (groupEmbeddings.length === 0) {
    return [];
  }

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(aiClusteringExamples)
    .where(sql`${aiClusteringExamples.tenantId} = ${tenantId}`);

  if (Number(count) < MIN_EXAMPLES_TO_SEARCH) {
    return [];
  }

  const queryVector = `[${centroid(groupEmbeddings).join(',')}]`;

  const rows = await db
    .select({
      clusterTitle: aiClusteringExamples.clusterTitle,
      keywords: aiClusteringExamples.keywords,
      targetUrl: aiClusteringExamples.targetUrl,
      urlType: aiClusteringExamples.urlType,
      destination: aiClusteringExamples.destination,
      contentType: aiClusteringExamples.contentType,
      searchIntent: aiClusteringExamples.searchIntent,
    })
    .from(aiClusteringExamples)
    .where(
      sql`${aiClusteringExamples.tenantId} = ${tenantId} AND ${aiClusteringExamples.embedding} IS NOT NULL`
    )
    .orderBy(sql`${aiClusteringExamples.embedding} <=> ${queryVector}::vector`)
    .limit(limit);

  return rows.map((r) => ({
    clusterTitle: r.clusterTitle,
    keywords: Array.isArray(r.keywords)
      ? (r.keywords as Array<{ keyword: string }>).map((k) => k.keyword)
      : [],
    targetUrl: r.targetUrl,
    urlType: r.urlType,
    destination: r.destination,
    contentType: r.contentType,
    searchIntent: r.searchIntent,
  }));
}

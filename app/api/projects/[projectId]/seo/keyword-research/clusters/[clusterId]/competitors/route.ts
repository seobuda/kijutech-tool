import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { projects, seoKwClusters } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { getCompetitorsByCluster, getCompetitorAnalysis } from '@/lib/seo/competitor-queries';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; clusterId: string }> }
) {
  const { projectId, clusterId } = await params;

  const user = await getUser();
  if (!user) {
    return Response.json({ competitors: [], analysis: null }, { status: 401 });
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project || project.tenantId !== user.tenantId) {
    return Response.json({ competitors: [], analysis: null }, { status: 404 });
  }

  const [cluster] = await db
    .select()
    .from(seoKwClusters)
    .where(eq(seoKwClusters.id, clusterId))
    .limit(1);

  if (!cluster || cluster.projectId !== projectId) {
    return Response.json({ competitors: [], analysis: null }, { status: 404 });
  }

  const [competitors, analysis] = await Promise.all([
    getCompetitorsByCluster(clusterId, user.tenantId),
    getCompetitorAnalysis(clusterId, user.tenantId),
  ]);

  return Response.json({ competitors, analysis });
}

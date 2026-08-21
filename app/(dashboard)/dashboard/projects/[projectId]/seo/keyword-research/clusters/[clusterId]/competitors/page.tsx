import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getUser } from '@/lib/db/queries';
import { getKwClusterById } from '@/lib/seo/kw-queries';
import { getCompetitorsByCluster, getCompetitorAnalysis } from '@/lib/seo/competitor-queries';
import { CompetitorsPanel } from './competitors-panel';

export default async function ClusterCompetitorsPage({
  params,
}: {
  params: Promise<{ projectId: string; clusterId: string }>;
}) {
  const { projectId, clusterId } = await params;

  // La autenticación y el chequeo de tenant del proyecto ya los hace
  // app/(dashboard)/dashboard/projects/[projectId]/seo/layout.tsx, que
  // envuelve esta ruta — aquí solo hace falta el usuario para el tenantId
  // que exigen las queries (seo_cluster_competitors sí guarda tenant_id).
  const user = await getUser();
  if (!user) {
    notFound();
  }

  const cluster = await getKwClusterById(clusterId);
  if (!cluster || cluster.projectId !== projectId) {
    notFound();
  }

  const [competitors, analysis] = await Promise.all([
    getCompetitorsByCluster(clusterId, user.tenantId),
    getCompetitorAnalysis(clusterId, user.tenantId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/dashboard/projects/${projectId}/seo/keyword-research/clusters`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Volver a clusters
        </Link>
        <h2 className="text-lg font-medium mt-1">Competidores SERP</h2>
        <p className="text-sm text-muted-foreground">{cluster.title}</p>
      </div>
      <CompetitorsPanel
        projectId={projectId}
        clusterId={clusterId}
        initialCompetitors={competitors}
        initialAnalysis={analysis}
      />
    </div>
  );
}

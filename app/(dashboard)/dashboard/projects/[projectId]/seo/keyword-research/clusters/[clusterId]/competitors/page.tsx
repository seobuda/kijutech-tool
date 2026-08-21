import { notFound } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { getCompetitorsByCluster, getCompetitorAnalysis } from '@/lib/seo/competitor-queries';
import { CompetitorsPanel } from './competitors-panel';

export default async function ClusterCompetitorsPage({
  params,
}: {
  params: Promise<{ projectId: string; clusterId: string }>;
}) {
  const { projectId, clusterId } = await params;

  // La autenticación y el chequeo de tenant/existencia del cluster ya los
  // hace el layout de este segmento ([clusterId]/layout.tsx) — aquí solo
  // hace falta el usuario para el tenantId que exigen las queries
  // (seo_cluster_competitors sí guarda tenant_id).
  const user = await getUser();
  if (!user) {
    notFound();
  }

  const [competitors, analysis] = await Promise.all([
    getCompetitorsByCluster(clusterId, user.tenantId),
    getCompetitorAnalysis(clusterId, user.tenantId),
  ]);

  return (
    <CompetitorsPanel
      projectId={projectId}
      clusterId={clusterId}
      initialCompetitors={competitors}
      initialAnalysis={analysis}
    />
  );
}

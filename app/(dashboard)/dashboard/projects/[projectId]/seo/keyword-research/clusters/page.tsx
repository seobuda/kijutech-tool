import { ensureKwStepInProgress } from '@/lib/seo/kw-actions';
import { getKwClusters, getKwStepProgress, getShareToken } from '@/lib/seo/kw-queries';
import { ClustersBoard } from './clusters-board';

export default async function ClustersStepPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await ensureKwStepInProgress(projectId, 'clusters');

  const [clusters, progress, shareToken] = await Promise.all([
    getKwClusters(projectId),
    getKwStepProgress(projectId, 'clusters'),
    getShareToken(projectId)
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Paso 4 · Mapa de clusters</h2>
      </div>
      <ClustersBoard
        projectId={projectId}
        initialClusters={clusters}
        initialShareToken={shareToken?.token ?? null}
        stageStatus={progress?.status ?? 'pending'}
      />
    </div>
  );
}

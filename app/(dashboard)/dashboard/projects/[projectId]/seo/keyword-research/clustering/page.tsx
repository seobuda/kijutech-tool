import { ensureKwStepInProgress } from '@/lib/seo/kw-actions';
import { getKwStepProgress, getKwRaw, getKwClusters } from '@/lib/seo/kw-queries';
import { getSeoSettingValue } from '@/lib/seo/queries';
import { getUser } from '@/lib/db/queries';
import { getActiveProviderForTenant } from '@/lib/ai/queries';
import { ClusteringStepClient } from './clustering-step-client';

export default async function ClusteringStepPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await ensureKwStepInProgress(projectId, 'clustering');

  const user = await getUser();
  const [progress, keywordsProgress, tutorUrl, rawKeywords, existingClusters, activeProvider] =
    await Promise.all([
      getKwStepProgress(projectId, 'clustering'),
      getKwStepProgress(projectId, 'keywords'),
      getSeoSettingValue('tutor_url'),
      getKwRaw(projectId),
      getKwClusters(projectId),
      user ? getActiveProviderForTenant(user.tenantId) : Promise.resolve(null)
    ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Paso 3 · Clustering con IA</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Analiza tus keywords automáticamente con IA, o pega el texto en el
          Tutor Kijutech y sigue sus instrucciones manualmente. Cuando tengas
          los clusters definidos, continúa al mapa de clusters.
        </p>
      </div>
      <ClusteringStepClient
        projectId={projectId}
        activeProvider={activeProvider}
        keywordCount={rawKeywords.length}
        existingClustersCount={existingClusters.length}
        manualPanelProps={{
          tutorText: keywordsProgress?.tutorText ?? null,
          tutorUrl: tutorUrl ?? 'https://claude.ai',
          initialNotes: progress?.notes ?? '',
          stageStatus: progress?.status ?? 'pending'
        }}
      />
    </div>
  );
}

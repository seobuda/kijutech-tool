import { ensureKwStepInProgress } from '@/lib/seo/kw-actions';
import { getKwStepProgress } from '@/lib/seo/kw-queries';
import { getSeoSettingValue } from '@/lib/seo/queries';
import { ClusteringPanel } from './clustering-panel';

export default async function ClusteringStepPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await ensureKwStepInProgress(projectId, 'clustering');

  const [progress, keywordsProgress, tutorUrl] = await Promise.all([
    getKwStepProgress(projectId, 'clustering'),
    getKwStepProgress(projectId, 'keywords'),
    getSeoSettingValue('tutor_url')
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Paso 3 · Clustering con IA</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Pega el texto en el Tutor Kijutech y sigue sus instrucciones.
          Cuando tengas los clusters definidos por la IA, vuelve aquí y
          marca este paso como completado para continuar al mapa de
          clusters.
        </p>
      </div>
      <ClusteringPanel
        projectId={projectId}
        tutorText={keywordsProgress?.tutorText ?? null}
        tutorUrl={tutorUrl ?? 'https://claude.ai'}
        initialNotes={progress?.notes ?? ''}
        stageStatus={progress?.status ?? 'pending'}
      />
    </div>
  );
}

import { ensureKwStepInProgress } from '@/lib/seo/kw-actions';
import { getKwCompetitors, getKwStepProgress } from '@/lib/seo/kw-queries';
import { CompetitorsPanel } from './competitors-panel';

export default async function CompetitorsStepPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await ensureKwStepInProgress(projectId, 'competitors');

  const [competitors, progress] = await Promise.all([
    getKwCompetitors(projectId),
    getKwStepProgress(projectId, 'competitors')
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">
          Paso 1 · Análisis de competidores
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Busca esta keyword en Google en modo incógnito. Anota los 3
          primeros resultados orgánicos (ignora anuncios y mapas).
        </p>
      </div>
      <CompetitorsPanel
        projectId={projectId}
        initialCompetitors={competitors}
        initialTargetKeyword={progress?.targetKeyword ?? ''}
        initialInstructions={progress?.instructionsText ?? null}
        stageStatus={progress?.status ?? 'pending'}
      />
    </div>
  );
}

import { ensureKwStepInProgress } from '@/lib/seo/kw-actions';
import { getKwRaw, getKwStepProgress } from '@/lib/seo/kw-queries';
import { KeywordsPanel } from './keywords-panel';

export default async function KeywordsStepPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await ensureKwStepInProgress(projectId, 'keywords');

  const [rawKeywords, progress, competitorsProgress] = await Promise.all([
    getKwRaw(projectId),
    getKwStepProgress(projectId, 'keywords'),
    getKwStepProgress(projectId, 'competitors')
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium">Paso 2 · Extracción de keywords</h2>
      </div>
      <KeywordsPanel
        projectId={projectId}
        initialRawKeywords={rawKeywords}
        instructions={competitorsProgress?.instructionsText ?? null}
        initialTutorText={progress?.tutorText ?? null}
        stageStatus={progress?.status ?? 'pending'}
      />
    </div>
  );
}

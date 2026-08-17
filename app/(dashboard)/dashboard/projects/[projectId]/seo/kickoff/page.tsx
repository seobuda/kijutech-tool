import { getKickoffAnswers, getStageProgress } from '@/lib/seo/queries';
import { ensureStageInProgress } from '@/lib/seo/actions';
import { KickoffForm } from './kickoff-form';

export default async function KickoffStagePage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await ensureStageInProgress(projectId, 'kickoff');

  const existingAnswers = await getKickoffAnswers(projectId);
  const progress = await getStageProgress(projectId);
  const stageStatus =
    progress.find((p) => p.stageKey === 'kickoff')?.status ?? 'pending';

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium">Kickoff</h2>
      <KickoffForm
        projectId={projectId}
        existingAnswers={existingAnswers}
        stageStatus={stageStatus}
      />
    </div>
  );
}

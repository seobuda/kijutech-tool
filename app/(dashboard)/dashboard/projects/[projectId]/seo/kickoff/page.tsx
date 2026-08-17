import { getKnowledgeCardsByStage, getKickoffAnswers } from '@/lib/seo/queries';
import { ensureStageInProgress } from '@/lib/seo/actions';
import { SeoStageLayout } from '../seo-stage-layout';
import { KickoffForm } from './kickoff-form';

export default async function KickoffStagePage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await ensureStageInProgress(projectId, 'kickoff');

  const cardsByStage = await getKnowledgeCardsByStage();
  const cards = cardsByStage['kickoff'] ?? [];
  const existingAnswers = await getKickoffAnswers(projectId);

  return (
    <SeoStageLayout cards={cards}>
      <h2 className="text-lg font-medium">Kickoff</h2>
      <KickoffForm projectId={projectId} existingAnswers={existingAnswers} />
    </SeoStageLayout>
  );
}

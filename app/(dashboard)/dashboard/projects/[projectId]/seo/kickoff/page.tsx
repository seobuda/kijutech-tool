import { getKnowledgeCardsByStage, getKickoffAnswers } from '@/lib/seo/queries';
import { ensureStageInProgress } from '@/lib/seo/actions';
import { KnowledgeCardsSection } from '../knowledge-cards-section';
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
    <div className="space-y-6">
      <h2 className="text-lg font-medium">Kickoff</h2>
      <KnowledgeCardsSection cards={cards} />
      <KickoffForm projectId={projectId} existingAnswers={existingAnswers} />
    </div>
  );
}

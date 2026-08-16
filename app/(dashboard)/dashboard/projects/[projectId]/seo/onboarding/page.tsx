import { getKnowledgeCardsByStage } from '@/lib/seo/queries';
import { ensureStageInProgress } from '@/lib/seo/actions';
import { KnowledgeCardsSection } from '../knowledge-cards-section';
import { OnboardingChecklist } from './onboarding-checklist';

export default async function OnboardingStagePage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await ensureStageInProgress(projectId, 'onboarding');

  const cardsByStage = await getKnowledgeCardsByStage();
  const cards = cardsByStage['onboarding'] ?? [];

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium">Onboarding y Medición</h2>
      <KnowledgeCardsSection cards={cards} />
      <OnboardingChecklist projectId={projectId} />
    </div>
  );
}

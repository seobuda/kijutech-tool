import { getKnowledgeCardsByStage, getOnboardingChecklist, getStageProgress } from '@/lib/seo/queries';
import { ensureStageInProgress } from '@/lib/seo/actions';
import { SeoStageLayout } from '../seo-stage-layout';
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
  const initialChecklist = await getOnboardingChecklist(projectId);
  const progress = await getStageProgress(projectId);
  const stageStatus =
    progress.find((p) => p.stageKey === 'onboarding')?.status ?? 'pending';

  return (
    <SeoStageLayout cards={cards}>
      <h2 className="text-lg font-medium">Onboarding y Medición</h2>
      <OnboardingChecklist
        projectId={projectId}
        initialChecklist={initialChecklist}
        stageStatus={stageStatus}
      />
    </SeoStageLayout>
  );
}

import { getOnboardingChecklist, getStageProgress } from '@/lib/seo/queries';
import { ensureOnboardingInitialized } from '@/lib/seo/actions';
import { OnboardingChecklist } from './onboarding-checklist';

export default async function OnboardingStagePage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await ensureOnboardingInitialized(projectId);

  const initialChecklist = await getOnboardingChecklist(projectId);
  const progress = await getStageProgress(projectId);
  const stageStatus =
    progress.find((p) => p.stageKey === 'onboarding')?.status ?? 'pending';

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium">Onboarding y Medición</h2>
      <OnboardingChecklist
        projectId={projectId}
        initialChecklist={initialChecklist}
        stageStatus={stageStatus}
      />
    </div>
  );
}

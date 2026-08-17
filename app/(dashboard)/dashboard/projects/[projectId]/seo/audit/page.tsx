import { getAuditFindings, getStageProgress } from '@/lib/seo/queries';
import { ensureStageInProgress } from '@/lib/seo/actions';
import { AuditForm } from './audit-form';

export default async function AuditStagePage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await ensureStageInProgress(projectId, 'audit');

  const existingFindings = await getAuditFindings(projectId);
  const progress = await getStageProgress(projectId);
  const stageStatus =
    progress.find((p) => p.stageKey === 'audit')?.status ?? 'pending';

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-medium">Radiografía Inicial</h2>
      <AuditForm
        projectId={projectId}
        existingFindings={existingFindings}
        stageStatus={stageStatus}
      />
    </div>
  );
}

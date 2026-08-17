import { getKnowledgeCardsByStage, getAuditFindings } from '@/lib/seo/queries';
import { ensureStageInProgress } from '@/lib/seo/actions';
import { SeoStageLayout } from '../seo-stage-layout';
import { AuditForm } from './audit-form';

export default async function AuditStagePage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await ensureStageInProgress(projectId, 'audit');

  const cardsByStage = await getKnowledgeCardsByStage();
  const cards = cardsByStage['audit'] ?? [];
  const existingFindings = await getAuditFindings(projectId);

  return (
    <SeoStageLayout cards={cards}>
      <h2 className="text-lg font-medium">Radiografía Inicial</h2>
      <AuditForm projectId={projectId} existingFindings={existingFindings} />
    </SeoStageLayout>
  );
}

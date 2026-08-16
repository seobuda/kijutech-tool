import { getKnowledgeCardsByStage, getAuditFindings } from '@/lib/seo/queries';
import { ensureStageInProgress } from '@/lib/seo/actions';
import { KnowledgeCardsSection } from '../knowledge-cards-section';
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
    <div className="space-y-6">
      <h2 className="text-lg font-medium">Radiografía Inicial</h2>
      <KnowledgeCardsSection cards={cards} />
      <AuditForm projectId={projectId} existingFindings={existingFindings} />
    </div>
  );
}

import { getKnowledgeCardsByStage, getSeoSettingValue } from '@/lib/seo/queries';
import { getKwCompetitors, getKwProgress, getKwRawStats } from '@/lib/seo/kw-queries';
import { KwWizardShell } from './kw-wizard-shell';

export default async function KeywordResearchLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const [cardsByStage, tutorUrlSetting, progress, competitors, rawStats] =
    await Promise.all([
      getKnowledgeCardsByStage(),
      getSeoSettingValue('tutor_url'),
      getKwProgress(projectId),
      getKwCompetitors(projectId),
      getKwRawStats(projectId)
    ]);

  return (
    <KwWizardShell
      projectId={projectId}
      cards={cardsByStage['keyword_research'] ?? []}
      tutorUrl={tutorUrlSetting ?? 'https://claude.ai'}
      progress={progress}
      competitorsCount={competitors.length}
      rawCount={rawStats.total}
    >
      {children}
    </KwWizardShell>
  );
}

import { redirect, notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { projects } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { getSeoManifest } from '@/lib/seo/manifest';
import { getKnowledgeCardsByStage, getSeoSettingValue, getStageProgress } from '@/lib/seo/queries';
import { getKwCompetitors, getKwProgress, getKwRawStats } from '@/lib/seo/kw-queries';
import { SeoWizardShell } from './seo-wizard-shell';

export default async function SeoWizardLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    notFound();
  }

  if (project.tenantId !== user.tenantId) {
    redirect('/dashboard/projects');
  }

  const manifest = getSeoManifest();
  const [initialProgress, cardsByStage, tutorUrl, kwProgress, kwCompetitors, kwRawStats] =
    await Promise.all([
      getStageProgress(projectId),
      getKnowledgeCardsByStage(),
      getSeoSettingValue('tutor_url').then((v) => v ?? 'https://claude.ai'),
      getKwProgress(projectId),
      getKwCompetitors(projectId),
      getKwRawStats(projectId)
    ]);

  return (
    <section className="flex-1 p-4 lg:py-6 lg:px-0">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">Proyecto</p>
        <h1 className="text-lg lg:text-2xl font-medium">{project.name}</h1>
      </div>
      <SeoWizardShell
        projectId={projectId}
        stages={manifest.stages}
        initialProgress={initialProgress}
        cardsByStage={cardsByStage}
        tutorUrl={tutorUrl}
        kwSubStepsData={{
          initialProgress: kwProgress,
          competitorsCount: kwCompetitors.length,
          rawCount: kwRawStats.total
        }}
      >
        {children}
      </SeoWizardShell>
    </section>
  );
}

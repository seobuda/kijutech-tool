import { redirect, notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { projects } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { getSeoManifest } from '@/lib/seo/manifest';
import { SeoWizardNav } from './seo-wizard-nav';

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

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">Proyecto</p>
        <h1 className="text-lg lg:text-2xl font-medium">{project.name}</h1>
      </div>
      <div className="flex flex-col lg:flex-row gap-6">
        <SeoWizardNav projectId={projectId} stages={manifest.stages} />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </section>
  );
}

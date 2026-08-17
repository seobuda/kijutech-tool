import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { projects } from '@/lib/db/schema';
import { getKwClusters, getProjectIdByShareToken } from '@/lib/seo/kw-queries';
import { PublicClusterCard } from './public-cluster-card';
import { PublicTimeline } from './public-timeline';

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(date);
}

export default async function PublicKeywordResearchPage({
  params
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const projectId = await getProjectIdByShareToken(token);
  if (!projectId) {
    notFound();
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);

  if (!project) {
    notFound();
  }

  const allClusters = await getKwClusters(projectId);
  const visibleClusters = allClusters
    .filter((c) => c.status === 'active' || c.status === 'completed')
    .sort((a, b) => a.priority - b.priority);

  const lastUpdated = allClusters.reduce<Date | null>(
    (latest, c) => (!latest || c.createdAt > latest ? c.createdAt : latest),
    null
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-10">
          <p className="text-sm font-semibold tracking-wide text-orange-600 uppercase">
            Kijutech
          </p>
          <h1 className="text-2xl sm:text-3xl font-medium mt-2">
            {project.name}
          </h1>
          <p className="text-muted-foreground mt-1">
            {project.clientName ?? 'Estrategia de Keyword Research'}
            {lastUpdated && ` · Actualizado el ${formatDate(lastUpdated)}`}
          </p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12 space-y-16">
        <PublicTimeline clusters={visibleClusters} />

        <section>
          <h2 className="text-xl font-medium mb-6">Estrategia de contenidos</h2>
          {visibleClusters.length === 0 ? (
            <p className="text-muted-foreground">
              Todavía no hay clusters publicados.
            </p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {visibleClusters.map((cluster) => (
                <PublicClusterCard key={cluster.id} cluster={cluster} />
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-gray-200 bg-white py-8">
        <div className="max-w-6xl mx-auto px-6 text-center text-sm text-muted-foreground">
          Estrategia SEO desarrollada por Kijutech · {new Date().getFullYear()}
        </div>
      </footer>
    </div>
  );
}

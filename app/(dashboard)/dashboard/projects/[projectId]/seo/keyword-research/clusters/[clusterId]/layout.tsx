import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getKwClusterById } from '@/lib/seo/kw-queries';
import { ClusterTabs } from './cluster-tabs';

export default async function ClusterDetailLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string; clusterId: string }>;
}) {
  const { projectId, clusterId } = await params;

  const cluster = await getKwClusterById(clusterId);
  if (!cluster || cluster.projectId !== projectId) {
    notFound();
  }

  const basePath = `/dashboard/projects/${projectId}/seo/keyword-research/clusters/${clusterId}`;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/dashboard/projects/${projectId}/seo/keyword-research/clusters`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Volver a clusters
        </Link>
        <h2 className="text-lg font-medium mt-1">{cluster.title}</h2>
      </div>

      <ClusterTabs basePath={basePath} />

      {children}
    </div>
  );
}

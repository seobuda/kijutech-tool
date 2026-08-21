import { notFound } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { getContentPlan } from '@/lib/seo/content-plan-queries';
import { ContentPlanPanel } from './content-plan-panel';

export default async function ClusterContentPlanPage({
  params,
}: {
  params: Promise<{ projectId: string; clusterId: string }>;
}) {
  const { clusterId } = await params;

  // Mismo patrón que competitors/page.tsx: la autenticación y el chequeo
  // de tenant/existencia del cluster ya los hace el layout de este
  // segmento — aquí solo hace falta el usuario para el tenantId.
  const user = await getUser();
  if (!user) {
    notFound();
  }

  const plan = await getContentPlan(clusterId, user.tenantId);

  return <ContentPlanPanel clusterId={clusterId} initialPlan={plan} />;
}

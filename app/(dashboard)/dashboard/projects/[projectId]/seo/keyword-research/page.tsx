import { redirect } from 'next/navigation';
import { getKwProgress } from '@/lib/seo/kw-queries';
import { KW_STEPS } from '@/lib/seo/kw-steps';

export default async function KeywordResearchIndexPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const progress = await getKwProgress(projectId);
  const byStep = new Map(progress.map((p) => [p.step, p.status]));

  const nextStep =
    KW_STEPS.find((s) => byStep.get(s.key) !== 'completed') ??
    KW_STEPS[KW_STEPS.length - 1];

  redirect(`/dashboard/projects/${projectId}/seo/keyword-research/${nextStep.path}`);
}

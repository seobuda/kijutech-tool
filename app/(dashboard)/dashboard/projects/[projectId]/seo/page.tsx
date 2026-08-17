import { redirect } from 'next/navigation';

export default async function SeoWizardIndexPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  redirect(`/dashboard/projects/${projectId}/seo/onboarding`);
}

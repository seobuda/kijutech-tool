import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { getUser, getUserTenantRoleNames, getProjectsForUser } from '@/lib/db/queries';
import { getAiPrompt } from '@/lib/ai/queries';
import { PromptEditForm } from './prompt-edit-form';

export default async function PromptEditPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;

  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  const roleNames = await getUserTenantRoleNames(user.id);
  if (!roleNames.includes('super_admin')) {
    redirect('/dashboard');
  }

  const [prompt, projects] = await Promise.all([getAiPrompt(key), getProjectsForUser()]);

  if (!prompt) {
    notFound();
  }

  return (
    <section className="flex-1 p-4 lg:p-8 space-y-6">
      <div>
        <Link
          href="/dashboard/ai/settings"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-3"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a IA &amp; Modelos
        </Link>
        <h1 className="text-lg lg:text-2xl font-medium">Editar prompt</h1>
        <p className="text-sm text-muted-foreground">
          key: <code>{prompt.key}</code> (no editable)
        </p>
      </div>

      <PromptEditForm
        prompt={{
          key: prompt.key,
          name: prompt.name,
          description: prompt.description ?? '',
          systemPrompt: prompt.systemPrompt,
          userPromptTemplate: prompt.userPromptTemplate,
          isActive: prompt.isActive,
          version: prompt.version,
          updatedAt: prompt.updatedAt,
          updatedByLabel: prompt.updatedByName ?? prompt.updatedByEmail ?? '—',
        }}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      />
    </section>
  );
}

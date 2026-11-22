import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { getUser, getUserTenantRoleNames, getProjectsForUser } from '@/lib/db/queries';
import { getAiPrompt } from '@/lib/ai/queries';
import { PromptEditForm, type PromptExam } from './prompt-edit-form';
import { wireApp } from '@/lib/app-wiring';
import { evalState, getPromptEvalSuite, listPromptEvals } from '@/lib/ai/prompt-evals';

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

  // Examen del prompt, si tiene batería de referencia (los conecta wireApp).
  wireApp();
  const suite = getPromptEvalSuite(prompt.key);
  let exam: PromptExam | null = null;
  if (suite) {
    const runs = await listPromptEvals(prompt.key);
    exam = {
      state: evalState(prompt.version, runs),
      summary: suite.summary,
      costHint: suite.costHint,
      minScore: suite.minScore,
      runs: runs.map((r) => ({
        id: r.id,
        promptVersion: r.promptVersion,
        draft: r.draft,
        status: r.status,
        passedChecks: r.passedChecks,
        totalChecks: r.totalChecks,
        minScorePct: r.minScorePct,
        passed: r.passed,
        result: (r.result ?? {}) as PromptExam['runs'][number]['result'],
        error: r.error,
        costUsd: r.costUsd,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt
      }))
    };
  }

  return (
    <section className="mx-auto w-full max-w-[1400px] px-4 py-6 lg:px-8 lg:py-8 space-y-6">
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
        exam={exam}
      />
    </section>
  );
}

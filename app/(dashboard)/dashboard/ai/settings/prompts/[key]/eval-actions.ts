'use server';

// Examen de prompts desde el panel (22 nov 2026). Solo super_admin, igual que editar prompts: cada pasada gasta IA.
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { wireApp } from '@/lib/app-wiring';
import { startPromptEval } from '@/lib/ai/prompt-evals';

type Result = { ok: boolean; message: string; error?: string };

const MAX_PROMPT_CHARS = 60_000;

export async function startPromptEvalAction(promptKey: string, draft?: { systemPrompt: string; userPromptTemplate: string } | null): Promise<Result> {
  try {
    const user = await requirePermission('users');
    wireApp();
    const key = String(promptKey ?? '').slice(0, 100);
    const d = draft
      ? { system_prompt: String(draft.systemPrompt ?? '').slice(0, MAX_PROMPT_CHARS), user_prompt_template: String(draft.userPromptTemplate ?? '').slice(0, MAX_PROMPT_CHARS) }
      : undefined;
    const r = await startPromptEval({ promptKey: key, tenantId: user.tenantId, userId: user.id, draft: d });
    revalidatePath(`/dashboard/ai/settings/prompts/${key}`);
    return r.ok ? { ok: true, message: r.message } : { ok: false, message: r.message, error: r.message };
  } catch (e) {
    const m = publicError(e, 'No se pudo lanzar el examen');
    return { ok: false, message: m, error: m };
  }
}

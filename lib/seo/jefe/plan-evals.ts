import 'server-only';
// SEO · Jefe SEO, D2: examen del prompt del plan de servicio (seo_jefe_plan_maestro). Se lanza a mano desde IA → Prompts;
// nunca en el despliegue. Tres expedientes sintéticos con Opus 5.5 (el mismo modelo y esfuerzo que el plan real).
import { callAI } from '@/lib/ai/gateway';
import { registerPromptEvalSuite, type EvalCaseResult, type PromptEvalSuite } from '@/lib/ai/prompt-evals';
import { PLAYBOOKS } from '@/lib/seo/estrategia/playbooks';
import { extractJson } from '@/lib/seo/jefe/plan-rules';
import { gradePlan, planEvalCases } from '@/lib/seo/jefe/plan-eval-cases';
import { JEFE_MODEL, PLAN_PROMPT } from '@/lib/seo/jefe/plan';

const LINEAS = Object.values(PLAYBOOKS)
  .filter((p) => p.key !== 'cimientos')
  .map((p) => `- ${p.key}: ${p.label} — ${p.description} (${p.unitLabel}, ~${p.hoursPerUnit} h cada una)`)
  .join('\n');

export const PLAN_EVAL_SUITE: PromptEvalSuite = {
  promptKey: PLAN_PROMPT,
  summary: 'Tres expedientes inventados (web rota, cerca del top 3, sin Search Console): comprueba que no inventa datos, usa líneas que se pueden hacer, el primer trimestre cabe, dice lo que no sabe y sigue el orden de la agencia.',
  minScore: 0.85,
  costHint: 'unos 1,5-2 $ (3 llamadas a Opus 5.5 con esfuerzo alto; el coste exacto queda en el historial)',
  run: async (tenantId, prompt) => {
    const results: EvalCaseResult[] = [];
    for (const c of planEvalCases()) {
      const vals: Record<string, string> = { horizonte: String(c.horizonMonths), trimestres: String(c.horizonMonths / 3), expediente: c.text, lineas: LINEAS, anterior: 'Ninguno: es el primer plan del proyecto.' };
      const user = prompt.user_prompt_template.replace(/\{(horizonte|trimestres|expediente|lineas|anterior)\}/g, (_m, k: string) => vals[k] ?? '');
      let checks;
      try {
        const res = await callAI({ tenantId, function: 'seo_jefe_plan_examen', promptKey: PLAN_PROMPT, model: JEFE_MODEL, preferredProvider: 'anthropic', requireProvider: 'anthropic', noFallback: true, effort: 'high', maxTokens: 16000, timeoutMs: 300_000, messages: [{ role: 'system', content: prompt.system_prompt }, { role: 'user', content: user }] });
        checks = gradePlan(extractJson(res.content), c);
      } catch (e) {
        checks = [{ name: 'respuesta', pass: false, detail: e instanceof Error ? e.message.slice(0, 300) : String(e) }];
      }
      results.push({ key: c.key, title: c.title, text: c.text.slice(0, 1500), checks });
    }
    return { cases: results, skipped: [] };
  }
};

/** Lo llama la capa de aplicación (wireApp). Idempotente. */
export function registerSeoJefePromptEvals(): void {
  registerPromptEvalSuite(PLAN_EVAL_SUITE);
}

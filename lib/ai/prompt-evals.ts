import 'server-only';
// Exámenes de prompts desde el panel (22 nov 2026). Un examen es la batería de referencia de un prompt: casos con
// respuesta conocida que se pasan a la IA real y se corrigen con código. Así, antes de dejar activo un cambio de prompt
// (o cuando se quiera), se ve si la IA acierta igual, mejor o peor, y queda el historial para ver si empeora con el tiempo.
//
// Núcleo: aquí está el registro, la ejecución en segundo plano y el historial (ai_prompt_evals). Los casos de cada
// prompt los pone el módulo dueño del prompt con registerPromptEvalSuite (la capa de aplicación los conecta en wireApp).
// Cuesta céntimos por pasada: solo se lanza a mano, nunca en el despliegue ni en el planificador.
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { aiJobs, aiPromptEvals, aiPrompts } from '@/lib/db/schema';
import { reportError } from '@/lib/core/errors';
import { withEvalRunId } from '@/lib/ai/eval-tag';

export type EvalCheck = { name: string; pass: boolean; detail: string };
// title: qué comprueba el caso, en claro (p. ej. «Detecta al cliente por su alias»); text: la entrada que recibió la IA.
export type EvalCaseResult = { key: string; title?: string; text?: string; checks: EvalCheck[] };
export type EvalPrompt = { system_prompt: string; user_prompt_template: string };
export type EvalOutcome = { cases: EvalCaseResult[]; skipped: string[] };

export type PromptEvalSuite = {
  promptKey: string;
  /** Qué mide el examen, en una frase para el panel. */
  summary: string;
  /** Nota mínima para aprobar (0-1). */
  minScore: number;
  /** Coste aproximado en palabras («unos céntimos: 5 llamadas a la IA»). */
  costHint: string;
  /** Construye los casos con los datos de la cuenta y los pasa a la IA con ese prompt. Cada caso atrapa sus fallos. */
  run(tenantId: string, prompt: EvalPrompt): Promise<EvalOutcome>;
};

// Un examen que lleva más de esto «en curso» se cortó (el servidor se reinició a mitad): se da por interrumpido.
export const EVAL_STALE_MS = 30 * 60_000;

const G = globalThis as unknown as { __kijuPromptEvalSuites?: Map<string, PromptEvalSuite> };
const suites = (G.__kijuPromptEvalSuites ??= new Map());

export function registerPromptEvalSuite(s: PromptEvalSuite): void {
  suites.set(s.promptKey, s);
}
export function getPromptEvalSuite(key: string): PromptEvalSuite | null {
  return suites.get(key) ?? null;
}
export function promptEvalSuiteKeys(): string[] {
  return [...suites.keys()].sort();
}

/** Nota del examen: comprobaciones aprobadas sobre el total (pura). */
export function scoreOf(cases: EvalCaseResult[]): { passed: number; total: number; score: number } {
  const all = cases.flatMap((c) => c.checks);
  const passed = all.filter((c) => c.pass).length;
  return { passed, total: all.length, score: all.length ? passed / all.length : 0 };
}

export type PromptEvalState = 'sin-examen' | 'sin-examinar' | 'aprobado' | 'suspendido' | 'en-curso' | 'error';

/**
 * Estado del prompt frente a su examen (pura). Mira el último examen de la versión guardada (los de borrador no cuentan):
 * si la versión actual nunca se examinó tras cambiarla, «sin-examinar».
 */
export function evalState(
  currentVersion: number,
  runs: { promptVersion: number | null; draft: boolean; status: string; passed: boolean | null }[]
): PromptEvalState {
  if (runs.some((r) => r.status === 'en_curso')) return 'en-curso';
  const saved = runs.filter((r) => !r.draft);
  if (!saved.length) return 'sin-examen';
  const last = saved[0];
  if (last.promptVersion !== currentVersion) return 'sin-examinar';
  if (last.status === 'error') return 'error';
  return last.passed ? 'aprobado' : 'suspendido';
}

async function closeStale(): Promise<void> {
  await db
    .update(aiPromptEvals)
    .set({ status: 'error', error: 'Interrumpido: el servidor se reinició mientras se pasaba el examen.', finishedAt: new Date() })
    .where(and(eq(aiPromptEvals.status, 'en_curso'), lt(aiPromptEvals.startedAt, new Date(Date.now() - EVAL_STALE_MS))));
}

export type StartEvalResult = { ok: boolean; message: string; runId?: string };

/**
 * Lanza un examen en segundo plano y vuelve enseguida (tarda unos minutos). `draft` examina el texto del formulario sin
 * guardarlo. Uno a la vez por prompt.
 */
export async function startPromptEval(input: { promptKey: string; tenantId: string; userId: number | null; draft?: EvalPrompt }): Promise<StartEvalResult> {
  const suite = getPromptEvalSuite(input.promptKey);
  if (!suite) return { ok: false, message: 'Este prompt todavía no tiene examen.' };
  const [p] = await db
    .select({ system: aiPrompts.systemPrompt, user: aiPrompts.userPromptTemplate, version: aiPrompts.version })
    .from(aiPrompts)
    .where(eq(aiPrompts.key, input.promptKey))
    .limit(1);
  if (!p && !input.draft) return { ok: false, message: 'El prompt no existe.' };
  const prompt: EvalPrompt = input.draft
    ? { system_prompt: input.draft.system_prompt.trim(), user_prompt_template: input.draft.user_prompt_template.trim() }
    : { system_prompt: p!.system, user_prompt_template: p!.user };
  if (!prompt.system_prompt || !prompt.user_prompt_template) return { ok: false, message: 'El prompt está vacío.' };

  await closeStale();
  // Uno a la vez: la comprobación y el alta van con un candado de transacción por prompt.
  const runId = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'ai_prompt_eval:' + input.promptKey}))`);
    const [busy] = await tx
      .select({ id: aiPromptEvals.id })
      .from(aiPromptEvals)
      .where(and(eq(aiPromptEvals.promptKey, input.promptKey), eq(aiPromptEvals.status, 'en_curso')))
      .limit(1);
    if (busy) return null;
    const [r] = await tx
      .insert(aiPromptEvals)
      .values({
        promptKey: input.promptKey,
        promptVersion: input.draft ? null : p!.version,
        draft: Boolean(input.draft),
        tenantId: input.tenantId,
        minScorePct: Math.round(suite.minScore * 100),
        startedBy: input.userId
      })
      .returning({ id: aiPromptEvals.id });
    return r.id;
  });
  if (!runId) return { ok: false, message: 'Ya hay un examen de este prompt en marcha: espera a que termine.' };

  void executeEval(runId, suite, input.tenantId, prompt);
  return { ok: true, message: 'Examen en marcha: tarda unos minutos. Puedes seguir trabajando; el resultado aparece aquí.', runId };
}

/** Pasa el examen y guarda el resultado. Nunca lanza: un fallo queda en la fila (y en el registro de errores). */
export async function executeEval(runId: string, suite: PromptEvalSuite, tenantId: string, prompt: EvalPrompt): Promise<void> {
  let outcome: EvalOutcome | null = null;
  let error: string | null = null;
  try {
    outcome = await withEvalRunId(runId, () => suite.run(tenantId, prompt));
    if (!outcome.cases.length) error = 'Sin datos para construir casos (¿caché de ClickUp vacía o sin clientes vinculados?).';
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    reportError({ source: 'sistema', area: 'IA', message: `Examen del prompt ${suite.promptKey}`, error: e, tenantId });
  }
  try {
    const [cost] = await db
      .select({ usd: sql<string | null>`sum(${aiJobs.estimatedCost})` })
      .from(aiJobs)
      .where(and(eq(aiJobs.tenantId, tenantId), sql`${aiJobs.input}->>'evalRunId' = ${runId}`));
    const s = scoreOf(outcome?.cases ?? []);
    await db
      .update(aiPromptEvals)
      .set({
        status: error ? 'error' : 'ok',
        passedChecks: s.passed,
        totalChecks: s.total,
        passed: error ? null : s.score >= suite.minScore,
        result: outcome ?? {},
        error: error?.slice(0, 2000) ?? null,
        costUsd: cost?.usd ?? null,
        finishedAt: new Date()
      })
      .where(eq(aiPromptEvals.id, runId));
  } catch (e) {
    reportError({ source: 'sistema', area: 'IA', message: `No se pudo guardar el examen del prompt ${suite.promptKey}`, error: e, tenantId });
  }
}

export type PromptEvalRun = typeof aiPromptEvals.$inferSelect;

export async function listPromptEvals(promptKey: string, limit = 12): Promise<PromptEvalRun[]> {
  await closeStale();
  return db.select().from(aiPromptEvals).where(eq(aiPromptEvals.promptKey, promptKey)).orderBy(desc(aiPromptEvals.startedAt)).limit(limit);
}

export type PromptEvalOverview = { promptKey: string; name: string; version: number; state: PromptEvalState; last: PromptEvalRun | null };

/** Estado de cada prompt con examen (lista de prompts y parte de Sistema). */
export async function promptEvalOverview(): Promise<PromptEvalOverview[]> {
  const keys = promptEvalSuiteKeys();
  if (!keys.length) return [];
  await closeStale();
  const prompts = await db.select({ key: aiPrompts.key, name: aiPrompts.name, version: aiPrompts.version }).from(aiPrompts).where(inArray(aiPrompts.key, keys));
  const out: PromptEvalOverview[] = [];
  for (const p of prompts) {
    const runs = await db.select().from(aiPromptEvals).where(eq(aiPromptEvals.promptKey, p.key)).orderBy(desc(aiPromptEvals.startedAt)).limit(20);
    out.push({ promptKey: p.key, name: p.name, version: p.version, state: evalState(p.version, runs), last: runs.find((r) => !r.draft && r.status !== 'en_curso') ?? null });
  }
  return out.sort((a, b) => a.promptKey.localeCompare(b.promptKey));
}

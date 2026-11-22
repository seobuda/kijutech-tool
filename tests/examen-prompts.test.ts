// Examen de prompts desde el panel (22 nov 2026): el motor del núcleo con un examen falso (sin IA).
//  - lanza en segundo plano y guarda nota, versión y casos; uno a la vez por prompt;
//  - el examen del borrador no cuenta como examen de la versión guardada;
//  - uno que se quedó «en curso» (servidor reiniciado) se da por interrumpido;
//  - la marca de examen llega a las llamadas a la IA (para sumar su coste) y no se escapa fuera.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { aiPromptEvals, aiPrompts, tenants } from '@/lib/db/schema';
import { evalState, EVAL_STALE_MS, listPromptEvals, promptEvalOverview, registerPromptEvalSuite, startPromptEval, type EvalPrompt } from '@/lib/ai/prompt-evals';
import { currentEvalRunId, withEvalRunId } from '@/lib/ai/eval-tag';

const KEY = 'seg-test-examen-prompt';
const KEY_SLOW = 'seg-test-examen-lento';
let tenantId = '';
const seen: { prompt: EvalPrompt; tag: string | null }[] = [];
let release: () => void = () => undefined;

async function waitDone(key: string) {
  for (let i = 0; i < 100; i++) {
    const [r] = await listPromptEvals(key, 1);
    if (r && r.status !== 'en_curso') return r;
    await new Promise((res) => setTimeout(res, 50));
  }
  throw new Error('el examen no terminó');
}

describe('examen de prompts: motor del núcleo', () => {
  beforeAll(async () => {
    const [t] = await db.insert(tenants).values({ name: 'Examen prompts', slug: `seg-test-examen-${Date.now().toString(36)}` }).returning({ id: tenants.id });
    tenantId = t.id;
    await db.delete(aiPrompts).where(inArray(aiPrompts.key, [KEY, KEY_SLOW]));
    await db.insert(aiPrompts).values([
      { key: KEY, name: 'Prompt de prueba', systemPrompt: 'sistema v1', userPromptTemplate: 'usuario {nota}', version: 1 },
      { key: KEY_SLOW, name: 'Prompt lento', systemPrompt: 's', userPromptTemplate: 'u', version: 1 }
    ]);
    registerPromptEvalSuite({
      promptKey: KEY,
      summary: 'prueba',
      minScore: 1,
      costHint: 'nada',
      run: async (_t, prompt) => {
        seen.push({ prompt, tag: currentEvalRunId() });
        const bien = prompt.system_prompt.includes('v1');
        return {
          cases: [
            { key: 'a', title: 'Caso A', checks: [{ name: 'cliente', pass: true, detail: 'ok' }] },
            { key: 'b', title: 'Caso B', checks: [{ name: 'responsable', pass: bien, detail: bien ? 'ok' : '«otro»' }] }
          ],
          skipped: ['caso c: faltan datos']
        };
      }
    });
    registerPromptEvalSuite({
      promptKey: KEY_SLOW,
      summary: 'lento',
      minScore: 1,
      costHint: 'nada',
      run: () => new Promise((res) => (release = () => res({ cases: [{ key: 'x', checks: [{ name: 'n', pass: true, detail: '' }] }], skipped: [] })))
    });
  });

  afterAll(async () => {
    release();
    await new Promise((r) => setTimeout(r, 100));
    await db.delete(aiPromptEvals).where(inArray(aiPromptEvals.promptKey, [KEY, KEY_SLOW]));
    await db.delete(aiPrompts).where(inArray(aiPrompts.key, [KEY, KEY_SLOW]));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  it('pasa el examen de la versión guardada y guarda nota, versión, casos y lo que faltó', async () => {
    const r = await startPromptEval({ promptKey: KEY, tenantId, userId: null });
    expect(r.ok).toBe(true);
    const run = await waitDone(KEY);
    expect(run).toMatchObject({ status: 'ok', promptVersion: 1, draft: false, passedChecks: 2, totalChecks: 2, passed: true, minScorePct: 100 });
    expect((run.result as { skipped: string[] }).skipped).toEqual(['caso c: faltan datos']);
    // Durante el examen, las llamadas llevan su marca (el gateway la copia para sumar el coste)…
    expect(seen.at(-1)?.tag).toBe(run.id);
    // …y fuera de él, no.
    expect(currentEvalRunId()).toBeNull();
    expect(await withEvalRunId('x', async () => currentEvalRunId())).toBe('x');
  });

  it('el borrador se examina sin guardarlo y no cuenta como examen de la versión guardada', async () => {
    const r = await startPromptEval({ promptKey: KEY, tenantId, userId: null, draft: { system_prompt: 'sistema v2 roto', user_prompt_template: 'u' } });
    expect(r.ok).toBe(true);
    const run = await waitDone(KEY);
    expect(run).toMatchObject({ draft: true, promptVersion: null, passed: false, passedChecks: 1, totalChecks: 2 });
    expect(seen.at(-1)?.prompt.system_prompt).toBe('sistema v2 roto');
    const [p] = await db.select().from(aiPrompts).where(eq(aiPrompts.key, KEY));
    expect(p.systemPrompt).toBe('sistema v1');
    expect(evalState(p.version, await listPromptEvals(KEY))).toBe('aprobado');
  });

  it('al cambiar el prompt queda «cambiado sin examinar» (lista de prompts y parte de Sistema)', async () => {
    await db.update(aiPrompts).set({ version: 2 }).where(eq(aiPrompts.key, KEY));
    const o = (await promptEvalOverview()).find((x) => x.promptKey === KEY);
    expect(o?.state).toBe('sin-examinar');
    expect(o?.last?.promptVersion).toBe(1);
  });

  it('uno a la vez por prompt', async () => {
    const a = await startPromptEval({ promptKey: KEY_SLOW, tenantId, userId: null });
    const b = await startPromptEval({ promptKey: KEY_SLOW, tenantId, userId: null });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(false);
    expect(b.message).toMatch(/en marcha/);
    release();
    expect((await waitDone(KEY_SLOW)).status).toBe('ok');
  });

  it('uno que se quedó en curso tras un reinicio se da por interrumpido', async () => {
    await db.insert(aiPromptEvals).values({ promptKey: KEY_SLOW, tenantId, promptVersion: 1, startedAt: new Date(Date.now() - EVAL_STALE_MS - 60_000) });
    const [r] = await listPromptEvals(KEY_SLOW, 5).then((rows) => rows.filter((x) => x.error?.startsWith('Interrumpido')));
    expect(r?.status).toBe('error');
  });

  it('un prompt sin examen no se puede examinar', async () => {
    expect((await startPromptEval({ promptKey: 'seg-test-sin-examen', tenantId, userId: null })).ok).toBe(false);
  });
});

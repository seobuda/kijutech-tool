import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { asc } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { tenants } from '@/lib/db/schema';
import { getPrompt } from '@/lib/ai/gateway';
import { NOTE_PROMPT_KEY, type NotePrompt } from '@/lib/operaciones/request-proposer';
import type { ProposalItem } from '@/lib/operaciones/note-types';
import { gradeNoteItems as grade } from '@/lib/operaciones/prompt-evals-rules';
import { runNoteEval } from '@/lib/operaciones/prompt-evals';
import { evalState, scoreOf, type EvalCaseResult } from '@/lib/ai/prompt-evals';

/**
 * Batería de referencia del prompt «Convertir nota en encargos» (ops_note_to_requests).
 *
 * Para qué: saber, antes de dejar activo un cambio de prompt, si la IA acierta igual, mejor o peor. En producción ya se
 * mide con la decisión de Enric (Propuestas del agente); esto mide ANTES, con casos de respuesta conocida.
 *
 * Cómo se usa (dentro del contenedor, nunca en Windows):
 *   RUN_REAL_EVALS=true ./node_modules/.bin/vitest run tests/ia-prompts-evals.test.ts
 * Lo normal es pasarla desde el panel (IA → Prompts → el prompt), que guarda el historial; esta prueba usa el mismo
 * código (lib/operaciones/prompt-evals.ts). ~0,20 $ por pasada.
 * Opcional:
 *   EVAL_PROMPT_FILE=/ruta/prompt.json  prueba un prompt candidato sin guardarlo ({ system_prompt, user_prompt_template });
 *                                       sin él se usa el de la base de datos en la que se ejecuta.
 *   EVAL_REPEAT=3                       repite cada caso (la IA no responde siempre igual): si un fallo sale en una
 *                                       sola repetición es ruido; si sale en todas, el prompt empeoró.
 *   EVAL_MIN_SCORE=0.9                  nota mínima para aprobar. Por defecto 1: todos los casos bien. Con 0,8 un
 *                                       prompt saboteado a propósito (perdía el responsable nombrado) aprobaba con 0,92,
 *                                       porque el código rescata parte del trabajo de la IA (cliente, tareas propias).
 *
 * Sin RUN_REAL_EVALS la llamada a la IA se salta: con una IA simulada no se evaluaría el prompt, solo la simulación.
 * Así la batería nunca gasta en el despliegue. Lo que sí corre siempre es el corrector (sin IA).
 *
 * Qué mide: solo lo que decide la IA. La fecha la calcula el código por el plazo del cliente salvo que la nota diga
 * una fecha; por eso solo se exige en el caso que la dice. Los casos se construyen al ejecutarse con los clientes y
 * miembros de la propia base de datos: no hay nombres de clientes escritos en este archivo.
 */

describe('evals de prompts: el corrector', () => {
  const item = (p: Partial<ProposalItem>): ProposalItem =>
    ({ key: 'k', title: 't', description: '', missingData: [], listId: '', assigneeId: '', assigneeName: '', assigneeReason: '', dueDate: '', dueReason: '', priority: 3, clientOptionId: '', clientName: '', clientWarning: '', serviceKey: '', workTypeKey: '', requiresReview: false, ...p }) as ProposalItem;

  it('aprueba lo que coincide (sin distinguir mayúsculas ni acentos) y suspende lo que no', () => {
    const ok = grade([item({ clientName: 'Clínica Ejemplo', listId: 'L1', assigneeName: 'ana', dueDate: '2026-12-15' })], {
      count: 1, clientNames: ['clinica ejemplo'], listIn: ['L1', 'L2'], assignee: 'Ana', dueDate: '2026-12-15'
    });
    expect(ok.every((c) => c.pass)).toBe(true);
    const ko = grade([item({ clientName: 'Otro', listId: 'L9', assigneeName: 'Luis', dueDate: '' }), item({})], {
      count: 1, clientNames: ['Clínica Ejemplo'], listIn: ['L1'], assignee: 'Ana', dueDate: '2026-12-15'
    });
    expect(ko.filter((c) => c.pass)).toEqual([]);
  });

  it('sin encargos no revienta y suspende lo que pide un encargo', () => {
    const r = grade([], { minCount: 1, clientNames: ['X'], assignee: 'Ana' });
    expect(r.map((c) => c.pass)).toEqual([false, false, false]);
  });

  it('la nota es la proporción de comprobaciones aprobadas', () => {
    const c: EvalCaseResult[] = [{ key: 'a', checks: [{ name: '', pass: true, detail: '' }, { name: '', pass: false, detail: '' }] }];
    expect(scoreOf(c)).toEqual({ passed: 1, total: 2, score: 0.5 });
    expect(scoreOf([]).score).toBe(0);
  });

  it('estado del prompt en el panel: sin examen, sin examinar tras cambiarlo, aprobado, suspendido, en curso', () => {
    const run = (p: Partial<{ promptVersion: number | null; draft: boolean; status: string; passed: boolean | null }>) => ({ promptVersion: 3, draft: false, status: 'ok', passed: true, ...p });
    expect(evalState(3, [])).toBe('sin-examen');
    expect(evalState(3, [run({ draft: true, promptVersion: null })])).toBe('sin-examen');
    expect(evalState(3, [run({})])).toBe('aprobado');
    expect(evalState(3, [run({ passed: false })])).toBe('suspendido');
    expect(evalState(4, [run({})])).toBe('sin-examinar');
    // Un examen del borrador no cuenta como examen de la versión guardada.
    expect(evalState(4, [run({ draft: true, promptVersion: null }), run({})])).toBe('sin-examinar');
    expect(evalState(3, [run({ status: 'en_curso', passed: null }), run({})])).toBe('en-curso');
    expect(evalState(3, [run({ status: 'error', passed: null })])).toBe('error');
  });
});

// --- Casos y ejecución real ------------------------------------------------------------------------------------------

const REAL = process.env.RUN_REAL_EVALS === 'true';
const REPEAT = Math.max(1, Math.min(5, Number(process.env.EVAL_REPEAT ?? 1) || 1));
const MIN_SCORE = Math.min(1, Number(process.env.EVAL_MIN_SCORE ?? 1) || 1);

describe.skipIf(!REAL)('evals de prompts: ops_note_to_requests con la IA real (RUN_REAL_EVALS=true)', () => {
  it(
    `la nota media llega al mínimo (${MIN_SCORE})`,
    async () => {
      // La cuenta dueña de la plataforma (la primera): la de la agencia, con su caché de ClickUp, clientes y fichas.
      const [t] = await db.select({ id: tenants.id }).from(tenants).orderBy(asc(tenants.createdAt)).limit(1);
      expect(t, 'no hay ninguna cuenta en la base de datos').toBeTruthy();
      const prompt: NotePrompt | null = process.env.EVAL_PROMPT_FILE
        ? JSON.parse(fs.readFileSync(process.env.EVAL_PROMPT_FILE, 'utf8'))
        : await getPrompt(NOTE_PROMPT_KEY);
      expect(prompt?.system_prompt && prompt?.user_prompt_template, 'el prompt no existe o está desactivado').toBeTruthy();

      const { cases: results, skipped } = await runNoteEval(t.id, prompt!, REPEAT);
      expect(results.length, 'sin datos para construir casos (¿caché de ClickUp vacía?)').toBeGreaterThan(0);

      const { score } = scoreOf(results);
      const lines = results.map((r) => `  ${r.checks.every((c) => c.pass) ? '✓' : '✗'} ${r.key}: ${r.checks.map((c) => `${c.pass ? '✓' : '✗'} ${c.name} ${c.detail}`).join(' · ')}`);
      console.log(
        [`Evals ops_note_to_requests${process.env.EVAL_PROMPT_FILE ? ' (prompt candidato)' : ''}: nota ${score.toFixed(2)} (mínimo ${MIN_SCORE})`, ...lines, ...skipped.map((s) => `  – sin caso: ${s}`)].join('\n')
      );
      expect(score).toBeGreaterThanOrEqual(MIN_SCORE);
    },
    15 * 60_000
  );
});

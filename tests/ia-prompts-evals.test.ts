import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { asc } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { tenants } from '@/lib/db/schema';
import { getPrompt } from '@/lib/ai/gateway';
import { ALL_SPACES, NOTE_PROMPT_KEY, proposeRequests, type NotePrompt } from '@/lib/operaciones/request-proposer';
import { getStructure } from '@/lib/operaciones/structure';
import { listClients, normText, type ClientWithServices } from '@/lib/operaciones/clients';
import type { ProposalItem } from '@/lib/operaciones/note-types';

/**
 * Batería de referencia del prompt «Convertir nota en encargos» (ops_note_to_requests).
 *
 * Para qué: saber, antes de dejar activo un cambio de prompt, si la IA acierta igual, mejor o peor. En producción ya se
 * mide con la decisión de Enric (Propuestas del agente); esto mide ANTES, con casos de respuesta conocida.
 *
 * Cómo se usa (dentro del contenedor, nunca en Windows):
 *   RUN_REAL_EVALS=true ./node_modules/.bin/vitest run tests/ia-prompts-evals.test.ts
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

type Check = { name: string; pass: boolean; detail: string };
type CaseResult = { key: string; checks: Check[] };

// --- Corrector (puro) ------------------------------------------------------------------------------------------------

const same = (a: string | null | undefined, b: string | null | undefined) => Boolean(a && b && normText(a) === normText(b));

export function grade(
  items: ProposalItem[],
  expect: {
    count?: number;
    minCount?: number;
    clientNames?: string[];
    listIn?: string[];
    assignee?: string;
    dueDate?: string;
  }
): Check[] {
  const checks: Check[] = [];
  const first = items[0];
  if (expect.count !== undefined) checks.push({ name: 'número de encargos', pass: items.length === expect.count, detail: `${items.length} (esperado ${expect.count})` });
  if (expect.minCount !== undefined) checks.push({ name: 'hay encargo', pass: items.length >= expect.minCount, detail: `${items.length}` });
  if (expect.clientNames) {
    checks.push({ name: 'cliente', pass: Boolean(first && expect.clientNames.some((n) => same(first.clientName, n))), detail: `«${first?.clientName ?? ''}»` });
  }
  if (expect.listIn) checks.push({ name: 'lista habitual', pass: Boolean(first && expect.listIn.includes(first.listId)), detail: first?.listId || '(sin lista)' });
  if (expect.assignee) checks.push({ name: 'responsable', pass: Boolean(first && same(first.assigneeName, expect.assignee)), detail: `«${first?.assigneeName ?? ''}»` });
  if (expect.dueDate) checks.push({ name: 'fecha de la nota', pass: first?.dueDate === expect.dueDate, detail: `${first?.dueDate || '(sin fecha)'} (esperado ${expect.dueDate})` });
  return checks;
}

const scoreOf = (results: CaseResult[]) => {
  const all = results.flatMap((r) => r.checks);
  return all.length ? all.filter((c) => c.pass).length / all.length : 0;
};

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
    expect(scoreOf([{ key: 'a', checks: [{ name: '', pass: true, detail: '' }, { name: '', pass: false, detail: '' }] }])).toBe(0.5);
  });
});

// --- Casos y ejecución real ------------------------------------------------------------------------------------------

const REAL = process.env.RUN_REAL_EVALS === 'true';
const REPEAT = Math.max(1, Math.min(5, Number(process.env.EVAL_REPEAT ?? 1) || 1));
const MIN_SCORE = Math.min(1, Number(process.env.EVAL_MIN_SCORE ?? 1) || 1);

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function inDays(days: number): { iso: string; text: string } {
  const d = new Date(Date.now() + days * 86_400_000);
  const [y, m, dd] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).split('-');
  return { iso: `${y}-${m}-${dd}`, text: `${Number(dd)} de ${MONTHS[Number(m) - 1]} de ${y}` };
}

type EvalCase = { key: string; text: string; expect: Parameters<typeof grade>[1] };

function buildCases(clients: ClientWithServices[], members: string[], me: string | null): { cases: EvalCase[]; skipped: string[] } {
  const skipped: string[] = [];
  const linked = clients.filter((c) => c.active && c.clickupOptionId).sort((a, b) => a.name.localeCompare(b.name));
  const names = (c: ClientWithServices) => [c.clickupOptionLabel ?? '', c.name].filter(Boolean);
  const withAlias = linked.find((c) => c.aliases.length > 0 && c.usualListIds.length > 0) ?? linked.find((c) => c.aliases.length > 0);
  const pick = (i: number) => linked[i % Math.max(1, linked.length)];
  const other = members.find((m) => !same(m, me));
  const date = inDays(24);
  const cases: EvalCase[] = [];

  if (withAlias) {
    cases.push({
      key: 'cliente-por-alias',
      text: `Para ${withAlias.aliases[0]}: hay que actualizar los horarios de verano en la página de contacto de su web.`,
      expect: { minCount: 1, clientNames: names(withAlias), ...(withAlias.usualListIds.length ? { listIn: withAlias.usualListIds } : {}) }
    });
  } else skipped.push('cliente-por-alias (no hay clientes con alias)');

  if (linked.length) {
    const c = pick(1);
    cases.push({
      key: 'fecha-de-la-nota',
      text: `Revisar el informe SEO mensual de ${c.name} y enviarlo antes del ${date.text}.`,
      expect: { minCount: 1, clientNames: names(c), dueDate: date.iso }
    });
    const c2 = pick(2);
    cases.push({
      key: 'dos-encargos',
      text: `Dos cosas para ${c2.name}: cambiar el logo del pie de página de la web, y por otro lado escribir un artículo de blog sobre sus servicios.`,
      expect: { count: 2, clientNames: names(c2) }
    });
  } else skipped.push('fecha-de-la-nota y dos-encargos (no hay clientes vinculados a ClickUp)');

  if (linked.length && other) {
    const c = pick(3);
    cases.push({
      key: 'responsable-nombrado',
      text: `${other} tiene que maquetar la landing nueva de ${c.name} esta semana.`,
      expect: { minCount: 1, clientNames: names(c), assignee: other }
    });
  } else skipped.push('responsable-nombrado (faltan clientes o miembros)');

  if (linked.length && me) {
    const c = pick(4);
    cases.push({
      key: 'tarea-propia',
      text: `Llamar a ${c.name} para pedirle los accesos de Google Analytics.`,
      expect: { minCount: 1, assignee: me }
    });
  } else skipped.push('tarea-propia (no se sabe quién lleva las operaciones)');

  return { cases, skipped };
}

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

      const structure = await getStructure(t.id);
      const { cases, skipped } = buildCases(
        await listClients(t.id),
        structure.members.map((m) => m.username),
        structure.meUsername
      );
      expect(cases.length, 'sin datos para construir casos (¿caché de ClickUp vacía?)').toBeGreaterThan(0);

      const results: CaseResult[] = [];
      for (const c of cases) {
        for (let i = 0; i < REPEAT; i++) {
          let checks: Check[];
          try {
            const { items } = await proposeRequests(t.id, { text: c.text, spaceId: ALL_SPACES, spaceName: 'todos los espacios', assigneeClickupId: null, assigneeName: null }, prompt!);
            checks = grade(items, c.expect);
          } catch (e) {
            checks = [{ name: 'respuesta', pass: false, detail: e instanceof Error ? e.message : String(e) }];
          }
          results.push({ key: REPEAT > 1 ? `${c.key} #${i + 1}` : c.key, checks });
        }
      }

      const score = scoreOf(results);
      const lines = results.map((r) => `  ${r.checks.every((c) => c.pass) ? '✓' : '✗'} ${r.key}: ${r.checks.map((c) => `${c.pass ? '✓' : '✗'} ${c.name} ${c.detail}`).join(' · ')}`);
      console.log(
        [`Evals ops_note_to_requests${process.env.EVAL_PROMPT_FILE ? ' (prompt candidato)' : ''}: nota ${score.toFixed(2)} (mínimo ${MIN_SCORE})`, ...lines, ...skipped.map((s) => `  – sin caso: ${s}`)].join('\n')
      );
      expect(score).toBeGreaterThanOrEqual(MIN_SCORE);
    },
    15 * 60_000
  );
});

import 'server-only';
// Examen del prompt «Convertir nota en encargos» (ops_note_to_requests), 22 nov 2026. Antes vivía solo en
// tests/ia-prompts-evals.test.ts; ahora se pasa desde el panel (IA → Prompts → el prompt) y queda su historial. La
// prueba sigue usando estas mismas funciones.
//
// Qué mide: solo lo que decide la IA. La fecha la calcula el código por el plazo del cliente salvo que la nota diga
// una; por eso solo se exige en el caso que la dice. Los casos se construyen al ejecutarse con los clientes y miembros
// de la propia cuenta: no hay nombres de clientes escritos en el código.
import { registerPromptEvalSuite, type EvalCaseResult, type EvalPrompt, type PromptEvalSuite } from '@/lib/ai/prompt-evals';
import { ALL_SPACES, NOTE_PROMPT_KEY, proposeRequests } from '@/lib/operaciones/request-proposer';
import { getStructure } from '@/lib/operaciones/structure';
import { listClients, normText, type ClientWithServices } from '@/lib/operaciones/clients';
import { gradeNoteItems, type EvalCheck, type NoteExpect } from '@/lib/operaciones/prompt-evals-rules';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function inDays(days: number): { iso: string; text: string } {
  const d = new Date(Date.now() + days * 86_400_000);
  const [y, m, dd] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).split('-');
  return { iso: `${y}-${m}-${dd}`, text: `${Number(dd)} de ${MONTHS[Number(m) - 1]} de ${y}` };
}

export type NoteEvalCase = { key: string; title: string; text: string; expect: NoteExpect };

const same = (a: string | null | undefined, b: string | null | undefined) => Boolean(a && b && normText(a) === normText(b));

/** Casos con respuesta conocida, a partir de los clientes y miembros de la cuenta. Los que no se pueden armar se dicen. */
export function buildNoteCases(clients: ClientWithServices[], members: string[], me: string | null): { cases: NoteEvalCase[]; skipped: string[] } {
  const skipped: string[] = [];
  const linked = clients.filter((c) => c.active && c.clickupOptionId).sort((a, b) => a.name.localeCompare(b.name));
  const names = (c: ClientWithServices) => [c.clickupOptionLabel ?? '', c.name].filter(Boolean);
  const withAlias = linked.find((c) => c.aliases.length > 0 && c.usualListIds.length > 0) ?? linked.find((c) => c.aliases.length > 0);
  const pick = (i: number) => linked[i % Math.max(1, linked.length)];
  const other = members.find((m) => !same(m, me));
  const date = inDays(24);
  const cases: NoteEvalCase[] = [];

  if (withAlias) {
    cases.push({
      key: 'cliente-por-alias',
      title: 'Reconoce al cliente por su alias y usa su lista habitual',
      text: `Para ${withAlias.aliases[0]}: hay que actualizar los horarios de verano en la página de contacto de su web.`,
      expect: { minCount: 1, clientNames: names(withAlias), ...(withAlias.usualListIds.length ? { listIn: withAlias.usualListIds } : {}) }
    });
  } else skipped.push('Cliente por su alias: no hay clientes con alias');

  if (linked.length) {
    const c = pick(1);
    cases.push({
      key: 'fecha-de-la-nota',
      title: 'Respeta la fecha que dice la nota',
      text: `Revisar el informe SEO mensual de ${c.name} y enviarlo antes del ${date.text}.`,
      expect: { minCount: 1, clientNames: names(c), dueDate: date.iso }
    });
    const c2 = pick(2);
    cases.push({
      key: 'dos-encargos',
      title: 'Separa dos encargos de una misma nota',
      text: `Dos cosas para ${c2.name}: cambiar el logo del pie de página de la web, y por otro lado escribir un artículo de blog sobre sus servicios.`,
      expect: { count: 2, clientNames: names(c2) }
    });
  } else skipped.push('Fecha de la nota y dos encargos: no hay clientes vinculados a ClickUp');

  if (linked.length && other) {
    const c = pick(3);
    cases.push({
      key: 'responsable-nombrado',
      title: 'Asigna a la persona que nombra la nota',
      text: `${other} tiene que maquetar la landing nueva de ${c.name} esta semana.`,
      expect: { minCount: 1, clientNames: names(c), assignee: other }
    });
  } else skipped.push('Responsable nombrado: faltan clientes o miembros');

  if (linked.length && me) {
    const c = pick(4);
    cases.push({
      key: 'tarea-propia',
      title: 'Una tarea tuya te la asigna a ti',
      text: `Llamar a ${c.name} para pedirle los accesos de Google Analytics.`,
      expect: { minCount: 1, assignee: me }
    });
  } else skipped.push('Tarea propia: no se sabe quién lleva las operaciones');

  return { cases, skipped };
}

/** Pasa cada caso por la IA con ese prompt y lo corrige. `repeat` repite cada caso (la IA no responde siempre igual). */
export async function runNoteEval(tenantId: string, prompt: EvalPrompt, repeat = 1): Promise<{ cases: EvalCaseResult[]; skipped: string[] }> {
  const structure = await getStructure(tenantId);
  const { cases, skipped } = buildNoteCases(await listClients(tenantId), structure.members.map((m) => m.username), structure.meUsername);
  const results: EvalCaseResult[] = [];
  for (const c of cases) {
    for (let i = 0; i < repeat; i++) {
      let checks: EvalCheck[];
      try {
        const { items } = await proposeRequests(tenantId, { text: c.text, spaceId: ALL_SPACES, spaceName: 'todos los espacios', assigneeClickupId: null, assigneeName: null }, prompt);
        checks = gradeNoteItems(items, c.expect);
      } catch (e) {
        checks = [{ name: 'respuesta', pass: false, detail: e instanceof Error ? e.message.slice(0, 300) : String(e) }];
      }
      results.push({ key: repeat > 1 ? `${c.key} #${i + 1}` : c.key, title: c.title, text: c.text, checks });
    }
  }
  return { cases: results, skipped };
}

export const NOTE_EVAL_SUITE: PromptEvalSuite = {
  promptKey: NOTE_PROMPT_KEY,
  summary: 'Convierte notas de ejemplo construidas con tus clientes y tu equipo, y comprueba cliente, lista, responsable, fecha y número de encargos.',
  // Con 0,8 un prompt saboteado a propósito (perdía el responsable nombrado) aprobaba con 0,92: el código rescata
  // parte del trabajo de la IA. Por eso se exige todo bien.
  minScore: 1,
  // Medido el 22 nov 2026: 0,20 $ por pasada (el prompt lleva todas las listas, clientes y fichas).
  costHint: 'unos 0,20 $ (una llamada a la IA por caso, unos 5 casos; el coste exacto de cada pasada queda en el historial)',
  run: (tenantId, prompt) => runNoteEval(tenantId, prompt)
};

/** Lo llama la capa de aplicación (wireApp). Idempotente. */
export function registerOperacionesPromptEvals(): void {
  registerPromptEvalSuite(NOTE_EVAL_SUITE);
}

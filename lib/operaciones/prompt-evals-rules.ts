// Corrector del examen de «Convertir nota en encargos» (22 nov 2026). Puro: sin IA ni base de datos, para probarlo solo
// (tests/ia-prompts-evals.test.ts).
import { normText } from '@/lib/core/client-rules';
import type { ProposalItem } from '@/lib/operaciones/note-types';

export type EvalCheck = { name: string; pass: boolean; detail: string };
export type NoteExpect = {
  count?: number;
  minCount?: number;
  clientNames?: string[];
  listIn?: string[];
  assignee?: string;
  dueDate?: string;
};

const same = (a: string | null | undefined, b: string | null | undefined) => Boolean(a && b && normText(a) === normText(b));

export function gradeNoteItems(items: ProposalItem[], expect: NoteExpect): EvalCheck[] {
  const checks: EvalCheck[] = [];
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

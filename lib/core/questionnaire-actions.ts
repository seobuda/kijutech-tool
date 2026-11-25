'use server';

// Acciones PÚBLICAS del cuestionario en línea (25 nov 2026): las usa el cliente desde /cuestionario/<token>, sin
// sesión. Lo que las protege es el token (24 bytes aleatorios; en la base de datos solo su hash), que caduca a los 30
// días y solo da acceso a las preguntas de ese cuestionario. Están en la lista de acciones públicas de
// tests/auditoria.test.ts con este motivo. Tamaños limitados y errores genéricos.
import { z } from 'zod';
import { publicError } from '@/lib/errors';
import { QuestionsError, saveQuestionnaireDraft, submitQuestionnaire } from '@/lib/core/questions';

type Res<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const Token = z.string().regex(/^[A-Za-z0-9_-]{32}$/);
const Value = z.union([
  z.string().max(4000),
  z.array(z.string().max(200)).max(30),
  z.boolean(),
  z.object({ calle: z.string().max(200), codigo_postal: z.string().max(10), poblacion: z.string().max(120), provincia: z.string().max(120) })
]);

const fail = (e: unknown, fallback: string): { ok: false; error: string } => ({ ok: false, error: e instanceof QuestionsError ? e.userMessage : publicError(e, fallback) });

export async function saveQuestionnaireAnswerAction(token: string, questionId: string, value: unknown): Promise<Res> {
  try {
    const t = Token.safeParse(token);
    const q = z.string().uuid().safeParse(questionId);
    const v = Value.safeParse(value);
    if (!t.success || !q.success || !v.success) return { ok: false, error: 'Respuesta no válida' };
    await saveQuestionnaireDraft(t.data, q.data, v.data);
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo guardar. Inténtalo de nuevo en un momento.');
  }
}

export async function submitQuestionnaireAction(token: string): Promise<Res<{ answered: number; total: number }>> {
  try {
    const t = Token.safeParse(token);
    if (!t.success) return { ok: false, error: 'Enlace no válido' };
    const r = await submitQuestionnaire(t.data);
    return { ok: true, ...r };
  } catch (e) {
    return fail(e, 'No se pudieron enviar las respuestas. Inténtalo de nuevo en un momento.');
  }
}

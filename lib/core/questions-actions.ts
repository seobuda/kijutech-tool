'use server';

// Acciones web de las Preguntas al cliente (núcleo, 25 nov 2026). Todas comprueban permisos en el servidor:
//   - las de un cliente (pestaña Preguntas de su ficha) piden `edit`; el envío pasa además por la aprobación;
//   - el banco y los textos de los correos son de toda la cuenta: piden `admin`.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { ClientError } from '@/lib/core/clients';
import {
  addLooseQuestion,
  addQuestionsRecipient,
  answerManually,
  cancelQuestionnaire,
  createTemplate,
  deleteTemplate,
  editClientQuestion,
  moveTemplate,
  prepareQuestionsSend,
  proposeQuestions,
  QuestionsError,
  resetCommsTemplate,
  saveCommsTemplate,
  setQuestionStatus,
  updateTemplate,
  applyAnswerToFicha
} from '@/lib/core/questions';
import type { ProposedQuestion } from '@/lib/core/questions-rules';

type Res<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const Id = z.string().uuid();
const fail = (e: unknown, fallback: string): { ok: false; error: string } => ({
  ok: false,
  error: e instanceof QuestionsError ? e.userMessage : e instanceof ClientError ? e.userMessage : publicError(e, fallback)
});
const refresh = () => revalidatePath('/dashboard/clientes', 'layout');
const who = (u: { name: string | null; email: string }) => (u.name || u.email).slice(0, 120);

const QuestionInput = z.object({
  text: z.string().max(2000),
  help: z.string().max(2000).nullable().optional(),
  answerType: z.string().max(12),
  target: z.string().max(60)
});
const TemplateInput = QuestionInput.extend({
  askWhen: z.string().max(12),
  repeatDays: z.number().int().nullable().optional()
});

// --- Preguntas de un cliente -----------------------------------------------------------------------------------------

export async function addLooseQuestionAction(clientId: string, input: z.infer<typeof QuestionInput>): Promise<Res> {
  try {
    const user = await requirePermission('edit');
    const c = Id.safeParse(clientId);
    const i = QuestionInput.safeParse(input);
    if (!c.success || !i.success) return { ok: false, error: 'Datos no válidos' };
    await addLooseQuestion(user.tenantId, c.data, i.data);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo añadir la pregunta');
  }
}

export async function editClientQuestionAction(id: string, text: string, help: string | null): Promise<Res> {
  try {
    const user = await requirePermission('edit');
    const p = Id.safeParse(id);
    if (!p.success || typeof text !== 'string') return { ok: false, error: 'Datos no válidos' };
    await editClientQuestion(user.tenantId, p.data, text.slice(0, 2000), typeof help === 'string' ? help.slice(0, 2000) : null);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo cambiar la pregunta');
  }
}

export async function setQuestionStatusAction(id: string, to: 'no_aplica' | 'pendiente'): Promise<Res> {
  try {
    const user = await requirePermission('edit');
    const p = Id.safeParse(id);
    if (!p.success || (to !== 'no_aplica' && to !== 'pendiente')) return { ok: false, error: 'Datos no válidos' };
    await setQuestionStatus(user.tenantId, p.data, to);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo cambiar la pregunta');
  }
}

export async function answerManuallyAction(id: string, answer: string): Promise<Res> {
  try {
    const user = await requirePermission('edit');
    const p = Id.safeParse(id);
    if (!p.success || typeof answer !== 'string') return { ok: false, error: 'Datos no válidos' };
    await answerManually(user.tenantId, p.data, answer.slice(0, 4000), who(user));
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo guardar la respuesta');
  }
}

export async function applyAnswerToFichaAction(id: string): Promise<Res> {
  try {
    const user = await requirePermission('edit');
    const p = Id.safeParse(id);
    if (!p.success) return { ok: false, error: 'Datos no válidos' };
    await applyAnswerToFicha(user.tenantId, p.data);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo pasar a la ficha');
  }
}

export async function addQuestionsRecipientAction(clientId: string, contactId: string): Promise<Res> {
  try {
    const user = await requirePermission('edit');
    const c = Id.safeParse(clientId);
    const k = Id.safeParse(contactId);
    if (!c.success || !k.success) return { ok: false, error: 'Datos no válidos' };
    await addQuestionsRecipient(user.tenantId, c.data, k.data);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo marcar el contacto');
  }
}

export async function prepareQuestionsSendAction(
  clientId: string,
  input: { ids: string[]; delivery: 'correo' | 'cuestionario'; subject?: string; body?: string }
): Promise<Res<{ status: string; delivery: string; count: number }>> {
  try {
    const user = await requirePermission('edit');
    const c = Id.safeParse(clientId);
    const i = z
      .object({ ids: z.array(Id).min(1).max(60), delivery: z.enum(['correo', 'cuestionario']), subject: z.string().max(300).optional(), body: z.string().max(20000).optional() })
      .safeParse(input);
    if (!c.success || !i.success) return { ok: false, error: 'Datos no válidos' };
    const r = await prepareQuestionsSend(user.tenantId, c.data, i.data, { kind: 'persona', name: who(user), userId: user.id });
    refresh();
    return { ok: true, ...r };
  } catch (e) {
    return fail(e, 'No se pudo preparar el envío');
  }
}

export async function cancelQuestionnaireAction(clientId: string, questionnaireId: string): Promise<Res> {
  try {
    const user = await requirePermission('edit');
    const c = Id.safeParse(clientId);
    const q = Id.safeParse(questionnaireId);
    if (!c.success || !q.success) return { ok: false, error: 'Datos no válidos' };
    await cancelQuestionnaire(user.tenantId, c.data, q.data);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo anular el cuestionario');
  }
}

// --- Propuestas de la IA ---------------------------------------------------------------------------------------------

/** Para el banco (admin) o para un cliente concreto (edit). No guarda nada. */
export async function proposeQuestionsAction(input: { serviceKey: string | null; goal: string; clientId?: string | null }): Promise<Res<{ proposals: ProposedQuestion[] }>> {
  try {
    const user = await requirePermission(input?.clientId ? 'edit' : 'admin');
    const i = z.object({ serviceKey: z.string().max(40).nullable(), goal: z.string().max(1000), clientId: Id.nullable().optional() }).safeParse(input);
    if (!i.success) return { ok: false, error: 'Datos no válidos' };
    const proposals = await proposeQuestions(user.tenantId, i.data);
    if (!proposals.length) return { ok: false, error: 'La IA no ha propuesto ninguna pregunta nueva. Prueba a concretar más qué quieres saber.' };
    return { ok: true, proposals };
  } catch (e) {
    return fail(e, 'No se pudieron proponer preguntas');
  }
}

// --- Banco (toda la cuenta) -----------------------------------------------------------------------------------------

export async function createTemplateAction(input: z.infer<typeof TemplateInput> & { serviceKey: string | null }, fromAi = false): Promise<Res> {
  try {
    const user = await requirePermission('admin');
    const i = TemplateInput.extend({ serviceKey: z.string().max(40).nullable() }).safeParse(input);
    if (!i.success) return { ok: false, error: 'Datos no válidos' };
    await createTemplate(user.tenantId, i.data, who(user), fromAi === true ? 'ia' : 'manual');
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo añadir la pregunta');
  }
}

export async function updateTemplateAction(id: string, input: z.infer<typeof TemplateInput> & { active: boolean }): Promise<Res> {
  try {
    const user = await requirePermission('admin');
    const p = Id.safeParse(id);
    const i = TemplateInput.extend({ active: z.boolean() }).safeParse(input);
    if (!p.success || !i.success) return { ok: false, error: 'Datos no válidos' };
    await updateTemplate(user.tenantId, p.data, i.data, who(user));
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo guardar la pregunta');
  }
}

export async function deleteTemplateAction(id: string): Promise<Res> {
  try {
    const user = await requirePermission('admin');
    const p = Id.safeParse(id);
    if (!p.success) return { ok: false, error: 'Datos no válidos' };
    await deleteTemplate(user.tenantId, p.data);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo eliminar la pregunta');
  }
}

export async function moveTemplateAction(id: string, dir: 'up' | 'down'): Promise<Res> {
  try {
    const user = await requirePermission('admin');
    const p = Id.safeParse(id);
    if (!p.success || (dir !== 'up' && dir !== 'down')) return { ok: false, error: 'Datos no válidos' };
    await moveTemplate(user.tenantId, p.data, dir);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo mover la pregunta');
  }
}

export async function saveCommsTemplateAction(key: string, subject: string, body: string): Promise<Res> {
  try {
    const user = await requirePermission('admin');
    if (typeof key !== 'string' || typeof subject !== 'string' || typeof body !== 'string') return { ok: false, error: 'Datos no válidos' };
    await saveCommsTemplate(user.tenantId, key.slice(0, 40), subject.slice(0, 300), body.slice(0, 8000), who(user));
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo guardar el texto');
  }
}

export async function resetCommsTemplateAction(key: string): Promise<Res> {
  try {
    const user = await requirePermission('admin');
    if (typeof key !== 'string') return { ok: false, error: 'Datos no válidos' };
    await resetCommsTemplate(user.tenantId, key.slice(0, 40));
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo restaurar el texto');
  }
}

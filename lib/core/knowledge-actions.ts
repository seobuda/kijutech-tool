'use server';

// Acciones web de la base de conocimiento (NÚCLEO, 20 nov 2026). Permisos, siempre en el servidor:
//   - enviar una solicitud de entrada: «view» (cualquier persona del equipo con acceso);
//   - crear, editar, publicar, cambiar de estado, borrar y categorías: «admin» (solo publica Enric).
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import {
  archiveCategory,
  deleteArticle,
  KnowledgeError,
  markReviewed,
  redraftArticle,
  reviseWithInstruction,
  saveArticle,
  saveCategory,
  setArticleStatus,
  submitRequest,
  type ArticleInput
} from '@/lib/core/knowledge';
import { isKbStatus, type KbLink } from '@/lib/core/knowledge-rules';

type Ok<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (e: unknown, fallback: string): { ok: false; error: string } => ({
  ok: false,
  error: e instanceof KnowledgeError ? e.userMessage : publicError(e, fallback)
});

const refresh = (id?: string) => {
  revalidatePath('/dashboard/conocimiento');
  if (id) revalidatePath(`/dashboard/conocimiento/${id}`);
};

export async function saveArticleAction(id: string | null, input: ArticleInput, publish = false): Promise<Ok<{ id: string }>> {
  try {
    const user = await requirePermission('admin');
    const articleId = await saveArticle(user.tenantId, id, input, user.id, publish ? 'publicada' : 'borrador');
    if (id && publish) await setArticleStatus(user.tenantId, articleId, 'publicada', user.id);
    refresh(articleId);
    return { ok: true, id: articleId };
  } catch (e) {
    return fail(e, 'No se pudo guardar la entrada');
  }
}

export async function setArticleStatusAction(id: string, status: string): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    if (!isKbStatus(status)) return { ok: false, error: 'Estado no válido' };
    await setArticleStatus(user.tenantId, id, status, user.id);
    refresh(id);
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo cambiar el estado');
  }
}

export async function markReviewedAction(id: string): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    await markReviewed(user.tenantId, id, user.id);
    refresh(id);
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo marcar como revisada');
  }
}

export async function deleteArticleAction(id: string): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    await deleteArticle(user.tenantId, id);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo eliminar la entrada');
  }
}

/** La IA rehace la propuesta con la indicación de Enric (lo mismo que «Cambiar» en Telegram). */
export async function reviseArticleAction(id: string, instruction: string): Promise<Ok<{ message: string }>> {
  try {
    const user = await requirePermission('admin');
    const r = await reviseWithInstruction(user.tenantId, id, instruction, user.name || user.email);
    refresh(id);
    return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.message };
  } catch (e) {
    return fail(e, 'No se pudo rehacer la entrada');
  }
}

export async function redraftArticleAction(id: string): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    const done = await redraftArticle(user.tenantId, id);
    refresh(id);
    return done ? { ok: true } : { ok: false, error: 'La IA no ha podido redactarla ahora.' };
  } catch (e) {
    return fail(e, 'No se pudo redactar la entrada');
  }
}

/** Solicitud de una persona del equipo: la IA la redacta y a Enric le llega para aprobarla. */
export async function submitRequestAction(input: { text: string; links: KbLink[] }): Promise<Ok<{ drafted: boolean }>> {
  try {
    const user = await requirePermission('view');
    const r = await submitRequest(user.tenantId, { text: input.text, links: input.links, source: 'equipo', byName: user.name || user.email, byUserId: user.id });
    refresh();
    return { ok: true, drafted: r.drafted };
  } catch (e) {
    return fail(e, 'No se pudo enviar la solicitud');
  }
}

export async function saveCategoryAction(id: string | null, name: string): Promise<Ok<{ id: string }>> {
  try {
    const user = await requirePermission('admin');
    const cid = await saveCategory(user.tenantId, id, name);
    refresh();
    return { ok: true, id: cid };
  } catch (e) {
    return fail(e, 'No se pudo guardar la categoría');
  }
}

export async function archiveCategoryAction(id: string, archived: boolean): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    await archiveCategory(user.tenantId, id, archived);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo cambiar la categoría');
  }
}

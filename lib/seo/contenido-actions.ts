'use server';

// SEO · Briefs de contenido (parte 9a). Permiso «edit» en el servidor; el proyecto, siempre de la cuenta del usuario.
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { projects } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { BriefError, briefToTask, briefToWordPress, markBriefUsed, requestBrief, retryBrief, setBriefStatus } from '@/lib/seo/contenido/briefs';

type Ok = { ok: true; message?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATH = (id: string) => `/dashboard/projects/${id}/palabras`;

async function ownProject(tenantId: string, projectId: string): Promise<boolean> {
  if (!UUID.test(projectId)) return false;
  const [p] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  return Boolean(p);
}

export async function requestBriefAction(projectId: string, keyword: string, topicKey: string | null, targetUrl: string | null): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!(await ownProject(user.tenantId, projectId))) return { ok: false, error: 'Proyecto no encontrado' };
    await requestBrief(user.tenantId, projectId, { keyword: String(keyword ?? ''), topicKey: topicKey ? String(topicKey) : null, targetUrl: targetUrl ? String(targetUrl) : null }, user.name || user.email);
    revalidatePath(PATH(projectId));
    return { ok: true, message: 'Preparando el brief: en un par de minutos está listo (abajo, en «Briefs»).' };
  } catch (e) {
    if (e instanceof BriefError) return { ok: false, error: e.userMessage };
    return { ok: false, error: publicError(e, 'No se pudo pedir el brief') };
  }
}

export async function setBriefStatusAction(projectId: string, id: string, status: 'borrador' | 'listo' | 'archivado'): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!(await ownProject(user.tenantId, projectId)) || !UUID.test(id)) return { ok: false, error: 'No encontrado' };
    if (!['borrador', 'listo', 'archivado'].includes(status)) return { ok: false, error: 'Estado no válido' };
    if (!(await setBriefStatus(user.tenantId, projectId, id, status))) return { ok: false, error: 'No encontrado' };
    revalidatePath(PATH(projectId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo guardar') };
  }
}

export async function markBriefUsedAction(projectId: string, id: string, publishedUrl: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!(await ownProject(user.tenantId, projectId)) || !UUID.test(id)) return { ok: false, error: 'No encontrado' };
    const measured = await markBriefUsed(user.tenantId, projectId, id, String(publishedUrl ?? '').trim(), user.name || user.email);
    revalidatePath(PATH(projectId));
    return { ok: true, message: measured ? 'Hecho: se medirá si funcionó (Plan → Resultados, a partir de 4 semanas).' : 'Guardado. El proyecto no tiene cliente, así que no se puede medir: elige el cliente en el proyecto.' };
  } catch (e) {
    if (e instanceof BriefError) return { ok: false, error: e.userMessage };
    return { ok: false, error: publicError(e, 'No se pudo guardar') };
  }
}

export async function retryBriefAction(projectId: string, id: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!(await ownProject(user.tenantId, projectId)) || !UUID.test(id)) return { ok: false, error: 'No encontrado' };
    if (!(await retryBrief(user.tenantId, projectId, id))) return { ok: false, error: 'Solo se pueden reintentar los que fallaron' };
    revalidatePath(PATH(projectId));
    return { ok: true, message: 'Preparando de nuevo.' };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo reintentar') };
  }
}

export async function briefToTaskAction(projectId: string, id: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!(await ownProject(user.tenantId, projectId)) || !UUID.test(id)) return { ok: false, error: 'No encontrado' };
    const r = await briefToTask(user.tenantId, projectId, id, user.name || user.email);
    revalidatePath(PATH(projectId));
    return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.message };
  } catch (e) {
    if (e instanceof BriefError) return { ok: false, error: e.userMessage };
    return { ok: false, error: publicError(e, 'No se pudo crear el encargo') };
  }
}

/** Parte 9b: crear el borrador en el WordPress del cliente (entrada nueva, nunca publica). */
export async function briefToWordPressAction(projectId: string, id: string): Promise<Ok & { editUrl?: string }> {
  try {
    const user = await requirePermission('edit');
    if (!(await ownProject(user.tenantId, projectId)) || !UUID.test(id)) return { ok: false, error: 'Brief no encontrado' };
    const r = await briefToWordPress(user.tenantId, projectId, id);
    revalidatePath(PATH(projectId));
    return { ok: true, message: r.created ? 'Borrador creado en WordPress. Ábrelo para escribirlo; publicarlo lo hace una persona.' : 'Ya tenía su borrador en WordPress.', editUrl: r.editUrl };
  } catch (e) {
    if (e instanceof BriefError) return { ok: false, error: e.userMessage };
    return { ok: false, error: publicError(e, 'No se pudo crear el borrador') };
  }
}

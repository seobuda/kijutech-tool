'use server';

// SEO · Plan de mejora: acciones de la pantalla (Hito 1, 23 nov 2026). Permiso «edit» en el servidor (editor o más); el
// proyecto y la propuesta siempre de la cuenta del usuario.
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { approvePlanItem, discardPlanItem, PlanError, regeneratePlan, reopenPlanItem } from '@/lib/seo/plan/plan';

type Ok<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATH = (id: string) => `/dashboard/projects/${id}/plan`;
const err = (e: unknown, fallback: string) => (e instanceof PlanError ? e.userMessage : publicError(e, fallback));

export async function regeneratePlanAction(projectId: string): Promise<Ok<{ pending: number; created: number }>> {
  try {
    const user = await requirePermission('edit');
    if (!UUID.test(projectId)) return { ok: false, error: 'Proyecto no encontrado' };
    const r = await regeneratePlan(user.tenantId, projectId);
    revalidatePath(PATH(projectId));
    return { ok: true, pending: r.pending, created: r.created };
  } catch (e) {
    return { ok: false, error: err(e, 'No se pudo rehacer el plan') };
  }
}

export async function approvePlanItemAction(projectId: string, itemId: string, note?: string): Promise<Ok<{ message: string; url: string | null }>> {
  try {
    const user = await requirePermission('edit');
    if (!UUID.test(projectId) || !UUID.test(itemId)) return { ok: false, error: 'Propuesta no encontrada' };
    const r = await approvePlanItem(user.tenantId, projectId, itemId, user.name || user.email, note);
    revalidatePath(PATH(projectId));
    return r.ok ? { ok: true, message: r.message, url: r.url } : { ok: false, error: r.message };
  } catch (e) {
    return { ok: false, error: err(e, 'No se pudo aprobar') };
  }
}

export async function discardPlanItemAction(projectId: string, itemId: string, note: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!UUID.test(projectId) || !UUID.test(itemId)) return { ok: false, error: 'Propuesta no encontrada' };
    const ok = await discardPlanItem(user.tenantId, projectId, itemId, user.name || user.email, note || null);
    revalidatePath(PATH(projectId));
    return ok ? { ok: true } : { ok: false, error: 'Ya no está pendiente' };
  } catch (e) {
    return { ok: false, error: err(e, 'No se pudo descartar') };
  }
}

export async function reopenPlanItemAction(projectId: string, itemId: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!UUID.test(projectId) || !UUID.test(itemId)) return { ok: false, error: 'Propuesta no encontrada' };
    const ok = await reopenPlanItem(user.tenantId, projectId, itemId);
    revalidatePath(PATH(projectId));
    return ok ? { ok: true } : { ok: false, error: 'No estaba descartada' };
  } catch (e) {
    return { ok: false, error: err(e, 'No se pudo recuperar') };
  }
}

'use server';

// SEO · Plan de mejora: acciones de la pantalla (Hito 1, 23 nov 2026). Permiso «edit» en el servidor (editor o más); el
// proyecto y la propuesta siempre de la cuenta del usuario.
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { approvePlanItem, approveThisMonth, DISCARD_REASONS, discardPlanItem, PlanError, regeneratePlan, reopenPlanItem, type ApproveOptions, type DiscardReason } from '@/lib/seo/plan/plan';

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

/** Aprueba con lo elegido en la vista previa (lista, responsable, fecha, título, horas y páginas) o solo con una nota. */
export async function approvePlanItemAction(projectId: string, itemId: string, opts?: string | ApproveOptions): Promise<Ok<{ message: string; url: string | null }>> {
  try {
    const user = await requirePermission('edit');
    if (!UUID.test(projectId) || !UUID.test(itemId)) return { ok: false, error: 'Propuesta no encontrada' };
    const s = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : undefined);
    const o: ApproveOptions =
      typeof opts === 'string' || opts === undefined
        ? { note: s(opts, 1000) }
        : {
            note: s(opts.note, 1000),
            title: s(opts.title, 300),
            estHours: typeof opts.estHours === 'number' && Number.isFinite(opts.estHours) ? opts.estHours : undefined,
            urls: Array.isArray(opts.urls) ? opts.urls.filter((u) => typeof u === 'string').slice(0, 200) : undefined,
            listId: s(opts.listId, 50) ?? null,
            assigneeId: s(opts.assigneeId, 50) ?? null,
            dueDate: typeof opts.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(opts.dueDate) ? opts.dueDate : null
          };
    const r = await approvePlanItem(user.tenantId, projectId, itemId, user.name || user.email, o);
    revalidatePath(PATH(projectId));
    return r.ok ? { ok: true, message: r.message, url: r.url } : { ok: false, error: r.message };
  } catch (e) {
    return { ok: false, error: err(e, 'No se pudo aprobar') };
  }
}

export async function discardPlanItemAction(projectId: string, itemId: string, note: string, reason?: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!UUID.test(projectId) || !UUID.test(itemId)) return { ok: false, error: 'Propuesta no encontrada' };
    const why = reason && reason in DISCARD_REASONS ? (reason as DiscardReason) : null;
    const ok = await discardPlanItem(user.tenantId, projectId, itemId, user.name || user.email, typeof note === 'string' ? note.slice(0, 1000) : null, why);
    revalidatePath(PATH(projectId));
    return ok ? { ok: true } : { ok: false, error: 'Ya no está pendiente' };
  } catch (e) {
    return { ok: false, error: err(e, 'No se pudo descartar') };
  }
}

/** Aprueba de una vez lo que cabe este mes (con el responsable del servicio y la lista habitual del cliente). */
export async function approveThisMonthAction(projectId: string): Promise<Ok<{ message: string }>> {
  try {
    const user = await requirePermission('edit');
    if (!UUID.test(projectId)) return { ok: false, error: 'Proyecto no encontrado' };
    const r = await approveThisMonth(user.tenantId, projectId, user.name || user.email);
    revalidatePath(PATH(projectId));
    if (!r.approved && r.failed.length) return { ok: false, error: r.failed[0] };
    return { ok: true, message: `${r.approved} encargo(s) creados${r.failed.length ? `; ${r.failed.length} no se pudieron crear (${r.failed[0]})` : ''}.` };
  } catch (e) {
    return { ok: false, error: err(e, 'No se pudo aprobar') };
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

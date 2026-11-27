'use server';

// SEO · acciones del plan de servicio del Jefe SEO (docs/PLAN-SEO-JEFE.md, D2). Todas son de administrador: generar cuesta
// dinero (Opus) y aprobar cambia la estrategia del proyecto (decisión de Enric: el plan lo aprueba un admin).
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { projects } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { approvePlan, PlanError, rejectPlan, requestMasterPlan, scorePlanShadow } from '@/lib/seo/jefe/plan';

type Ok = { ok: true; message?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (e: unknown): Ok => ({ ok: false, error: e instanceof PlanError ? e.userMessage : publicError(e, 'No se pudo completar la acción') });
const paths = (id: string) => revalidatePath(`/dashboard/projects/${id}/servicio`);

async function ownProject(tenantId: string, projectId: string): Promise<boolean> {
  if (!UUID.test(projectId)) return false;
  const [p] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId), eq(projects.service, 'seo'))).limit(1);
  return Boolean(p);
}

export async function requestMasterPlanAction(projectId: string, horizonMonths: number): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    if (!(await ownProject(user.tenantId, projectId))) return { ok: false, error: 'Proyecto no encontrado' };
    const r = await requestMasterPlan(user.tenantId, projectId, user.name || user.email, Number(horizonMonths) || 12);
    paths(projectId);
    return { ok: true, message: `Preparando la versión ${r.version} (unos minutos). Quedará en sombra para que la revises.` };
  } catch (e) {
    return fail(e);
  }
}

export async function approvePlanAction(projectId: string, planId: string, note: string): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    if (!(await ownProject(user.tenantId, projectId)) || !UUID.test(planId)) return { ok: false, error: 'Plan no encontrado' };
    await approvePlan(user.tenantId, projectId, planId, user.name || user.email, String(note ?? '').trim() || null);
    paths(projectId);
    return { ok: true, message: 'Plan aprobado: es el plan de servicio vigente del proyecto.' };
  } catch (e) {
    return fail(e);
  }
}

export async function rejectPlanAction(projectId: string, planId: string, reason: string): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    if (!(await ownProject(user.tenantId, projectId)) || !UUID.test(planId)) return { ok: false, error: 'Plan no encontrado' };
    await rejectPlan(user.tenantId, projectId, planId, user.name || user.email, String(reason ?? ''));
    paths(projectId);
    return { ok: true, message: 'Rechazado. El motivo se tendrá en cuenta en la siguiente versión.' };
  } catch (e) {
    return fail(e);
  }
}

export async function scorePlanAction(projectId: string, planId: string, score: number, note: string): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    if (!(await ownProject(user.tenantId, projectId)) || !UUID.test(planId)) return { ok: false, error: 'Plan no encontrado' };
    await scorePlanShadow(user.tenantId, projectId, planId, Number(score), String(note ?? ''));
    paths(projectId);
    return { ok: true, message: 'Nota guardada.' };
  } catch (e) {
    return fail(e);
  }
}

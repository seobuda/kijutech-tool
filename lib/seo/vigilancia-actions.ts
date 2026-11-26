'use server';

// SEO · Vigilancia continua: acciones de la pestaña Salud (parte 0, 26 nov 2026). Permiso «edit» en el servidor, y el
// proyecto siempre de la cuenta del usuario. Cambiar la frecuencia, pausar o lanzar ahora un proceso del proyecto.
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { projects } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { enqueueJob, pauseSchedule, setScheduleEvery } from '@/lib/core/jobs';
import { SEO_PROCESSES, isSeoProcessKey } from '@/lib/seo/vigilancia/rules';

type Ok = { ok: true; message?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ownProject(tenantId: string, projectId: string): Promise<boolean> {
  if (!UUID.test(projectId)) return false;
  const [p] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  return Boolean(p);
}

export async function setVigilanciaEveryAction(projectId: string, key: string, everyMinutes: number): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!isSeoProcessKey(key) || !(await ownProject(user.tenantId, projectId))) return { ok: false, error: 'Proceso no encontrado' };
    if (!(SEO_PROCESSES[key].options as readonly number[]).includes(everyMinutes)) return { ok: false, error: 'Frecuencia no válida' };
    if (!(await setScheduleEvery(user.tenantId, key, projectId, everyMinutes))) return { ok: false, error: 'El proceso aún no está programado' };
    revalidatePath(`/dashboard/projects/${projectId}/salud`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo cambiar la frecuencia') };
  }
}

/** Pausar unos días (1-90) o reanudar (days = 0). */
export async function pauseVigilanciaAction(projectId: string, key: string, days: number): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!isSeoProcessKey(key) || !(await ownProject(user.tenantId, projectId))) return { ok: false, error: 'Proceso no encontrado' };
    if (!Number.isInteger(days) || days < 0 || days > 90) return { ok: false, error: 'Pausa no válida' };
    const until = days ? new Date(Date.now() + days * 86_400_000) : null;
    if (!(await pauseSchedule(user.tenantId, key, projectId, { pausedUntil: until }))) return { ok: false, error: 'El proceso aún no está programado' };
    revalidatePath(`/dashboard/projects/${projectId}/salud`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo pausar') };
  }
}

export async function runVigilanciaNowAction(projectId: string, key: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!isSeoProcessKey(key) || !(await ownProject(user.tenantId, projectId))) return { ok: false, error: 'Proceso no encontrado' };
    const r = await enqueueJob({ tenantId: user.tenantId, kind: key, payload: { projectId }, scopeType: 'proyecto', scopeId: projectId, priority: 3, dedupeKey: `manual:${key}:${projectId}` });
    revalidatePath(`/dashboard/projects/${projectId}/salud`);
    return { ok: true, message: r.created ? 'En marcha: el resultado aparece en unos minutos.' : 'Ya estaba en marcha.' };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo lanzar') };
  }
}

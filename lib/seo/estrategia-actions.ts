'use server';

// SEO · acciones de la sección «Estrategia» (ciclos; docs/PLAN-SEO-CICLOS.md). Decisión de Enric: crear, aprobar el lote del
// mes y cancelar una estrategia es solo de administradores. «Encargar ahora» (la pasada de cada día, a mano): edición.
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { projects } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { approveMonth, cancelCycle, createCycle, CycleError, materialize } from '@/lib/seo/estrategia/ciclos';

type Ok = { ok: true; message?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const path = (id: string) => `/dashboard/projects/${id}/estrategia`;
const fail = (e: unknown): Ok => ({ ok: false, error: e instanceof CycleError ? e.userMessage : publicError(e, 'No se pudo completar la acción') });

async function ownProject(tenantId: string, projectId: string): Promise<boolean> {
  if (!UUID.test(projectId)) return false;
  const [p] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  return Boolean(p);
}

export async function createCycleAction(projectId: string, input: { name: string; months: number; startsOn: string; reservePct: number; thesis: string; lines: { playbook: string; params: Record<string, unknown> }[] }): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    if (!(await ownProject(user.tenantId, projectId))) return { ok: false, error: 'Proyecto no encontrado' };
    const lines = Array.isArray(input?.lines) ? input.lines.slice(0, 5).map((l) => ({ playbook: String(l?.playbook ?? ''), params: l?.params && typeof l.params === 'object' ? l.params : {} })) : [];
    await createCycle(user.tenantId, projectId, { name: String(input?.name ?? ''), months: Number(input?.months ?? 3), startsOn: String(input?.startsOn ?? ''), reservePct: Number(input?.reservePct ?? 30), thesis: String(input?.thesis ?? ''), lines }, user.name || user.email);
    revalidatePath(path(projectId));
    return { ok: true, message: 'Estrategia activa. Aprueba el lote del primer mes para que empiecen los encargos.' };
  } catch (e) {
    return fail(e);
  }
}

export async function approveMonthAction(projectId: string, month: string): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    if (!(await ownProject(user.tenantId, projectId))) return { ok: false, error: 'Proyecto no encontrado' };
    const n = await approveMonth(user.tenantId, projectId, String(month), user.name || user.email);
    const r = await materialize(user.tenantId, projectId, user.name || user.email);
    revalidatePath(path(projectId));
    return { ok: true, message: `${n} tarea(s) aprobada(s). ${r.encargados ? `${r.encargados} encargada(s) ya (las de las próximas 2 semanas).` : 'Se encargan solas cuando falten 2 semanas.'}${r.errores.length ? ` ${r.errores.length} con error: ${r.errores[0]}` : ''}` };
  } catch (e) {
    return fail(e);
  }
}

export async function cancelCycleAction(projectId: string, cycleId: string, reason: string): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    if (!(await ownProject(user.tenantId, projectId)) || !UUID.test(cycleId)) return { ok: false, error: 'Estrategia no encontrada' };
    const why = String(reason ?? '').trim();
    if (why.length < 3) return { ok: false, error: 'Escribe por qué se cancela (queda en el historial).' };
    await cancelCycle(user.tenantId, projectId, cycleId, why);
    revalidatePath(path(projectId));
    return { ok: true, message: 'Estrategia cancelada: lo pendiente se ha saltado; lo ya encargado sigue su curso.' };
  } catch (e) {
    return fail(e);
  }
}

export async function materializeNowAction(projectId: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!(await ownProject(user.tenantId, projectId))) return { ok: false, error: 'Proyecto no encontrado' };
    const r = await materialize(user.tenantId, projectId, user.name || user.email);
    revalidatePath(path(projectId));
    return { ok: true, message: `${r.encargados} encargada(s), ${r.hechos} hecha(s), ${r.saltados} saltada(s).${r.errores.length ? ` Errores: ${r.errores.slice(0, 2).join(' · ')}` : ''}` };
  } catch (e) {
    return fail(e);
  }
}

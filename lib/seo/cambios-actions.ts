'use server';

// SEO · Páginas de dinero (parte 6, 6b): fijar y quitar páginas vigiladas. Permiso «edit» en el servidor; el proyecto,
// siempre de la cuenta del usuario; solo páginas de la web del propio proyecto (nada de pedir webs ajenas).
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { projects } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { pinMoneyPage, unpinMoneyPage } from '@/lib/seo/cambios/dinero';

type Ok = { ok: true; message?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ownProject(tenantId: string, projectId: string): Promise<boolean> {
  if (!UUID.test(projectId)) return false;
  const [p] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  return Boolean(p);
}

export async function pinMoneyPageAction(projectId: string, url: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!(await ownProject(user.tenantId, projectId))) return { ok: false, error: 'Proyecto no encontrado' };
    const r = await pinMoneyPage(user.tenantId, projectId, String(url ?? '').slice(0, 2000));
    if (!r.ok) return r;
    revalidatePath(`/dashboard/projects/${projectId}/salud`);
    return { ok: true, message: 'Fijada: se vigila desde la próxima pasada.' };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo fijar') };
  }
}

export async function unpinMoneyPageAction(projectId: string, id: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!(await ownProject(user.tenantId, projectId)) || !UUID.test(id)) return { ok: false, error: 'No encontrada' };
    if (!(await unpinMoneyPage(projectId, id))) return { ok: false, error: 'No encontrada' };
    revalidatePath(`/dashboard/projects/${projectId}/salud`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo quitar') };
  }
}

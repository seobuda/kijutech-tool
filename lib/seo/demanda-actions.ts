'use server';

// SEO · Demanda (parte 7): ideas de palabras (bajo demanda, con coste) y su estado. Permiso «edit» en el servidor; el
// proyecto, siempre de la cuenta del usuario.
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { projects } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { enqueueJob } from '@/lib/core/jobs';
import { DemandaError, generateIdeas, setIdeaStatus } from '@/lib/seo/demanda/demanda';

type Ok = { ok: true; message?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATH = (id: string) => `/dashboard/projects/${id}/palabras`;

async function ownProject(tenantId: string, projectId: string): Promise<boolean> {
  if (!UUID.test(projectId)) return false;
  const [p] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  return Boolean(p);
}

export async function generateIdeasAction(projectId: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!(await ownProject(user.tenantId, projectId))) return { ok: false, error: 'Proyecto no encontrado' };
    const n = await generateIdeas(user.tenantId, projectId);
    revalidatePath(PATH(projectId));
    return { ok: true, message: n ? `${n} ideas nuevas: decide cuáles seguir.` : 'No hay ideas nuevas (todas se conocían o no tenían búsquedas).' };
  } catch (e) {
    if (e instanceof DemandaError) return { ok: false, error: e.userMessage };
    return { ok: false, error: publicError(e, 'No se pudieron buscar ideas') };
  }
}

export async function setIdeaStatusAction(projectId: string, id: string, status: 'seguida' | 'descartada' | 'nueva'): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!(await ownProject(user.tenantId, projectId)) || !UUID.test(id)) return { ok: false, error: 'No encontrada' };
    if (!['seguida', 'descartada', 'nueva'].includes(status)) return { ok: false, error: 'Estado no válido' };
    const r = await setIdeaStatus(user.tenantId, projectId, id, status);
    revalidatePath(PATH(projectId));
    return r;
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo guardar') };
  }
}

export async function runDemandNowAction(projectId: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!(await ownProject(user.tenantId, projectId))) return { ok: false, error: 'Proyecto no encontrado' };
    // Misma clave que el proceso programado: nunca dos pasadas a la vez.
    const r = await enqueueJob({ tenantId: user.tenantId, kind: 'seo.demanda', payload: { projectId }, scopeType: 'proyecto', scopeId: projectId, priority: 4, dedupeKey: `sched:seo.demanda:${projectId}` });
    revalidatePath(PATH(projectId));
    return { ok: true, message: r.created ? 'En marcha: en unos minutos se actualiza.' : 'Ya estaba en marcha.' };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo lanzar') };
  }
}

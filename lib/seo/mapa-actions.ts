'use server';

// SEO · Mapa de palabras: acciones de la pantalla (Hito 2, 24 nov 2026). Permiso «edit» en el servidor; el proyecto y el
// tema siempre de la cuenta del usuario.
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clientCompetitors, projects, seoTopics } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { gscPropertiesForProject } from '@/lib/core/gsc';
import { enqueueKeywordMap } from '@/lib/seo/mapa/mapa';
import { serpSource } from '@/lib/core/capabilities';
import { crawlCompetitors, enqueueCompetitors } from '@/lib/seo/competencia/competencia';

type Ok = { ok: true } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATH = (id: string) => `/dashboard/projects/${id}/palabras`;

export async function buildKeywordMapAction(projectId: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!UUID.test(projectId)) return { ok: false, error: 'Proyecto no encontrado' };
    const [p] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, user.tenantId))).limit(1);
    if (!p) return { ok: false, error: 'Proyecto no encontrado' };
    if (!(await gscPropertiesForProject(user.tenantId, projectId)).length) return { ok: false, error: 'El proyecto no tiene Search Console en su alcance: edita el proyecto y marca la propiedad.' };
    await enqueueKeywordMap(user.tenantId, projectId);
    revalidatePath(PATH(projectId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo poner en marcha') };
  }
}

/** Descartar un tema (no es del negocio) o recuperarlo; cambiarle el nombre. */
export async function updateTopicAction(projectId: string, topicId: string, patch: { status?: 'activo' | 'descartado'; name?: string }): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!UUID.test(projectId) || !UUID.test(topicId)) return { ok: false, error: 'Tema no encontrado' };
    const set: Partial<typeof seoTopics.$inferInsert> = { updatedAt: new Date() };
    if (patch.status) {
      if (!['activo', 'descartado'].includes(patch.status)) return { ok: false, error: 'Estado no válido' };
      set.status = patch.status;
    }
    if (patch.name !== undefined) {
      const n = patch.name.trim().slice(0, 200);
      if (!n) return { ok: false, error: 'Escribe un nombre' };
      set.name = n;
      set.namedBy = 'persona';
    }
    const r = await db
      .update(seoTopics)
      .set(set)
      .where(and(eq(seoTopics.id, topicId), eq(seoTopics.projectId, projectId), eq(seoTopics.tenantId, user.tenantId)))
      .returning({ id: seoTopics.id });
    if (!r.length) return { ok: false, error: 'Tema no encontrado' };
    // Descartar o recuperar un tema cambia sus oportunidades: se rehace el mapa (y con él, el plan).
    if (patch.status) await enqueueKeywordMap(user.tenantId, projectId);
    revalidatePath(PATH(projectId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo guardar') };
  }
}

/** Buscar la competencia en Google (DataForSEO, por el núcleo). */
export async function findCompetitorsAction(projectId: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!UUID.test(projectId)) return { ok: false, error: 'Proyecto no encontrado' };
    const [p] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, user.tenantId))).limit(1);
    if (!p) return { ok: false, error: 'Proyecto no encontrado' };
    const src = serpSource();
    if (!src || !(await src.isConnected(user.tenantId))) return { ok: false, error: 'Conecta DataForSEO en Agentes → Integraciones para buscar la competencia.' };
    await enqueueCompetitors(user.tenantId, projectId);
    revalidatePath(PATH(projectId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo poner en marcha') };
  }
}

/** Confirmar o descartar un competidor propuesto (o volver a proponerlo). */
export async function decideCompetitorAction(projectId: string, competitorId: string, status: 'confirmado' | 'descartado' | 'propuesto'): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!UUID.test(projectId) || !UUID.test(competitorId)) return { ok: false, error: 'Competidor no encontrado' };
    if (!['confirmado', 'descartado', 'propuesto'].includes(status)) return { ok: false, error: 'Estado no válido' };
    const [p] = await db.select({ clientId: projects.clientId }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, user.tenantId))).limit(1);
    if (!p?.clientId) return { ok: false, error: 'Proyecto no encontrado' };
    const r = await db
      .update(clientCompetitors)
      .set({ status })
      .where(and(eq(clientCompetitors.id, competitorId), eq(clientCompetitors.clientId, p.clientId), eq(clientCompetitors.tenantId, user.tenantId)))
      .returning({ id: clientCompetitors.id });
    if (!r.length) return { ok: false, error: 'Competidor no encontrado' };
    // Al confirmarlo, rastreo ligero de su web para compararla (si no hay uno de los últimos 30 días). Si falla, la
    // confirmación vale igual: se puede lanzar después con «Rastrear sus webs».
    if (status === 'confirmado') await crawlCompetitors(user.tenantId, projectId, competitorId).catch((e) => console.error('[seo.competencia] rastreo al confirmar', e));
    revalidatePath(PATH(projectId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo guardar') };
  }
}

/** Rastreo ligero de las webs de la competencia confirmada (las que no tienen uno de los últimos 30 días). */
export async function crawlCompetitorsAction(projectId: string): Promise<{ ok: true; started: number } | { ok: false; error: string }> {
  try {
    const user = await requirePermission('edit');
    if (!UUID.test(projectId)) return { ok: false, error: 'Proyecto no encontrado' };
    const [p] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, user.tenantId))).limit(1);
    if (!p) return { ok: false, error: 'Proyecto no encontrado' };
    const r = await crawlCompetitors(user.tenantId, projectId);
    revalidatePath(PATH(projectId));
    return { ok: true, started: r.started };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo empezar el rastreo') };
  }
}

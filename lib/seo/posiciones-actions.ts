'use server';

// SEO · Posiciones: acciones de la pestaña (parte 4, 26 nov 2026). Permiso «edit» en el servidor; el proyecto y la
// búsqueda siempre de la cuenta del usuario. Añadir una búsqueda, pausarla o quitarla (lo quitado no vuelve a proponerse)
// y «Consultar ahora» (no si hay una consulta en curso o de hace menos de 12 h: el tope de gasto no es atómico).
import { revalidatePath } from 'next/cache';
import { and, count, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { projects, seoRankKeywords } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { enqueueJob } from '@/lib/core/jobs';
import { kwKey, MAX_KEYWORDS, keywordLanguage } from '@/lib/seo/posiciones/rules';
import { recentOrOpenCheck } from '@/lib/seo/posiciones/view';

type Ok = { ok: true; message?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATH = (id: string) => `/dashboard/projects/${id}/posiciones`;

async function ownProject(tenantId: string, projectId: string): Promise<boolean> {
  if (!UUID.test(projectId)) return false;
  const [p] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  return Boolean(p);
}

export async function addRankKeywordAction(projectId: string, raw: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!(await ownProject(user.tenantId, projectId))) return { ok: false, error: 'Proyecto no encontrado' };
    const keyword = raw.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
    const key = kwKey(keyword);
    if (key.length < 3) return { ok: false, error: 'Escribe la búsqueda (3 letras o más).' };
    const [{ n }] = await db.select({ n: count() }).from(seoRankKeywords).where(and(eq(seoRankKeywords.projectId, projectId), eq(seoRankKeywords.status, 'activa')));
    if (Number(n) >= MAX_KEYWORDS) return { ok: false, error: `Ya hay ${MAX_KEYWORDS} búsquedas activas: pausa o quita alguna antes.` };
    await db
      .insert(seoRankKeywords)
      .values({ tenantId: user.tenantId, projectId, keyword, keywordKey: key.slice(0, 150), origin: 'manual', language: keywordLanguage(keyword, ['es', 'ca']) })
      .onConflictDoUpdate({ target: [seoRankKeywords.projectId, seoRankKeywords.keywordKey, seoRankKeywords.device], set: { status: 'activa', origin: 'manual', updatedAt: new Date() } });
    revalidatePath(PATH(projectId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo añadir la búsqueda') };
  }
}

export async function setRankKeywordStatusAction(projectId: string, keywordId: string, status: 'activa' | 'pausada' | 'quitada'): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!(await ownProject(user.tenantId, projectId)) || !UUID.test(keywordId)) return { ok: false, error: 'Búsqueda no encontrada' };
    if (!['activa', 'pausada', 'quitada'].includes(status)) return { ok: false, error: 'Estado no válido' };
    const rows = await db
      .update(seoRankKeywords)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(seoRankKeywords.id, keywordId), eq(seoRankKeywords.projectId, projectId), eq(seoRankKeywords.tenantId, user.tenantId)))
      .returning({ id: seoRankKeywords.id });
    if (!rows.length) return { ok: false, error: 'Búsqueda no encontrada' };
    revalidatePath(PATH(projectId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo cambiar la búsqueda') };
  }
}

export async function checkPositionsNowAction(projectId: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!(await ownProject(user.tenantId, projectId))) return { ok: false, error: 'Proyecto no encontrado' };
    if (await recentOrOpenCheck(projectId)) return { ok: false, error: 'Ya hay una consulta en curso o de hace menos de 12 horas.' };
    // Misma clave que el proceso programado: nunca corren dos a la vez para el mismo proyecto (no se paga dos veces).
    const r = await enqueueJob({ tenantId: user.tenantId, kind: 'seo.posiciones', payload: { projectId }, scopeType: 'proyecto', scopeId: projectId, priority: 4, dedupeKey: `sched:seo.posiciones:${projectId}` });
    revalidatePath(PATH(projectId));
    return { ok: true, message: r.created ? 'Enviada: los resultados llegan en unos minutos (la pantalla se refresca sola).' : 'Ya había una consulta en marcha.' };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo consultar') };
  }
}

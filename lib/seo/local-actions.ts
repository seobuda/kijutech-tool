'use server';

// SEO · Local (tanda 5a): acciones de la pestaña Local. Permiso «edit» en el servidor; el proyecto y la ficha siempre de
// la cuenta del usuario. Cada consulta a DataForSEO comprueba el tope de gasto del proyecto.
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { projects, seoLocalPlaces } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { enqueueJob } from '@/lib/core/jobs';
import { cidFromInput } from '@/lib/seo/local/ficha-rules';
import { acceptChanges, decidePlace, proposeClientPlace, proposeCompetitorPlaces, setPlaceFromCid } from '@/lib/seo/local/ficha';

type Ok = { ok: true; message?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATH = (id: string) => `/dashboard/projects/${id}/local`;

async function ownProject(tenantId: string, projectId: string) {
  if (!UUID.test(projectId)) return null;
  const [p] = await db.select({ id: projects.id, clientId: projects.clientId }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  return p ?? null;
}

/** La ficha debe ser del cliente del proyecto (y de la cuenta). */
async function ownPlace(tenantId: string, projectId: string, placeRowId: string) {
  const p = await ownProject(tenantId, projectId);
  if (!p?.clientId || !UUID.test(placeRowId)) return null;
  const [pl] = await db.select({ id: seoLocalPlaces.id }).from(seoLocalPlaces).where(and(eq(seoLocalPlaces.id, placeRowId), eq(seoLocalPlaces.tenantId, tenantId), eq(seoLocalPlaces.clientId, p.clientId))).limit(1);
  return pl ?? null;
}

export async function proposeClientPlaceAction(projectId: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!(await ownProject(user.tenantId, projectId))) return { ok: false, error: 'Proyecto no encontrado' };
    const r = await proposeClientPlace(user.tenantId, projectId);
    revalidatePath(PATH(projectId));
    return r.found ? { ok: true, message: r.matches ? 'Encontrada: coincide su web o su teléfono. Confírmala.' : 'Encontrada una ficha: revisa que sea la suya antes de confirmarla.' } : { ok: false, error: 'No se encontró por nombre y población: pega el enlace de su ficha en Google Maps.' };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo buscar la ficha') };
  }
}

export async function setPlaceFromUrlAction(projectId: string, raw: string, role: 'cliente' | 'competidor'): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!(await ownProject(user.tenantId, projectId))) return { ok: false, error: 'Proyecto no encontrado' };
    if (role !== 'cliente' && role !== 'competidor') return { ok: false, error: 'Papel no válido' };
    const cid = cidFromInput(raw.slice(0, 2000));
    if (!cid) return { ok: false, error: 'No reconozco el enlace: copia la URL de la ficha en Google Maps (la que lleva «cid=» o «0x…:0x…») o pega el número CID.' };
    const info = await setPlaceFromCid(user.tenantId, projectId, cid, role, (user.name || user.email).slice(0, 120));
    revalidatePath(PATH(projectId));
    return info ? { ok: true, message: `Guardada: ${info.title}.` } : { ok: false, error: 'Google no devolvió esa ficha.' };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo guardar la ficha') };
  }
}

export async function decidePlaceAction(projectId: string, placeRowId: string, status: 'confirmada' | 'descartada'): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!['confirmada', 'descartada'].includes(status) || !(await ownPlace(user.tenantId, projectId, placeRowId))) return { ok: false, error: 'Ficha no encontrada' };
    await decidePlace(user.tenantId, placeRowId, status, (user.name || user.email).slice(0, 120));
    revalidatePath(PATH(projectId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo guardar') };
  }
}

export async function acceptPlaceChangesAction(projectId: string, placeRowId: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!(await ownPlace(user.tenantId, projectId, placeRowId))) return { ok: false, error: 'Ficha no encontrada' };
    await acceptChanges(user.tenantId, placeRowId, (user.name || user.email).slice(0, 120));
    revalidatePath(PATH(projectId));
    return { ok: true, message: 'Aceptado: lo actual pasa a ser lo confirmado.' };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo aceptar') };
  }
}

export async function proposeCompetitorPlacesAction(projectId: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!(await ownProject(user.tenantId, projectId))) return { ok: false, error: 'Proyecto no encontrado' };
    const n = await proposeCompetitorPlaces(user.tenantId, projectId);
    revalidatePath(PATH(projectId));
    return n ? { ok: true, message: `${n} ficha(s) de competidores propuestas: confírmalas.` } : { ok: false, error: 'No hay competidores directos confirmados sin ficha (confírmalos en Palabras → Competencia).' };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudieron buscar') };
  }
}

export async function checkLocalNowAction(projectId: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!(await ownProject(user.tenantId, projectId))) return { ok: false, error: 'Proyecto no encontrado' };
    // Misma clave que el proceso programado: nunca corren dos a la vez.
    const r = await enqueueJob({ tenantId: user.tenantId, kind: 'seo.local', payload: { projectId }, scopeType: 'proyecto', scopeId: projectId, priority: 4, dedupeKey: `sched:seo.local:${projectId}` });
    revalidatePath(PATH(projectId));
    return { ok: true, message: r.created ? 'En marcha: en un minuto se actualiza.' : 'Ya estaba en marcha.' };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo lanzar') };
  }
}

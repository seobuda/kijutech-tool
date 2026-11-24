'use server';

// SEO · Expediente: acciones de la pantalla (Hito 1, 23 nov 2026). Permiso «edit» en el servidor; el proyecto y el dato
// siempre de la cuenta del usuario. Pasar un dato a la ficha del cliente es una decisión explícita de una persona.
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { projects, seoDossierFacts } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { isBusinessType } from '@/lib/core/business-types';
import { updateCoreClient } from '@/lib/core/clients';
import { enqueueDossier } from '@/lib/seo/expediente/collect';
import { DOSSIER_FIELD_SET, normPhone } from '@/lib/seo/expediente/rules';
import { prepareQuestions } from '@/lib/seo/preguntas/preguntas';

type Ok = { ok: true } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATH = (id: string) => `/dashboard/projects/${id}/expediente`;

async function ownProject(tenantId: string, projectId: string) {
  if (!UUID.test(projectId)) return null;
  const [p] = await db.select({ id: projects.id, clientId: projects.clientId }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  return p ?? null;
}

export async function collectDossierAction(projectId: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    const p = await ownProject(user.tenantId, projectId);
    if (!p) return { ok: false, error: 'Proyecto no encontrado' };
    if (!p.clientId) return { ok: false, error: 'El proyecto no tiene cliente: edítalo y elige el cliente.' };
    await enqueueDossier(user.tenantId, projectId);
    revalidatePath(PATH(projectId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo poner en marcha') };
  }
}

export async function decideDossierFactAction(projectId: string, factId: string, status: 'confirmado' | 'descartado' | 'provisional'): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!['confirmado', 'descartado', 'provisional'].includes(status) || !UUID.test(factId)) return { ok: false, error: 'Dato no válido' };
    const p = await ownProject(user.tenantId, projectId);
    if (!p) return { ok: false, error: 'Proyecto no encontrado' };
    const r = await db
      .update(seoDossierFacts)
      .set({ status, decidedBy: status === 'provisional' ? null : (user.name || user.email).slice(0, 120), decidedAt: status === 'provisional' ? null : new Date(), updatedAt: new Date() })
      .where(and(eq(seoDossierFacts.id, factId), eq(seoDossierFacts.projectId, projectId), eq(seoDossierFacts.tenantId, user.tenantId)))
      .returning({ id: seoDossierFacts.id });
    if (!r.length) return { ok: false, error: 'Dato no encontrado' };
    revalidatePath(PATH(projectId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo guardar') };
  }
}

/** Una persona escribe el dato correcto (origen «persona», confirmado). */
export async function savePersonaFactAction(projectId: string, field: string, raw: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    const p = await ownProject(user.tenantId, projectId);
    if (!p) return { ok: false, error: 'Proyecto no encontrado' };
    if (!DOSSIER_FIELD_SET.has(field) || field === 'direccion' || field === 'marca_en_google') return { ok: false, error: 'Ese dato no se escribe a mano aquí' };
    const text = raw.trim().slice(0, 500);
    if (!text) return { ok: false, error: 'Escribe el dato' };
    let value: unknown = text;
    if (field === 'telefono') {
      value = normPhone(text);
      if (!value) return { ok: false, error: 'Teléfono no válido' };
    } else if (field === 'tipo_negocio' && !isBusinessType(text)) return { ok: false, error: 'Tipo de negocio no válido' };
    else if (field === 'perfiles') value = text.split(/[\s,]+/).filter((x) => /^https?:\/\//i.test(x)).slice(0, 12);
    else if (field === 'servicios') value = [...new Set(text.split(/[,;\n]/).map((x) => x.trim()).filter((x) => x.length >= 2))].slice(0, 15);
    const by = (user.name || user.email).slice(0, 120);
    await db
      .insert(seoDossierFacts)
      .values({ tenantId: user.tenantId, projectId, field, value: value as object, source: 'persona', confidence: 100, status: 'confirmado', decidedBy: by, decidedAt: new Date() })
      .onConflictDoUpdate({
        target: [seoDossierFacts.projectId, seoDossierFacts.field, seoDossierFacts.source],
        set: { value: value as object, status: 'confirmado', decidedBy: by, decidedAt: new Date(), updatedAt: new Date() }
      });
    revalidatePath(PATH(projectId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo guardar') };
  }
}

/** Pasa a la ficha del cliente un dato que la ficha guarda como campo propio (tipo de negocio, logo). */
export async function applyFactToFichaAction(projectId: string, factId: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    const p = await ownProject(user.tenantId, projectId);
    if (!p?.clientId) return { ok: false, error: 'El proyecto no tiene cliente' };
    if (!UUID.test(factId)) return { ok: false, error: 'Dato no encontrado' };
    const [f] = await db
      .select()
      .from(seoDossierFacts)
      .where(and(eq(seoDossierFacts.id, factId), eq(seoDossierFacts.projectId, projectId), eq(seoDossierFacts.tenantId, user.tenantId)))
      .limit(1);
    if (!f) return { ok: false, error: 'Dato no encontrado' };
    if (f.field === 'tipo_negocio' && typeof f.value === 'string' && isBusinessType(f.value)) await updateCoreClient(user.tenantId, p.clientId, { businessType: f.value });
    else if (f.field === 'logo' && typeof f.value === 'string' && /^https:\/\//i.test(f.value)) await updateCoreClient(user.tenantId, p.clientId, { logoUrl: f.value });
    else if (f.field === 'servicios' && Array.isArray(f.value) && f.value.length) await updateCoreClient(user.tenantId, p.clientId, { offerings: f.value.map(String).join('\n') });
    else return { ok: false, error: 'Este dato se cambia en la ficha del cliente (Locales, Webs y cuentas).' };
    await db.update(seoDossierFacts).set({ status: 'confirmado', decidedBy: (user.name || user.email).slice(0, 120), decidedAt: new Date(), updatedAt: new Date() }).where(eq(seoDossierFacts.id, f.id));
    await enqueueDossier(user.tenantId, projectId);
    revalidatePath(PATH(projectId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo pasar a la ficha') };
  }
}

/** Prepara el correo de preguntas al cliente (sale del buzón del agente solo cuando Enric lo aprueba). */
export async function prepareQuestionsAction(projectId: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    const p = await ownProject(user.tenantId, projectId);
    if (!p) return { ok: false, error: 'Proyecto no encontrado' };
    const r = await prepareQuestions(user.tenantId, projectId, { kind: 'persona', name: (user.name || user.email).slice(0, 120), userId: user.id });
    if (!r.ok) return { ok: false, error: r.error };
    revalidatePath(PATH(projectId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo preparar el correo') };
  }
}

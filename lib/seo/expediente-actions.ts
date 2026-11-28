'use server';

// SEO · Expediente: acciones de la pantalla (Hito 1, 23 nov 2026). Permiso «edit» en el servidor; el proyecto y el dato
// siempre de la cuenta del usuario. Pasar un dato a la ficha del cliente es una decisión explícita de una persona.
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clients, projects, seoDossierFacts } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { isBusinessType } from '@/lib/core/business-types';
import { updateCoreClient } from '@/lib/core/clients';
import { enqueueDossier } from '@/lib/seo/expediente/collect';
import { ATENCION_OPTIONS, DOSSIER_FIELD_SET, normPhone } from '@/lib/seo/expediente/rules';
import { enqueueProposal } from '@/lib/seo/alta/alta';

type Ok = { ok: true } | { ok: false; error: string; needsReplace?: string };
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
    else if (field === 'atencion' && !ATENCION_OPTIONS.some((o) => o.value === text)) return { ok: false, error: 'Elige una opción' };
    else if (field === 'idiomas') {
      value = [...new Set(text.toLowerCase().split(/[\s,;]+/).filter((x) => /^[a-z]{2}$/.test(x)))].slice(0, 4);
      if (!(value as string[]).length) return { ok: false, error: 'Escribe los códigos de idioma, p. ej. «es, ca»' };
    } else if (field === 'telefonos_antiguos') {
      value = [...new Set(text.split(/[,;\n]/).map((x) => normPhone(x.trim())).filter((x): x is string => Boolean(x)))].slice(0, 5);
      if (!(value as string[]).length) return { ok: false, error: 'Escribe uno o varios teléfonos separados por comas' };
    } else if (field === 'negocio' || field === 'publico') value = text.slice(0, 300);
    else if (field === 'zona') value = text.slice(0, 255);
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

/** Campos de la ficha que se pueden rellenar desde el expediente (texto libre: nunca se pisa sin confirmarlo). */
const FICHA_TEXT: Record<string, 'offerings' | 'area' | 'business' | 'audience'> = { servicios: 'offerings', zona: 'area', negocio: 'business', publico: 'audience' };

/**
 * Pasa a la ficha del cliente un dato del expediente. Los campos de texto (servicios, zona, a qué se dedica, público)
 * no se pisan: si la ficha ya tiene texto distinto, devuelve `needsReplace` con lo que hay y solo se cambia si la
 * persona lo pide con `replace` (alta de la cartera, 26 nov 2026).
 */
export async function applyFactToFichaAction(projectId: string, factId: string, replace = false): Promise<Ok> {
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
    else if (FICHA_TEXT[f.field]) {
      const col = FICHA_TEXT[f.field];
      const text = f.field === 'servicios' ? (Array.isArray(f.value) ? f.value.map(String).join('\n') : '') : typeof f.value === 'string' ? f.value : '';
      if (!text.trim()) return { ok: false, error: 'El dato está vacío' };
      const [c] = await db.select({ offerings: clients.offerings, area: clients.area, business: clients.business, audience: clients.audience }).from(clients).where(and(eq(clients.id, p.clientId), eq(clients.tenantId, user.tenantId))).limit(1);
      const current = (c?.[col] ?? '').trim();
      if (current && current !== text.trim() && !replace) return { ok: false, error: 'La ficha ya tiene un texto distinto.', needsReplace: current.slice(0, 400) };
      await updateCoreClient(user.tenantId, p.clientId, { [col]: text } as Parameters<typeof updateCoreClient>[2]);
    } else return { ok: false, error: 'Este dato se cambia en la ficha del cliente (Locales, Webs y cuentas).' };
    await db.update(seoDossierFacts).set({ status: 'confirmado', decidedBy: (user.name || user.email).slice(0, 120), decidedAt: new Date(), updatedAt: new Date() }).where(eq(seoDossierFacts.id, f.id));
    await enqueueDossier(user.tenantId, projectId);
    revalidatePath(PATH(projectId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo pasar a la ficha') };
  }
}

/** Vuelve a pedir a la IA la propuesta de ficha (servicios, zona, a qué se dedica, público) con el último rastreo. */
export async function proposeFichaAction(projectId: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    const p = await ownProject(user.tenantId, projectId);
    if (!p) return { ok: false, error: 'Proyecto no encontrado' };
    await enqueueProposal(user.tenantId, projectId, true);
    revalidatePath(PATH(projectId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo pedir la propuesta') };
  }
}


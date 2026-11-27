'use server';

// SEO · Salud técnica: acciones de la pantalla del proyecto (Hito 1, 23 nov 2026). Permiso «edit» en el servidor
// (editor o más), y el proyecto y el hallazgo siempre de la cuenta del usuario.
import { revalidatePath } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { findings, projects } from '@/lib/db/schema';
import { isBusinessType } from '@/lib/core/business-types';
import { updateCoreClient } from '@/lib/core/clients';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { decideFinding } from '@/lib/core/findings';
import { SaludError, SALUD_SOURCE, startProjectAudit } from '@/lib/seo/salud/audit';
import { acceptMoneyBaseline } from '@/lib/seo/cambios/dinero';
import { LOCAL_SOURCE } from '@/lib/seo/local/rules';
import { VIGILANCIA_SOURCES } from '@/lib/seo/vigilancia/rules';

type Ok<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function startSaludAuditAction(projectId: string): Promise<Ok<{ already: boolean }>> {
  try {
    const user = await requirePermission('edit');
    if (!UUID.test(projectId)) return { ok: false, error: 'Proyecto no encontrado' };
    const r = await startProjectAudit(user.tenantId, projectId);
    revalidatePath(`/dashboard/projects/${projectId}/salud`);
    return { ok: true, already: r.already };
  } catch (e) {
    return { ok: false, error: e instanceof SaludError ? e.userMessage : publicError(e, 'No se pudo lanzar la auditoría') };
  }
}

/** Guarda el tipo de negocio en la ficha del cliente del proyecto (núcleo: clients.business_type). */
export async function saveSeoBusinessTypeAction(projectId: string, businessType: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!UUID.test(projectId)) return { ok: false, error: 'Proyecto no encontrado' };
    if (!isBusinessType(businessType)) return { ok: false, error: 'Tipo de negocio no válido' };
    const [p] = await db.select({ clientId: projects.clientId }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, user.tenantId))).limit(1);
    if (!p?.clientId) return { ok: false, error: 'El proyecto no tiene cliente' };
    await updateCoreClient(user.tenantId, p.clientId, { businessType });
    revalidatePath(`/dashboard/projects/${projectId}/salud`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo guardar el tipo de negocio') };
  }
}

export async function decideSaludFindingAction(projectId: string, findingId: string, status: 'descartado' | 'aceptado' | 'abierto', reason?: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!UUID.test(projectId) || !UUID.test(findingId)) return { ok: false, error: 'Hallazgo no encontrado' };
    if (!['descartado', 'aceptado', 'abierto'].includes(status)) return { ok: false, error: 'Estado no válido' };
    // Solo hallazgos de Salud de ese proyecto y de la cuenta del usuario.
    const [f] = await db
      .select({ id: findings.id, source: findings.source, url: findings.url })
      .from(findings)
      .where(and(eq(findings.id, findingId), eq(findings.projectId, projectId), eq(findings.tenantId, user.tenantId), inArray(findings.source, [SALUD_SOURCE, LOCAL_SOURCE, 'seo.mapa:gsc', 'seo.salud:externos', 'seo.posiciones:serp', 'seo.local:ficha', 'seo.local:geogrid', 'seo.local:nap_antiguo', 'seo.salud:puertas', 'seo.vigilancia:hackeo', 'seo.vigilancia:dinero', ...VIGILANCIA_SOURCES])))
      .limit(1);
    if (!f) return { ok: false, error: 'Hallazgo no encontrado' };
    await decideFinding(user.tenantId, findingId, status, user.name || user.email, reason);
    // Páginas de dinero: «Dejar así» o «No es un problema» acepta la foto actual como referencia (versión nueva).
    if (f.source === 'seo.vigilancia:dinero' && status !== 'abierto') await acceptMoneyBaseline(projectId, f.url);
    revalidatePath(`/dashboard/projects/${projectId}/salud`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo guardar') };
  }
}

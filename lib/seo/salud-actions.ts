'use server';

// SEO · Salud técnica: acciones de la pantalla del proyecto (Hito 1, 23 nov 2026). Permiso «edit» en el servidor
// (editor o más), y el proyecto y el hallazgo siempre de la cuenta del usuario.
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { findings } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { decideFinding } from '@/lib/core/findings';
import { SaludError, SALUD_SOURCE, startProjectAudit } from '@/lib/seo/salud/audit';

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

export async function decideSaludFindingAction(projectId: string, findingId: string, status: 'descartado' | 'aceptado' | 'abierto', reason?: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!UUID.test(projectId) || !UUID.test(findingId)) return { ok: false, error: 'Hallazgo no encontrado' };
    if (!['descartado', 'aceptado', 'abierto'].includes(status)) return { ok: false, error: 'Estado no válido' };
    // Solo hallazgos de Salud de ese proyecto y de la cuenta del usuario.
    const [f] = await db
      .select({ id: findings.id })
      .from(findings)
      .where(and(eq(findings.id, findingId), eq(findings.projectId, projectId), eq(findings.tenantId, user.tenantId), eq(findings.source, SALUD_SOURCE)))
      .limit(1);
    if (!f) return { ok: false, error: 'Hallazgo no encontrado' };
    await decideFinding(user.tenantId, findingId, status, user.name || user.email, reason);
    revalidatePath(`/dashboard/projects/${projectId}/salud`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo guardar') };
  }
}

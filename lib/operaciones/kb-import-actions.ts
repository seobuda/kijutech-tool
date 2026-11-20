'use server';

// Acción de la importación de la base de conocimiento desde ClickUp (20 nov 2026). Solo admin.
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { importKnowledgeFromClickUp, type KbImportResult } from '@/lib/operaciones/kb-import';

export async function importKnowledgeAction(spaceId: string): Promise<({ ok: true } & KbImportResult) | { ok: false; error: string }> {
  try {
    const user = await requirePermission('admin');
    if (!/^\d{1,30}$/.test(spaceId)) return { ok: false, error: 'Espacio no válido' };
    const r = await importKnowledgeFromClickUp(user.tenantId, spaceId, user.id);
    revalidatePath('/dashboard/conocimiento');
    return { ok: true, ...r };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo importar desde ClickUp') };
  }
}

'use server';

// Acciones web de los correos a clientes (cimientos, 23 nov 2026): aprobar (tal cual o corregido) o descartar lo que
// espera aprobación. Es de administración. Al decidir aquí, el aviso de Telegram pierde sus botones.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { approveClientMessage, rejectClientMessage } from '@/lib/core/comms';
import { commsApprovalNotifier } from '@/lib/core/capabilities';

type Res = { ok: true } | { ok: false; error: string };
const Id = z.string().uuid();

export async function approveClientMessageAction(id: string, corrected?: { subject?: string; body?: string }): Promise<Res> {
  try {
    const user = await requirePermission('admin');
    const p = Id.safeParse(id);
    if (!p.success) return { ok: false, error: 'Mensaje no válido' };
    const by = user.name || 'Administración';
    const fix = corrected && (corrected.subject?.trim() || corrected.body?.trim()) ? { subject: corrected.subject?.slice(0, 300), body: corrected.body?.slice(0, 20000) } : undefined;
    const r = await approveClientMessage(user.tenantId, p.data, by, fix);
    if (!r.ok) return r;
    await commsApprovalNotifier()?.decided(user.tenantId, p.data, fix ? '✏️ Corregido y aprobado en la web' : '✅ Aprobado en la web').catch(() => undefined);
    revalidatePath('/dashboard/para-ti');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo aprobar el correo') };
  }
}

export async function rejectClientMessageAction(id: string, reason?: string): Promise<Res> {
  try {
    const user = await requirePermission('admin');
    const p = Id.safeParse(id);
    if (!p.success) return { ok: false, error: 'Mensaje no válido' };
    const r = await rejectClientMessage(user.tenantId, p.data, user.name || 'Administración', typeof reason === 'string' ? reason : undefined);
    if (!r.ok) return r;
    await commsApprovalNotifier()?.decided(user.tenantId, p.data, '✖️ Descartado en la web').catch(() => undefined);
    revalidatePath('/dashboard/para-ti');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo descartar el correo') };
  }
}

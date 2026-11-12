'use server';

// Acciones web del panel «Salud» (solo administración).
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { retryStuck } from '@/lib/operaciones/health';

export async function retryStuckAction(): Promise<
  { ok: true; notifications: number; outbox: number; emails: number; requests: number } | { ok: false; error: string }
> {
  try {
    const user = await requirePermission('admin');
    const res = await retryStuck(user.tenantId);
    revalidatePath('/dashboard/operaciones/salud');
    return { ok: true, ...res };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo reintentar') };
  }
}

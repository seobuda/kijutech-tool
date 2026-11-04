'use server';

import { revalidatePath } from 'next/cache';
import { getUser } from '@/lib/db/queries';
import { getUserIfAllowed, requirePermission, type Permission } from '@/lib/auth/permissions';
import { canManageProfiles } from '@/lib/operaciones/team-profiles';
import { setPilotStart } from '@/lib/operaciones/pilot';

export async function savePilotStartAction(ymd: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getUserIfAllowed('admin');
  if (!user || !canManageProfiles(user)) return { ok: false, error: 'No tienes permiso para hacer esto' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || Number.isNaN(new Date(`${ymd}T12:00:00Z`).getTime())) {
    return { ok: false, error: 'Fecha no válida' };
  }
  await setPilotStart(user.tenantId, ymd);
  revalidatePath('/dashboard/operaciones/piloto');
  return { ok: true };
}

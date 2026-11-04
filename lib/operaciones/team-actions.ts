'use server';

import { getUser } from '@/lib/db/queries';
import { getUserIfAllowed, requirePermission, type Permission } from '@/lib/auth/permissions';
import { getNoDateCounts, getTeamToday, type NoDateResult } from '@/lib/operaciones/team-today';
import { publicError } from '@/lib/errors';

// Botón "Actualizar ahora": se salta la caché de 2 minutos.
export async function refreshTeamToday(): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getUserIfAllowed('view');
  if (!user) return { ok: false, error: 'No tienes permiso para hacer esto' };
  try {
    await getTeamToday(user.tenantId, { force: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo actualizar')};
  }
}

// La pantalla pregunta por las tareas "sin fecha" DESPUÉS de pintarse.
export async function fetchNoDateCounts(): Promise<NoDateResult> {
  const user = await getUserIfAllowed('view');
  if (!user) return { status: 'error', error: 'No tienes permiso para hacer esto' };
  return getNoDateCounts(user.tenantId);
}

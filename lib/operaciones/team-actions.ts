'use server';

import { getUser } from '@/lib/db/queries';
import { getNoDateCounts, getTeamToday, type NoDateResult } from '@/lib/operaciones/team-today';

// Botón "Actualizar ahora": se salta la caché de 2 minutos.
export async function refreshTeamToday(): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'No autenticado' };
  try {
    await getTeamToday(user.tenantId, { force: true });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo actualizar' };
  }
}

// La pantalla pregunta por las tareas "sin fecha" DESPUÉS de pintarse.
export async function fetchNoDateCounts(): Promise<NoDateResult> {
  const user = await getUser();
  if (!user) return { status: 'error', error: 'No autenticado' };
  return getNoDateCounts(user.tenantId);
}

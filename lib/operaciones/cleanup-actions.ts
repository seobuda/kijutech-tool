'use server';

// Botones «Enviar limpieza de vencidas» (Equipo y Automatizaciones).
import { revalidatePath } from 'next/cache';
import { getUser } from '@/lib/db/queries';
import { canManageProfiles } from '@/lib/operaciones/team-profiles';
import { startCleanup } from '@/lib/operaciones/cleanup';
import { getTelegramConfig } from '@/lib/operaciones/telegram-config';

type Res = { ok: true; message: string } | { ok: false; error: string };

// target: el id de ClickUp de una persona, o 'all'.
export async function sendCleanupAction(target: string): Promise<Res> {
  try {
    const user = await getUser();
    if (!user) return { ok: false, error: 'No autenticado' };
    if (!canManageProfiles(user)) return { ok: false, error: 'No tienes permiso para lanzar limpiezas' };
    if (!/^(all|\d{1,20})$/.test(target)) return { ok: false, error: 'Persona no válida' };
    const res = await startCleanup(user.tenantId, { clickupUserId: target, startedBy: user.name ?? user.email });
    if (!res.ok) return { ok: false, error: res.error };
    const cfg = await getTelegramConfig(user.tenantId);
    const parts = [
      ...res.result.started.map((s) => `${s.name}: ${s.total} tarea${s.total === 1 ? '' : 's'}${s.more ? ` (+${s.more} en otra tanda)` : ''}`),
      ...res.result.skipped.map((s) => `${s.name}: ${s.reason}`)
    ];
    revalidatePath('/dashboard/operaciones/equipo');
    revalidatePath('/dashboard/operaciones/automatizaciones');
    if (res.result.started.length === 0) return { ok: false, error: parts.join(' · ') || 'No había nada que enviar' };
    return {
      ok: true,
      message: `Limpieza enviada → ${parts.join(' · ')}.${cfg?.testMode ? ' Modo pruebas: te llega todo a ti; solo tus tareas son reales, las de otras personas se simulan.' : ''}`
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo lanzar la limpieza' };
  }
}

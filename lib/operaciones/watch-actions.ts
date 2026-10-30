'use server';

// Interruptor «Vigilar ClickUp» (Ajustes): activa o desactiva la consulta periódica de tareas.
import { revalidatePath } from 'next/cache';
import { getUser } from '@/lib/db/queries';
import { disableWatch, enableWatch } from '@/lib/operaciones/watch';

type Res = { ok: true; message: string } | { ok: false; error: string };

export async function setClickupWatch(enabled: boolean): Promise<Res> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'No autenticado' };
  try {
    if (enabled) {
      const r = await enableWatch(user.tenantId);
      if (!r.ok) return r;
      revalidatePath('/dashboard/operaciones/ajustes');
      return { ok: true, message: `Activado. Se han anotado ${r.baseline} tareas abiertas como punto de partida (no avisan).` };
    }
    await disableWatch(user.tenantId);
    revalidatePath('/dashboard/operaciones/ajustes');
    return { ok: true, message: 'Vigilancia desactivada.' };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo cambiar la vigilancia' };
  }
}

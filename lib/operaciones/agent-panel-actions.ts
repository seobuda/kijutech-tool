'use server';

// Acciones web del panel «Agente» (motor de acciones del agente, paso 2).
// Cambiar la autonomía de un tipo de acción es de administración: decide cuánto actúa el agente solo.
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/permissions';
import { isAgentKind, setAutonomy, type Autonomy } from '@/lib/operaciones/agent-actions';
import { publicError } from '@/lib/errors';

const LEVELS: Autonomy[] = ['sombra', 'aprobacion', 'autonomo'];

export async function setAgentAutonomyAction(
  kind: string,
  level: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await requirePermission('admin');
    if (!isAgentKind(kind)) return { ok: false, error: 'Tipo de acción desconocido' };
    if (!LEVELS.includes(level as Autonomy)) return { ok: false, error: 'Nivel de autonomía no válido' };
    await setAutonomy(user.tenantId, kind, level as Autonomy);
    revalidatePath('/dashboard/operaciones/agente');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo cambiar la autonomía') };
  }
}

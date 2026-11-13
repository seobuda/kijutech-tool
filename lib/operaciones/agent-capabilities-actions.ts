'use server';

// Autonomía por herramienta de las acciones que proponen los agentes (pantalla Agentes; solo administración).
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { setToolAutonomy } from '@/lib/operaciones/agent-capabilities';
import { logEvent } from '@/lib/operaciones/events';

export async function setToolAutonomyAction(tool: string, level: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const user = await requirePermission('admin');
    const t = z.string().regex(/^[a-z][a-z0-9_]{1,63}$/).safeParse(tool);
    const l = z.enum(['sombra', 'aprobacion', 'autonomo']).safeParse(level);
    if (!t.success || !l.success) return { ok: false, error: 'Datos no válidos' };
    await setToolAutonomy(user.tenantId, t.data, l.data);
    await logEvent(user.tenantId, { actor: { clickupUserId: null, name: user.name || user.email }, type: 'autonomia', payload: { kind: 'agent_tool', tool: t.data, to: l.data, via: 'web' } });
    revalidatePath('/dashboard/agentes');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo cambiar la autonomía') };
  }
}

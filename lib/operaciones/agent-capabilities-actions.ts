'use server';

// Autonomía por herramienta de las acciones que proponen los agentes (pantalla Agentes; solo administración) y
// decidir una propuesta desde Para ti (lo mismo que ✅ Hacerlo / ✖️ Descartar en Telegram; solo quien lleva las operaciones).
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { decideAgentTool, setToolAutonomy } from '@/lib/operaciones/agent-capabilities';
import { requireInboxOwner } from '@/lib/operaciones/inbox-owner';
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

export async function decideAgentToolAction(actionId: string, approve: boolean): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const user = await requireInboxOwner();
    const id = z.string().uuid().safeParse(actionId);
    if (!id.success) return { ok: false, error: 'Propuesta no válida' };
    const by = user.name || 'Operaciones';
    const r = await decideAgentTool(user.tenantId, id.data, Boolean(approve), by, 'panel');
    await logEvent(user.tenantId, { actor: { clickupUserId: null, name: by }, type: 'autonomia', payload: { kind: 'agent_tool', decision: approve ? 'ok' : 'no', actionId: id.data, via: 'web' } });
    revalidatePath('/dashboard/para-ti');
    revalidatePath('/dashboard/operaciones/agente');
    // Sin «line» la propuesta ya no existía o ya estaba decidida: se dice tal cual.
    if (!r.line) return { ok: false, error: r.answer };
    const text = r.line.replace(/^\S+\s/, '');
    // Aprobada pero la acción falló al hacerse (⚠️): se enseña como error, con lo que dijo la herramienta.
    if (r.line.startsWith('⚠️')) return { ok: false, error: `Aprobada, pero no se pudo hacer: ${text}` };
    return { ok: true, message: text };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo decidir la propuesta') };
  }
}

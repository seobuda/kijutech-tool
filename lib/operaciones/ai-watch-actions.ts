'use server';

// Sistema → Gasto de IA (solo administración): conectar la clave de administración de Anthropic (sk-ant-admin…) para leer
// el coste real de la cuenta, quitarla y refrescar el informe. La clave se guarda cifrada y nunca vuelve al navegador.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { fetchOrgCostReport, getOrgCost, saveAdminKey } from '@/lib/operaciones/ai-watch';

type Res = { ok: true; message: string } | { ok: false; error: string };
const PATH = '/dashboard/operaciones/gasto-ia';

export async function connectAnthropicAdminAction(key: string): Promise<Res> {
  try {
    const user = await requirePermission('admin');
    const parsed = z.string().trim().regex(/^sk-ant-admin[\w-]{10,200}$/).safeParse(key);
    if (!parsed.success) return { ok: false, error: 'Tiene que ser una clave de administración (empieza por sk-ant-admin).' };
    // Se prueba antes de guardarla: el informe de ayer.
    const now = Date.now();
    try {
      await fetchOrgCostReport(parsed.data, new Date(now - 2 * 86_400_000).toISOString(), new Date(now).toISOString());
    } catch {
      return { ok: false, error: 'Anthropic no aceptó la clave. Comprueba que es de administración y de la organización correcta.' };
    }
    await saveAdminKey(user.tenantId, parsed.data);
    await getOrgCost(user.tenantId, new Date(), true);
    revalidatePath(PATH);
    return { ok: true, message: 'Conectada: ya se ve el coste real de la cuenta.' };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo conectar') };
  }
}

export async function disconnectAnthropicAdminAction(): Promise<Res> {
  try {
    const user = await requirePermission('admin');
    await saveAdminKey(user.tenantId, null);
    revalidatePath(PATH);
    return { ok: true, message: 'Clave quitada.' };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo quitar') };
  }
}

export async function refreshOrgCostAction(): Promise<Res> {
  try {
    const user = await requirePermission('admin');
    const r = await getOrgCost(user.tenantId, new Date(), true);
    revalidatePath(PATH);
    if (!r) return { ok: false, error: 'La cuenta de Anthropic no está conectada.' };
    return r.error ? { ok: false, error: r.error } : { ok: true, message: 'Actualizado.' };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo actualizar') };
  }
}

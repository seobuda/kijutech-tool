'use server';

// Sistema → Servidor y costes (solo administración): conectar el token de DigitalOcean (mejor uno de SOLO LECTURA),
// quitarlo y refrescar. El token se guarda cifrado y nunca vuelve al navegador.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { getInfra, saveDoToken, testDoToken } from '@/lib/operaciones/infra-watch';

type Res = { ok: true; message: string } | { ok: false; error: string };
const PATH = '/dashboard/operaciones/servidor';

export async function connectDoTokenAction(token: string): Promise<Res> {
  try {
    const user = await requirePermission('admin');
    const parsed = z.string().trim().regex(/^[\w-]{20,200}$/).safeParse(token);
    if (!parsed.success) return { ok: false, error: 'El token no tiene el formato de DigitalOcean.' };
    if (!(await testDoToken(parsed.data))) return { ok: false, error: 'DigitalOcean no aceptó el token (necesita leer facturación, servidores y monitorización).' };
    await saveDoToken(user.tenantId, parsed.data);
    await getInfra(user.tenantId, { force: true });
    revalidatePath(PATH);
    return { ok: true, message: 'Conectado.' };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo conectar') };
  }
}

export async function disconnectDoTokenAction(): Promise<Res> {
  try {
    const user = await requirePermission('admin');
    await saveDoToken(user.tenantId, null);
    revalidatePath(PATH);
    return { ok: true, message: 'Token quitado.' };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo quitar') };
  }
}

export async function refreshInfraAction(): Promise<Res> {
  try {
    const user = await requirePermission('admin');
    const d = await getInfra(user.tenantId, { force: true });
    revalidatePath(PATH);
    if (!d) return { ok: false, error: 'DigitalOcean no está conectado.' };
    return d.error ? { ok: false, error: d.error } : { ok: true, message: 'Actualizado.' };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo actualizar') };
  }
}

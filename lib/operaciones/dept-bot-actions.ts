'use server';

// Bots de departamento (organigrama, 20 nov 2026): guardar el token, comprobar si ya está listo y quitarlo.
// Solo administración (tokens). El token nunca vuelve al navegador.
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { checkDeptBot, DEPT_BOT_KEY_RE, DeptBotError, removeDeptBot, saveDeptBot } from '@/lib/operaciones/dept-bots';

type Res<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const PATH = '/dashboard/agentes/departamentos';
const fail = (e: unknown, fallback: string): { ok: false; error: string } => ({ ok: false, error: e instanceof DeptBotError ? e.message : publicError(e, fallback) });

export async function saveDeptBotAction(key: string, token: string): Promise<Res<{ message: string; ready: boolean }>> {
  try {
    const user = await requirePermission('admin');
    if (!DEPT_BOT_KEY_RE.test(key)) return { ok: false, error: 'Departamento no válido' };
    const r = await saveDeptBot(user.tenantId, key, token);
    revalidatePath(PATH);
    return {
      ok: true,
      ready: r.ready,
      message: r.ready
        ? `@${r.botUsername} conectado: te acaba de escribir por Telegram.`
        : `@${r.botUsername} guardado. Abre su chat en Telegram, pulsa «Iniciar» y vuelve aquí a pulsar «Comprobar».`
    };
  } catch (e) {
    return fail(e, 'No se pudo guardar el bot');
  }
}

export async function checkDeptBotAction(key: string): Promise<Res<{ ready: boolean }>> {
  try {
    const user = await requirePermission('admin');
    if (!DEPT_BOT_KEY_RE.test(key)) return { ok: false, error: 'Departamento no válido' };
    const ready = await checkDeptBot(user.tenantId, key);
    revalidatePath(PATH);
    return { ok: true, ready };
  } catch (e) {
    return fail(e, 'No se pudo comprobar el bot');
  }
}

export async function removeDeptBotAction(key: string): Promise<Res> {
  try {
    const user = await requirePermission('admin');
    if (!DEPT_BOT_KEY_RE.test(key)) return { ok: false, error: 'Departamento no válido' };
    await removeDeptBot(user.tenantId, key);
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo quitar el bot');
  }
}

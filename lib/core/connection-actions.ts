'use server';

// Núcleo · acciones de las conexiones del cliente (27 nov 2026). Conectar, cambiar o quitar: «admin» (guardan un secreto).
// Descargar los leads ahora: «edit». Nunca devuelven el secreto.
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { ConnectionError, connectGoHighLevel, connectWordPress, deleteConnection, syncClientLeads } from '@/lib/core/connections';

type Ok = { ok: true; message?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const path = (id: string) => `/dashboard/clientes/${id}`;
const fail = (e: unknown): Ok => ({ ok: false, error: e instanceof ConnectionError ? e.userMessage : publicError(e, 'No se pudo completar la acción') });

export async function connectWordPressAction(clientId: string, url: string, username: string, password: string): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    if (!UUID.test(clientId)) return { ok: false, error: 'Cliente no encontrado' };
    const r = await connectWordPress(user.tenantId, clientId, { url: String(url ?? ''), username: String(username ?? ''), password: password ? String(password) : null }, user.name || user.email);
    revalidatePath(path(clientId));
    return { ok: true, message: `WordPress conectado como ${r.user || 'Colaborador'}: solo podrá crear borradores nuevos.` };
  } catch (e) {
    return fail(e);
  }
}

export async function connectGoHighLevelAction(clientId: string, locationId: string, token: string): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    if (!UUID.test(clientId)) return { ok: false, error: 'Cliente no encontrado' };
    const r = await connectGoHighLevel(user.tenantId, clientId, { locationId: String(locationId ?? ''), token: token ? String(token) : null }, user.name || user.email);
    revalidatePath(path(clientId));
    return { ok: true, message: `GoHighLevel conectado (${r.forms} formulario(s)). Los leads se descargan cada día; pulsa «Descargar ahora» para la primera vez.` };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteConnectionAction(clientId: string, kind: 'wordpress' | 'gohighlevel'): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    if (!UUID.test(clientId) || !['wordpress', 'gohighlevel'].includes(kind)) return { ok: false, error: 'Conexión no encontrada' };
    await deleteConnection(user.tenantId, clientId, kind);
    revalidatePath(path(clientId));
    return { ok: true, message: 'Conexión quitada y su contraseña o token borrados.' };
  } catch (e) {
    return fail(e);
  }
}

export async function syncLeadsNowAction(clientId: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!UUID.test(clientId)) return { ok: false, error: 'Cliente no encontrado' };
    const r = await syncClientLeads(user.tenantId, clientId);
    revalidatePath(path(clientId));
    return { ok: true, message: `${r.added} lead(s) nuevo(s).` };
  } catch (e) {
    return fail(e);
  }
}

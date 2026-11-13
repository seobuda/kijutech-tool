'use server';

// Acciones de la «Memoria» de la ficha de un cliente (NÚCLEO desde el 14 nov 2026; antes en Operaciones junto a los
// remitentes, que ahora son los contactos de la ficha). Todas comprueban permisos en el servidor: ver y editar piden
// `edit` y borrar de verdad pide `admin`; un editor puede descartar un dato equivocado sin borrarlo.
import { and, desc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/drizzle';
import { clientMemory } from '@/lib/db/schema';
import { checkPermission, requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { addMemory, ClientError, getClient } from '@/lib/core/clients';
import { isMemoryKind, validateMemoryText, type MemoryKind, type MemoryStatus } from '@/lib/core/client-rules';

type Ok<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (e: unknown, fallback: string): { ok: false; error: string } => ({
  ok: false,
  error: e instanceof ClientError ? e.userMessage : publicError(e, fallback)
});

const refresh = () => revalidatePath('/dashboard/clientes', 'layout');

export type ClientMemoryView = {
  id: string;
  kind: MemoryKind;
  text: string;
  status: MemoryStatus;
  sourceType: string;
  createdAt: string;
};

export async function listClientMemory(clientId: string): Promise<Ok<{ memory: ClientMemoryView[]; canDelete: boolean }>> {
  try {
    const user = await requirePermission('edit');
    if (!(await getClient(user.tenantId, clientId))) return { ok: false, error: 'La ficha no existe' };
    // Solo para pintar el botón «Eliminar»: borrar de verdad lo vuelve a comprobar cada acción.
    const canDelete = (await checkPermission('admin')).ok;
    const memory = await db
      .select()
      .from(clientMemory)
      .where(and(eq(clientMemory.clientId, clientId), eq(clientMemory.tenantId, user.tenantId)))
      .orderBy(desc(clientMemory.createdAt));
    return {
      ok: true,
      canDelete,
      memory: memory.map((m) => ({
        id: m.id,
        kind: m.kind as MemoryKind,
        text: m.text,
        status: m.status as MemoryStatus,
        sourceType: m.sourceType,
        createdAt: m.createdAt.toISOString()
      }))
    };
  } catch (e) {
    return fail(e, 'No se pudo cargar la memoria del cliente');
  }
}

export async function addClientMemory(input: { clientId: string; kind: string; text: string }): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    // Lo escribe una persona: entra ya aceptado (lo que propone la IA entra como «propuesto»).
    await addMemory(user.tenantId, input.clientId, { kind: input.kind, text: input.text, status: 'aceptado', sourceType: 'manual', by: user.id });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo guardar el dato');
  }
}

export async function updateClientMemory(input: { id: string; kind: string; text: string }): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!isMemoryKind(input.kind)) return { ok: false, error: 'Tipo de dato no válido' };
    const v = validateMemoryText(input.text);
    if (!v.ok) return v;
    const res = await db
      .update(clientMemory)
      .set({ kind: input.kind, text: v.text, updatedAt: new Date() })
      .where(and(eq(clientMemory.id, input.id), eq(clientMemory.tenantId, user.tenantId)))
      .returning({ id: clientMemory.id });
    if (res.length === 0) return { ok: false, error: 'El dato no existe' };
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo guardar el dato');
  }
}

// Aceptar un dato propuesto, descartarlo o recuperar uno descartado.
export async function decideClientMemory(id: string, status: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (status !== 'aceptado' && status !== 'descartado') return { ok: false, error: 'Estado no válido' };
    const res = await db
      .update(clientMemory)
      .set({ status, decidedBy: user.id, decidedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(clientMemory.id, id), eq(clientMemory.tenantId, user.tenantId)))
      .returning({ id: clientMemory.id });
    if (res.length === 0) return { ok: false, error: 'El dato no existe' };
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo cambiar el dato');
  }
}

export async function deleteClientMemory(id: string): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    const res = await db
      .delete(clientMemory)
      .where(and(eq(clientMemory.id, id), eq(clientMemory.tenantId, user.tenantId)))
      .returning({ id: clientMemory.id });
    if (res.length === 0) return { ok: false, error: 'El dato no existe' };
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo eliminar el dato');
  }
}

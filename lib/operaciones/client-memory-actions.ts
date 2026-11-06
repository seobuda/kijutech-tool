'use server';

// Acciones de «Contactos» y «Memoria» de la ficha de un cliente. Todas comprueban permisos en el
// servidor: ver y editar piden `edit` (como las fichas) y borrar de verdad pide `admin`; un editor
// puede descartar un dato equivocado sin borrarlo.
import { and, asc, desc, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/drizzle';
import { opsClientMemory, opsClientSenders, opsClients } from '@/lib/db/schema';
import { checkPermission, requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import {
  isMemoryKind,
  normalizeSender,
  validateMemoryText,
  type MemoryKind,
  type MemoryStatus
} from '@/lib/operaciones/client-memory-rules';

type Ok<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (e: unknown, fallback: string): { ok: false; error: string } => ({
  ok: false,
  error: publicError(e, fallback)
});

const refresh = () => revalidatePath('/dashboard/operaciones/clientes');

export type ClientSenderView = {
  id: string;
  kind: 'email' | 'domain';
  value: string;
  name: string;
  role: string;
  active: boolean;
};

export type ClientMemoryView = {
  id: string;
  kind: MemoryKind;
  text: string;
  status: MemoryStatus;
  sourceType: string;
  createdAt: string;
};

// El cliente tiene que ser de la cuenta del usuario.
async function ownClient(tenantId: string, clientId: string): Promise<boolean> {
  const [c] = await db
    .select({ id: opsClients.id })
    .from(opsClients)
    .where(and(eq(opsClients.id, clientId), eq(opsClients.tenantId, tenantId)))
    .limit(1);
  return Boolean(c);
}

export async function listClientMemory(
  clientId: string
): Promise<Ok<{ senders: ClientSenderView[]; memory: ClientMemoryView[]; canDelete: boolean }>> {
  try {
    const user = await requirePermission('edit');
    if (!(await ownClient(user.tenantId, clientId))) return { ok: false, error: 'La ficha no existe' };
    // Solo para pintar el botón «Eliminar»: borrar de verdad lo vuelve a comprobar cada acción.
    const canDelete = (await checkPermission('admin')).ok;
    const [senders, memory] = await Promise.all([
      db
        .select()
        .from(opsClientSenders)
        .where(and(eq(opsClientSenders.clientId, clientId), eq(opsClientSenders.tenantId, user.tenantId)))
        .orderBy(asc(opsClientSenders.kind), asc(opsClientSenders.value)),
      db
        .select()
        .from(opsClientMemory)
        .where(and(eq(opsClientMemory.clientId, clientId), eq(opsClientMemory.tenantId, user.tenantId)))
        .orderBy(desc(opsClientMemory.createdAt))
    ]);
    return {
      ok: true,
      canDelete,
      senders: senders.map((s) => ({
        id: s.id,
        kind: s.kind as 'email' | 'domain',
        value: s.value,
        name: s.name ?? '',
        role: s.role ?? '',
        active: s.active
      })),
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

// --- Contactos (remitentes) -------------------------------------------------------------------

export async function addClientSender(input: {
  clientId: string;
  kind: string;
  value: string;
  name: string;
  role: string;
}): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!(await ownClient(user.tenantId, input.clientId))) return { ok: false, error: 'La ficha no existe' };
    const norm = normalizeSender(input.kind, input.value);
    if (!norm.ok) return norm;

    // Una misma dirección o dominio no puede ser de dos clientes: se avisa de cuál es.
    const [dup] = await db
      .select({ clientName: opsClients.name, clientId: opsClientSenders.clientId })
      .from(opsClientSenders)
      .innerJoin(opsClients, eq(opsClients.id, opsClientSenders.clientId))
      .where(
        and(
          eq(opsClientSenders.tenantId, user.tenantId),
          eq(opsClientSenders.kind, norm.kind),
          eq(opsClientSenders.value, norm.value)
        )
      )
      .limit(1);
    if (dup) {
      return {
        ok: false,
        error:
          dup.clientId === input.clientId
            ? 'Ese contacto ya está en esta ficha'
            : `Ese contacto ya pertenece a la ficha «${dup.clientName}»`
      };
    }

    await db.insert(opsClientSenders).values({
      tenantId: user.tenantId,
      clientId: input.clientId,
      kind: norm.kind,
      value: norm.value,
      name: input.name.trim().slice(0, 255) || null,
      role: input.role.trim().slice(0, 120) || null
    });
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo añadir el contacto');
  }
}

export async function setClientSenderActive(senderId: string, active: boolean): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    const res = await db
      .update(opsClientSenders)
      .set({ active })
      .where(and(eq(opsClientSenders.id, senderId), eq(opsClientSenders.tenantId, user.tenantId)))
      .returning({ id: opsClientSenders.id });
    if (res.length === 0) return { ok: false, error: 'El contacto no existe' };
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo cambiar el contacto');
  }
}

export async function deleteClientSender(senderId: string): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    const res = await db
      .delete(opsClientSenders)
      .where(and(eq(opsClientSenders.id, senderId), eq(opsClientSenders.tenantId, user.tenantId)))
      .returning({ id: opsClientSenders.id });
    if (res.length === 0) return { ok: false, error: 'El contacto no existe' };
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo eliminar el contacto');
  }
}

// --- Memoria ----------------------------------------------------------------------------------

export async function addClientMemory(input: { clientId: string; kind: string; text: string }): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!(await ownClient(user.tenantId, input.clientId))) return { ok: false, error: 'La ficha no existe' };
    if (!isMemoryKind(input.kind)) return { ok: false, error: 'Tipo de dato no válido' };
    const v = validateMemoryText(input.text);
    if (!v.ok) return v;
    // Lo escribe una persona: entra ya aceptado (lo que propone la IA entra como «propuesto»).
    await db.insert(opsClientMemory).values({
      tenantId: user.tenantId,
      clientId: input.clientId,
      kind: input.kind,
      text: v.text,
      status: 'aceptado',
      sourceType: 'manual',
      createdBy: user.id,
      decidedBy: user.id,
      decidedAt: new Date()
    });
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
      .update(opsClientMemory)
      .set({ kind: input.kind, text: v.text, updatedAt: new Date() })
      .where(and(eq(opsClientMemory.id, input.id), eq(opsClientMemory.tenantId, user.tenantId)))
      .returning({ id: opsClientMemory.id });
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
      .update(opsClientMemory)
      .set({ status, decidedBy: user.id, decidedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(opsClientMemory.id, id), eq(opsClientMemory.tenantId, user.tenantId)))
      .returning({ id: opsClientMemory.id });
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
      .delete(opsClientMemory)
      .where(and(eq(opsClientMemory.id, id), eq(opsClientMemory.tenantId, user.tenantId)))
      .returning({ id: opsClientMemory.id });
    if (res.length === 0) return { ok: false, error: 'El dato no existe' };
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo eliminar el dato');
  }
}

'use server';

// Acciones web de la ficha del cliente (NÚCLEO, 14 nov 2026). Todas comprueban permisos en el servidor:
//   - ver y editar la ficha, contactos, locales, webs y cuentas y competencia: «edit» (como antes las fichas);
//   - el contrato (cuota, fechas) y borrar un cliente o un contacto: «admin».
// Los errores al usuario son genéricos salvo los de validación (ClientError), que explican qué corregir.
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import {
  ClientError,
  createCoreClient,
  deleteAsset,
  deleteCompetitor,
  deleteContact,
  deleteCoreClient,
  deleteLocation,
  saveAsset,
  saveCompetitor,
  saveContact,
  saveLocation,
  setClientStatus,
  updateCoreClient,
  type AssetInput,
  type ClientContractInput,
  type ClientProfileInput,
  type CompetitorInput,
  type ContactInput,
  type LocationInput
} from '@/lib/core/clients';
import { isClientStatus } from '@/lib/core/client-rules';

type Ok<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (e: unknown, fallback: string): { ok: false; error: string } => ({
  ok: false,
  error: e instanceof ClientError ? e.userMessage : publicError(e, fallback)
});

const refresh = (id?: string) => {
  revalidatePath('/dashboard/clientes');
  if (id) revalidatePath(`/dashboard/clientes/${id}`);
};

export async function createClientAction(input: { name: string; status: string }): Promise<Ok<{ id: string }>> {
  try {
    const user = await requirePermission('edit');
    if (!isClientStatus(input.status)) return { ok: false, error: 'Estado no válido' };
    const id = await createCoreClient(user.tenantId, { name: input.name, status: input.status, startedAt: input.status === 'activo' || input.status === 'onboarding' ? new Date().toISOString().slice(0, 10) : undefined });
    refresh(id);
    return { ok: true, id };
  } catch (e) {
    return fail(e, 'No se pudo crear el cliente');
  }
}

export async function saveClientProfileAction(clientId: string, profile: ClientProfileInput): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    // El estado se cambia con su propia acción (pone fechas de alta y baja).
    const { status: _status, ...rest } = profile;
    await updateCoreClient(user.tenantId, clientId, rest);
    refresh(clientId);
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo guardar la ficha');
  }
}

export async function saveClientContractAction(clientId: string, contract: ClientContractInput): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    await updateCoreClient(user.tenantId, clientId, {}, contract);
    refresh(clientId);
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo guardar el contrato');
  }
}

export async function setClientStatusAction(clientId: string, status: string, endReason?: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!isClientStatus(status)) return { ok: false, error: 'Estado no válido' };
    await setClientStatus(user.tenantId, clientId, status, endReason);
    refresh(clientId);
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo cambiar el estado');
  }
}

export async function deleteClientAction(clientId: string): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    await deleteCoreClient(user.tenantId, clientId);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo eliminar el cliente');
  }
}

// --- Contactos ----------------------------------------------------------------------------------------------------

export async function saveContactAction(clientId: string, input: ContactInput): Promise<Ok<{ id: string }>> {
  try {
    const user = await requirePermission('edit');
    const id = await saveContact(user.tenantId, clientId, input);
    refresh(clientId);
    return { ok: true, id };
  } catch (e) {
    return fail(e, 'No se pudo guardar el contacto');
  }
}

/** Borrar un contacto de verdad es de administrador; un editor puede marcarlo como inactivo. */
export async function deleteContactAction(clientId: string, contactId: string): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    await deleteContact(user.tenantId, contactId);
    refresh(clientId);
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo eliminar el contacto');
  }
}

// --- Locales ------------------------------------------------------------------------------------------------------

export async function saveLocationAction(clientId: string, input: LocationInput): Promise<Ok<{ id: string }>> {
  try {
    const user = await requirePermission('edit');
    const id = await saveLocation(user.tenantId, clientId, input);
    refresh(clientId);
    return { ok: true, id };
  } catch (e) {
    return fail(e, 'No se pudo guardar el local');
  }
}

export async function deleteLocationAction(clientId: string, locationId: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    await deleteLocation(user.tenantId, locationId);
    refresh(clientId);
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo eliminar el local');
  }
}

// --- Webs y cuentas -----------------------------------------------------------------------------------------------

export async function saveAssetAction(clientId: string, input: AssetInput): Promise<Ok<{ id: string }>> {
  try {
    const user = await requirePermission('edit');
    const id = await saveAsset(user.tenantId, clientId, input);
    refresh(clientId);
    return { ok: true, id };
  } catch (e) {
    return fail(e, 'No se pudo guardar');
  }
}

export async function deleteAssetAction(clientId: string, assetId: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    await deleteAsset(user.tenantId, assetId);
    refresh(clientId);
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo eliminar');
  }
}

// --- Competencia --------------------------------------------------------------------------------------------------

export async function saveCompetitorAction(clientId: string, input: CompetitorInput): Promise<Ok<{ id: string }>> {
  try {
    const user = await requirePermission('edit');
    const id = await saveCompetitor(user.tenantId, clientId, { ...input, source: input.id ? undefined : 'manual' });
    refresh(clientId);
    return { ok: true, id };
  } catch (e) {
    return fail(e, 'No se pudo guardar el competidor');
  }
}

export async function deleteCompetitorAction(clientId: string, competitorId: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    await deleteCompetitor(user.tenantId, competitorId);
    refresh(clientId);
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo eliminar el competidor');
  }
}

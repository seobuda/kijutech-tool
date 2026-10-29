'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/drizzle';
import {
  opsClickupConnections,
  opsClickupLists,
  opsClickupMembers,
  opsClickupSpaces
} from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { encrypt } from '@/lib/ai/encryption';
import { setTranscriptionModel } from '@/lib/operaciones/settings';
import { getWorkspaces, registerTokenTenant, ClickUpError } from '@/lib/operaciones/clickup';
import { getStructure, setSelectedSpaces, syncStructure } from '@/lib/operaciones/structure';

export async function saveClickUpToken(
  token: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'No autenticado' };

  const clean = token.trim();
  if (!clean) return { ok: false, error: 'Pega el token de ClickUp' };

  // Se valida contra ClickUp antes de guardar, para no almacenar un token roto.
  registerTokenTenant(clean, user.tenantId);
  try {
    await getWorkspaces(clean);
  } catch (e) {
    return { ok: false, error: e instanceof ClickUpError ? e.message : 'No se pudo contactar con ClickUp' };
  }

  const { encrypted, iv } = encrypt(clean);
  await db
    .insert(opsClickupConnections)
    .values({ tenantId: user.tenantId, apiKeyEncrypted: encrypted, apiKeyIv: iv })
    .onConflictDoUpdate({
      target: opsClickupConnections.tenantId,
      // Al cambiar de token se olvida el workspace elegido (puede ser otro).
      set: {
        apiKeyEncrypted: encrypted,
        apiKeyIv: iv,
        workspaceId: null,
        structureSyncedAt: null,
        updatedAt: new Date()
      }
    });

  // La estructura se carga en segundo plano: el Bloc la tendrá lista en segundos.
  void syncStructure(user.tenantId);

  revalidatePath('/dashboard/operaciones', 'layout');
  return { ok: true };
}

export async function removeClickUpToken(): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'No autenticado' };
  await db.delete(opsClickupConnections).where(eq(opsClickupConnections.tenantId, user.tenantId));
  // La caché pertenece a esa conexión: sin token no tiene sentido conservarla.
  await db.delete(opsClickupLists).where(eq(opsClickupLists.tenantId, user.tenantId));
  await db.delete(opsClickupSpaces).where(eq(opsClickupSpaces.tenantId, user.tenantId));
  await db.delete(opsClickupMembers).where(eq(opsClickupMembers.tenantId, user.tenantId));
  revalidatePath('/dashboard/operaciones', 'layout');
  return { ok: true };
}

export async function saveTranscriptionModel(
  model: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'No autenticado' };
  const clean = model.trim();
  if (!/^[\w.\-]{3,100}$/.test(clean)) {
    return { ok: false, error: 'Nombre de modelo no válido (ej.: gemini-flash-latest)' };
  }
  await setTranscriptionModel(user.tenantId, clean);
  revalidatePath('/dashboard/operaciones/ajustes');
  return { ok: true };
}

export type SyncSummary =
  | { ok: true; workspaceName: string; members: number; spaces: number; selected: number; lists: number }
  | { ok: false; error: string };

// "Probar conexión" y "Actualizar desde ClickUp": sincroniza la caché ahora mismo.
export async function syncClickUpNow(): Promise<SyncSummary> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'No autenticado' };

  const res = await syncStructure(user.tenantId);
  if (!res.ok) return res;

  const s = await getStructure(user.tenantId);
  revalidatePath('/dashboard/operaciones', 'layout');
  return {
    ok: true,
    workspaceName: s.workspaceName ?? '',
    members: s.members.length,
    spaces: s.spaces.length,
    selected: s.spaces.filter((x) => x.selected).length,
    lists: s.spaces.reduce((n, x) => n + x.lists.length, 0)
  };
}

// Elige qué espacios se sincronizan (y aparecen en los desplegables).
export async function saveSelectedSpaces(
  spaceIds: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'No autenticado' };
  if (spaceIds.length === 0) return { ok: false, error: 'Deja al menos un espacio seleccionado' };

  const res = await setSelectedSpaces(user.tenantId, spaceIds);
  revalidatePath('/dashboard/operaciones', 'layout');
  return res;
}

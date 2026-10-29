'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/drizzle';
import { opsClickupConnections } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { encrypt } from '@/lib/ai/encryption';
import { getClickUpToken } from '@/lib/operaciones/queries';
import { setTranscriptionModel } from '@/lib/operaciones/settings';
import { getSpacesWithLists, getWorkspaces, ClickUpError } from '@/lib/operaciones/clickup';

export type TestConnectionResult =
  | {
      ok: true;
      workspaces: {
        id: string;
        name: string;
        memberCount: number;
        spaces: { id: string; name: string; lists: { id: string; name: string; folder: string | null }[] }[];
      }[];
    }
  | { ok: false; error: string };

export async function saveClickUpToken(
  token: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'No autenticado' };

  const clean = token.trim();
  if (!clean) return { ok: false, error: 'Pega el token de ClickUp' };

  // Se valida contra ClickUp antes de guardar, para no almacenar un token roto.
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
      set: { apiKeyEncrypted: encrypted, apiKeyIv: iv, workspaceId: null, updatedAt: new Date() }
    });

  revalidatePath('/dashboard/operaciones', 'layout');
  return { ok: true };
}

export async function removeClickUpToken(): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'No autenticado' };
  await db.delete(opsClickupConnections).where(eq(opsClickupConnections.tenantId, user.tenantId));
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

export async function testClickUpConnection(): Promise<TestConnectionResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'No autenticado' };

  const conn = await getClickUpToken(user.tenantId);
  if (!conn) return { ok: false, error: 'Todavía no hay token guardado' };

  try {
    const workspaces = await getWorkspaces(conn.token);
    const result = await Promise.all(
      workspaces.map(async (w) => ({
        id: w.id,
        name: w.name,
        memberCount: w.members.length,
        spaces: await getSpacesWithLists(conn.token, w.id)
      }))
    );

    // Se recuerda el primer workspace como el que usa "Equipo hoy" si aún no hay uno.
    if (!conn.workspaceId && workspaces[0]) {
      await db
        .update(opsClickupConnections)
        .set({ workspaceId: workspaces[0].id })
        .where(eq(opsClickupConnections.tenantId, user.tenantId));
    }
    return { ok: true, workspaces: result };
  } catch (e) {
    return { ok: false, error: e instanceof ClickUpError ? e.message : 'No se pudo contactar con ClickUp' };
  }
}

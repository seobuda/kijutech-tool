// Caché en base de datos de la estructura de ClickUp: espacios, carpetas/listas
// y miembros. Las pantallas leen de aquí (milisegundos) en vez de llamar a
// ClickUp (27 peticiones y varios segundos por pantalla).
//  - Se refresca sola si tiene más de 1 hora (en segundo plano, sin bloquear).
//  - Botón "Actualizar desde ClickUp" en Ajustes.
//  - Solo se guardan las listas de los espacios seleccionados.
//  - En la primera sincronización todos los espacios quedan seleccionados.
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  opsClickupConnections,
  opsClickupLists,
  opsClickupMembers,
  opsClickupSpaces
} from '@/lib/db/schema';
import { getClickUpToken } from '@/lib/operaciones/queries';
import {
  ClickUpError,
  getMe,
  getSpaceLists,
  getSpacesBasic,
  getWorkspaces,
  type ClickUpList
} from '@/lib/operaciones/clickup';

export const STRUCTURE_STALE_MS = 60 * 60 * 1000;

export type CachedSpace = { id: string; name: string; selected: boolean; lists: ClickUpList[] };
export type CachedMember = { id: string; username: string };

export type CachedStructure = {
  connected: boolean;
  syncedAt: Date | null;
  workspaceId: string | null;
  workspaceName: string | null;
  meId: string | null;
  meUsername: string | null;
  spaces: CachedSpace[]; // todos los espacios; las listas solo vienen en los seleccionados
  members: CachedMember[];
};

export async function getStructure(tenantId: string): Promise<CachedStructure> {
  const [conn] = await db
    .select()
    .from(opsClickupConnections)
    .where(eq(opsClickupConnections.tenantId, tenantId))
    .limit(1);
  if (!conn) {
    return {
      connected: false,
      syncedAt: null,
      workspaceId: null,
      workspaceName: null,
      meId: null,
      meUsername: null,
      spaces: [],
      members: []
    };
  }

  const [spaces, lists, members] = await Promise.all([
    db.select().from(opsClickupSpaces).where(eq(opsClickupSpaces.tenantId, tenantId)),
    db.select().from(opsClickupLists).where(eq(opsClickupLists.tenantId, tenantId)),
    db.select().from(opsClickupMembers).where(eq(opsClickupMembers.tenantId, tenantId))
  ]);

  const listsBySpace = new Map<string, ClickUpList[]>();
  for (const l of lists) {
    const arr = listsBySpace.get(l.clickupSpaceId) ?? [];
    arr.push({ id: l.clickupListId, name: l.name, folder: l.folderName });
    listsBySpace.set(l.clickupSpaceId, arr);
  }

  return {
    connected: true,
    syncedAt: conn.structureSyncedAt,
    workspaceId: conn.workspaceId,
    workspaceName: conn.workspaceName,
    meId: conn.meClickupId,
    meUsername: conn.meUsername,
    spaces: spaces
      .map((s) => ({
        id: s.clickupSpaceId,
        name: s.name,
        selected: s.selected,
        lists: (listsBySpace.get(s.clickupSpaceId) ?? []).sort((a, b) =>
          `${a.folder ?? ''}/${a.name}`.localeCompare(`${b.folder ?? ''}/${b.name}`, 'es')
        )
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es')),
    members: members
      .map((m) => ({ id: m.clickupUserId, username: m.username }))
      .sort((a, b) => a.username.localeCompare(b.username, 'es'))
  };
}

// Solo los espacios seleccionados, con sus listas (los desplegables del Bloc y de Nuevo encargo).
export function selectedSpaces(structure: CachedStructure) {
  return structure.spaces.filter((s) => s.selected);
}

// ---------------------------------------------------------------------------
// Sincronización
// ---------------------------------------------------------------------------

// Un solo sync a la vez por cuenta (compartido por todo el proceso).
const g = globalThis as unknown as { __opsSyncs?: Map<string, Promise<SyncOutcome>> };
const running: Map<string, Promise<SyncOutcome>> = (g.__opsSyncs ??= new Map());

export type SyncOutcome = { ok: true } | { ok: false; error: string };

export function syncStructure(tenantId: string): Promise<SyncOutcome> {
  const existing = running.get(tenantId);
  if (existing) return existing;
  const p = doSync(tenantId)
    .catch(
      (e): SyncOutcome => ({
        ok: false,
        error: e instanceof Error ? e.message : 'No se pudo sincronizar con ClickUp'
      })
    )
    .finally(() => running.delete(tenantId));
  running.set(tenantId, p);
  return p;
}

// Refresco automático: si la caché no existe o tiene más de 1 hora, se lanza una
// sincronización EN SEGUNDO PLANO (sin esperar). La pantalla pinta con lo que hay.
export async function ensureFresh(tenantId: string): Promise<void> {
  const [conn] = await db
    .select({ at: opsClickupConnections.structureSyncedAt })
    .from(opsClickupConnections)
    .where(eq(opsClickupConnections.tenantId, tenantId))
    .limit(1);
  if (!conn) return;
  if (!conn.at || Date.now() - conn.at.getTime() > STRUCTURE_STALE_MS) {
    void syncStructure(tenantId);
  }
}

async function fetchListsInChunks(token: string, spaceIds: string[]) {
  const out = new Map<string, ClickUpList[]>();
  for (let i = 0; i < spaceIds.length; i += 4) {
    const chunk = spaceIds.slice(i, i + 4);
    const results = await Promise.all(chunk.map((id) => getSpaceLists(token, id)));
    chunk.forEach((id, idx) => out.set(id, results[idx]));
  }
  return out;
}

async function replaceLists(tenantId: string, bySpace: Map<string, ClickUpList[]>) {
  if (bySpace.size === 0) return;
  await db.transaction(async (tx) => {
    for (const [spaceId, lists] of bySpace) {
      await tx
        .delete(opsClickupLists)
        .where(and(eq(opsClickupLists.tenantId, tenantId), eq(opsClickupLists.clickupSpaceId, spaceId)));
      if (lists.length > 0) {
        await tx.insert(opsClickupLists).values(
          lists.map((l) => ({
            tenantId,
            clickupListId: l.id,
            clickupSpaceId: spaceId,
            name: l.name,
            folderName: l.folder
          }))
        );
      }
    }
  });
}

async function doSync(tenantId: string): Promise<SyncOutcome> {
  const conn = await getClickUpToken(tenantId);
  if (!conn) return { ok: false, error: 'ClickUp no está conectado (falta el token en Ajustes)' };

  // 3 peticiones: workspace + miembros, usuario del token y espacios.
  const workspaces = await getWorkspaces(conn.token);
  const workspace = workspaces.find((w) => w.id === conn.workspaceId) ?? workspaces[0];
  if (!workspace) return { ok: false, error: 'Tu cuenta de ClickUp no tiene workspaces' };
  const me = await getMe(conn.token);
  const remoteSpaces = await getSpacesBasic(conn.token, workspace.id);

  const existing = await db
    .select()
    .from(opsClickupSpaces)
    .where(eq(opsClickupSpaces.tenantId, tenantId));
  const firstSync = existing.length === 0;
  const existingIds = new Set(existing.map((s) => s.clickupSpaceId));
  const remoteIds = remoteSpaces.map((s) => s.id);

  // Espacios nuevos: en la PRIMERA sincronización quedan todos seleccionados (para que los
  // desplegables no salgan vacíos); los que aparezcan después, sin seleccionar.
  const fresh = remoteSpaces.filter((s) => !existingIds.has(s.id));
  if (fresh.length > 0) {
    await db.insert(opsClickupSpaces).values(
      fresh.map((s) => ({
        tenantId,
        clickupSpaceId: s.id,
        name: s.name,
        selected: firstSync
      }))
    );
  }
  for (const s of remoteSpaces.filter((s) => existingIds.has(s.id))) {
    await db
      .update(opsClickupSpaces)
      .set({ name: s.name, syncedAt: new Date() })
      .where(and(eq(opsClickupSpaces.tenantId, tenantId), eq(opsClickupSpaces.clickupSpaceId, s.id)));
  }
  // Espacios que ya no existen en ClickUp.
  if (remoteIds.length > 0) {
    const gone = existing.map((s) => s.clickupSpaceId).filter((id) => !remoteIds.includes(id));
    if (gone.length > 0) {
      await db
        .delete(opsClickupSpaces)
        .where(and(eq(opsClickupSpaces.tenantId, tenantId), inArray(opsClickupSpaces.clickupSpaceId, gone)));
      await db
        .delete(opsClickupLists)
        .where(and(eq(opsClickupLists.tenantId, tenantId), inArray(opsClickupLists.clickupSpaceId, gone)));
    }
  }

  // Miembros del workspace.
  await db.transaction(async (tx) => {
    await tx.delete(opsClickupMembers).where(eq(opsClickupMembers.tenantId, tenantId));
    if (workspace.members.length > 0) {
      await tx.insert(opsClickupMembers).values(
        workspace.members.map((m) => ({
          tenantId,
          clickupUserId: String(m.id),
          username: m.username,
          email: m.email ?? null
        }))
      );
    }
  });

  // Listas: SOLO de los espacios seleccionados (2 peticiones por espacio).
  const selected = await db
    .select({ id: opsClickupSpaces.clickupSpaceId })
    .from(opsClickupSpaces)
    .where(and(eq(opsClickupSpaces.tenantId, tenantId), eq(opsClickupSpaces.selected, true)));
  const selectedIds = selected.map((s) => s.id);
  await replaceLists(tenantId, await fetchListsInChunks(conn.token, selectedIds));
  // Las listas de espacios no seleccionados no se guardan.
  if (selectedIds.length > 0) {
    await db
      .delete(opsClickupLists)
      .where(
        and(eq(opsClickupLists.tenantId, tenantId), notInArray(opsClickupLists.clickupSpaceId, selectedIds))
      );
  } else {
    await db.delete(opsClickupLists).where(eq(opsClickupLists.tenantId, tenantId));
  }

  await db
    .update(opsClickupConnections)
    .set({
      workspaceId: workspace.id,
      workspaceName: workspace.name,
      meClickupId: String(me.id),
      meUsername: me.username,
      structureSyncedAt: new Date()
    })
    .where(eq(opsClickupConnections.tenantId, tenantId));

  return { ok: true };
}

// Cambia qué espacios se sincronizan. Los recién marcados traen sus listas ahora
// (2 peticiones cada uno); los desmarcados pierden las suyas de la caché.
export async function setSelectedSpaces(tenantId: string, spaceIds: string[]): Promise<SyncOutcome> {
  const conn = await getClickUpToken(tenantId);
  if (!conn) return { ok: false, error: 'ClickUp no está conectado' };

  const all = await db.select().from(opsClickupSpaces).where(eq(opsClickupSpaces.tenantId, tenantId));
  const wanted = new Set(spaceIds);
  const toSelect = all.filter((s) => wanted.has(s.clickupSpaceId) && !s.selected).map((s) => s.clickupSpaceId);
  const toUnselect = all.filter((s) => !wanted.has(s.clickupSpaceId) && s.selected).map((s) => s.clickupSpaceId);

  try {
    // Primero se traen las listas nuevas: si ClickUp falla, no se toca nada.
    const lists = toSelect.length > 0 ? await fetchListsInChunks(conn.token, toSelect) : new Map();
    if (toSelect.length > 0) {
      await db
        .update(opsClickupSpaces)
        .set({ selected: true })
        .where(and(eq(opsClickupSpaces.tenantId, tenantId), inArray(opsClickupSpaces.clickupSpaceId, toSelect)));
      await replaceLists(tenantId, lists);
    }
    if (toUnselect.length > 0) {
      await db
        .update(opsClickupSpaces)
        .set({ selected: false })
        .where(and(eq(opsClickupSpaces.tenantId, tenantId), inArray(opsClickupSpaces.clickupSpaceId, toUnselect)));
      await db
        .delete(opsClickupLists)
        .where(and(eq(opsClickupLists.tenantId, tenantId), inArray(opsClickupLists.clickupSpaceId, toUnselect)));
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof ClickUpError || e instanceof Error ? e.message : 'Error desconocido' };
  }
}

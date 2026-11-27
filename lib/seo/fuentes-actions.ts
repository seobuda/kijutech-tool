'use server';

// SEO · acciones de «Fuentes de novedades» (27 nov 2026). Ver la lista: cualquiera con acceso; añadir, editar, quitar y
// «Leer ahora»: administradores (cambian lo que lee la agencia y lo que verá el investigador del Jefe SEO).
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { enqueueJob } from '@/lib/core/jobs';
import { addSource, deleteSource, resolveSource, SourceError, updateSource } from '@/lib/seo/id/fuentes';
import { ensureSeoWatch, ID_WATCH } from '@/lib/seo/id/watch';
import type { SourceLevel } from '@/lib/seo/id/fuentes-rules';

type Ok = { ok: true; message?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PATH = '/dashboard/seo/fuentes';
const fail = (e: unknown, fallback: string): Ok => ({ ok: false, error: e instanceof SourceError ? e.userMessage : publicError(e, fallback) });

/** Comprueba una URL sin guardarla: qué tipo es, qué feed se leería y sus 3 últimos títulos. */
export async function previewSourceAction(url: string): Promise<{ ok: true; kind: string; feedUrl: string; title: string | null; items: number; sample: string[] } | { ok: false; error: string }> {
  try {
    await requirePermission('admin');
    const r = await resolveSource(String(url ?? '').slice(0, 500));
    return { ok: true, ...r };
  } catch (e) {
    return fail(e, 'No se pudo leer esa dirección') as { ok: false; error: string };
  }
}

export async function addSourceAction(input: { url: string; label: string; level: SourceLevel }): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    const r = await addSource(user.tenantId, { url: String(input?.url ?? '').slice(0, 500), label: String(input?.label ?? '').slice(0, 160), level: input?.level }, user.name || user.email);
    revalidatePath(PATH);
    return { ok: true, message: `Añadida «${r.label}» (${r.items} publicaciones leídas). Se leerá cada 3 horas.` };
  } catch (e) {
    return fail(e, 'No se pudo añadir la fuente');
  }
}

export async function updateSourceAction(id: string, patch: { label?: string; level?: SourceLevel; active?: boolean }): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    if (!UUID.test(id)) return { ok: false, error: 'Fuente no encontrada' };
    await updateSource(user.tenantId, id, { label: patch?.label, level: patch?.level, active: patch?.active });
    revalidatePath(PATH);
    return { ok: true, message: 'Guardado.' };
  } catch (e) {
    return fail(e, 'No se pudo guardar');
  }
}

export async function deleteSourceAction(id: string): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    if (!UUID.test(id)) return { ok: false, error: 'Fuente no encontrada' };
    await deleteSource(user.tenantId, id);
    revalidatePath(PATH);
    return { ok: true, message: 'Fuente quitada. Lo que ya se leyó sigue en Novedades.' };
  } catch (e) {
    return fail(e, 'No se pudo quitar');
  }
}

export async function readSourcesNowAction(): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    await ensureSeoWatch(user.tenantId);
    await enqueueJob({ tenantId: user.tenantId, kind: ID_WATCH, priority: 4, dedupeKey: `${ID_WATCH}:manual` });
    return { ok: true, message: 'Leyendo las fuentes (menos de un minuto). Recarga la página para ver el resultado.' };
  } catch (e) {
    return fail(e, 'No se pudo lanzar la lectura');
  }
}

'use server';

// Acciones web del flujo de trabajo (paso 5): correspondencia de estados, tipos de trabajo,
// horas de los resúmenes y «Mi bandeja» (aceptar, devolver, responder).
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/drizzle';
import { opsTelegramConfig, opsWorkTypes } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { getClickUpConnection } from '@/lib/operaciones/queries';
import { saveStatusGroup } from '@/lib/operaciones/status-map';
import { slugKey } from '@/lib/operaciones/work-types';
import { sendDigestNow } from '@/lib/operaciones/digest';
import { acceptWork, getRequest, returnWork } from '@/lib/operaciones/workflow';
import { getBlocker, ownerAnswerBlocker } from '@/lib/operaciones/blockers';
import type { Actor } from '@/lib/operaciones/events';

type Ok<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function requireUser() {
  const user = await getUser();
  if (!user) throw new Error('No autenticado');
  return user;
}

const fail = (e: unknown, fallback: string): { ok: false; error: string } => ({
  ok: false,
  error: e instanceof Error ? e.message : fallback
});

// Quien actúa desde la web es quien lleva las operaciones (dueño del token de ClickUp).
async function ownerActor(tenantId: string): Promise<Actor> {
  const conn = await getClickUpConnection(tenantId);
  return { clickupUserId: conn?.meClickupId ?? null, name: conn?.meUsername ?? 'Operaciones' };
}

const refreshAll = () => {
  revalidatePath('/dashboard/operaciones/bandeja');
  revalidatePath('/dashboard/operaciones/encargos');
};

// --- Estados de ClickUp -----------------------------------------------------------------

export async function saveStatusMapping(
  listIds: string[],
  values: { inProgress: string | null; inReview: string | null; done: string | null }
): Promise<Ok> {
  try {
    const user = await requireUser();
    const clean = (v: string | null) => (v && v.trim() ? v.trim() : null);
    await saveStatusGroup(user.tenantId, listIds, {
      inProgress: clean(values.inProgress),
      inReview: clean(values.inReview),
      done: clean(values.done)
    });
    revalidatePath('/dashboard/operaciones/ajustes');
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo guardar');
  }
}

// --- Tipos de trabajo -------------------------------------------------------------------

export async function addWorkType(label: string): Promise<Ok> {
  try {
    const user = await requireUser();
    const clean = label.trim();
    const key = slugKey(clean);
    if (!clean || !key) return { ok: false, error: 'Escribe un nombre' };
    const existing = await db.select().from(opsWorkTypes).where(eq(opsWorkTypes.tenantId, user.tenantId));
    if (existing.some((t) => t.key === key)) return { ok: false, error: 'Ya existe un tipo con ese nombre' };
    await db.insert(opsWorkTypes).values({
      tenantId: user.tenantId,
      key,
      label: clean.slice(0, 100),
      sortOrder: existing.length + 1
    });
    revalidatePath('/dashboard/operaciones', 'layout');
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo añadir');
  }
}

export async function updateWorkType(key: string, patch: { label?: string; active?: boolean }): Promise<Ok> {
  try {
    const user = await requireUser();
    const set: Partial<typeof opsWorkTypes.$inferInsert> = {};
    if (patch.label !== undefined) {
      if (!patch.label.trim()) return { ok: false, error: 'El nombre no puede estar vacío' };
      set.label = patch.label.trim().slice(0, 100);
    }
    if (patch.active !== undefined) set.active = patch.active;
    await db
      .update(opsWorkTypes)
      .set(set)
      .where(and(eq(opsWorkTypes.tenantId, user.tenantId), eq(opsWorkTypes.key, key)));
    revalidatePath('/dashboard/operaciones', 'layout');
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo guardar');
  }
}

// --- Resúmenes para el dueño ------------------------------------------------------------

export async function saveDigestSettings(times: string): Promise<Ok> {
  try {
    const user = await requireUser();
    const list = times
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (list.length === 0 || list.length > 4 || list.some((t) => !/^([01]?\d|2[0-3]):[0-5]\d$/.test(t))) {
      return { ok: false, error: 'Escribe de 1 a 4 horas con formato HH:MM separadas por comas (ej.: 13:00, 18:00)' };
    }
    await db
      .update(opsTelegramConfig)
      .set({
        digestTimes: list.map((t) => t.padStart(5, '0')).join(','),
        updatedAt: new Date()
      })
      .where(eq(opsTelegramConfig.tenantId, user.tenantId));
    revalidatePath('/dashboard/operaciones/telegram');
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo guardar');
  }
}

export async function sendDigestNowAction(): Promise<Ok<{ sent: boolean }>> {
  try {
    const user = await requireUser();
    const res = await sendDigestNow(user.tenantId);
    revalidatePath('/dashboard/operaciones/telegram');
    return { ok: true, ...res };
  } catch (e) {
    return fail(e, 'No se pudo enviar el resumen');
  }
}

// --- Mi bandeja -------------------------------------------------------------------------

export async function inboxAccept(requestId: string): Promise<Ok> {
  try {
    const user = await requireUser();
    const req = await getRequest(user.tenantId, requestId);
    if (!req) return { ok: false, error: 'Encargo no encontrado' };
    const res = await acceptWork(req, await ownerActor(user.tenantId));
    refreshAll();
    return res.ok ? { ok: true } : { ok: false, error: res.reason };
  } catch (e) {
    return fail(e, 'No se pudo aceptar');
  }
}

export async function inboxReturn(requestId: string, reason: string): Promise<Ok> {
  try {
    const user = await requireUser();
    if (!reason.trim()) return { ok: false, error: 'Escribe el motivo de la devolución' };
    const req = await getRequest(user.tenantId, requestId);
    if (!req) return { ok: false, error: 'Encargo no encontrado' };
    const res = await returnWork(req, await ownerActor(user.tenantId), reason);
    refreshAll();
    return res.ok ? { ok: true } : { ok: false, error: res.reason };
  } catch (e) {
    return fail(e, 'No se pudo devolver');
  }
}

export async function inboxAnswer(blockerId: string, answer: string): Promise<Ok> {
  try {
    const user = await requireUser();
    const blocker = await getBlocker(user.tenantId, blockerId);
    if (!blocker) return { ok: false, error: 'Bloqueo no encontrado' };
    const res = await ownerAnswerBlocker(blocker, await ownerActor(user.tenantId), answer);
    refreshAll();
    return res.ok ? { ok: true } : { ok: false, error: res.reason };
  } catch (e) {
    return fail(e, 'No se pudo responder');
  }
}

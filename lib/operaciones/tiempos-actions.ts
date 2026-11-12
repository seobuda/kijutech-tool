'use server';

// Acciones web de «Equipo → Tiempos» (solo administración): márgenes por tipo de trabajo y correcciones.
// Nunca se borra nada: anular deja la fila tachada con quién y por qué; corregir anula y crea una nueva
// 'correccion' con los minutos buenos (el margen y la estimación se conservan).
import { revalidatePath } from 'next/cache';
import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { opsTaskTimes, opsWorkTypes } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { logEvent } from '@/lib/operaciones/events';
import { precisionHit, verdictFor } from '@/lib/operaciones/tiempos-core';
import { tiemposSettings } from '@/lib/operaciones/tiempos';

type Res = { ok: true } | { ok: false; error: string };
const PATH = '/dashboard/operaciones/tiempos';

const minutes = z.number().int().min(0).max(1440).nullable();
const bandSchema = z
  .object({ key: z.string().trim().min(1).max(40), min: minutes, max: minutes })
  .refine((d) => d.max === null || d.max > 0, { message: 'El máximo debe ser mayor que 0' })
  .refine((d) => d.min === null || d.max === null || d.min <= d.max, { message: 'El mínimo no puede ser mayor que el máximo' });

export async function saveBandAction(input: { key: string; min: number | null; max: number | null }): Promise<Res> {
  try {
    const user = await requirePermission('admin');
    const parsed = bandSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos no válidos' };
    const [row] = await db
      .update(opsWorkTypes)
      .set({ minMinutes: parsed.data.min, maxMinutes: parsed.data.max })
      .where(and(eq(opsWorkTypes.tenantId, user.tenantId), eq(opsWorkTypes.key, parsed.data.key)))
      .returning({ key: opsWorkTypes.key });
    if (!row) return { ok: false, error: 'Ese tipo de trabajo no existe' };
    await logEvent(user.tenantId, {
      actor: { clickupUserId: null, name: user.name || user.email },
      type: 'tiempos',
      payload: { kind: 'margen', type: parsed.data.key, min: parsed.data.min, max: parsed.data.max }
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo guardar el margen') };
  }
}

const voidSchema = z.object({ id: z.string().uuid(), reason: z.string().trim().min(3, 'Escribe el motivo de la corrección').max(500) });

export async function voidTaskTimeAction(id: string, reason: string): Promise<Res> {
  try {
    const user = await requirePermission('admin');
    const parsed = voidSchema.safeParse({ id, reason });
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos no válidos' };
    const by = user.name || user.email;
    const [row] = await db
      .update(opsTaskTimes)
      .set({ voidedAt: new Date(), voidedByName: by, voidReason: parsed.data.reason, updatedAt: new Date() })
      .where(and(eq(opsTaskTimes.tenantId, user.tenantId), eq(opsTaskTimes.id, parsed.data.id), isNull(opsTaskTimes.voidedAt)))
      .returning();
    if (!row) return { ok: false, error: 'Esa fila no existe o ya estaba anulada' };
    await logEvent(user.tenantId, {
      requestId: row.requestId,
      actor: { clickupUserId: row.clickupUserId, name: row.personName },
      type: 'tiempos',
      payload: { kind: 'anulada', by, reason: parsed.data.reason }
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo anular') };
  }
}

const correctSchema = z.object({
  id: z.string().uuid(),
  minutes: z.number().int().min(0).max(1440),
  reason: z.string().trim().min(3, 'Escribe el motivo de la corrección').max(500)
});

export async function correctTaskTimeAction(input: { id: string; minutes: number; reason: string }): Promise<Res> {
  try {
    const user = await requirePermission('admin');
    const parsed = correctSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos no válidos' };
    const by = user.name || user.email;
    const s = await tiemposSettings(user.tenantId);
    const ok = await db.transaction(async (tx) => {
      const [old] = await tx
        .update(opsTaskTimes)
        .set({ voidedAt: new Date(), voidedByName: by, voidReason: `Corregida: ${parsed.data.reason}`, updatedAt: new Date() })
        .where(
          and(
            eq(opsTaskTimes.tenantId, user.tenantId),
            eq(opsTaskTimes.id, parsed.data.id),
            eq(opsTaskTimes.status, 'cerrada'),
            isNull(opsTaskTimes.voidedAt)
          )
        )
        .returning();
      if (!old) return null;
      const m = parsed.data.minutes;
      const verdict = verdictFor(m, old.bandMin, old.bandMax);
      await tx.insert(opsTaskTimes).values({
        tenantId: old.tenantId,
        clickupTaskId: old.clickupTaskId,
        requestId: old.requestId,
        clickupUserId: old.clickupUserId,
        personName: old.personName,
        taskName: old.taskName,
        workTypeKey: old.workTypeKey,
        status: 'cerrada',
        startedAt: old.startedAt,
        doneAt: old.doneAt,
        workedMinutes: m,
        estimateMinutes: old.estimateMinutes,
        bandMin: old.bandMin,
        bandMax: old.bandMax,
        verdict,
        precisionHit: old.estimateMinutes ? precisionHit(old.estimateMinutes, m, s.precisionPct) : null,
        // Si ya no se pasa del margen, no hace falta justificarla; si se justificó, se conserva.
        justifyStatus: verdict === 'pasado' ? (old.justifyStatus === 'no_necesaria' ? 'pendiente' : old.justifyStatus) : old.justifyStatus === 'enviada' ? 'enviada' : 'no_necesaria',
        evidenceUrl: old.evidenceUrl,
        overReason: old.overReason,
        overNote: old.overNote,
        source: 'correccion'
      });
      return old;
    });
    if (!ok) return { ok: false, error: 'Esa fila no existe, no está cerrada o ya estaba anulada' };
    await logEvent(user.tenantId, {
      requestId: ok.requestId,
      actor: { clickupUserId: ok.clickupUserId, name: ok.personName },
      type: 'tiempos',
      payload: { kind: 'corregida', by, from: ok.workedMinutes, to: parsed.data.minutes, reason: parsed.data.reason }
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo corregir') };
  }
}

'use server';

// Acciones web de «Equipo → Jornada» (solo administración): corregir registros de la jornada.
// Nunca se borra nada: anular deja el registro tachado con quién y por qué; añadir crea uno 'correccion'.
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { opsTeamProfiles } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { logEvent } from '@/lib/operaciones/events';
import { WORK_KINDS } from '@/lib/operaciones/jornada-core';
import { addCorrection, localTimeMs, voidWorkEvent } from '@/lib/operaciones/jornada';

type Res = { ok: true } | { ok: false; error: string };
const PATH = '/dashboard/operaciones/jornada';

const voidSchema = z.object({ id: z.string().uuid(), reason: z.string().trim().min(3, 'Escribe el motivo de la corrección').max(500) });

export async function voidWorkEventAction(id: string, reason: string): Promise<Res> {
  try {
    const user = await requirePermission('admin');
    const parsed = voidSchema.safeParse({ id, reason });
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos no válidos' };
    const by = user.name || user.email;
    const row = await voidWorkEvent(user.tenantId, parsed.data.id, by, parsed.data.reason);
    if (!row) return { ok: false, error: 'Ese registro no existe o ya estaba anulado' };
    await logEvent(user.tenantId, {
      actor: { clickupUserId: row.clickupUserId, name: row.personName },
      type: 'jornada',
      payload: { kind: 'anulado', eventKind: row.kind, by, reason: parsed.data.reason }
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo anular el registro') };
  }
}

const addSchema = z.object({
  clickupUserId: z.string().regex(/^\d{1,20}$/),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(WORK_KINDS.filter((k) => k !== 'tarea') as [string, ...string[]]),
  time: z.string().regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Hora no válida (HH:MM)'),
  reason: z.string().trim().min(3, 'Escribe el motivo de la corrección').max(500),
  plannedMinutes: z.number().int().min(1).max(600).nullable()
});

export async function addWorkEventAction(input: {
  clickupUserId: string;
  date: string;
  kind: string;
  time: string;
  reason: string;
  plannedMinutes: number | null;
}): Promise<Res> {
  try {
    const user = await requirePermission('admin');
    const parsed = addSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos no válidos' };
    const d = parsed.data;
    const [p] = await db
      .select({ timezone: opsTeamProfiles.timezone })
      .from(opsTeamProfiles)
      .where(and(eq(opsTeamProfiles.tenantId, user.tenantId), eq(opsTeamProfiles.clickupUserId, d.clickupUserId)))
      .limit(1);
    if (!p) return { ok: false, error: 'Esa persona no tiene ficha' };
    const at = new Date(localTimeMs(p.timezone, d.date, d.time.padStart(5, '0')));
    if (at.getTime() > Date.now() + 60_000) return { ok: false, error: 'No se pueden añadir registros en el futuro' };
    const by = user.name || user.email;
    await addCorrection(
      user.tenantId,
      { clickupUserId: d.clickupUserId, date: d.date, kind: d.kind as (typeof WORK_KINDS)[number], at, reason: d.reason, plannedMinutes: d.plannedMinutes },
      { id: user.id, name: by }
    );
    await logEvent(user.tenantId, { actor: { clickupUserId: d.clickupUserId, name: by }, type: 'jornada', payload: { kind: 'corregido', eventKind: d.kind, date: d.date, time: d.time, by } });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo añadir el registro') };
  }
}

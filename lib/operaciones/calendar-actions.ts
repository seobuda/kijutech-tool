'use server';

// Acciones web de «Equipo → Calendario» (solo administración): festivos y ausencias planificadas por rango.
// Quitar una entrada la borra del calendario (no es un registro de jornada: lo ya fichado no se toca) y queda
// anotado en el registro de eventos con quién y qué.
import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { logEvent } from '@/lib/operaciones/events';
import { CALENDAR_KINDS, getCalendar, saveCalendar, validateEntry, type CalendarEntry } from '@/lib/operaciones/calendar';

type Res = { ok: true } | { ok: false; error: string };
const PATH = '/dashboard/operaciones/calendario';

const addSchema = z.object({
  kind: z.enum(CALENDAR_KINDS),
  from: z.string().trim(),
  to: z.string().trim(),
  name: z.string().trim().max(120),
  users: z.array(z.string().trim().min(1).max(50)).max(50).nullable()
});

export async function addCalendarEntryAction(input: z.infer<typeof addSchema>): Promise<Res> {
  try {
    const user = await requirePermission('admin');
    const parsed = addSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Datos no válidos' };
    const d = parsed.data;
    const users = d.users && d.users.length ? [...new Set(d.users)] : null;
    const err = validateEntry({ ...d, users });
    if (err) return { ok: false, error: err };
    const entries = await getCalendar(user.tenantId);
    if (entries.length >= 500) return { ok: false, error: 'El calendario está lleno: quita entradas antiguas.' };
    const entry: CalendarEntry = {
      id: randomUUID(),
      kind: d.kind,
      from: d.from,
      to: d.to,
      name: d.name.trim(),
      users,
      createdBy: user.name || user.email,
      createdAt: new Date().toISOString()
    };
    await saveCalendar(user.tenantId, [...entries, entry]);
    await logEvent(user.tenantId, {
      actor: { clickupUserId: null, name: user.name || user.email },
      type: 'calendario',
      payload: { action: 'add', kind: entry.kind, from: entry.from, to: entry.to, name: entry.name, users: entry.users }
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo guardar') };
  }
}

export async function removeCalendarEntryAction(id: string): Promise<Res> {
  try {
    const user = await requirePermission('admin');
    if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Datos no válidos' };
    const entries = await getCalendar(user.tenantId);
    const entry = entries.find((e) => e.id === id);
    if (!entry) return { ok: false, error: 'Esa entrada ya no existe' };
    await saveCalendar(
      user.tenantId,
      entries.filter((e) => e.id !== id)
    );
    await logEvent(user.tenantId, {
      actor: { clickupUserId: null, name: user.name || user.email },
      type: 'calendario',
      payload: { action: 'remove', kind: entry.kind, from: entry.from, to: entry.to, name: entry.name, users: entry.users }
    });
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo quitar') };
  }
}

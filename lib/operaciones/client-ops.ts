import 'server-only';

// Ajustes de Operaciones de un cliente (ops_clients, mismo id que el cliente del núcleo) y sus servicios.
// Lo usan la pestaña «Operaciones» de la ficha, el agente y «Rellenar con IA». Valida contra los datos reales:
// niveles, servicios, personas, opciones del campo «Cliente» de ClickUp, espacios y listas.
import { and, eq, inArray, ne } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsClients, opsClientServices } from '@/lib/db/schema';
import { ClientError, getClient } from '@/lib/core/clients';
import { getLevels, getServices, DEFAULT_LEVEL } from '@/lib/operaciones/clients';
import { getStructure } from '@/lib/operaciones/structure';

export type OpsSettingsInput = Partial<{
  clickupOptionId: string; // '' = sin vincular
  usualSpaceId: string;
  usualListIds: string[];
  level: string;
  deliveryDays: number | null;
  inactivityDays: number | null;
  planningDays: number | null;
  alertsEnabled: boolean;
  monthlyHours: number | null;
  workDays: number[]; // vacío = lunes a viernes
}>;

const okDays = (n: number | null | undefined, min: number, max: number) => n === null || n === undefined || (Number.isInteger(n) && n >= min && n <= max);

/** Guarda (o crea) los ajustes de Operaciones de un cliente. Solo cambia lo que se pasa. */
export async function upsertOpsSettings(tenantId: string, clientId: string, input: OpsSettingsInput): Promise<void> {
  if (!(await getClient(tenantId, clientId))) throw new ClientError('La ficha no existe.');
  const [levels, structure] = await Promise.all([getLevels(tenantId), getStructure(tenantId)]);
  const v: Partial<typeof opsClients.$inferInsert> = {};

  if (input.level !== undefined) {
    if (!levels.some((l) => l.key === input.level)) throw new ClientError('El nivel elegido no existe.');
    v.level = input.level;
  }
  if (!okDays(input.deliveryDays, 0, 60)) throw new ClientError('El plazo debe ser un número entero de días entre 0 y 60.');
  if (!okDays(input.inactivityDays, 1, 90)) throw new ClientError('Los días sin actividad deben estar entre 1 y 90.');
  if (!okDays(input.planningDays, 0, 60)) throw new ClientError('El horizonte de trabajo planificado debe estar entre 0 y 60 días (0 = desactivado).');
  if (input.deliveryDays !== undefined) v.deliveryDays = input.deliveryDays;
  if (input.inactivityDays !== undefined) v.inactivityDays = input.inactivityDays;
  if (input.planningDays !== undefined) v.planningDays = input.planningDays;
  if (input.alertsEnabled !== undefined) v.alertsEnabled = input.alertsEnabled;
  if (input.monthlyHours !== undefined) {
    if (input.monthlyHours !== null && !(input.monthlyHours >= 0 && input.monthlyHours <= 1000)) throw new ClientError('Las horas al mes deben estar entre 0 y 1000.');
    v.monthlyHours = input.monthlyHours != null ? String(input.monthlyHours) : null;
  }
  if (input.workDays !== undefined) {
    const days = [...new Set(input.workDays.filter((d) => Number.isInteger(d) && d >= 1 && d <= 7))].sort();
    v.workDays = days.length > 0 && days.join(',') !== '1,2,3,4,5' ? days.join(',') : null;
  }

  // Opción de ClickUp: tiene que existir y no estar vinculada a otra ficha.
  if (input.clickupOptionId !== undefined) {
    if (!input.clickupOptionId) {
      v.clickupOptionId = null;
      v.clickupOptionLabel = null;
    } else {
      const label = Object.values(structure.clientFields).flatMap((f) => f.options).find((o) => o.id === input.clickupOptionId)?.label;
      if (!label) throw new ClientError('Esa opción del campo Cliente no existe (actualiza desde ClickUp en Ajustes).');
      const [dup] = await db
        .select({ id: opsClients.id })
        .from(opsClients)
        .where(and(eq(opsClients.tenantId, tenantId), eq(opsClients.clickupOptionId, input.clickupOptionId), ne(opsClients.id, clientId)))
        .limit(1);
      if (dup) throw new ClientError('Esa opción de ClickUp ya está vinculada a otra ficha.');
      v.clickupOptionId = input.clickupOptionId;
      v.clickupOptionLabel = label;
    }
  }

  // Espacio y listas habituales: reales y de ese espacio.
  if (input.usualSpaceId !== undefined) {
    if (!input.usualSpaceId) {
      v.usualSpaceId = null;
      v.usualListIds = [];
    } else {
      const space = structure.spaces.find((s) => s.id === input.usualSpaceId);
      if (!space) throw new ClientError('El espacio habitual no existe.');
      v.usualSpaceId = space.id;
      const valid = new Set(space.lists.map((l) => l.id));
      v.usualListIds = [...new Set((input.usualListIds ?? []).filter((id) => valid.has(id)))];
    }
  }

  await db
    .insert(opsClients)
    .values({ id: clientId, tenantId, level: DEFAULT_LEVEL, ...v })
    .onConflictDoUpdate({ target: opsClients.id, set: { ...v, updatedAt: new Date() } });
}

/** Sustituye los servicios contratados (con su responsable habitual). */
export async function replaceServices(tenantId: string, clientId: string, list: { key: string; responsibleClickupId: string | null }[]): Promise<void> {
  if (!(await getClient(tenantId, clientId))) throw new ClientError('La ficha no existe.');
  const [services, structure] = await Promise.all([getServices(tenantId), getStructure(tenantId)]);
  const keys = new Set(services.map((s) => s.key));
  const members = new Set(structure.members.map((m) => m.id));
  const svc = new Map<string, string | null>();
  for (const s of list) if (keys.has(s.key)) svc.set(s.key, s.responsibleClickupId && members.has(s.responsibleClickupId) ? s.responsibleClickupId : null);
  await db.transaction(async (tx) => {
    await tx.delete(opsClientServices).where(eq(opsClientServices.clientId, clientId));
    if (svc.size) await tx.insert(opsClientServices).values([...svc].map(([serviceKey, responsibleClickupId]) => ({ clientId, serviceKey, responsibleClickupId })));
  });
}

/** Añade servicios (o cambia su responsable si ahora se dice uno) y quita los indicados. */
export async function changeServices(clientId: string, add: { key: string; responsibleClickupId: string | null }[], remove: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    if (remove.length) await tx.delete(opsClientServices).where(and(eq(opsClientServices.clientId, clientId), inArray(opsClientServices.serviceKey, remove)));
    if (!add.length) return;
    const have = await tx.select().from(opsClientServices).where(eq(opsClientServices.clientId, clientId));
    for (const sv of add) {
      const h = have.find((x) => x.serviceKey === sv.key);
      if (!h) await tx.insert(opsClientServices).values({ clientId, serviceKey: sv.key, responsibleClickupId: sv.responsibleClickupId });
      else if (sv.responsibleClickupId && h.responsibleClickupId !== sv.responsibleClickupId) await tx.update(opsClientServices).set({ responsibleClickupId: sv.responsibleClickupId }).where(eq(opsClientServices.id, h.id));
    }
  });
}

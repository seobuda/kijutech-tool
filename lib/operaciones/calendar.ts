// Calendario del equipo (revisión de autonomía, 12 nov 2026): festivos y ausencias planificadas por rango
// (vacaciones, médico, permiso). Se guarda en ops_settings (clave 'calendar', JSON) — sin tabla nueva: son
// pocas entradas al año y se leen enteras. Se aplica en UN sitio: getScheduleMap() añade `daysOff` al horario
// de cada persona, y todo lo que mira si un día es laborable (jornada, buenos días, recordatorios, minutos
// laborables, resumen del equipo) lo respeta sin cambios. Los plazos de los encargos saltan los festivos
// de toda la agencia (entradas sin personas).
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsSettings } from '@/lib/db/schema';

export const CALENDAR_KEY = 'calendar';
export const CALENDAR_KINDS = ['festivo', 'vacaciones', 'ausencia'] as const;
export type CalendarKind = (typeof CALENDAR_KINDS)[number];
export const KIND_LABEL: Record<CalendarKind, string> = { festivo: '🎉 Festivo', vacaciones: '🏖 Vacaciones', ausencia: '🏠 Ausencia' };

export type CalendarEntry = {
  id: string;
  kind: CalendarKind;
  from: string; // YYYY-MM-DD (incluido)
  to: string; // YYYY-MM-DD (incluido)
  name: string;
  users: string[] | null; // clickup user ids; null = toda la agencia
  createdBy: string;
  createdAt: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_RANGE_DAYS = 120;

export function isValidDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400_000);
}

/** Todas las fechas de un rango (incluidos los extremos), con tope. */
export function expandRange(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T12:00:00Z`);
  for (let i = 0; i <= MAX_RANGE_DAYS && d.toISOString().slice(0, 10) <= to; i++) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export const appliesTo = (e: CalendarEntry, user: string) => !e.users || e.users.length === 0 || e.users.includes(user);

/** Días libres de una persona (festivos que le aplican + sus ausencias). */
export function daysOffFor(entries: CalendarEntry[], user: string): Set<string> {
  const out = new Set<string>();
  for (const e of entries) if (appliesTo(e, user)) for (const d of expandRange(e.from, e.to)) out.add(d);
  return out;
}

/** Festivos de toda la agencia (para los plazos de los encargos). */
export function agencyHolidays(entries: CalendarEntry[]): Set<string> {
  const out = new Set<string>();
  for (const e of entries) if (e.kind === 'festivo' && (!e.users || e.users.length === 0)) for (const d of expandRange(e.from, e.to)) out.add(d);
  return out;
}

/** La entrada que hace libre ese día a esa persona (para enseñar el motivo). */
export function offEntry(entries: CalendarEntry[], user: string, date: string): CalendarEntry | null {
  return entries.find((e) => appliesTo(e, user) && e.from <= date && date <= e.to) ?? null;
}

/** Valida una entrada nueva. Devuelve el error o null. */
export function validateEntry(e: Pick<CalendarEntry, 'kind' | 'from' | 'to' | 'name' | 'users'>): string | null {
  if (!CALENDAR_KINDS.includes(e.kind)) return 'Tipo no válido.';
  if (!isValidDate(e.from) || !isValidDate(e.to)) return 'Fechas no válidas.';
  if (e.to < e.from) return 'La fecha final es anterior a la inicial.';
  if (daysBetween(e.from, e.to) > MAX_RANGE_DAYS) return `Como máximo ${MAX_RANGE_DAYS} días por entrada.`;
  if (!e.name.trim() || e.name.trim().length > 120) return 'Pon un nombre o motivo (máx. 120 caracteres).';
  if (e.kind !== 'festivo' && (!e.users || e.users.length === 0)) return 'Una ausencia o vacaciones necesita al menos una persona.';
  return null;
}

// --- Base de datos ----------------------------------------------------------------------------

const cache = new Map<string, { at: number; entries: CalendarEntry[] }>();
const TTL_MS = 10_000;

export function parseCalendar(raw: string | null | undefined): CalendarEntry[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as { entries?: CalendarEntry[] };
    return Array.isArray(v.entries) ? v.entries.filter((e) => e && isValidDate(e.from) && isValidDate(e.to)) : [];
  } catch {
    return [];
  }
}

export async function getCalendar(tenantId: string): Promise<CalendarEntry[]> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.entries;
  const [row] = await db
    .select({ value: opsSettings.value })
    .from(opsSettings)
    .where(and(eq(opsSettings.tenantId, tenantId), eq(opsSettings.key, CALENDAR_KEY)))
    .limit(1);
  const entries = parseCalendar(row?.value);
  cache.set(tenantId, { at: Date.now(), entries });
  return entries;
}

export async function saveCalendar(tenantId: string, entries: CalendarEntry[]): Promise<void> {
  const sorted = [...entries].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  const value = JSON.stringify({ entries: sorted });
  await db
    .insert(opsSettings)
    .values({ tenantId, key: CALENDAR_KEY, value })
    .onConflictDoUpdate({ target: [opsSettings.tenantId, opsSettings.key], set: { value, updatedAt: new Date() } });
  cache.delete(tenantId);
}

export function invalidateCalendar(tenantId: string) {
  cache.delete(tenantId);
}

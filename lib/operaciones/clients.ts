// Clientes vistos desde Operaciones: la ficha del NÚCLEO (clients) más los ajustes del módulo (ops_clients, mismo id)
// y sus servicios. Desde el 14 nov 2026 nombre, alias, estado y negocio vienen del núcleo; aquí solo nivel, plazo,
// ClickUp, alertas, horas y días. Un cliente sin fila en ops_clients usa los valores por defecto.
// Aquí vive también la lógica determinista que usa el agente al convertir notas (reconocer el cliente, plazo en días
// laborables): la IA identifica, el código decide.
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clients as coreClients, opsClientLevels, opsClientServices, opsClients, opsRequests, opsServices } from '@/lib/db/schema';
import { isWorkingStatus } from '@/lib/core/client-rules';
import { parseWorkDays } from '@/lib/operaciones/team-profiles';

export type ClientService = { serviceKey: string; responsibleClickupId: string | null };
/** Cliente con lo que Operaciones necesita. «active» = en onboarding o activo (estado del núcleo). */
export type OpsClient = {
  id: string;
  tenantId: string;
  name: string;
  aliases: string[];
  status: string;
  active: boolean;
  business: string | null;
  offerings: string | null;
  area: string | null;
  audience: string | null;
  goals: string | null;
  strategy: string | null;
  notes: string | null;
  hasOpsSettings: boolean;
  clickupOptionId: string | null;
  clickupOptionLabel: string | null;
  usualSpaceId: string | null;
  usualListIds: string[];
  level: string;
  deliveryDays: number | null;
  inactivityDays: number | null;
  planningDays: number | null;
  alertsEnabled: boolean;
  monthlyHours: string | null;
  workDays: string | null;
  createdAt: Date;
  updatedAt: Date;
};
export type ClientWithServices = OpsClient & { services: ClientService[] };
export const DEFAULT_LEVEL = 'standard';
export type LevelRow = { key: string; label: string; defaultDays: number; inactivityDays: number; planningDays: number };
export type ServiceRow = { key: string; label: string; active: boolean };

export async function getLevels(tenantId: string): Promise<LevelRow[]> {
  return db
    .select({
      key: opsClientLevels.key,
      label: opsClientLevels.label,
      defaultDays: opsClientLevels.defaultDays,
      inactivityDays: opsClientLevels.inactivityDays,
      planningDays: opsClientLevels.planningDays
    })
    .from(opsClientLevels)
    .where(eq(opsClientLevels.tenantId, tenantId))
    .orderBy(asc(opsClientLevels.sortOrder), asc(opsClientLevels.label));
}

export async function getServices(tenantId: string): Promise<ServiceRow[]> {
  return db
    .select({ key: opsServices.key, label: opsServices.label, active: opsServices.active })
    .from(opsServices)
    .where(eq(opsServices.tenantId, tenantId))
    .orderBy(asc(opsServices.sortOrder), asc(opsServices.label));
}

export async function listClients(tenantId: string): Promise<ClientWithServices[]> {
  const rows = await db
    .select({ c: coreClients, o: opsClients })
    .from(coreClients)
    .leftJoin(opsClients, eq(opsClients.id, coreClients.id))
    .where(eq(coreClients.tenantId, tenantId));
  if (rows.length === 0) return [];
  const clients: OpsClient[] = rows.map(({ c, o }) => ({
    id: c.id,
    tenantId: c.tenantId,
    name: c.name,
    aliases: c.aliases,
    status: c.status,
    active: isWorkingStatus(c.status),
    business: c.business,
    offerings: c.offerings,
    area: c.area,
    audience: c.audience,
    goals: c.goals,
    strategy: c.strategy,
    notes: c.notes,
    hasOpsSettings: Boolean(o),
    clickupOptionId: o?.clickupOptionId ?? null,
    clickupOptionLabel: o?.clickupOptionLabel ?? null,
    usualSpaceId: o?.usualSpaceId ?? null,
    usualListIds: o?.usualListIds ?? [],
    level: o?.level ?? DEFAULT_LEVEL,
    deliveryDays: o?.deliveryDays ?? null,
    inactivityDays: o?.inactivityDays ?? null,
    planningDays: o?.planningDays ?? null,
    alertsEnabled: o?.alertsEnabled ?? true,
    monthlyHours: o?.monthlyHours ?? null,
    workDays: o?.workDays ?? null,
    createdAt: c.createdAt,
    updatedAt: o && o.updatedAt > c.updatedAt ? o.updatedAt : c.updatedAt
  }));
  const services = await db
    .select()
    .from(opsClientServices)
    .where(inArray(opsClientServices.clientId, clients.map((c) => c.id)));
  return clients
    .map((c) => ({
      ...c,
      services: services
        .filter((s) => s.clientId === c.id)
        .map((s) => ({ serviceKey: s.serviceKey, responsibleClickupId: s.responsibleClickupId }))
    }))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'es'));
}

// Encargos por opción de ClickUp vinculada (para saber si una ficha se puede borrar).
export async function requestCountsByOption(tenantId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ option: opsRequests.clientOptionId, n: sql<number>`count(*)::int` })
    .from(opsRequests)
    .where(and(eq(opsRequests.tenantId, tenantId), sql`${opsRequests.clientOptionId} IS NOT NULL`))
    .groupBy(opsRequests.clientOptionId);
  return new Map(rows.map((r) => [r.option as string, r.n]));
}

// --- Texto y nombres --------------------------------------------------------------------------

export function normText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// «Rfserveis.com» → «rfserveis»: la parte del dominio sin extensión.
function baseName(s: string): string {
  return normText(s).replace(/\.(com|es|net|org|ai|cat|eu|info|io)$/, '');
}

// Todas las formas con las que se puede llamar a un cliente (nombre, opción de ClickUp, alias).
type NamedClient = Pick<OpsClient, 'name' | 'aliases' | 'clickupOptionLabel'>;
function clientKeys(c: NamedClient): string[] {
  const raw = [c.name, c.clickupOptionLabel ?? '', ...(c.aliases ?? [])];
  const keys = new Set<string>();
  for (const r of raw) {
    const n = normText(r);
    if (n.length >= 3) keys.add(n);
    const b = baseName(r);
    if (b.length >= 3) keys.add(b);
  }
  return [...keys];
}

// Cliente cuyo nombre, opción de ClickUp o alias coincide EXACTAMENTE con el texto (sin tildes ni mayúsculas).
export function findClientByName<T extends NamedClient>(clients: T[], text: string): T | null {
  const t = normText(text);
  if (!t) return null;
  const hits = clients.filter((c) => clientKeys(c).includes(t) || clientKeys(c).includes(baseName(text)));
  return hits.length === 1 ? hits[0] : null;
}

// Busca nombres o alias dentro de un texto libre. Solo vale si sale UN cliente (si hay dudas, ninguno).
export function findClientInText<T extends NamedClient>(clients: T[], text: string): T | null {
  const t = normText(text);
  if (!t) return null;
  const hits = clients.filter((c) =>
    clientKeys(c).some((k) => new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(t))
  );
  return hits.length === 1 ? hits[0] : null;
}

// Pares de fichas que parecen el mismo cliente (una forma es el principio de la otra, p. ej. «sih» y «Sihbou.com»).
export function possibleDuplicates(clients: { name: string }[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < clients.length; i++) {
    for (let j = i + 1; j < clients.length; j++) {
      const a = baseName(clients[i].name).replace(/[^a-z0-9]/g, '');
      const b = baseName(clients[j].name).replace(/[^a-z0-9]/g, '');
      if (a.length < 3 || b.length < 3) continue;
      if (a === b || a.startsWith(b) || b.startsWith(a)) out.push([clients[i].name, clients[j].name]);
    }
  }
  return out;
}

// --- Plazo en días laborables -----------------------------------------------------------------

export function clientDeliveryDays(c: Pick<OpsClient, 'level' | 'deliveryDays'>, levels: LevelRow[]): number | null {
  if (c.deliveryDays != null) return c.deliveryDays;
  return levels.find((l) => l.key === c.level)?.defaultDays ?? null;
}

// Fecha AAAA-MM-DD resultante de contar `days` días laborables desde hoy (zona dada). Se cuentan solo
// los días de la semana marcados (por defecto lunes a viernes) y se saltan los festivos de la agencia (calendar.ts).
export function addWorkingDays(days: number, workDaysRaw: string | null, timeZone: string, now = new Date(), daysOff?: Set<string>): string {
  const workDays = new Set(workDaysRaw ? parseWorkDays(workDaysRaw) : [1, 2, 3, 4, 5]);
  if (workDays.size === 0) [1, 2, 3, 4, 5].forEach((d) => workDays.add(d));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const d = new Date(`${today}T00:00:00Z`);
  let left = Math.max(0, Math.floor(days));
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const iso = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    if (workDays.has(iso) && !daysOff?.has(d.toISOString().slice(0, 10))) left--;
  }
  return d.toISOString().slice(0, 10);
}

// --- Alertas de cliente (paso 6D) -------------------------------------------------------------

// Días sin actividad a partir de los cuales se alerta (el del cliente o el de su nivel).
export function clientInactivityDays(c: Pick<OpsClient, 'level' | 'inactivityDays'>, levels: LevelRow[]): number {
  return c.inactivityDays ?? levels.find((l) => l.key === c.level)?.inactivityDays ?? 14;
}

// Horizonte (días) en que debe haber trabajo planificado; 0 = alerta desactivada.
export function clientPlanningDays(c: Pick<OpsClient, 'level' | 'planningDays'>, levels: LevelRow[]): number {
  return c.planningDays ?? levels.find((l) => l.key === c.level)?.planningDays ?? 0;
}

export type AlertState = 'red' | 'amber' | 'green' | 'gray';
export type AlertEval = {
  state: AlertState;
  inactive: boolean;
  unplanned: boolean;
  note: string; // motivo del gris o resumen de las alertas
  inactiveNote: string;
  unplannedNote: string;
};

// Solo generan alertas los clientes activos, vinculados a ClickUp, con el interruptor encendido y la ficha
// completada (al menos un servicio contratado u horas al mes).
export function alertEligibility(
  c: Pick<OpsClient, 'active' | 'alertsEnabled' | 'clickupOptionId' | 'monthlyHours'> & { services: unknown[] }
): { ok: true } | { ok: false; reason: string } {
  if (!c.active) return { ok: false, reason: 'Desactivado' };
  if (!c.alertsEnabled) return { ok: false, reason: 'Alertas desactivadas' };
  if (!c.clickupOptionId) return { ok: false, reason: 'Sin vincular a ClickUp' };
  if (c.services.length === 0 && !(Number(c.monthlyHours) > 0)) return { ok: false, reason: 'Ficha sin completar' };
  return { ok: true };
}

const DAY_MS = 24 * 3600 * 1000;

export function evaluateClient(
  c: ClientWithServices,
  act: { lastActivityMs: number | null; windowDays: number; upcomingTasks: number; horizonDays: number } | null,
  levels: LevelRow[],
  now = Date.now()
): AlertEval {
  const el = alertEligibility(c);
  if (!el.ok) return { state: 'gray', inactive: false, unplanned: false, note: el.reason, inactiveNote: '', unplannedNote: '' };
  if (!act) return { state: 'gray', inactive: false, unplanned: false, note: 'Sin datos todavía', inactiveNote: '', unplannedNote: '' };
  const limit = clientInactivityDays(c, levels);
  const daysSince = act.lastActivityMs ? Math.floor((now - act.lastActivityMs) / DAY_MS) : null;
  const inactive = daysSince === null || daysSince >= limit;
  const planning = clientPlanningDays(c, levels);
  const unplanned = planning > 0 && act.upcomingTasks === 0;
  const inactiveNote = inactive ? (daysSince === null ? `Sin actividad en más de ${act.windowDays} días` : `Sin actividad desde hace ${daysSince} días (límite ${limit})`) : '';
  const unplannedNote = unplanned ? `Sin trabajo planificado en los próximos ${planning} días` : '';
  return {
    state: inactive ? 'red' : unplanned ? 'amber' : 'green',
    inactive,
    unplanned,
    note: [inactiveNote, unplannedNote].filter(Boolean).join(' · '),
    inactiveNote,
    unplannedNote
  };
}

// Fichas de clientes («Clientes» en Operaciones): consultas y reglas compartidas. Las acciones de la
// web están en client-actions.ts. Aquí vive también la lógica determinista que usa el agente al
// convertir notas (reconocer el cliente, plazo en días laborables): la IA identifica, el código decide.
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  opsClientLevels,
  opsClientServices,
  opsClients,
  opsRequests,
  opsServices,
  type OpsClient
} from '@/lib/db/schema';
import { parseWorkDays } from '@/lib/operaciones/team-profiles';

export type ClientService = { serviceKey: string; responsibleClickupId: string | null };
export type ClientWithServices = OpsClient & { services: ClientService[] };
export type LevelRow = { key: string; label: string; defaultDays: number };
export type ServiceRow = { key: string; label: string; active: boolean };

export async function getLevels(tenantId: string): Promise<LevelRow[]> {
  return db
    .select({ key: opsClientLevels.key, label: opsClientLevels.label, defaultDays: opsClientLevels.defaultDays })
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
  const clients = await db.select().from(opsClients).where(eq(opsClients.tenantId, tenantId));
  if (clients.length === 0) return [];
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
function clientKeys(c: Pick<OpsClient, 'name' | 'aliases' | 'clickupOptionLabel'>): string[] {
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
export function findClientByName<T extends OpsClient>(clients: T[], text: string): T | null {
  const t = normText(text);
  if (!t) return null;
  const hits = clients.filter((c) => clientKeys(c).includes(t) || clientKeys(c).includes(baseName(text)));
  return hits.length === 1 ? hits[0] : null;
}

// Busca nombres o alias dentro de un texto libre. Solo vale si sale UN cliente (si hay dudas, ninguno).
export function findClientInText<T extends OpsClient>(clients: T[], text: string): T | null {
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
// los días de la semana marcados (por defecto lunes a viernes); los festivos no se tienen en cuenta.
export function addWorkingDays(days: number, workDaysRaw: string | null, timeZone: string, now = new Date()): string {
  const workDays = new Set(workDaysRaw ? parseWorkDays(workDaysRaw) : [1, 2, 3, 4, 5]);
  if (workDays.size === 0) [1, 2, 3, 4, 5].forEach((d) => workDays.add(d));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const d = new Date(`${today}T00:00:00Z`);
  let left = Math.max(0, Math.floor(days));
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const iso = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    if (workDays.has(iso)) left--;
  }
  return d.toISOString().slice(0, 10);
}

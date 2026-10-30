// Fichas del equipo («Equipo» en Operaciones): consultas compartidas. Las acciones de la web
// están en profile-actions.ts. La zona horaria y el horario viven AQUÍ (única fuente de verdad);
// Telegram solo guarda la vinculación del chat.
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  opsClickupConnections,
  opsTeamProfileWorkTypes,
  opsTeamProfiles,
  opsWorkTypes,
  type OpsTeamProfile
} from '@/lib/db/schema';

export const DEFAULT_TEAM_TIMEZONE = 'America/Santo_Domingo';
export const OWNER_TIMEZONE = 'Europe/Madrid';

export type WorkTypeRole = 'primary' | 'support';

export type ProfileWithTypes = OpsTeamProfile & {
  workTypes: { key: string; role: WorkTypeRole }[];
};

export type Schedule = {
  timezone: string;
  workStart: string;
  workDays: number[]; // 1 = lunes … 7 = domingo
  hoursPerDay: number;
  active: boolean;
};

// Quién puede ver o editar fichas. Hoy solo quien lleva las operaciones (cualquier usuario con
// acceso a este módulo). Cuando cada miembro pueda entrar a ver su propio perfil, bastará con que
// canViewProfile devuelva true también cuando profile.userId === user.id; canManageProfiles
// seguirá siendo solo para quien administra.
export function canManageProfiles(user: { tenantId: string } | null): boolean {
  return Boolean(user);
}

export function canViewProfile(
  user: { id: number; tenantId: string } | null,
  profile: { tenantId: string; userId: number | null }
): boolean {
  if (!user || user.tenantId !== profile.tenantId) return false;
  return canManageProfiles(user) || profile.userId === user.id;
}

export function parseWorkDays(raw: string): number[] {
  const days = raw
    .split(',')
    .map((d) => Number(d.trim()))
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
  return [...new Set(days)].sort();
}

export const WEEKDAY_ISO: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export async function listProfiles(tenantId: string): Promise<ProfileWithTypes[]> {
  const profiles = await db
    .select()
    .from(opsTeamProfiles)
    .where(eq(opsTeamProfiles.tenantId, tenantId))
    .orderBy(asc(opsTeamProfiles.name));
  if (profiles.length === 0) return [];
  const types = await db
    .select()
    .from(opsTeamProfileWorkTypes)
    .where(inArray(opsTeamProfileWorkTypes.profileId, profiles.map((p) => p.id)));
  return profiles
    .map((p) => ({
      ...p,
      workTypes: types
        .filter((t) => t.profileId === p.id)
        .map((t) => ({ key: t.workTypeKey, role: t.role as WorkTypeRole }))
    }))
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'es'));
}

export async function getProfile(tenantId: string, id: string): Promise<ProfileWithTypes | null> {
  return (await listProfiles(tenantId)).find((p) => p.id === id) ?? null;
}

// Horario por miembro de ClickUp (para los resúmenes y avisos). Quien no tiene ficha usa los valores por defecto.
export async function getScheduleMap(tenantId: string): Promise<Map<string, Schedule>> {
  const rows = await db
    .select()
    .from(opsTeamProfiles)
    .where(eq(opsTeamProfiles.tenantId, tenantId));
  const map = new Map<string, Schedule>();
  for (const p of rows) {
    if (!p.clickupUserId) continue;
    map.set(p.clickupUserId, {
      timezone: p.timezone,
      workStart: p.workStart,
      workDays: parseWorkDays(p.workDays),
      hoursPerDay: Number(p.hoursPerDay),
      active: p.active
    });
  }
  return map;
}

export function scheduleOrDefault(map: Map<string, Schedule>, clickupUserId: string): Schedule {
  return (
    map.get(clickupUserId) ?? {
      timezone: DEFAULT_TEAM_TIMEZONE,
      workStart: '09:00',
      workDays: [1, 2, 3, 4, 5],
      hoursPerDay: 8,
      active: true
    }
  );
}

export async function getMemberTimezone(tenantId: string, clickupUserId: string | null): Promise<string> {
  if (!clickupUserId) return DEFAULT_TEAM_TIMEZONE;
  const [p] = await db
    .select({ timezone: opsTeamProfiles.timezone })
    .from(opsTeamProfiles)
    .where(and(eq(opsTeamProfiles.tenantId, tenantId), eq(opsTeamProfiles.clickupUserId, clickupUserId)))
    .limit(1);
  return p?.timezone ?? DEFAULT_TEAM_TIMEZONE;
}

// Zona horaria de quien lleva las operaciones (dueño del token): la usan sus resúmenes.
export async function getOwnerTimezone(tenantId: string): Promise<string> {
  const [conn] = await db
    .select({ me: opsClickupConnections.meClickupId })
    .from(opsClickupConnections)
    .where(eq(opsClickupConnections.tenantId, tenantId))
    .limit(1);
  if (!conn?.me) return OWNER_TIMEZONE;
  const [p] = await db
    .select({ timezone: opsTeamProfiles.timezone })
    .from(opsTeamProfiles)
    .where(and(eq(opsTeamProfiles.tenantId, tenantId), eq(opsTeamProfiles.clickupUserId, conn.me)))
    .limit(1);
  return p?.timezone ?? OWNER_TIMEZONE;
}

// Texto de las fichas para el prompt de conversión de notas. Solo personas activas y vinculadas a un
// miembro de ClickUp (si no, no se les puede asignar la tarea). El nombre es el de ClickUp.
export async function profilesForPrompt(
  tenantId: string,
  clickupNames: Map<string, string>
): Promise<string> {
  const profiles = (await listProfiles(tenantId)).filter(
    (p) => p.active && p.clickupUserId && clickupNames.has(p.clickupUserId)
  );
  if (profiles.length === 0) return '- (sin fichas)';
  const labels = new Map(
    (await db.select().from(opsWorkTypes).where(eq(opsWorkTypes.tenantId, tenantId))).map((t) => [t.key, t.label])
  );
  const fmt = (role: WorkTypeRole, p: ProfileWithTypes) =>
    p.workTypes.filter((t) => t.role === role).map((t) => `${t.key} (${labels.get(t.key) ?? t.key})`).join(', ');
  return profiles
    .map((p) => {
      const lines = [
        `- ${clickupNames.get(p.clickupUserId!)}${p.jobTitle ? ` — ${p.jobTitle}` : ''}`,
        `  función principal: ${fmt('primary', p) || 'ninguna'}`,
        `  apoyo: ${fmt('support', p) || 'ninguno'}`
      ];
      if (p.description?.trim()) lines.push(`  perfil: ${p.description.trim().replace(/\s+/g, ' ').slice(0, 500)}`);
      return lines.join('\n');
    })
    .join('\n');
}

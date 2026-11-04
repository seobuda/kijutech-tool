import { desc, and, eq, isNull, ne } from 'drizzle-orm';
import { db } from './drizzle';
import {
  activityLogs,
  projects,
  roles,
  teamMembers,
  teams,
  userRoles,
  users
} from './schema';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth/session';

export async function getUser() {
  const sessionCookie = (await cookies()).get('session');
  if (!sessionCookie || !sessionCookie.value) {
    return null;
  }

  const sessionData = await verifyToken(sessionCookie.value);
  if (
    !sessionData ||
    !sessionData.user ||
    typeof sessionData.user.id !== 'number'
  ) {
    return null;
  }

  if (new Date(sessionData.expires) < new Date()) {
    return null;
  }

  const user = await db
    .select()
    .from(users)
    .where(and(eq(users.id, sessionData.user.id), isNull(users.deletedAt)))
    .limit(1);

  if (user.length === 0) {
    return null;
  }

  return user[0];
}

export async function getUserWithTeam(userId: number) {
  const result = await db
    .select({
      user: users,
      teamId: teamMembers.teamId
    })
    .from(users)
    .leftJoin(teamMembers, eq(users.id, teamMembers.userId))
    .where(eq(users.id, userId))
    .limit(1);

  return result[0];
}

export async function getActivityLogs() {
  const user = await getUser();
  if (!user) {
    throw new Error('User not authenticated');
  }

  return await db
    .select({
      id: activityLogs.id,
      action: activityLogs.action,
      timestamp: activityLogs.timestamp,
      ipAddress: activityLogs.ipAddress,
      userName: users.name
    })
    .from(activityLogs)
    .leftJoin(users, eq(activityLogs.userId, users.id))
    .where(eq(activityLogs.userId, user.id))
    .orderBy(desc(activityLogs.timestamp))
    .limit(10);
}

export async function getProjectsForUser() {
  const user = await getUser();
  if (!user) {
    throw new Error('User not authenticated');
  }

  return await db
    .select()
    .from(projects)
    .where(
      and(eq(projects.tenantId, user.tenantId), ne(projects.status, 'archived'))
    )
    .orderBy(desc(projects.createdAt));
}

export async function getProjectById(projectId: string) {
  const user = await getUser();
  if (!user) {
    throw new Error('User not authenticated');
  }

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, user.tenantId)))
    .limit(1);

  return project ?? null;
}

export async function getArchivedProjectsForUser() {
  const user = await getUser();
  if (!user) {
    throw new Error('User not authenticated');
  }

  return await db
    .select()
    .from(projects)
    .where(
      and(eq(projects.tenantId, user.tenantId), eq(projects.status, 'archived'))
    )
    .orderBy(desc(projects.createdAt));
}

export async function getUserTenantRoleNames(userId: number) {
  const result = await db
    .select({ name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(eq(userRoles.userId, userId), isNull(userRoles.projectId)));

  return result.map((r) => r.name);
}

export async function getTeamForUser() {
  const user = await getUser();
  if (!user) {
    return null;
  }

  const result = await db.query.teamMembers.findFirst({
    where: eq(teamMembers.userId, user.id),
    with: {
      team: {
        with: {
          teamMembers: {
            with: {
              user: {
                columns: {
                  id: true,
                  name: true,
                  email: true
                }
              }
            }
          }
        }
      }
    }
  });

  return result?.team || null;
}

// --- Versiones seguras para el navegador --------------------------------------------------
// getUser() devuelve la fila completa (incluido password_hash): SOLO para uso en servidor.
// Lo que viaja al navegador (HTML inicial, /api/user, /api/team) pasa por estas funciones.
export type SafeUser = { id: number; name: string | null; email: string };

export async function getSafeUser(): Promise<SafeUser | null> {
  const user = await getUser();
  return user ? { id: user.id, name: user.name, email: user.email } : null;
}

export type SafeTeam = { members: SafeUser[] };

export async function getSafeTeam(): Promise<SafeTeam | null> {
  const team = await getTeamForUser();
  if (!team) return null;
  return {
    members: team.teamMembers.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email
    }))
  };
}

import 'server-only';
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsTeamProfiles, type User } from '@/lib/db/schema';
import { checkPermission, getTenantRoleNames } from '@/lib/auth/permissions';
import { getClickUpConnection } from '@/lib/operaciones/queries';

/**
 * «Mi bandeja» es solo del dueño: la persona que lleva las operaciones, es decir, la del
 * usuario de ClickUp dueño del token. Se reconoce porque su ficha de equipo está enlazada a
 * su usuario de la herramienta. Si esa ficha no está enlazada todavía, la bandeja queda para
 * los super_admin (así nunca queda abierta a todo el mundo).
 */
export async function isInboxOwner(user: Pick<User, 'id' | 'tenantId'>): Promise<boolean> {
  const conn = await getClickUpConnection(user.tenantId);
  if (conn?.meClickupId) {
    const [profile] = await db
      .select({ userId: opsTeamProfiles.userId })
      .from(opsTeamProfiles)
      .where(
        and(
          eq(opsTeamProfiles.tenantId, user.tenantId),
          eq(opsTeamProfiles.clickupUserId, conn.meClickupId),
          isNotNull(opsTeamProfiles.userId)
        )
      )
      .limit(1);
    if (profile) return profile.userId === user.id;
  }
  return (await getTenantRoleNames(user.id)).includes('super_admin');
}

// Para las acciones de la bandeja: exige sesión, rol de editor o superior y ser el dueño.
export async function requireInboxOwner(): Promise<User> {
  const perm = await checkPermission('edit');
  if (!perm.ok) throw new Error(perm.error);
  if (!(await isInboxOwner(perm.user))) {
    throw new Error('Mi bandeja es solo de quien lleva las operaciones');
  }
  return perm.user;
}

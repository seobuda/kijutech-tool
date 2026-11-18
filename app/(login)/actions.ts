'use server';

import { z } from 'zod';
import { hashSync } from 'bcryptjs';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  User,
  users,
  teams,
  teamMembers,
  activityLogs,
  tenants,
  type NewUser,
  type NewTeam,
  type NewTeamMember,
  type NewActivityLog,
  ActivityType,
  invitations
} from '@/lib/db/schema';
import { comparePasswords, hashPassword, setSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getClientIp, minutesLocked, recordLoginAttempt } from '@/lib/auth/rate-limit';
import { getUser, getUserWithTeam } from '@/lib/db/queries';
import {
  validatedAction,
  validatedActionWithUser
} from '@/lib/auth/middleware';

// Hash de relleno para que comprobar un correo inexistente tarde lo mismo que uno real.
const DUMMY_HASH = hashSync('contraseña-que-no-existe', 10);

async function logActivity(
  teamId: number | null | undefined,
  userId: number,
  type: ActivityType,
  ipAddress?: string
) {
  if (teamId === null || teamId === undefined) {
    return;
  }
  const newActivity: NewActivityLog = {
    teamId,
    userId,
    action: type,
    ipAddress: ipAddress || ''
  };
  await db.insert(activityLogs).values(newActivity);
}

const signInSchema = z.object({
  email: z.string().email().min(3).max(255),
  password: z.string().min(1).max(100)
});

const GENERIC_SIGNIN_ERROR = 'Correo o contraseña incorrectos.';

export const signIn = validatedAction(signInSchema, async (data) => {
  const { email, password } = data;

  // Demasiados fallos recientes: ni se comprueba la contraseña (así no sirve para seguir probando).
  const locked = await minutesLocked(email);
  if (locked > 0) {
    return {
      error: `Demasiados intentos fallidos. Vuelve a intentarlo en ${locked} min.`,
      email
    };
  }

  const ip = await getClientIp();

  const userWithTeam = await db
    .select({
      user: users,
      team: teams
    })
    .from(users)
    .leftJoin(teamMembers, eq(users.id, teamMembers.userId))
    .leftJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(and(eq(sql`lower(${users.email})`, email.trim().toLowerCase()), isNull(users.deletedAt)))
    .limit(1);

  // Mismo mensaje y mismo trabajo (comparación de hash) exista o no el correo.
  const found = userWithTeam[0];
  const isPasswordValid = await comparePasswords(
    password,
    found?.user.passwordHash ?? DUMMY_HASH
  );

  if (!found || !isPasswordValid) {
    await recordLoginAttempt(email, false, ip);
    return { error: GENERIC_SIGNIN_ERROR, email };
  }

  await recordLoginAttempt(email, true, ip);
  await Promise.all([
    setSession(found.user),
    logActivity(found.team?.id, found.user.id, ActivityType.SIGN_IN, ip)
  ]);

  redirect('/dashboard');
});


export async function signOut() {
  const user = (await getUser()) as User;
  const userWithTeam = await getUserWithTeam(user.id);
  await logActivity(userWithTeam?.teamId, user.id, ActivityType.SIGN_OUT);
  (await cookies()).delete('session');
}

// S9 (18 nov 2026): 12 caracteres como en el alta, mensajes en español, sin devolver las contraseñas al navegador, y
// al cambiarla se cierran las demás sesiones (el token lleva una huella de la contraseña; ver lib/auth/session.ts).
const updatePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Escribe tu contraseña actual.').max(100),
  newPassword: z.string().min(12, 'La contraseña nueva debe tener al menos 12 caracteres.').max(100),
  confirmPassword: z.string().max(100)
});

export const updatePassword = validatedActionWithUser(
  updatePasswordSchema,
  async (data, _, user) => {
    const { currentPassword, newPassword, confirmPassword } = data;

    if (!(await comparePasswords(currentPassword, user.passwordHash))) {
      return { error: 'La contraseña actual no es correcta.' };
    }
    if (currentPassword === newPassword) {
      return { error: 'La contraseña nueva tiene que ser distinta de la actual.' };
    }
    if (confirmPassword !== newPassword) {
      return { error: 'La confirmación no coincide con la contraseña nueva.' };
    }

    const newPasswordHash = await hashPassword(newPassword);
    const userWithTeam = await getUserWithTeam(user.id);

    await Promise.all([
      db
        .update(users)
        .set({ passwordHash: newPasswordHash, updatedAt: new Date() })
        .where(eq(users.id, user.id)),
      logActivity(userWithTeam?.teamId, user.id, ActivityType.UPDATE_PASSWORD)
    ]);
    // Esta sesión sigue abierta con la huella nueva; las demás (otros navegadores) dejan de valer.
    await setSession({ ...user, passwordHash: newPasswordHash });

    return {
      success: 'Contraseña cambiada. Las sesiones abiertas en otros dispositivos se han cerrado.'
    };
  }
);

const deleteAccountSchema = z.object({
  password: z.string().min(8).max(100)
});

export const deleteAccount = validatedActionWithUser(
  deleteAccountSchema,
  async (data, _, user) => {
    const { password } = data;

    const isPasswordValid = await comparePasswords(password, user.passwordHash);
    if (!isPasswordValid) {
      return {
        password,
        error: 'La contraseña no es correcta: la cuenta no se ha eliminado.'
      };
    }

    const userWithTeam = await getUserWithTeam(user.id);

    await logActivity(
      userWithTeam?.teamId,
      user.id,
      ActivityType.DELETE_ACCOUNT
    );

    // Soft delete
    await db
      .update(users)
      .set({
        deletedAt: sql`CURRENT_TIMESTAMP`,
        email: sql`CONCAT(email, '-', id, '-deleted')` // Ensure email uniqueness
      })
      .where(eq(users.id, user.id));

    if (userWithTeam?.teamId) {
      await db
        .delete(teamMembers)
        .where(
          and(
            eq(teamMembers.userId, user.id),
            eq(teamMembers.teamId, userWithTeam.teamId)
          )
        );
    }

    (await cookies()).delete('session');
    redirect('/sign-in');
  }
);

// S4 (18 nov 2026): cambiar el correo pide la contraseña, se guarda en minúsculas y no puede coincidir con el de otro
// usuario sin distinguir mayúsculas (el login busca con lower(email): un correo «igual» bloquearía el acceso del otro).
const updateAccountSchema = z.object({
  name: z.string().trim().min(1, 'Escribe tu nombre.').max(100),
  email: z.string().trim().toLowerCase().email('El correo no es válido.').max(255),
  currentPassword: z.string().max(100).optional()
});

export const updateAccount = validatedActionWithUser(
  updateAccountSchema,
  async (data, _, user) => {
    const { name, email, currentPassword } = data;
    const emailChanged = email !== user.email.trim().toLowerCase();

    if (emailChanged) {
      if (!currentPassword || !(await comparePasswords(currentPassword, user.passwordHash))) {
        return { name, error: 'Para cambiar el correo, escribe tu contraseña actual.' };
      }
      const [taken] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(sql`lower(${users.email})`, email), sql`${users.id} <> ${user.id}`))
        .limit(1);
      if (taken) {
        return { name, error: 'Ese correo ya lo usa otro usuario.' };
      }
    }

    const userWithTeam = await getUserWithTeam(user.id);
    await Promise.all([
      db
        .update(users)
        .set({ name, ...(emailChanged ? { email } : {}), updatedAt: new Date() })
        .where(eq(users.id, user.id)),
      logActivity(userWithTeam?.teamId, user.id, ActivityType.UPDATE_ACCOUNT)
    ]);

    return { name, success: emailChanged ? 'Datos guardados. A partir de ahora entra con el correo nuevo.' : 'Datos guardados.' };
  }
);


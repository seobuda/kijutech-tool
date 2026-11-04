import 'server-only';
import { and, eq, gt, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { db } from '@/lib/db/drizzle';
import { authLoginAttempts } from '@/lib/db/schema';

/**
 * Límite de intentos de inicio de sesión: MAX_FAILURES fallos en WINDOW_MINUTES minutos
 * bloquean ese correo hasta que el fallo más antiguo de la ventana caduque. Se cuenta por
 * correo (no solo por IP) para que rotar de IP no sirva para seguir probando contraseñas.
 * Un inicio de sesión correcto borra los fallos pendientes de ese correo.
 */
export const MAX_FAILURES = 5;
export const WINDOW_MINUTES = 15;

const normalize = (email: string) => email.trim().toLowerCase();

export async function getClientIp(): Promise<string> {
  const h = await headers();
  return (h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? 'desconocida').trim().slice(0, 64);
}

// Devuelve los minutos que faltan para poder reintentar, o 0 si no está bloqueado.
export async function minutesLocked(email: string): Promise<number> {
  const since = sql`now() - (${WINDOW_MINUTES} * interval '1 minute')`;
  const rows = await db
    .select({ createdAt: authLoginAttempts.createdAt })
    .from(authLoginAttempts)
    .where(
      and(
        eq(authLoginAttempts.email, normalize(email)),
        eq(authLoginAttempts.succeeded, false),
        gt(authLoginAttempts.createdAt, since)
      )
    )
    .orderBy(authLoginAttempts.createdAt);

  if (rows.length < MAX_FAILURES) return 0;
  // El bloqueo acaba cuando caduca el fallo que deja la cuenta por debajo del límite.
  const blocking = rows[rows.length - MAX_FAILURES];
  const unlockAt = blocking.createdAt.getTime() + WINDOW_MINUTES * 60_000;
  return Math.max(1, Math.ceil((unlockAt - Date.now()) / 60_000));
}

export async function recordLoginAttempt(email: string, succeeded: boolean, ip: string) {
  const e = normalize(email);
  if (succeeded) {
    await db
      .delete(authLoginAttempts)
      .where(and(eq(authLoginAttempts.email, e), eq(authLoginAttempts.succeeded, false)));
  }
  await db.insert(authLoginAttempts).values({ email: e, ip, succeeded });
  // Limpieza barata: fuera lo anterior a un día.
  await db.delete(authLoginAttempts).where(sql`${authLoginAttempts.createdAt} < now() - interval '1 day'`);
}

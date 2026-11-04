import 'server-only';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { roles, userRoles, type User } from '@/lib/db/schema';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';

/**
 * Permisos por rol, comprobados SIEMPRE en el servidor (acciones y rutas de API).
 * Ocultar un botón en pantalla no es seguridad: cada acción llama a requirePermission()
 * o checkPermission() antes de hacer nada.
 *
 * Niveles (cada uno incluye los de abajo):
 *   view  → ver (lector, editor, admin, super_admin)
 *   edit  → editor o superior: Bloc, encargos, fichas (editar), SEO (modificar)
 *   admin → admin o superior: tokens de ClickUp/Telegram, Automatizaciones, Niveles y
 *           servicios, borrar fichas o clientes
 *   users → solo super_admin: gestionar usuarios
 *
 * «Mi bandeja» no es un nivel: es solo del dueño (ver lib/operaciones/inbox-owner.ts).
 */
export type RoleName = 'super_admin' | 'admin' | 'editor' | 'lector';
export type Permission = 'view' | 'edit' | 'admin' | 'users';

export const ROLE_NAMES: RoleName[] = ['super_admin', 'admin', 'editor', 'lector'];

const ROLE_PERMISSIONS: Record<RoleName, Permission[]> = {
  super_admin: ['view', 'edit', 'admin', 'users'],
  admin: ['view', 'edit', 'admin'],
  editor: ['view', 'edit'],
  lector: ['view']
};

export class PermissionError extends Error {
  constructor(message = 'No tienes permiso para hacer esto') {
    super(message);
    this.name = 'PermissionError';
  }
}

export function roleAllows(roleNames: string[], permission: Permission): boolean {
  return roleNames.some((r) => ROLE_PERMISSIONS[r as RoleName]?.includes(permission));
}

// Roles de nivel cuenta (sin proyecto) del usuario. Un usuario sin ningún rol no puede nada.
export async function getTenantRoleNames(userId: number): Promise<string[]> {
  const rows = await db
    .select({ name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(eq(userRoles.userId, userId), isNull(userRoles.projectId)));
  return rows.map((r) => r.name);
}

export type PermissionResult =
  | { ok: true; user: User; roles: string[] }
  | { ok: false; error: string };

/** Versión que no lanza: para acciones que devuelven { ok:false, error }. */
export async function checkPermission(permission: Permission): Promise<PermissionResult> {
  const user = await getUser();
  if (!user) return { ok: false, error: 'No autenticado' };
  const roleNames = await getTenantRoleNames(user.id);
  if (!roleAllows(roleNames, permission)) {
    return { ok: false, error: 'No tienes permiso para hacer esto' };
  }
  return { ok: true, user, roles: roleNames };
}

/** Versión que lanza PermissionError: para acciones que ya van dentro de try/catch. */
export async function requirePermission(permission: Permission): Promise<User> {
  const res = await checkPermission(permission);
  if (!res.ok) throw new PermissionError(res.error);
  return res.user;
}

/** Para acciones que ya tienen su rama `if (!user) return {...}`: devuelve null si no hay sesión o permiso. */
export async function getUserIfAllowed(permission: Permission): Promise<User | null> {
  const res = await checkPermission(permission);
  return res.ok ? res.user : null;
}

/**
 * Para páginas (componentes de servidor): sin sesión → inicio de sesión; sin permiso → /dashboard.
 * Es solo comodidad de navegación: lo que protege los datos son las comprobaciones de las acciones.
 */
export async function requirePagePermission(permission: Permission): Promise<User> {
  const res = await checkPermission(permission);
  if (!res.ok) redirect(res.error === 'No autenticado' ? '/sign-in' : '/dashboard');
  return res.user;
}

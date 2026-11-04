import { and, eq, inArray, like } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { authLoginAttempts, projects, roles, tenants, userRoles, users } from '@/lib/db/schema';
import { hashPassword, signToken } from '@/lib/auth/session';

/**
 * Usuarios de prueba (prefijo `seg-test-`): uno por rol en la cuenta Kijutech y uno en OTRA
 * cuenta. Se crean antes de las pruebas y se borran después. Nunca se tocan usuarios reales.
 */
export const PREFIX = 'seg-test-';
export const FIXTURE_PASSWORD = 'Fixture-Pass-12345';
export const ROLE_USERS = ['lector', 'editor', 'admin', 'super_admin'] as const;
export type FixtureRole = (typeof ROLE_USERS)[number];

export type Fixtures = {
  kijutechTenantId: string;
  otherTenantId: string;
  kijutechProjectId: string;
  users: Record<FixtureRole | 'otraCuenta' | 'sinRol', { id: number; email: string }>;
};

const holder = (globalThis as unknown as { __segSession: { token: string | null } }).__segSession;

export const emailFor = (key: string) => `${PREFIX}${key.replace('_', '-')}@kijutech.test`;

export async function cleanupFixtures() {
  const testUsers = await db.select({ id: users.id }).from(users).where(like(users.email, `${PREFIX}%`));
  const ids = testUsers.map((u) => u.id);
  if (ids.length) {
    await db.delete(userRoles).where(inArray(userRoles.userId, ids));
    await db.delete(users).where(inArray(users.id, ids));
  }
  await db.delete(projects).where(like(projects.name, `${PREFIX}%`));
  await db.delete(authLoginAttempts).where(like(authLoginAttempts.email, `${PREFIX}%`));
  await db.delete(tenants).where(eq(tenants.slug, `${PREFIX}otra-cuenta`));
}

export async function createFixtures(): Promise<Fixtures> {
  await cleanupFixtures();

  const [kijutech] = await db.select().from(tenants).where(eq(tenants.slug, 'kijutech')).limit(1);
  if (!kijutech) throw new Error('No existe la cuenta Kijutech en la base de datos');

  const [other] = await db
    .insert(tenants)
    .values({ name: 'Otra cuenta (prueba)', slug: `${PREFIX}otra-cuenta` })
    .returning();

  // Proyecto de Kijutech para las pruebas de aislamiento: se crea uno propio y se borra al final.
  const [creador] = await db.select({ id: users.id }).from(users).where(eq(users.tenantId, kijutech.id)).limit(1);
  const [project] = await db
    .insert(projects)
    .values({ tenantId: kijutech.id, name: `${PREFIX}proyecto`, createdBy: creador.id })
    .returning();

  const passwordHash = await hashPassword(FIXTURE_PASSWORD);
  const allRoles = await db.select().from(roles);
  const roleId = (name: string) => {
    const r = allRoles.find((x) => x.name === name);
    if (!r) throw new Error(`Falta el rol ${name}`);
    return r.id;
  };

  const make = async (key: string, tenantId: string, role: string | null) => {
    const email = emailFor(key);
    const [u] = await db
      .insert(users)
      .values({ tenantId, name: `Prueba ${key}`, email, passwordHash, role: 'member' })
      .returning({ id: users.id });
    if (role) await db.insert(userRoles).values({ userId: u.id, roleId: roleId(role) });
    return { id: u.id, email };
  };

  const fx: Fixtures = {
    kijutechTenantId: kijutech.id,
    otherTenantId: other.id,
    kijutechProjectId: project.id,
    users: {
      lector: await make('lector', kijutech.id, 'lector'),
      editor: await make('editor', kijutech.id, 'editor'),
      admin: await make('admin', kijutech.id, 'admin'),
      super_admin: await make('super_admin', kijutech.id, 'super_admin'),
      // Otra cuenta con el rol MÁS ALTO: aun así no debe ver nada de Kijutech.
      otraCuenta: await make('otra', other.id, 'super_admin'),
      sinRol: await make('sinrol', kijutech.id, null)
    }
  };
  return fx;
}

/** Inicia sesión como ese usuario (cookie real firmada) o sin sesión si es null. */
export async function loginAs(user: { id: number } | null) {
  if (!user) {
    holder.token = null;
    return;
  }
  holder.token = await signToken({
    user: { id: user.id },
    expires: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  });
}

export async function countProjectsNamed(prefix: string) {
  const rows = await db.select({ id: projects.id }).from(projects).where(and(like(projects.name, `${prefix}%`)));
  return rows.length;
}

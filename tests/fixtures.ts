import { and, eq, inArray, like } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { authLoginAttempts, projects, roles, tenants, userRoles, users, clients } from '@/lib/db/schema';
import { hashPassword, passwordFingerprint, signToken } from '@/lib/auth/session';

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

const FIXTURE_CLIENT = 'Cliente de las pruebas de seguridad (fixture)';

export async function cleanupFixtures() {
  const testUsers = await db.select({ id: users.id }).from(users).where(like(users.email, `${PREFIX}%`));
  const ids = testUsers.map((u) => u.id);
  if (ids.length) {
    await db.delete(userRoles).where(inArray(userRoles.userId, ids));
    await db.delete(users).where(inArray(users.id, ids));
  }
  await db.delete(projects).where(like(projects.name, `${PREFIX}%`));
  // Cliente del proyecto de pruebas (desde los cimientos, 23 nov 2026, un proyecto siempre tiene cliente). Su nombre
  // no empieza por el prefijo: otras pruebas borran sus clientes «${PREFIX}…» y dejarían el proyecto sin cliente.
  await db.delete(clients).where(eq(clients.name, FIXTURE_CLIENT));
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
  const [fxClient] = await db.insert(clients).values({ tenantId: kijutech.id, name: FIXTURE_CLIENT }).returning();
  const [project] = await db
    .insert(projects)
    .values({ tenantId: kijutech.id, name: `${PREFIX}proyecto`, clientId: fxClient.id, createdBy: creador.id })
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
  const [row] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id));
  holder.token = await signToken({
    user: { id: user.id },
    expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    pv: row ? await passwordFingerprint(row.passwordHash) : undefined
  });
}

export async function countProjectsNamed(prefix: string) {
  const rows = await db.select({ id: projects.id }).from(projects).where(and(like(projects.name, `${prefix}%`)));
  return rows.length;
}

// Pruebas «pantallas-*» y cuenta de cada petición en el registro de errores (22 nov 2026).
//  - Reglas puras: qué pantallas se recorren y cuándo una visita es un fallo.
//  - Registro de errores: lee la sesión de la cabecera Cookie; una sesión de la cuenta de pruebas se anota allí y la de la
//    cuenta dueña sigue como «sistema».
//  - Barrera: el almacén interno de Next que usa el registro sigue existiendo (si una versión nueva lo quita, falla aquí
//    en vez de volver en silencio a anotarlo todo en la cuenta dueña).
//  - Usuarios de la cuenta de pruebas: tres, con su rol, nunca super_admin, y solo en una cuenta de pruebas.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsSimEnvironments, roles, tenants, userRoles, users } from '@/lib/db/schema';
import { failedDigest, judgePage, pageRoutes } from '@/lib/operaciones/sim/pantallas-rules';
import { currentRequestSession, defaultTenantId, sessionFromCookieHeader, tenantOfSession } from '@/lib/core/errors';
import { passwordFingerprint, signToken } from '@/lib/auth/session';
import { ensureSimUsers, SIM_USER_ROLES, simUserEmail } from '@/lib/operaciones/sim/env';

describe('pantallas: reglas', () => {
  it('saca del manifiesto solo las páginas fijas del panel', () => {
    const r = pageRoutes({
      '/(dashboard)/dashboard/page': '/dashboard',
      '/(dashboard)/dashboard/clientes/page': '/dashboard/clientes',
      '/(dashboard)/dashboard/clientes/[id]/page': '/dashboard/clientes/[id]',
      '/api/errores/route': '/api/errores',
      '/(login)/sign-in/page': '/sign-in',
      '/(dashboard)/page': '/'
    });
    expect(r).toEqual(['/dashboard', '/dashboard/clientes']);
  });

  it('distingue fallo, sin acceso y ok', () => {
    const v = (status: number, body = '', location: string | null = null) => judgePage({ route: '/dashboard/x', status, location, body });
    expect(v(200, '<html>ok</html>').outcome).toBe('ok');
    expect(v(500).outcome).toBe('fallo');
    expect(v(307, '', 'http://127.0.0.1:3000/sign-in').outcome).toBe('fallo');
    expect(v(307, '', '/dashboard').outcome).toBe('sin-acceso');
    expect(v(404).outcome).toBe('sin-acceso');
    expect(v(200, '<div data-pagina-error="">Algo ha fallado</div>').outcome).toBe('fallo');
    // El texto solo (p. ej. en la lista de Errores) no es la página de error.
    expect(v(200, '<td>Algo ha fallado (página de error)</td>').outcome).toBe('ok');
  });

  it('un trozo roto en el HTML es fallo; redirecciones y «pintar en el navegador» no', () => {
    expect(failedDigest('<template data-dgst="1234567890"></template>')).toBe('1234567890');
    expect(failedDigest('<template data-dgst="NEXT_REDIRECT;replace;/dashboard;307;"></template>')).toBeNull();
    expect(failedDigest('<template data-dgst="NEXT_HTTP_ERROR_FALLBACK;404"></template>')).toBeNull();
    expect(failedDigest('<template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING"></template>')).toBeNull();
    expect(failedDigest('<p>nada</p>')).toBeNull();
  });
});

describe('registro de errores: cuenta de cada petición', () => {
  it('lee la cookie session de la cabecera', () => {
    expect(sessionFromCookieHeader('a=1; session=abc.def.ghi; b=2')).toBe('abc.def.ghi');
    expect(sessionFromCookieHeader(['a=1', 'session=xyz'])).toBe('xyz');
    expect(sessionFromCookieHeader('mysession=no; sessionx=no')).toBeNull();
    expect(sessionFromCookieHeader(undefined)).toBeNull();
    expect(sessionFromCookieHeader('')).toBeNull();
  });

  it('fuera de una petición web no hay sesión (planificador, arranque, pruebas)', () => {
    expect(currentRequestSession()).toBeNull();
  });

  it('barrera: el almacén de peticiones de Next que usa el registro sigue existiendo', async () => {
    const mod = await import('next/dist/server/app-render/work-unit-async-storage.external');
    expect(typeof mod.workUnitAsyncStorage?.getStore).toBe('function');
    expect(typeof mod.workUnitAsyncStorage?.run).toBe('function');
  });

  it('una sesión con firma falsa no da cuenta', async () => {
    expect(await tenantOfSession('eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyIjp7ImlkIjoxfX0.firma-falsa')).toBeNull();
    expect(await tenantOfSession('basura')).toBeNull();
  });
});

describe('usuarios de la cuenta de pruebas', () => {
  const suffix = Date.now().toString(36);
  let ownerId = '';
  let simId = '';
  let realId = '';

  beforeAll(async () => {
    const [o] = await db.insert(tenants).values({ name: `Pantallas dueña ${suffix}`, slug: `pant-dueno-${suffix}` }).returning({ id: tenants.id });
    const [s] = await db.insert(tenants).values({ name: `Pantallas pruebas ${suffix}`, slug: `pant-sim-${suffix}` }).returning({ id: tenants.id });
    const [r] = await db.insert(tenants).values({ name: `Pantallas real ${suffix}`, slug: `pant-real-${suffix}` }).returning({ id: tenants.id });
    ownerId = o.id;
    simId = s.id;
    realId = r.id;
    await db.insert(opsSimEnvironments).values({ tenantId: ownerId, simTenantId: simId });
  });

  afterAll(async () => {
    const ids = (await db.select({ id: users.id }).from(users).where(inArray(users.tenantId, [simId, realId]))).map((u) => u.id);
    if (ids.length) {
      await db.delete(userRoles).where(inArray(userRoles.userId, ids));
      await db.delete(users).where(inArray(users.id, ids));
    }
    await db.delete(opsSimEnvironments).where(eq(opsSimEnvironments.tenantId, ownerId));
    await db.delete(tenants).where(inArray(tenants.id, [ownerId, simId, realId]));
  });

  it('crea admin, editor y lector (idempotente), cada uno con solo su rol', async () => {
    const a = await ensureSimUsers(simId);
    const b = await ensureSimUsers(simId);
    expect(b).toEqual(a);
    for (const role of SIM_USER_ROLES) {
      const rows = await db
        .select({ name: roles.name, tenantId: users.tenantId, email: users.email })
        .from(userRoles)
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .innerJoin(users, eq(users.id, userRoles.userId))
        .where(eq(userRoles.userId, a[role]));
      expect(rows.map((r) => r.name)).toEqual([role]);
      expect(rows[0].tenantId).toBe(simId);
      expect(rows[0].email).toBe(simUserEmail(simId, role));
      expect(rows[0].email.endsWith('.invalid')).toBe(true);
    }
  });

  it('nunca deja un super_admin en la cuenta de pruebas', async () => {
    const ids = await ensureSimUsers(simId);
    const [sa] = await db.select({ id: roles.id }).from(roles).where(eq(roles.name, 'super_admin')).limit(1);
    await db.insert(userRoles).values({ userId: ids.admin, roleId: sa.id });
    await ensureSimUsers(simId);
    const inSim = await db
      .select({ role: roles.name })
      .from(userRoles)
      .innerJoin(users, eq(users.id, userRoles.userId))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(users.tenantId, simId));
    expect(inSim.map((r) => r.role).sort()).toEqual(['admin', 'editor', 'lector']);
  });

  it('se niega en una cuenta que no es de pruebas', async () => {
    await expect(ensureSimUsers(realId)).rejects.toThrow(/cuenta de pruebas/);
  });

  it('una sesión de la cuenta de pruebas se anota en esa cuenta; la dueña de la plataforma no cambia', async () => {
    const ids = await ensureSimUsers(simId);
    const [u] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, ids.lector)).limit(1);
    const token = await signToken({ user: { id: ids.lector }, expires: new Date(Date.now() + 60_000).toISOString(), pv: await passwordFingerprint(u.passwordHash) });
    expect(await tenantOfSession(token)).toBe(simId);
    expect(await defaultTenantId()).not.toBe(simId);
  });
});

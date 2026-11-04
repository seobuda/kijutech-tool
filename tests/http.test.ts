import { describe, expect, it } from 'vitest';

/**
 * Pruebas contra la aplicación en marcha (dentro del contenedor está en 127.0.0.1:3000).
 * Comprueban lo que ve un visitante anónimo y las cabeceras de seguridad.
 */
const BASE = process.env.TEST_BASE_URL ?? 'http://127.0.0.1:3000';
const get = (p: string) => fetch(BASE + p, { redirect: 'manual' });

describe('visitante anónimo', () => {
  it('la portada redirige al inicio de sesión', async () => {
    const res = await get('/');
    expect([307, 308]).toContain(res.status);
    expect(new URL(res.headers.get('location')!, BASE).pathname).toBe('/sign-in');
  });

  it('/sign-up no crea usuarios: redirige al inicio de sesión', async () => {
    const res = await get('/sign-up');
    expect([307, 308]).toContain(res.status);
    expect(new URL(res.headers.get('location')!, BASE).pathname).toBe('/sign-in');
    // y un POST tampoco hace nada
    const post = await fetch(BASE + '/sign-up', {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'email=intruso%40example.com&password=Intruso-12345678'
    });
    expect(post.status).not.toBe(200);
  });

  it('/pricing ya no existe', async () => {
    const res = await get('/pricing');
    expect(new URL(res.headers.get('location') ?? '/', BASE).pathname).toBe('/sign-in');
  });

  it('el panel exige sesión', async () => {
    for (const p of ['/dashboard', '/dashboard/operaciones', '/dashboard/usuarios']) {
      const res = await get(p);
      expect(res.status, p).toBe(307);
      expect(new URL(res.headers.get('location')!, BASE).pathname, p).toBe('/sign-in');
    }
  });

  it('/api/team exige sesión y /api/user no devuelve datos', async () => {
    expect((await get('/api/team')).status).toBe(401);
    expect(await (await get('/api/user')).json()).toBeNull();
  });

  it('la página de inicio de sesión está en español y no habla de Stripe ni de ACME', async () => {
    const html = await (await get('/sign-in')).text();
    expect(html).toMatch(/Iniciar sesión/);
    expect(html).toMatch(/Kijutech Tool/);
    expect(html).not.toMatch(/ACME|Stripe|Next\.js SaaS Starter/i);
    expect(html).not.toMatch(/passwordHash|password_hash/);
  });
});

describe('cabeceras de seguridad', () => {
  it('se envían en todas las respuestas', async () => {
    const res = await get('/sign-in');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('strict-transport-security')).toMatch(/max-age=\d+/);
    expect(res.headers.get('content-security-policy')).toMatch(/frame-ancestors 'none'/);
    expect(res.headers.get('permissions-policy')).toBeTruthy();
  });

  it('no anuncia la tecnología del servidor', async () => {
    expect((await get('/sign-in')).headers.get('x-powered-by')).toBeNull();
  });
});

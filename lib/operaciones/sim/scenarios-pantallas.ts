import 'server-only';
// Pruebas «pantallas-*» (22 nov 2026): recorren TODAS las pantallas del panel con una sesión de cada rol (admin, editor,
// lector) de la cuenta de pruebas y fallan si alguna se rompe. Corren con el resto tras cada despliegue: si una pantalla
// revienta, deploy.sh vuelve solo a la versión anterior. Antes solo se comprobaba que /sign-in respondía.
//
// Seguridad:
//  - los usuarios son de la cuenta de pruebas y nunca super_admin (ensureSimUsers); su contraseña nadie la sabe: la
//    sesión la firma el propio servidor aquí, con la misma clave y huella que el inicio de sesión normal;
//  - las visitas van al propio servidor (127.0.0.1), nunca salen fuera;
//  - lo que falle en esas visitas se anota en la cuenta de pruebas (el registro de errores mira la sesión de cada
//    petición), así no avisa a Enric como si fuera de la cuenta real.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { and, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { sysErrorEvents, sysErrorGroups, users } from '@/lib/db/schema';
import { passwordFingerprint, signToken } from '@/lib/auth/session';
import { flushErrors } from '@/lib/core/errors';
import { ensureSimUsers, type SimUserRole } from '@/lib/operaciones/sim/env';
import { judgePage, pageRoutes, type PageVerdict } from '@/lib/operaciones/sim/pantallas-rules';
import { check, sleep, type Scenario, type ScenarioCtx } from '@/lib/operaciones/sim/kit';

const PAGE_TIMEOUT_MS = 25_000;
const ROLE_LABEL: Record<SimUserRole, string> = { admin: 'administración', editor: 'edición', lector: 'solo lectura' };

async function loadRoutes(): Promise<string[] | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), '.next', 'app-path-routes-manifest.json'), 'utf8');
    return pageRoutes(JSON.parse(raw) as Record<string, string>);
  } catch {
    return null;
  }
}

/** Sesión firmada para un usuario de la cuenta de pruebas (como setSession, pero sin cookie del navegador). */
async function simSession(userId: number, simTenantId: string): Promise<string> {
  const [u] = await db.select({ passwordHash: users.passwordHash, tenantId: users.tenantId }).from(users).where(eq(users.id, userId)).limit(1);
  if (!u || u.tenantId !== simTenantId) throw new Error('El usuario de pruebas no es de la cuenta de pruebas');
  return signToken({ user: { id: userId }, expires: new Date(Date.now() + 30 * 60_000).toISOString(), pv: await passwordFingerprint(u.passwordHash) });
}

async function visit(base: string, route: string, session: string): Promise<PageVerdict> {
  try {
    const r = await fetch(`${base}${route}`, {
      headers: { cookie: `session=${session}`, 'user-agent': 'kiju-pruebas-pantallas' },
      redirect: 'manual',
      cache: 'no-store',
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS)
    });
    const body = r.status === 200 ? await r.text() : '';
    return judgePage({ route, status: r.status, location: r.headers.get('location'), body });
  } catch (e) {
    return { route, outcome: 'fallo', detail: `no respondió (${e instanceof Error ? e.message : String(e)})` };
  }
}

async function runPantallas(ctx: ScenarioCtx, role: SimUserRole): Promise<void> {
  const routes = await loadRoutes();
  check(ctx, 'Lista de pantallas (manifiesto de next build)', Boolean(routes?.length), routes ? 'vacía' : 'no se encontró .next/app-path-routes-manifest.json');
  const ids = await ensureSimUsers(ctx.simTenantId);
  const session = await simSession(ids[role], ctx.simTenantId);
  // El mismo puerto que usa scripts/run-scenarios.sh para llegar a la app desde dentro del contenedor.
  const base = 'http://127.0.0.1:3000';
  const started = new Date(Date.now() - 1000);

  const verdicts: PageVerdict[] = [];
  for (const route of routes!) verdicts.push(await visit(base, route, session));

  const ok = verdicts.filter((v) => v.outcome === 'ok');
  const denied = verdicts.filter((v) => v.outcome === 'sin-acceso');
  const failed = verdicts.filter((v) => v.outcome === 'fallo');
  ctx.steps.push({ label: `Pantallas que cargan con ${ROLE_LABEL[role]}`, ok: true, detail: `${ok.length} de ${verdicts.length}` });
  if (denied.length) ctx.steps.push({ label: 'Sin acceso para este rol (correcto, las redirige)', ok: true, detail: denied.map((v) => v.route.replace('/dashboard', '') || '/').join(', ') });

  // Fallos que el servidor anotó durante el recorrido en la cuenta de pruebas. Esperar un poco: la cuenta de cada fallo
  // se averigua a partir de su sesión (asíncrono) antes de guardarlo.
  await sleep(1500);
  await flushErrors();
  const logged = await db
    .select({ source: sysErrorGroups.source, title: sysErrorGroups.title, path: sysErrorEvents.path })
    .from(sysErrorEvents)
    .innerJoin(sysErrorGroups, eq(sysErrorGroups.id, sysErrorEvents.groupId))
    .where(and(eq(sysErrorEvents.tenantId, ctx.simTenantId), gte(sysErrorEvents.createdAt, started)))
    .limit(50);
  const web = logged.filter((l) => l.source === 'web');
  const other = logged.filter((l) => l.source !== 'web');
  if (other.length) {
    // Avisos de código que ya captura el problema (p. ej. «ClickUp no responde», que en la cuenta de pruebas es lo normal):
    // se listan, no hacen fallar.
    ctx.steps.push({ label: 'Avisos anotados al recorrerlas (no hacen fallar)', ok: true, detail: [...new Set(other.map((l) => l.title.slice(0, 90)))].slice(0, 5).join(' · ') });
  }

  check(
    ctx,
    `Ninguna pantalla falla con ${ROLE_LABEL[role]}`,
    failed.length === 0,
    failed.map((v) => `${v.route}: ${v.detail}`).slice(0, 8).join(' · ')
  );
  check(
    ctx,
    'El servidor no anotó fallos de página al recorrerlas',
    web.length === 0,
    [...new Set(web.map((l) => `${l.path ?? '¿?'}: ${l.title.slice(0, 120)}`))].slice(0, 5).join(' · ')
  );
}

const scenario = (role: SimUserRole): Scenario => ({
  key: `pantallas-${role}`,
  title: `Pantallas con rol ${role}`,
  area: 'Pantallas',
  description: `Abre todas las pantallas del panel con un usuario de ${ROLE_LABEL[role]} de la cuenta de pruebas y comprueba que ninguna se rompe (ni responde con error, ni muestra la página de error, ni deja un fallo anotado).`,
  needsServer: true,
  timeoutMs: 170_000,
  run: (ctx) => runPantallas(ctx, role)
});

export const PANTALLAS_SCENARIOS: Scenario[] = [scenario('admin'), scenario('editor'), scenario('lector')];

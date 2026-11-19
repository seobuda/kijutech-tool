import { createHmac, timingSafeEqual } from 'crypto';
import { defaultTenantId } from '@/lib/core/errors';
import { runScenarios, type Trigger } from '@/lib/operaciones/sim/runner';

// Lanza las pruebas simuladas desde el propio servidor (scripts/run-scenarios.sh) sin sesión web: Claude las usa
// tras un cambio y, más adelante, el despliegue. Protegida con un secreto derivado de AUTH_SECRET que solo puede
// calcular quien ya está dentro del servidor (no hay variable nueva). Sin el secreto: 404, como si no existiera.
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function expectedSecret(): string | null {
  const s = process.env.AUTH_SECRET;
  return s ? createHmac('sha256', s).update('kiju-pruebas-simuladas').digest('hex') : null;
}

export async function POST(request: Request) {
  const expected = expectedSecret();
  const given = request.headers.get('x-kiju-pruebas') ?? '';
  if (!expected || given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
    return new Response('Not found', { status: 404 });
  }
  let body: { scenarios?: unknown; trigger?: unknown; commit?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // sin cuerpo: todas
  }
  const keys = Array.isArray(body.scenarios) ? body.scenarios.filter((k): k is string => typeof k === 'string').slice(0, 50) : 'all';
  const trigger: Trigger = body.trigger === 'despliegue' ? 'despliegue' : 'claude';
  const commit = typeof body.commit === 'string' ? body.commit.slice(0, 20) : null;
  const tenantId = await defaultTenantId();
  if (!tenantId) return Response.json({ ok: false, error: 'Sin cuenta' }, { status: 500 });
  const r = await runScenarios(tenantId, keys, trigger, trigger === 'despliegue' ? 'despliegue' : 'Claude', commit);
  return Response.json(r, { status: r.error ? 409 : 200 });
}

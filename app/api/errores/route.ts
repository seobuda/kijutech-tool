import { getUserIfAllowed } from '@/lib/auth/permissions';
import { reportError } from '@/lib/core/errors';

export const dynamic = 'force-dynamic';

// Errores del navegador (pantallas que fallan, promesas sin capturar) → registro central de errores (17 nov 2026).
// Solo usuarios con sesión y al menos permiso de ver; límite por persona para que una pantalla en bucle no lo llene.
const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 30;
const G = globalThis as unknown as { __kijuClientErrors?: Map<number, { start: number; n: number }> };
const budget = () => (G.__kijuClientErrors ??= new Map());

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

export async function POST(req: Request) {
  const user = await getUserIfAllowed('view');
  if (!user) return Response.json({ ok: false }, { status: 401 });
  const now = Date.now();
  const b = budget().get(user.id);
  const cur = b && now - b.start < WINDOW_MS ? b : { start: now, n: 0 };
  if (cur.n >= MAX_PER_WINDOW) return Response.json({ ok: false }, { status: 429 });
  cur.n++;
  budget().set(user.id, cur);
  if (budget().size > 500) budget().clear();

  let body: Record<string, unknown> = {};
  try {
    const raw = await req.text();
    if (raw.length > 20_000) return Response.json({ ok: false }, { status: 413 });
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const message = str(body.message, 2000).trim();
  if (!message) return Response.json({ ok: false }, { status: 400 });
  const path = str(body.path, 300).split('?')[0];
  // La ruta sin ids: todas las fichas de cliente que fallan igual caen en el mismo grupo.
  const route = path.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id').replace(/\/\d+(?=\/|$)/g, '/:n');
  const err = new Error(message);
  err.stack = str(body.stack, 6000) || undefined;
  reportError({
    error: err,
    source: 'navegador',
    area: `${str(body.kind, 30) || 'pantalla'} ${route}`.trim(),
    tenantId: user.tenantId,
    actor: user.name || user.email,
    channel: 'web',
    path,
    userMessage: str(body.kind, 30) === 'pantalla' ? 'Algo ha fallado (página de error)' : null,
    context: { digest: str(body.digest, 100) || null, navegador: str(req.headers.get('user-agent'), 200) }
  });
  return Response.json({ ok: true });
}

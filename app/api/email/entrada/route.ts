import {
  INBOUND_MAX_REQUEST_BYTES,
  inboundSecret,
  validateInboundPayload,
  verifyInbound
} from '@/lib/operaciones/inbound-email-rules';
import { ingestInboundEmail } from '@/lib/operaciones/inbound-email';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Entrada de correos de clientes. La llama el Email Worker de Cloudflare (no un navegador): no hay sesión,
// así que lo único que abre la puerta es la FIRMA del aviso (HMAC con un secreto derivado de AUTH_SECRET,
// con marca de tiempo que caduca a los 5 minutos). Sin firma válida no se lee ni se guarda nada.
export async function POST(request: Request) {
  const tenantId = new URL(request.url).searchParams.get('t');
  if (!tenantId || !UUID_RE.test(tenantId)) return new Response('Not found', { status: 404 });

  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > INBOUND_MAX_REQUEST_BYTES) return new Response('Payload too large', { status: 413 });

  const body = await request.text();
  if (body.length > INBOUND_MAX_REQUEST_BYTES) return new Response('Payload too large', { status: 413 });

  const valid = verifyInbound(
    inboundSecret(tenantId),
    request.headers.get('x-kijutech-timestamp'),
    body,
    request.headers.get('x-kijutech-signature')
  );
  if (!valid) return new Response('Forbidden', { status: 403 });

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  const email = validateInboundPayload(json);
  if (!email.ok) return Response.json({ ok: false, error: email.error }, { status: 400 });

  try {
    const res = await ingestInboundEmail(tenantId, email.value, 'cloudflare');
    if (!res.ok) return Response.json({ ok: false }, { status: res.code === 'rate' ? 429 : 500 });
    return Response.json({ ok: true, id: res.id, duplicate: res.duplicate });
  } catch (e) {
    console.error('[correos] entrada:', e instanceof Error ? e.message : e);
    return Response.json({ ok: false }, { status: 500 });
  }
}

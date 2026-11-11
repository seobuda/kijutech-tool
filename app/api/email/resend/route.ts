import { getEmailConfig, authFromResend, fetchReceivedEmail, verifyResendSignature } from '@/lib/operaciones/resend';
import { INBOUND_MAX_REQUEST_BYTES, validateInboundPayload } from '@/lib/operaciones/inbound-email-rules';
import { ingestInboundEmail } from '@/lib/operaciones/inbound-email';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Buzón del agente (agente@equipo.kijutech.com). La llama Resend, no un navegador: no hay sesión y lo
// único que abre la puerta es la FIRMA del webhook (secreto «whsec_…» guardado cifrado al conectar el
// buzón, marca de tiempo de ±5 min). El aviso solo trae el id: el contenido se pide a la API de Resend,
// así que aunque alguien reenviara un aviso viejo no podría inventarse el texto del correo.
// Aquí solo se guarda; la IA lo interpreta después desde el planificador (runEmailInterpretations).
export async function POST(request: Request) {
  const tenantId = new URL(request.url).searchParams.get('t');
  if (!tenantId || !UUID_RE.test(tenantId)) return new Response('Not found', { status: 404 });

  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > INBOUND_MAX_REQUEST_BYTES) return new Response('Payload too large', { status: 413 });
  const body = await request.text();
  if (body.length > INBOUND_MAX_REQUEST_BYTES) return new Response('Payload too large', { status: 413 });

  const cfg = await getEmailConfig(tenantId);
  if (!cfg.webhookSecret || !cfg.apiKey) return new Response('Not found', { status: 404 });
  const valid = verifyResendSignature(
    cfg.webhookSecret,
    {
      id: request.headers.get('svix-id') ?? request.headers.get('webhook-id'),
      timestamp: request.headers.get('svix-timestamp') ?? request.headers.get('webhook-timestamp'),
      signature: request.headers.get('svix-signature') ?? request.headers.get('webhook-signature')
    },
    body
  );
  if (!valid) return new Response('Forbidden', { status: 403 });

  let event: { type?: string; data?: { email_id?: string } };
  try {
    event = JSON.parse(body);
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  // Otros eventos (si algún día se suscriben) se aceptan sin hacer nada.
  if (event.type !== 'email.received' || !event.data?.email_id) return Response.json({ ok: true, ignored: true });

  try {
    const mail = await fetchReceivedEmail(cfg.apiKey, event.data.email_id);
    const h = mail.headers ?? {};
    const lower = Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), String(v)]));
    const parsed = validateInboundPayload({
      messageId: mail.message_id ?? lower['message-id'] ?? `resend-${mail.id}`,
      from: mail.from,
      to: (mail.to ?? [])[0],
      subject: mail.subject ?? '',
      text: mail.text ?? undefined,
      html: mail.html ?? undefined,
      date: mail.created_at,
      inReplyTo: lower['in-reply-to'],
      auth: authFromResend(mail.authentication),
      headers: Object.fromEntries(Object.entries(lower).map(([k, v]) => [k, v.slice(0, 1000)])),
      attachments: (mail.attachments ?? []).slice(0, 50).map((a) => ({ name: String(a.filename ?? 'adjunto') }))
    });
    if (!parsed.ok) return Response.json({ ok: false, error: parsed.error }, { status: 400 });
    const res = await ingestInboundEmail(tenantId, parsed.value, 'resend', {
      providerEmailId: mail.id,
      referencesHeader: lower['references']?.slice(0, 4000) ?? null
    });
    if (!res.ok) return Response.json({ ok: false }, { status: res.code === 'rate' ? 429 : 500 });
    return Response.json({ ok: true, id: res.id, duplicate: res.duplicate });
  } catch (e) {
    console.error('[correos] webhook de Resend:', e instanceof Error ? e.message : e);
    // 500: Resend reintenta más tarde (el Message-ID evita duplicados).
    return Response.json({ ok: false }, { status: 500 });
  }
}

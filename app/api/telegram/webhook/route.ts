import { timingSafeEqual } from 'crypto';
import { getTelegramConfig, decodeBotToken, webhookSecret } from '@/lib/operaciones/telegram-config';
import { handleUpdate } from '@/lib/operaciones/telegram-handler';
import type { TgUpdate } from '@/lib/operaciones/telegram';

// Recepción por webhook: para cuando la aplicación esté en un servidor con URL pública.
// En local no se usa (se escucha por consulta periódica). Se activa desde Ajustes →
// Telegram → «Activar webhook»; entonces Telegram envía aquí cada mensaje con el secreto
// derivado de AUTH_SECRET, y esta ruta rechaza cualquier petición que no lo traiga.
export async function POST(request: Request) {
  const tenantId = new URL(request.url).searchParams.get('t');
  if (!tenantId) return new Response('Not found', { status: 404 });

  const cfg = await getTelegramConfig(tenantId);
  if (!cfg || cfg.receiveMode !== 'webhook') return new Response('Not found', { status: 404 });

  const given = Buffer.from(request.headers.get('x-telegram-bot-api-secret-token') ?? '');
  const expected = Buffer.from(webhookSecret(tenantId));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return new Response('Forbidden', { status: 403 });
  }

  let update: TgUpdate;
  try {
    update = (await request.json()) as TgUpdate;
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  try {
    await handleUpdate(tenantId, decodeBotToken(cfg), update);
  } catch (e) {
    console.error('[telegram] webhook:', e instanceof Error ? e.message : e);
  }
  // Siempre 200: si no, Telegram reintenta la misma actualización una y otra vez.
  return Response.json({ ok: true });
}

import { timingSafeEqual } from 'crypto';
import { getTelegramConfig, decodeBotToken, webhookSecret } from '@/lib/operaciones/telegram-config';
import { decodeDeptBotToken, DEPT_BOT_KEY_RE, deptWebhookSecret, getDeptBot } from '@/lib/operaciones/dept-bots';
import { handleUpdate } from '@/lib/operaciones/telegram-handler';
import { wireApp } from '@/lib/app-wiring';

wireApp(); // los mensajes libres y audios van al agente por el núcleo
import type { TgUpdate } from '@/lib/operaciones/telegram';

// Recepción por webhook: para cuando la aplicación esté en un servidor con URL pública.
// En local no se usa (se escucha por consulta periódica). Se activa desde Ajustes →
// Telegram → «Activar webhook»; entonces Telegram envía aquí cada mensaje con el secreto
// derivado de AUTH_SECRET, y esta ruta rechaza cualquier petición que no lo traiga.
// Bots de departamento (organigrama, 20 nov 2026): llegan con &b=<clave> y su propio secreto (dept-bots.ts).
const same = (given: string, expected: string) => {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

export async function POST(request: Request) {
  const params = new URL(request.url).searchParams;
  const tenantId = params.get('t');
  const botKey = params.get('b');
  if (!tenantId || (botKey !== null && !DEPT_BOT_KEY_RE.test(botKey))) return new Response('Not found', { status: 404 });

  const cfg = await getTelegramConfig(tenantId);
  if (!cfg || cfg.receiveMode !== 'webhook') return new Response('Not found', { status: 404 });
  const dept = botKey ? await getDeptBot(tenantId, botKey) : null;
  if (botKey && !dept) return new Response('Not found', { status: 404 });

  const given = request.headers.get('x-telegram-bot-api-secret-token') ?? '';
  if (!same(given, botKey ? deptWebhookSecret(tenantId, botKey) : webhookSecret(tenantId))) {
    return new Response('Forbidden', { status: 403 });
  }

  let update: TgUpdate;
  try {
    update = (await request.json()) as TgUpdate;
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  try {
    if (dept && botKey) await handleUpdate(tenantId, decodeDeptBotToken(dept), update, botKey);
    else await handleUpdate(tenantId, decodeBotToken(cfg), update);
  } catch (e) {
    console.error(`[telegram] webhook${botKey ? ` (${botKey})` : ''}:`, e instanceof Error ? e.message : e);
  }
  // Siempre 200: si no, Telegram reintenta la misma actualización una y otra vez.
  return Response.json({ ok: true });
}

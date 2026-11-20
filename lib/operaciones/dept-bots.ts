import 'server-only';
// Bots de departamento (organigrama, 20 nov 2026). Además del bot de Operaciones (ops_telegram_config), cada jefe de
// departamento puede tener su propio bot de Telegram (el primero: «Kijutech Sistema»). Reglas:
//   - Solo hablan con el dueño. En un chat privado el id del chat es el id del usuario, el mismo que con el bot principal:
//     no hay que vincular nada, basta con que el dueño pulse «Iniciar» (Telegram no deja a un bot escribir antes).
//   - Solo por webhook (en el servidor). Cada bot tiene su URL (?t=cuenta&b=clave) y su secreto, derivado de AUTH_SECRET.
//   - Los avisos dicen por qué bot salen (payload.bot de ops_notifications). Si el bot no está listo, salen por el
//     principal: un aviso nunca se pierde por un bot mal configurado.
import { createHmac } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsTelegramBots, type OpsTelegramBot } from '@/lib/db/schema';
import { decrypt, encrypt } from '@/lib/ai/encryption';
import { escapeHtml, tg, TelegramError } from '@/lib/operaciones/telegram';
import { getOwnerMember, getTelegramConfig } from '@/lib/operaciones/telegram-config';

export const DEPT_BOT_KEY_RE = /^[a-z][a-z0-9_]{1,39}$/;

export class DeptBotError extends Error {}

export async function getDeptBot(tenantId: string, key: string): Promise<OpsTelegramBot | null> {
  const [row] = await db.select().from(opsTelegramBots).where(and(eq(opsTelegramBots.tenantId, tenantId), eq(opsTelegramBots.key, key))).limit(1);
  return row ?? null;
}

export async function listDeptBots(tenantId: string): Promise<OpsTelegramBot[]> {
  return db.select().from(opsTelegramBots).where(eq(opsTelegramBots.tenantId, tenantId));
}

export function decodeDeptBotToken(b: OpsTelegramBot): string {
  return decrypt(b.botTokenEncrypted, b.botTokenIv);
}

export function deptWebhookSecret(tenantId: string, key: string): string {
  return createHmac('sha256', process.env.AUTH_SECRET ?? '')
    .update(`telegram-webhook:${tenantId}:${key}`)
    .digest('hex')
    .slice(0, 48);
}

/**
 * Token por el que debe salir un mensaje al dueño. Con un bot de departamento listo, el suyo; si no (sin bot, sin
 * «Iniciar», cuenta de pruebas…), null: quien llama usa el bot principal.
 */
export async function readyDeptBotToken(tenantId: string, key: string | null | undefined): Promise<string | null> {
  if (!key) return null;
  const b = await getDeptBot(tenantId, key).catch(() => null);
  if (!b?.readyAt) return null;
  try {
    return decodeDeptBotToken(b);
  } catch {
    return null;
  }
}

const WELCOME: Record<string, string> = {
  sistema:
    '⚙️ <b>Hola, soy el jefe de Sistema.</b>\n\nAquí te llegan los avisos técnicos (errores, salud, pruebas, gasto de IA, servidor y despliegues) y el parte diario. Solo suena lo grave.\n\nPregúntame lo que quieras: «¿cómo está el sistema?», «¿qué falló anoche?», «¿qué dice el técnico de ese error?».'
};
export const welcomeText = (key: string, botName: string | null) =>
  WELCOME[key] ?? `👋 <b>${escapeHtml(botName ?? 'Hola')}</b>: a partir de ahora este departamento te escribirá por aquí.`;

/** Intenta escribir al dueño: si lo consigue, el bot queda listo (el dueño ya pulsó «Iniciar» alguna vez). */
async function tryWelcome(tenantId: string, b: OpsTelegramBot, token: string): Promise<boolean> {
  const owner = await getOwnerMember(tenantId);
  if (!owner?.telegramChatId) return false;
  try {
    await tg(token, 'sendMessage', { chat_id: owner.telegramChatId, text: welcomeText(b.key, b.botName), parse_mode: 'HTML' });
    await db.update(opsTelegramBots).set({ readyAt: new Date(), lastError: null, lastErrorAt: null, updatedAt: new Date() }).where(eq(opsTelegramBots.id, b.id));
    return true;
  } catch {
    return false;
  }
}

/**
 * Guarda el token de un bot de departamento (cifrado), comprueba que existe, activa su webhook con la misma dirección
 * pública que el bot principal y prueba a saludar al dueño. Devuelve si ya está listo o falta pulsar «Iniciar».
 */
export async function saveDeptBot(tenantId: string, key: string, rawToken: string): Promise<{ botName: string; botUsername: string; ready: boolean }> {
  if (!DEPT_BOT_KEY_RE.test(key)) throw new DeptBotError('Departamento no válido');
  const token = rawToken.trim();
  if (!/^\d{5,15}:[A-Za-z0-9_-]{20,80}$/.test(token)) throw new DeptBotError('Eso no parece un token de bot: es un número, dos puntos y una clave larga (te lo da @BotFather).');
  const main = await getTelegramConfig(tenantId);
  if (!main) throw new DeptBotError('Primero hay que configurar el bot principal (Operaciones → Telegram).');
  if (main.receiveMode !== 'webhook' || !main.webhookUrl) throw new DeptBotError('Los bots de departamento funcionan por webhook: solo se pueden activar en el servidor (con el bot principal en modo webhook).');
  let me: { id: number; first_name: string; username: string };
  try {
    me = await tg(token, 'getMe');
  } catch (e) {
    throw new DeptBotError(`Telegram no reconoce ese token${e instanceof TelegramError ? ` (${e.message})` : ''}.`);
  }
  const mainToken = decrypt(main.botTokenEncrypted, main.botTokenIv);
  if (token === mainToken) throw new DeptBotError('Ese es el token del bot principal: crea un bot nuevo en @BotFather para este departamento.');

  const origin = new URL(main.webhookUrl).origin;
  const url = `${origin}/api/telegram/webhook?t=${tenantId}&b=${key}`;
  await tg(token, 'setWebhook', { url, secret_token: deptWebhookSecret(tenantId, key), allowed_updates: ['message', 'callback_query'] });

  const { encrypted, iv } = encrypt(token);
  const values = { botTokenEncrypted: encrypted, botTokenIv: iv, botUsername: me.username, botName: me.first_name, readyAt: null, webhookSetAt: new Date(), lastError: null, lastErrorAt: null, updatedAt: new Date() };
  const [row] = await db
    .insert(opsTelegramBots)
    .values({ tenantId, key, ...values })
    .onConflictDoUpdate({ target: [opsTelegramBots.tenantId, opsTelegramBots.key], set: values })
    .returning();
  const ready = await tryWelcome(tenantId, row, token);
  return { botName: me.first_name, botUsername: me.username, ready };
}

/** «Comprobar»: si aún no estaba listo, vuelve a intentar saludar (por si el dueño ya pulsó «Iniciar»). */
export async function checkDeptBot(tenantId: string, key: string): Promise<boolean> {
  const b = await getDeptBot(tenantId, key);
  if (!b) throw new DeptBotError('Ese departamento no tiene bot.');
  if (b.readyAt) return true;
  return tryWelcome(tenantId, b, decodeDeptBotToken(b));
}

/** Quita el bot de un departamento: borra su webhook y su token. Sus avisos vuelven al bot principal. */
export async function removeDeptBot(tenantId: string, key: string): Promise<void> {
  const b = await getDeptBot(tenantId, key);
  if (!b) return;
  await tg(decodeDeptBotToken(b), 'deleteWebhook', { drop_pending_updates: true }).catch(() => undefined);
  await db.delete(opsTelegramBots).where(eq(opsTelegramBots.id, b.id));
}

/** El dueño escribió al bot (p. ej. pulsó «Iniciar»): queda listo. */
export async function markDeptBotReady(tenantId: string, key: string): Promise<boolean> {
  const rows = await db
    .update(opsTelegramBots)
    .set({ readyAt: new Date(), updatedAt: new Date() })
    .where(and(eq(opsTelegramBots.tenantId, tenantId), eq(opsTelegramBots.key, key)))
    .returning({ readyAt: opsTelegramBots.readyAt });
  return rows.length > 0;
}

export async function noteDeptBotError(tenantId: string, key: string, message: string): Promise<void> {
  await db
    .update(opsTelegramBots)
    .set({ lastError: message.slice(0, 500), lastErrorAt: new Date() })
    .where(and(eq(opsTelegramBots.tenantId, tenantId), eq(opsTelegramBots.key, key)))
    .catch(() => undefined);
}

import 'server-only';
// Telegram simulado (19 nov 2026): recibe las llamadas que tg() hace con el token centinela del entorno de pruebas y
// las guarda como conversación en ops_sim_messages. Devuelve lo mismo que devolvería Telegram (message_id, true…),
// así el código del bot no sabe que está en pruebas. Nunca sale a internet.
import { AsyncLocalStorage } from 'node:async_hooks';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsSimMessages } from '@/lib/db/schema';
import { setSimTelegramTransport } from '@/lib/operaciones/telegram';
import { simTenantFromToken } from '@/lib/operaciones/sim/env';
import { registerConsoleTenantResolver } from '@/lib/core/errors';

type Btn = { text: string; callback_data?: string; url?: string };

/** La ejecución en curso: los mensajes que se generen dentro quedan asociados a ella. */
export const simRunContext = new AsyncLocalStorage<{ runId: string | null; simTenantId?: string }>();
const runId = () => simRunContext.getStore()?.runId ?? null;

// Las pulsaciones simuladas llevan un id «sim:<chat>:<aleatorio>»: así la ventanita de la respuesta va a su chat.
export function simCallbackId(chatId: number): string {
  return `sim:${chatId}:${Math.random().toString(36).slice(2, 10)}`;
}

function keyboard(params: Record<string, unknown>): Btn[][] | null | undefined {
  const rm = params.reply_markup as { inline_keyboard?: Btn[][] } | undefined;
  if (rm === undefined) return undefined; // no se tocan los botones
  return rm?.inline_keyboard?.length ? rm.inline_keyboard : null;
}

async function transport(token: string, method: string, params: Record<string, unknown>): Promise<unknown> {
  const tenantId = simTenantFromToken(token);
  if (!tenantId) throw new Error('Token simulado no válido');
  const chatId = Number(params.chat_id);
  const msgId = Number(params.message_id);
  switch (method) {
    case 'getMe':
      return { id: 1, is_bot: true, first_name: 'Bot simulado', username: 'kiju_simulado_bot' };
    case 'sendMessage':
    case 'sendPhoto':
    case 'sendVoice': {
      const text = String(params.text ?? params.caption ?? '') || (method === 'sendVoice' ? '🎤 (nota de voz)' : '');
      const [row] = await db
        .insert(opsSimMessages)
        .values({ tenantId, chatId, direction: 'bot', text, buttons: keyboard(params) ?? null, runId: runId() })
        .returning({ id: opsSimMessages.id });
      return { message_id: row.id, chat: { id: chatId, type: 'private' }, date: Math.floor(Date.now() / 1000), text };
    }
    case 'editMessageText': {
      const kb = keyboard(params);
      await db
        .update(opsSimMessages)
        .set({ text: String(params.text ?? ''), ...(kb !== undefined ? { buttons: kb } : {}), editedAt: new Date() })
        .where(and(eq(opsSimMessages.tenantId, tenantId), eq(opsSimMessages.id, msgId)));
      return true;
    }
    case 'editMessageReplyMarkup': {
      await db
        .update(opsSimMessages)
        .set({ buttons: keyboard(params) ?? null, editedAt: new Date() })
        .where(and(eq(opsSimMessages.tenantId, tenantId), eq(opsSimMessages.id, msgId)));
      return true;
    }
    case 'deleteMessage': {
      await db.update(opsSimMessages).set({ deletedAt: sql`now()` }).where(and(eq(opsSimMessages.tenantId, tenantId), eq(opsSimMessages.id, msgId)));
      return true;
    }
    case 'answerCallbackQuery': {
      const text = String(params.text ?? '');
      const m = String(params.callback_query_id ?? '').match(/^sim:(-?\d+):/);
      if (text && m) await db.insert(opsSimMessages).values({ tenantId, chatId: Number(m[1]), direction: 'aviso', text, runId: runId() });
      return true;
    }
    default:
      // sendChatAction, setMyCommands, etc.: no dejan rastro en la conversación.
      return true;
  }
}

let registered = false;
/** Lo llama el simulador antes de usarse (idempotente). Sin registrar, un token simulado da error, nunca sale fuera. */
export function registerSimTransport(): void {
  if (registered) return;
  registered = true;
  setSimTelegramTransport(transport);
  // Lo que se escriba en la consola durante un escenario es de la cuenta de pruebas, no de la real (registro de errores).
  registerConsoleTenantResolver(() => simRunContext.getStore()?.simTenantId ?? null);
}

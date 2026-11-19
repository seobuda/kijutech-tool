import 'server-only';
// La persona simulada (19 nov 2026): escribe y pulsa botones en el Telegram simulado. Construye la misma
// «actualización» que mandaría Telegram y la entrega a handleUpdate, el mismo código que atiende a las personas reales.
import { and, asc, desc, eq, gt, isNull } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsSimMessages, type OpsSimMessage } from '@/lib/db/schema';
import { handleUpdate } from '@/lib/operaciones/telegram-handler';
import type { TgUpdate } from '@/lib/operaciones/telegram';
import { simBotToken, simChats } from '@/lib/operaciones/sim/env';
import { registerSimTransport, simCallbackId, simRunContext } from '@/lib/operaciones/sim/transport';

type Btn = { text: string; callback_data?: string };
let updateSeq = Date.now() % 1_000_000_000;

function who(simTenantId: string, chatId: number) {
  const c = simChats(simTenantId).find((x) => x.chatId === chatId);
  if (!c) throw new Error('Chat simulado desconocido');
  return { id: chatId, is_bot: false, first_name: c.name, username: c.clickupUserId };
}

/** La persona escribe un texto (o un comando como /cancelar). */
export async function simSay(simTenantId: string, chatId: number, text: string): Promise<void> {
  registerSimTransport();
  const runId = simRunContext.getStore()?.runId ?? null;
  const [row] = await db.insert(opsSimMessages).values({ tenantId: simTenantId, chatId, direction: 'persona', text, runId }).returning({ id: opsSimMessages.id });
  const update: TgUpdate = {
    update_id: ++updateSeq,
    message: { message_id: row.id, chat: { id: chatId, type: 'private' }, from: who(simTenantId, chatId), text }
  };
  await handleUpdate(simTenantId, simBotToken(simTenantId), update);
}

/** La persona pulsa un botón de un mensaje del bot. Devuelve el botón pulsado (o null si no existe). */
export async function simPress(simTenantId: string, messageId: number, match: (b: Btn) => boolean): Promise<Btn | null> {
  registerSimTransport();
  const [msg] = await db
    .select()
    .from(opsSimMessages)
    .where(and(eq(opsSimMessages.tenantId, simTenantId), eq(opsSimMessages.id, messageId)))
    .limit(1);
  if (!msg || msg.deletedAt) return null;
  const btn = ((msg.buttons as Btn[][] | null) ?? []).flat().find(match);
  if (!btn?.callback_data) return null;
  const runId = simRunContext.getStore()?.runId ?? null;
  await db.insert(opsSimMessages).values({ tenantId: simTenantId, chatId: msg.chatId, direction: 'persona', text: `👆 Pulsa «${btn.text}»`, runId });
  const update: TgUpdate = {
    update_id: ++updateSeq,
    callback_query: {
      id: simCallbackId(msg.chatId),
      from: who(simTenantId, msg.chatId),
      message: { message_id: msg.id, chat: { id: msg.chatId, type: 'private' }, text: msg.text },
      data: btn.callback_data
    }
  };
  await handleUpdate(simTenantId, simBotToken(simTenantId), update);
  return btn;
}

/**
 * Reenvía una pulsación con unos datos concretos sobre un mensaje, aunque el botón ya no se vea: es lo que pasa con un
 * doble toque o un móvil que aún no ha recibido el aviso actualizado.
 */
export async function simPressStale(simTenantId: string, messageId: number, data: string, label: string): Promise<void> {
  registerSimTransport();
  const [msg] = await db.select().from(opsSimMessages).where(and(eq(opsSimMessages.tenantId, simTenantId), eq(opsSimMessages.id, messageId))).limit(1);
  if (!msg) return;
  const runId = simRunContext.getStore()?.runId ?? null;
  await db.insert(opsSimMessages).values({ tenantId: simTenantId, chatId: msg.chatId, direction: 'persona', text: `👆 Vuelve a pulsar «${label}» (aviso sin actualizar)`, runId });
  await handleUpdate(simTenantId, simBotToken(simTenantId), {
    update_id: ++updateSeq,
    callback_query: { id: simCallbackId(msg.chatId), from: who(simTenantId, msg.chatId), message: { message_id: msg.id, chat: { id: msg.chatId, type: 'private' }, text: msg.text }, data }
  });
}

/** Pulsa el botón de la fila y columna dadas (lo usa el Telegram simulado del panel). */
export async function simPressAt(simTenantId: string, messageId: number, row: number, col: number): Promise<Btn | null> {
  const [msg] = await db
    .select({ buttons: opsSimMessages.buttons })
    .from(opsSimMessages)
    .where(and(eq(opsSimMessages.tenantId, simTenantId), eq(opsSimMessages.id, messageId)))
    .limit(1);
  const target = ((msg?.buttons as Btn[][] | null) ?? [])[row]?.[col];
  if (!target?.callback_data) return null;
  return simPress(simTenantId, messageId, (b) => b.callback_data === target.callback_data && b.text === target.text);
}

/** Mensajes visibles de un chat desde un id (para que cada escenario mire solo lo suyo). */
export async function simMessagesSince(simTenantId: string, chatId: number, afterId: number): Promise<OpsSimMessage[]> {
  return db
    .select()
    .from(opsSimMessages)
    .where(and(eq(opsSimMessages.tenantId, simTenantId), eq(opsSimMessages.chatId, chatId), gt(opsSimMessages.id, afterId), isNull(opsSimMessages.deletedAt)))
    .orderBy(asc(opsSimMessages.id));
}

export async function simLastId(simTenantId: string): Promise<number> {
  const [r] = await db.select({ id: opsSimMessages.id }).from(opsSimMessages).where(eq(opsSimMessages.tenantId, simTenantId)).orderBy(desc(opsSimMessages.id)).limit(1);
  return r?.id ?? 0;
}

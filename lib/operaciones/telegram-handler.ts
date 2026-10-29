// Procesa un mensaje o pulsación de botón recibido de Telegram. Lo usan por igual el
// sondeo periódico (long polling, en local) y la ruta de webhook (en un servidor).
//
// Seguridad:
//  1. Cualquier mensaje de un chat NO vinculado se ignora (sin respuesta), salvo
//     "/start <código>" con un código válido.
//  2. Cada código sirve UNA sola vez: al vincular se borra (UPDATE atómico).
//  3. "Visto" solo cuenta si lo pulsa el chat del responsable del encargo (o el chat
//     del dueño en modo pruebas).
import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsNotifications, opsRequests, opsTelegramMembers } from '@/lib/db/schema';
import { escapeHtml, tg, type TgCallbackQuery, type TgMessage, type TgUpdate } from '@/lib/operaciones/telegram';
import {
  getMemberByChat,
  getMemberByUser,
  getOwnerMember
} from '@/lib/operaciones/telegram-config';

export async function handleUpdate(tenantId: string, token: string, update: TgUpdate): Promise<void> {
  if (update.message) return handleMessage(tenantId, token, update.message);
  if (update.callback_query) return handleCallback(tenantId, token, update.callback_query);
}

async function reply(token: string, chatId: number, html: string) {
  await tg(token, 'sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true });
}

async function handleMessage(tenantId: string, token: string, msg: TgMessage): Promise<void> {
  // Solo chats privados con el bot; grupos y canales se ignoran.
  if (msg.chat.type !== 'private' || !msg.text) return;
  const chatId = msg.chat.id;
  const start = msg.text.trim().match(/^\/start(?:@\w+)?(?:\s+(\S+))?$/);

  const linked = await getMemberByChat(tenantId, chatId);

  if (start?.[1]) {
    // Vincular: el código se consume de forma atómica (solo UNA vez).
    const [member] = await db
      .update(opsTelegramMembers)
      .set({
        telegramChatId: chatId,
        telegramUsername: msg.from?.username ?? msg.chat.username ?? null,
        linkedAt: new Date(),
        linkCode: null,
        updatedAt: new Date()
      })
      .where(and(eq(opsTelegramMembers.tenantId, tenantId), eq(opsTelegramMembers.linkCode, start[1])))
      .returning();

    if (!member) {
      // Código inválido o ya usado: un chat desconocido no recibe respuesta.
      if (linked) {
        await reply(token, chatId, 'Ese enlace no es válido o ya se usó. Pide uno nuevo en Ajustes.');
      }
      return;
    }
    // Un chat pertenece a una sola persona: si estaba vinculado a otra, se desvincula.
    await db
      .update(opsTelegramMembers)
      .set({ telegramChatId: null, telegramUsername: null, linkedAt: null })
      .where(
        and(
          eq(opsTelegramMembers.tenantId, tenantId),
          eq(opsTelegramMembers.telegramChatId, chatId),
          ne(opsTelegramMembers.id, member.id)
        )
      );
    await reply(token, chatId, `✅ Conectado, hola <b>${escapeHtml(member.username)}</b>. Aquí recibirás tus avisos.`);
    return;
  }

  // Chat no vinculado: se ignora todo lo demás.
  if (!linked) return;

  if (start) {
    await reply(token, chatId, `Ya estás conectado, <b>${escapeHtml(linked.username)}</b>. Aquí recibirás tus avisos.`);
  }
  // Cualquier otro mensaje de un chat vinculado también se ignora: el bot solo envía avisos.
}

async function handleCallback(tenantId: string, token: string, cb: TgCallbackQuery): Promise<void> {
  const answer = (text?: string, alert = false) =>
    tg(token, 'answerCallbackQuery', { callback_query_id: cb.id, ...(text ? { text, show_alert: alert } : {}) }).catch(
      () => undefined
    );

  const chatId = cb.message?.chat.id;
  const messageId = cb.message?.message_id;
  const m = cb.data?.match(/^seen:([0-9a-f-]{36})$/);
  if (!chatId || !messageId || !m) return void (await answer());

  const presser = await getMemberByChat(tenantId, chatId);
  if (!presser) return void (await answer()); // chat no vinculado: se ignora

  const [notif] = await db
    .select()
    .from(opsNotifications)
    .where(and(eq(opsNotifications.id, m[1]), eq(opsNotifications.tenantId, tenantId)))
    .limit(1);
  if (!notif || notif.kind !== 'new_request' || !notif.requestId) return void (await answer());

  const payload = notif.payload as { testMode?: boolean; sentText?: string; text: string };

  // ¿De quién es este aviso? Del responsable del encargo; en modo pruebas, del dueño.
  const expected = payload.testMode
    ? await getOwnerMember(tenantId)
    : notif.forClickupUserId
      ? await getMemberByUser(tenantId, notif.forClickupUserId)
      : null;
  if (!expected?.telegramChatId || expected.telegramChatId !== chatId || notif.chatId !== chatId) {
    return void (await answer('No puedes marcar este aviso como visto.', true));
  }

  const seenBy = payload.testMode
    ? `${presser.username} (modo pruebas · iba para ${notif.forName ?? '—'})`
    : presser.username;
  await db
    .update(opsRequests)
    .set({
      seenAt: sql`coalesce(${opsRequests.seenAt}, now())`,
      seenBy: sql`coalesce(${opsRequests.seenBy}, ${seenBy})`
    })
    .where(and(eq(opsRequests.id, notif.requestId), eq(opsRequests.tenantId, tenantId)));

  // El mensaje pierde el botón y muestra cuándo se vio (en la zona de quien lo pulsó).
  const when = new Intl.DateTimeFormat('es-ES', {
    timeZone: presser.timezone,
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date());
  await tg(token, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text: `${payload.sentText ?? payload.text}\n\n✅ <b>Visto</b> a las ${when}`,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: [] }
  }).catch(() => undefined);
  await answer('Visto ✅');
}

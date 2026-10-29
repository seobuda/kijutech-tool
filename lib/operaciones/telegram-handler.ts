// Procesa un mensaje o pulsación de botón recibido de Telegram. Lo usan por igual el
// sondeo periódico (long polling, en local) y la ruta de webhook (en un servidor).
//
// Seguridad:
//  1. Cualquier mensaje de un chat NO vinculado se ignora (sin respuesta), salvo
//     "/start <código>" con un código válido.
//  2. Cada código sirve UNA sola vez: al vincular se borra (UPDATE atómico).
//  3. "Visto" y los botones del flujo (Empezar, Bloqueado, Hecho…) solo cuentan si los pulsa el chat
//     del responsable del encargo (o el chat del dueño en modo pruebas). Aceptar, Devolver y
//     Responder solo los acepta el chat del dueño.
//  4. Los mensajes de texto de un chat vinculado solo se atienden si el bot estaba esperando una
//     respuesta (enlace, motivo, pregunta…); el resto se ignora.
import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  opsNotifications,
  opsRequests,
  opsTelegramMembers,
  opsTelegramPending,

  type OpsTelegramMember
} from '@/lib/db/schema';
import { escapeHtml, tg, type TgCallbackQuery, type TgMessage, type TgUpdate } from '@/lib/operaciones/telegram';
import {
  getMemberByChat,
  getMemberByUser,
  getOwnerMember,
  getTelegramConfig
} from '@/lib/operaciones/telegram-config';
import { logEvent, type Actor } from '@/lib/operaciones/events';
import { refreshNotice } from '@/lib/operaciones/notifications';
import { acceptWork, finishWork, getRequest, returnWork, startWork } from '@/lib/operaciones/workflow';
import { getBlocker, ownerAnswerBlocker, reportBlock } from '@/lib/operaciones/blockers';

export async function handleUpdate(tenantId: string, token: string, update: TgUpdate): Promise<void> {
  if (update.message) return handleMessage(tenantId, token, update.message);
  if (update.callback_query) return handleCallback(tenantId, token, update.callback_query);
}

async function reply(token: string, chatId: number, html: string) {
  await tg(token, 'sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true });
}

async function handleMessage(tenantId: string, token: string, msg: TgMessage): Promise<void> {
  // Solo chats privados con el bot; grupos y canales se ignoran.
  if (msg.chat.type !== 'private' || (!msg.text && !msg.photo)) return;
  const chatId = msg.chat.id;
  const text = (msg.text ?? msg.caption ?? '').trim();
  const start = (msg.text ?? '').trim().match(/^\/start(?:@\w+)?(?:\s+(\S+))?$/);

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
  // ¿El bot esperaba una respuesta de esta persona? Si no, el mensaje se ignora.
  await handlePending(tenantId, token, linked, msg, text);
}

// ---------------------------------------------------------------------------
// Conversación pendiente: el bot espera un enlace, una pregunta, un motivo o una respuesta
// ---------------------------------------------------------------------------

const PENDING_MINUTES = 30;

async function setPending(
  tenantId: string,
  chatId: number,
  kind: 'done_note' | 'done_review' | 'block_question' | 'return_reason' | 'owner_reply',
  ids: { requestId?: string; blockerId?: string }
) {
  const row = {
    tenantId,
    kind,
    requestId: ids.requestId ?? null,
    blockerId: ids.blockerId ?? null,
    expiresAt: new Date(Date.now() + PENDING_MINUTES * 60_000),
    createdAt: new Date()
  };
  await db
    .insert(opsTelegramPending)
    .values({ chatId, ...row })
    .onConflictDoUpdate({ target: opsTelegramPending.chatId, set: row });
}

const actorOf = (m: OpsTelegramMember): Actor => ({ clickupUserId: m.clickupUserId, name: m.username });

async function handlePending(
  tenantId: string,
  token: string,
  member: OpsTelegramMember,
  msg: TgMessage,
  text: string
): Promise<void> {
  const chatId = msg.chat.id;
  const [p] = await db
    .delete(opsTelegramPending)
    .where(and(eq(opsTelegramPending.chatId, chatId), eq(opsTelegramPending.tenantId, tenantId)))
    .returning();
  if (!p || p.expiresAt.getTime() < Date.now()) return; // nada esperado (o ya caducó)
  if (/^\/cancelar/i.test(text)) return void (await reply(token, chatId, 'Cancelado.'));

  const owner = await getOwnerMember(tenantId);
  const isOwner = owner?.id === member.id;
  const skip = /^\/no\b/i.test(text);

  if ((p.kind === 'done_note' || p.kind === 'done_review') && p.requestId) {
    const req = await getRequest(tenantId, p.requestId);
    if (!req) return;
    const res = await finishWork(req, actorOf(member), skip ? null : text || null, p.kind === 'done_review');
    await reply(
      token,
      chatId,
      !res.ok
        ? res.reason
        : p.kind === 'done_review' || req.reviewerKey
          ? '👀 Enviado a revisión. Te avisaré con el resultado.'
          : '✅ Hecho. La tarea queda completada.'
    );
    return;
  }

  if (p.kind === 'block_question' && p.requestId) {
    const req = await getRequest(tenantId, p.requestId);
    if (!req) return;
    const fileId = msg.photo?.length ? msg.photo[msg.photo.length - 1].file_id : null;
    if (!text && !fileId) return void (await reply(token, chatId, 'Escribe tu pregunta o manda una captura.'));
    const res = await reportBlock(req, actorOf(member), text, fileId);
    await reply(
      token,
      chatId,
      res.ok ? '🚫 Anotado. Reviso tu pregunta y te contesto por aquí en cuanto pueda.' : res.reason
    );
    return;
  }

  // Lo que sigue solo lo hace el dueño.
  if (!isOwner) return;

  if (p.kind === 'return_reason' && p.requestId) {
    const req = await getRequest(tenantId, p.requestId);
    if (!req || !text) return void (await reply(token, chatId, 'Escribe el motivo de la devolución.'));
    const res = await returnWork(req, actorOf(member), text);
    await reply(token, chatId, res.ok ? '↩️ Devuelto. La persona recibe tu motivo.' : res.reason);
    return;
  }

  if (p.kind === 'owner_reply' && p.blockerId) {
    const blocker = await getBlocker(tenantId, p.blockerId);
    if (!blocker || !text) return void (await reply(token, chatId, 'Escribe tu respuesta.'));
    const res = await ownerAnswerBlocker(blocker, actorOf(member), text);
    await reply(token, chatId, res.ok ? '💬 Enviado. La persona recibe tu respuesta y queda como comentario en ClickUp.' : res.reason);
  }
}

// ---------------------------------------------------------------------------
// Botones del flujo: st (Empezar) · bl (Bloqueado) · dn (Hecho) · dr (Hecho, ¿lo revisas?) ·
// sk (sin comentario) · ok (Aceptar) · rt (Devolver) · rp (Responder)
// ---------------------------------------------------------------------------

type Answer = (text?: string, alert?: boolean) => Promise<unknown>;

async function handleWorkflowCallback(
  tenantId: string,
  token: string,
  cb: TgCallbackQuery,
  presser: OpsTelegramMember,
  chatId: number,
  messageId: number,
  answer: Answer
): Promise<void> {
  const m = cb.data?.match(/^(st|bl|dn|dr|ok|rt|rp):([0-9a-f-]{36})$/);
  const sk = cb.data?.match(/^sk:([dr]):([0-9a-f-]{36})$/);
  if (!m && !sk) return void (await answer());
  const code = m ? m[1] : 'sk';
  const id = m ? m[2] : sk![2];

  const cfg = await getTelegramConfig(tenantId);
  const owner = await getOwnerMember(tenantId);
  const isOwner = owner?.id === presser.id;
  const actor = actorOf(presser);

  // Responder a un bloqueo: el id es el del bloqueo.
  if (code === 'rp') {
    const blocker = await getBlocker(tenantId, id);
    if (!blocker || !isOwner) return void (await answer('Solo quien lleva las operaciones puede responder.', true));
    if (blocker.status !== 'escalado') return void (await answer('Este bloqueo ya está respondido.', true));
    await setPending(tenantId, chatId, 'owner_reply', { blockerId: blocker.id });
    await answer();
    await reply(token, chatId, `💬 Escribe tu respuesta para <b>${escapeHtml(blocker.askedByName ?? 'la persona')}</b> (o /cancelar).`);
    return;
  }

  const req = await getRequest(tenantId, id);
  if (!req) return void (await answer('Encargo no encontrado.', true));

  // Aceptar y Devolver: solo el dueño. Los demás: solo el responsable (o el dueño en modo pruebas).
  const reviewerAction = code === 'ok' || code === 'rt';
  const allowed = reviewerAction
    ? isOwner
    : presser.clickupUserId === req.assigneeClickupId || (Boolean(cfg?.testMode) && isOwner);
  if (!allowed) {
    await logEvent(tenantId, { requestId: req.id, actor, type: 'button_rejected', payload: { button: code } });
    return void (await answer('No puedes usar este botón.', true));
  }

  if (code === 'st') {
    const res = await startWork(req, actor);
    return void (await answer(res.ok ? '▶️ En curso' : res.reason, !res.ok));
  }

  if (code === 'bl') {
    if (!['asignado', 'en_curso', 'devuelto'].includes(req.workStatus)) {
      return void (await answer('Este encargo ya no se puede marcar como bloqueado.', true));
    }
    await setPending(tenantId, chatId, 'block_question', { requestId: req.id });
    await answer();
    await reply(token, chatId, `🚫 <b>${escapeHtml(req.title)}</b>\n¿Qué necesitas? Escríbelo o manda una captura (o /cancelar).`);
    return;
  }

  if (code === 'dn' || code === 'dr') {
    if (!['asignado', 'en_curso', 'devuelto', 'bloqueado'].includes(req.workStatus)) {
      return void (await answer('Este encargo ya está entregado.', true));
    }
    await setPending(tenantId, chatId, code === 'dr' ? 'done_review' : 'done_note', { requestId: req.id });
    await answer();
    await tg(token, 'sendMessage', {
      chat_id: chatId,
      text: `${code === 'dr' ? '👀' : '✅'} <b>${escapeHtml(req.title)}</b>\n¿Quieres añadir un enlace o un comentario? Escríbelo, o pulsa el botón.`,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[{ text: 'Sin comentario', callback_data: `sk:${code === 'dr' ? 'r' : 'd'}:${req.id}` }]]
      }
    });
    return;
  }

  if (code === 'sk') {
    // «Sin comentario»: cierra el "Hecho" pendiente sin texto.
    const [p] = await db
      .delete(opsTelegramPending)
      .where(and(eq(opsTelegramPending.chatId, chatId), eq(opsTelegramPending.requestId, req.id)))
      .returning();
    if (!p || p.expiresAt.getTime() < Date.now()) return void (await answer('Ya está hecho o caducó.', true));
    const res = await finishWork(req, actor, null, sk![1] === 'r');
    await answer(res.ok ? 'Hecho' : res.reason, !res.ok);
    await closeButtons(token, chatId, messageId);
    if (res.ok) {
      await reply(
        token,
        chatId,
        sk![1] === 'r' || req.reviewerKey ? '👀 Enviado a revisión. Te avisaré con el resultado.' : '✅ Hecho. La tarea queda completada.'
      );
    }
    return;
  }

  if (code === 'ok') {
    const res = await acceptWork(req, actor);
    await answer(res.ok ? '✅ Aceptado' : res.reason, !res.ok);
    if (res.ok) await closeIfReviewMessage(tenantId, token, chatId, messageId);
    return;
  }

  if (code === 'rt') {
    if (req.workStatus !== 'en_revision') return void (await answer('Este encargo ya no está en revisión.', true));
    await setPending(tenantId, chatId, 'return_reason', { requestId: req.id });
    await answer();
    await reply(token, chatId, `↩️ <b>${escapeHtml(req.title)}</b>\n¿Cuál es el motivo de la devolución? Escríbelo (o /cancelar).`);
  }
}

async function closeButtons(token: string, chatId: number, messageId: number) {
  await tg(token, 'editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: [] }
  }).catch(() => undefined);
}

// Los avisos sueltos de revisión pierden sus botones al aceptarse; el resumen conserva los suyos.
async function closeIfReviewMessage(tenantId: string, token: string, chatId: number, messageId: number) {
  const [n] = await db
    .select({ kind: opsNotifications.kind })
    .from(opsNotifications)
    .where(
      and(
        eq(opsNotifications.tenantId, tenantId),
        eq(opsNotifications.chatId, chatId),
        eq(opsNotifications.telegramMessageId, messageId)
      )
    )
    .limit(1);
  if (n?.kind === 'review_request') await closeButtons(token, chatId, messageId);
}



async function handleCallback(tenantId: string, token: string, cb: TgCallbackQuery): Promise<void> {
  const answer = (text?: string, alert = false) =>
    tg(token, 'answerCallbackQuery', { callback_query_id: cb.id, ...(text ? { text, show_alert: alert } : {}) }).catch(
      () => undefined
    );

  const chatId = cb.message?.chat.id;
  const messageId = cb.message?.message_id;
  const m = cb.data?.match(/^seen:([0-9a-f-]{36})$/);
  if (!chatId || !messageId) return void (await answer());

  const presser = await getMemberByChat(tenantId, chatId);
  if (!presser) return void (await answer()); // chat no vinculado: se ignora

  // Botones del flujo de trabajo (Empezar, Bloqueado, Hecho, Aceptar, Devolver, Responder…).
  if (!m) return handleWorkflowCallback(tenantId, token, cb, presser, chatId, messageId, answer);

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

  await logEvent(tenantId, {
    requestId: notif.requestId,
    actor: { clickupUserId: presser.clickupUserId, name: presser.username },
    type: 'seen',
    payload: { testMode: Boolean(payload.testMode) }
  });
  // El aviso mantiene sus botones (Empezar, Bloqueado, Hecho…) y pierde solo «Visto».
  await refreshNotice(tenantId, notif.requestId);
  await answer('Visto ✅');
}

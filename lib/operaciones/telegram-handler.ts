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
import { getAuto, num } from '@/lib/operaciones/automations';
import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  opsNotifications,
  opsRequests,
  opsTelegramMembers,
  opsSuggestions,
  opsTelegramPending,
  type OpsTelegramMember
} from '@/lib/db/schema';
import { handleCleanupCallback, handleCleanupDateReply } from '@/lib/operaciones/cleanup';
import { clampMessage, escapeHtml, tg, tgDownloadFile, type TgCallbackQuery, type TgMessage, type TgUpdate } from '@/lib/operaciones/telegram';
import {
  getMemberByChat,
  getMemberByUser,
  getOwnerMember,
  getTelegramConfig
} from '@/lib/operaciones/telegram-config';
import { logEvent, type Actor } from '@/lib/operaciones/events';
import { refreshNotice } from '@/lib/operaciones/notifications';
import { acceptWork, finishWork, getRequest, laterWork, returnWork, startWork } from '@/lib/operaciones/workflow';
import {
  approveBlockerProposal,
  getBlocker,
  ownerAnswerBlocker,
  rejectBlockerProposal,
  reportBlock
} from '@/lib/operaciones/blockers';

import { getAction } from '@/lib/operaciones/agent-actions';
import { approveEmailReply, rejectEmailReply, renderProposal, setProposalAssignee } from '@/lib/operaciones/email-agent';
import { teamLoad } from '@/lib/operaciones/email-pm';
import { handleJornadaCallback, handleJornadaCommand, handleJornadaPending, JORNADA_COMMAND_RE } from '@/lib/operaciones/jornada-bot';
import { handleTiemposCallback, handleTiemposPending } from '@/lib/operaciones/tiempos-bot';
import { handleAutopilotCallback } from '@/lib/operaciones/autopilot';
import { AGENT_TOOL_CALLBACK_RE, decideAgentTool } from '@/lib/operaciones/agent-capabilities';
import { dispatchInbound } from '@/lib/core/capabilities';

// Botones del motor de acciones del agente: ag:<id de la acción>:ok (aprobar) | no (descartar) | ed (corregir).
export const AGENT_CALLBACK_RE = /^ag:([0-9a-f-]{36}):(ok|no|ed|re|pa|as:(\d{1,20}))$/;

// Botones del flujo: código, id del encargo (o del bloqueo) y, con varios responsables, el id
// de ClickUp de la persona a la que iba el botón. Exportado para probarlo contra los teclados
// que genera noticeKeyboard (un `\d` olvidado dejó sin efecto los botones con varios responsables).
export const FLOW_CALLBACK_RE = /^(st|lt|bl|dn|dr|ok|rt|rp):([0-9a-f-]{36})(?::(\d{1,20}))?$/;

export async function handleUpdate(tenantId: string, token: string, update: TgUpdate): Promise<void> {
  if (update.message) return handleMessage(tenantId, token, update.message);
  if (update.callback_query) return handleCallback(tenantId, token, update.callback_query);
}

async function reply(token: string, chatId: number, html: string) {
  await tg(token, 'sendMessage', { chat_id: chatId, text: html, parse_mode: 'HTML', disable_web_page_preview: true });
}

async function handleMessage(tenantId: string, token: string, msg: TgMessage): Promise<void> {
  // Solo chats privados con el bot; grupos y canales se ignoran.
  if (msg.chat.type !== 'private' || (!msg.text && !msg.photo && !msg.voice && !msg.audio)) return;
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

  // Comandos de la voz del equipo (no tocan la conversación pendiente).
  if (/^\/ayuda(?:@\w+)?(?:\s|$)/i.test(text)) return void (await reply(token, chatId, HELP_TEXT));
  // Jornada real: /empiezo, /descanso 10, /comida, /salir, /vuelvo, /termino, /ausente, /jornada.
  if (JORNADA_COMMAND_RE.test(text)) return void (await handleJornadaCommand(tenantId, token, linked, chatId, text));
  const sug = text.match(/^\/sugerencia(?:@\w+)?(?:\s+([\s\S]+))?$/i);
  if (sug) {
    const fileId = msg.photo?.length ? msg.photo[msg.photo.length - 1].file_id : null;
    const body = (sug[1] ?? '').trim();
    if (body || fileId) return void (await saveSuggestion(tenantId, token, linked, chatId, body, fileId));
    await setPending(tenantId, chatId, 'suggestion', {});
    return void (await reply(token, chatId, '💡 Cuéntame tu sugerencia: escríbela o manda una captura con su texto (o /cancelar).'));
  }
  // Audios: van al agente (los transcribe él); no consumen lo que el bot estuviera esperando por escrito.
  if (msg.voice || msg.audio) return void (await toAgent(tenantId, token, linked, msg, text));
  // ¿El bot esperaba una respuesta de esta persona? Si no, el mensaje libre va al agente (si lo hay).
  await handlePending(tenantId, token, linked, msg, text);
}

/**
 * Mensaje libre o audio → al agente, por el registro del núcleo (el módulo Agentes lo atiende; Operaciones no lo importa).
 * Si nadie lo atiende (no es el dueño o no hay agente), se ignora como antes.
 */
async function toAgent(tenantId: string, token: string, member: OpsTelegramMember, msg: TgMessage, text: string): Promise<void> {
  const owner = await getOwnerMember(tenantId);
  const file = msg.voice ?? msg.audio ?? null;
  let audio: { data: ArrayBuffer; mimeType: string; seconds: number | null } | null = null;
  if (file) {
    if ((file.file_size ?? 0) > 20 * 1024 * 1024) return void (await reply(token, msg.chat.id, 'Ese audio es demasiado largo: mándalo en trozos de menos de 20 MB.'));
    // Hasta 3 intentos (un fallo puntual de Telegram no debe perder el audio). El motivo se registra y se enseña:
    // los errores de tg()/tgDownloadFile ya vienen sin el token.
    let lastError = '';
    for (let attempt = 1; attempt <= 3 && !audio; attempt++) {
      try {
        const f = await tgDownloadFile(token, file.file_id);
        // El tipo lo da Telegram en el mensaje (audio/ogg en las notas de voz); el de la descarga es para imágenes.
        audio = { data: f.data, mimeType: file.mime_type || 'audio/ogg', seconds: file.duration ?? null };
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        console.error(`[agente] descarga de audio (intento ${attempt}):`, lastError);
        if (attempt < 3) await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }
    if (!audio) return void (await reply(token, msg.chat.id, `No he podido descargar el audio (${escapeHtml(lastError.slice(0, 200) || 'sin detalle')}). Prueba otra vez.`));
  }
  const handled = await dispatchInbound({
    tenantId,
    channel: 'telegram',
    peer: String(msg.chat.id),
    peerName: member.username,
    isOwner: owner?.id === member.id,
    clickupUserId: member.clickupUserId,
    text,
    audio
  });
  if (!handled && file) await reply(token, msg.chat.id, 'Por ahora solo entiendo audios de quien lleva las operaciones.');
}

// ---------------------------------------------------------------------------
// Conversación pendiente: el bot espera un enlace, una pregunta, un motivo o una respuesta
// ---------------------------------------------------------------------------


async function setPending(
  tenantId: string,
  chatId: number,
  kind: 'done_note' | 'done_review' | 'block_question' | 'return_reason' | 'owner_reply' | 'suggestion' | 'agent_correct',
  ids: { requestId?: string; blockerId?: string; agentActionId?: string }
) {
  const row = {
    tenantId,
    kind,
    requestId: ids.requestId ?? null,
    blockerId: ids.blockerId ?? null,
    agentActionId: ids.agentActionId ?? null,
    expiresAt: new Date(Date.now() + num(await getAuto(tenantId, 'delivery'), 'pendingMinutes') * 60_000),
    createdAt: new Date()
  };
  await db
    .insert(opsTelegramPending)
    .values({ chatId, ...row })
    .onConflictDoUpdate({ target: opsTelegramPending.chatId, set: row });
}

const HELP_TEXT = [
  '<b>Qué hace cada botón</b>',
  '',
  '▶️ <b>Empezar ahora</b>: te pones con el encargo; queda «en curso» en ClickUp.',
  '🕐 <b>Más tarde</b>: lo dejas para luego; si vence hoy te lo recuerdo.',
  '🚫 <b>Bloqueado</b>: te falta algo. Escribes tu duda (o una captura) y te contesto, o se la paso a quien lleva las operaciones.',
  '✅ <b>Hecho</b>: lo terminaste; puedes añadir un enlace o un comentario.',
  '👀 <b>Hecho, ¿lo revisas?</b>: lo terminaste pero quieres que lo revisen antes de darlo por cerrado.',
  '✅ <b>Visto</b>: solo confirma que lo has leído.',
  '',
  '<b>En una limpieza de vencidas</b>',
  '✅ <b>Ya está hecha</b>: la cierra en ClickUp.',
  '📅 <b>Nueva fecha</b>: mañana, en 3 días, la semana que viene o la que escribas.',
  '🗑 <b>Ya no aplica</b>: la descarta (queda cerrada con un comentario).',
  '⏹ <b>Parar limpieza</b>: lo que queda sigue como está.',
  '',
  '<b>Tu jornada</b>',
  '/empiezo: elige con qué tarea empiezas (así queda tu entrada).',
  '/descanso 10: descanso de 10 min (o los minutos que digas).',
  '/comida: sales a comer · /vuelvo: has vuelto de una pausa.',
  '/salir motivo: tienes que salir (el motivo queda registrado).',
  '/termino: terminas la jornada · /ausente motivo: hoy no trabajas.',
  '/jornada: cómo va tu día y los botones.',
  '🔄 <b>Cambiar tarea</b> (en el panel): el tiempo pasa a contar para la otra tarea.',
  '⏱ Al empezar una tarea te pregunto cuánto crees que te llevará; al terminarla, te digo cuánto ha sido.',
  '',
  '<b>Comandos</b>',
  '/sugerencia: cuéntanos qué mejorarías (texto o captura).',
  '/ayuda: este mensaje.',
  '/cancelar: anula lo que el bot esté esperando.'
].join('\n');

async function saveSuggestion(
  tenantId: string,
  token: string,
  member: OpsTelegramMember,
  chatId: number,
  body: string,
  fileId: string | null
) {
  await db.insert(opsSuggestions).values({
    tenantId,
    personClickupUserId: member.clickupUserId,
    personName: member.username,
    text: body.slice(0, 3000) || '(captura sin texto)',
    photoFileId: fileId
  });
  await logEvent(tenantId, { actor: { clickupUserId: member.clickupUserId, name: member.username }, type: 'suggestion', payload: { photo: Boolean(fileId) } });
  await reply(token, chatId, '💡 Gracias, anotado. Quien lleva las operaciones la verá en su próximo resumen.');
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
  if (!p || p.expiresAt.getTime() < Date.now()) return void (await toAgent(tenantId, token, member, msg, text)); // nada esperado: al agente
  if (/^\/cancelar/i.test(text)) return void (await reply(token, chatId, 'Cancelado.'));

  // Jornada real: motivo de salida o ausencia, con qué empieza, hora real de salida.
  if (p.kind.startsWith('jw')) return void (await handleJornadaPending(tenantId, token, chatId, p.kind, text, member.username));
  // Tiempos de tarea: URL de una tarea que se pasó del margen.
  if (p.kind.startsWith('ttu:')) return void (await handleTiemposPending(tenantId, token, chatId, p.kind, text));

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

  if (p.kind === 'suggestion') {
    const fileId = msg.photo?.length ? msg.photo[msg.photo.length - 1].file_id : null;
    if (!text && !fileId) return void (await reply(token, chatId, 'Escribe tu sugerencia o manda una captura con su texto.'));
    await saveSuggestion(tenantId, token, member, chatId, text, fileId);
    return;
  }

  if (p.kind === 'cleanup_date' && p.cleanupItemId) {
    if (!text) return void (await reply(token, chatId, 'Escribe la fecha (por ejemplo 24/11) o /cancelar.'));
    return void (await reply(token, chatId, await handleCleanupDateReply(tenantId, token, member, chatId, p.cleanupItemId, text)));
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

  // Motor de acciones: Enric corrige la respuesta de correo propuesta por el agente.
  if (p.kind === 'agent_correct' && p.agentActionId) {
    if (!isOwner) return;
    if (!text) return void (await reply(token, chatId, 'Escribe la respuesta corregida.'));
    const res = await approveEmailReply(tenantId, p.agentActionId, actorOf(member), 'telegram', text, { createRequests: true });
    await reply(token, chatId, res.ok ? '📧 Enviada con tu corrección.' : res.reason);
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
  const m = cb.data?.match(FLOW_CALLBACK_RE);
  const sk = cb.data?.match(/^sk:([dr]):([0-9a-f-]{36})$/);
  if (!m && !sk) return void (await answer());
  const code = m ? m[1] : 'sk';
  const id = m ? m[2] : sk![2];
  const forUser = m?.[3] ?? null; // varios responsables avisados: de quién es el botón

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
  const mine = (id: string | null) => Boolean(id) && (id === req.assigneeClickupId || (req.candidateIds ?? []).includes(id!));
  // Los demás candidatos solo pueden «Empezar» o «Más tarde» mientras nadie haya cogido la
  // tarea. Con la tarea ya en marcha, solo actúa el responsable actual: un mensaje viejo de
  // otro candidato no puede cerrarla ni quedársela.
  const candidatePhase = (code === 'st' || code === 'lt') && req.workStatus === 'asignado';
  const isAssignee = Boolean(presser.clickupUserId) && presser.clickupUserId === req.assigneeClickupId;
  const allowed = reviewerAction
    ? isOwner
    : (candidatePhase ? mine(presser.clickupUserId) : isAssignee) || (Boolean(cfg?.testMode) && isOwner);
  if (!allowed) {
    await logEvent(tenantId, { requestId: req.id, actor, type: 'button_rejected', payload: { button: code } });
    return void (await answer('No puedes usar este botón.', true));
  }

  // Cualquier botón del aviso cuenta como visto (Empezar y Más tarde lo registran en su propia acción).
  if (code === 'bl' || code === 'dn' || code === 'dr') {
    await db
      .update(opsRequests)
      .set({ seenAt: sql`coalesce(${opsRequests.seenAt}, now())`, seenBy: sql`coalesce(${opsRequests.seenBy}, ${presser.username})` })
      .where(eq(opsRequests.id, req.id));
    await logEvent(tenantId, { requestId: req.id, actor, type: 'seen', payload: { button: code } });
  }

  // Persona a la que corresponde el botón: la del aviso (varios responsables) o la que lo pulsa.
  const target = forUser && mine(forUser) ? forUser : mine(presser.clickupUserId) ? presser.clickupUserId : req.assigneeClickupId;
  const targetMember = target ? await getMemberByUser(tenantId, target) : null;

  if (code === 'st') {
    const res = await startWork(req, actor, target && targetMember ? { id: target, name: targetMember.username } : undefined);
    if (res.ok) await closeIfReviewMessage(tenantId, token, chatId, messageId);
    return void (await answer(res.ok ? '▶️ En curso' : res.reason, !res.ok));
  }

  if (code === 'lt') {
    const person = targetMember ? actorOf(targetMember) : actor;
    const res = await laterWork(req, person);
    if (res.ok) await closeIfReviewMessage(tenantId, token, chatId, messageId);
    return void (await answer(res.ok ? '🕐 Te lo recordaré' : res.reason, !res.ok));
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
  if (n?.kind === 'review_request' || n?.kind === 'reminder') await closeButtons(token, chatId, messageId);
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

  // Limpieza de vencidas (cl:…).
  if (cb.data?.startsWith('cl:')) return handleCleanupCallback(tenantId, token, cb, presser, chatId, messageId, answer);

  // Jornada real (jw:…): empezar, descansos, comida, salidas, vuelta, termino.
  if (cb.data?.startsWith('jw:')) return handleJornadaCallback(tenantId, token, cb, presser, chatId, messageId, answer);
  // Tiempos de tarea (tt:…): estimación, tipo de tarea y motivo de exceso.
  if (cb.data?.startsWith('tt:')) return handleTiemposCallback(tenantId, token, cb, presser, chatId, messageId, answer);
  // Piloto automático (ap:…): «Mover a mañana» del parte y «Pasar a autónomo» (solo el dueño).
  if (cb.data?.startsWith('ap:')) return handleAutopilotCallback(tenantId, cb, presser, answer);
  // Propuestas de un agente desde la conversación (at:ok / at:no): solo el dueño.
  const at = cb.data?.match(AGENT_TOOL_CALLBACK_RE);
  if (at) {
    const owner = await getOwnerMember(tenantId);
    if (!owner || owner.id !== presser.id) return void (await answer('Este botón es solo de quien lleva las operaciones.', true));
    const r = await decideAgentTool(tenantId, at[2], at[1] === 'ok', presser.username);
    await tg(token, 'editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }).catch(() => undefined);
    if (r.line) await reply(token, chatId, escapeHtml(r.line));
    await logEvent(tenantId, { actor: { clickupUserId: presser.clickupUserId, name: presser.username }, type: 'autonomia', payload: { kind: 'agent_tool', decision: at[1], actionId: at[2] } });
    return void (await answer(r.answer));
  }

  // Motor de acciones del agente: «✅ Enviar la propuesta» / «✖️ Descartar propuesta» (solo el dueño).
  const ag = cb.data?.match(AGENT_CALLBACK_RE);
  if (ag) {
    const owner = await getOwnerMember(tenantId);
    if (!owner || owner.id !== presser.id) {
      return void (await answer('Solo quien lleva las operaciones puede decidir las propuestas.', true));
    }
    const action = await getAction(tenantId, ag[1]);
    if (!action) return void (await answer('Propuesta no encontrada.', true));
    if (action.status !== 'propuesto') return void (await answer('Esta propuesta ya está decidida.', true));

    // «✏️ Corregir»: el bot espera el texto corregido y lo envía en lugar de la propuesta.
    if (ag[2] === 'ed') {
      if (action.kind !== 'email_reply') return void (await answer('Esta propuesta no se corrige así.', true));
      await setPending(tenantId, chatId, 'agent_correct', { agentActionId: action.id });
      await answer();
      await reply(token, chatId, '✏️ Escribe la respuesta tal como quieres que se envíe (o /cancelar).');
      return;
    }

    // «👤 Cambiar responsable»: botones con cada persona del equipo y su carga (vencidas/hoy/abiertos).
    if (ag[2] === 'pa' && action.kind === 'email_reply') {
      const loads = await teamLoad(tenantId);
      const rows = loads.map((l) => [{ text: `${l.name} · ${l.overdue}/${l.today}/${l.open}`, callback_data: `ag:${action.id}:as:${l.clickupId}` }]);
      await tg(token, 'editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: rows } }).catch(() => undefined);
      return void (await answer('Elige quién lo lleva (vencidas/hoy/abiertos)'));
    }
    if (ag[2].startsWith('as:') && ag[3]) {
      const res = await setProposalAssignee(tenantId, action.id, ag[3]);
      if (!res.ok) return void (await answer(res.reason, true));
      const view = await renderProposal(tenantId, action.id);
      if (view) {
        await tg(token, 'editMessageText', {
          chat_id: chatId,
          message_id: messageId,
          text: clampMessage(view.text),
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: { inline_keyboard: view.buttons.map((r) => r.map((b) => ({ text: b.text, callback_data: b.data }))) }
        }).catch(() => undefined);
      }
      return void (await answer('Responsable cambiado'));
    }

    const actor = actorOf(presser);
    const res =
      action.kind === 'email_reply'
        ? ag[2] === 'ok' || ag[2] === 're'
          ? await approveEmailReply(tenantId, action.id, actor, 'telegram', undefined, { createRequests: ag[2] === 'ok' })
          : await rejectEmailReply(tenantId, action.id, actor, 'telegram')
        : ag[2] === 'ok'
          ? await approveBlockerProposal(tenantId, action.id, actor, 'telegram')
          : await rejectBlockerProposal(tenantId, action.id, actor, 'telegram');
    if (res.ok) await closeButtons(token, chatId, messageId);
    const created = res.ok && 'created' in res && res.created ? ` y ${res.created} encargo(s) creado(s) en ClickUp` : '';
    return void (await answer(res.ok ? (ag[2] === 'no' ? 'Propuesta descartada' : `✅ Enviada${created}`) : res.reason, !res.ok));
  }

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

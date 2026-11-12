// Tiempos de tarea (paso 5B) en Telegram: botones tt:… (estimación, tipo de tarea, motivo de exceso) y la
// respuesta escrita con la URL. Solo cuentan si los pulsa la persona de la fila (o el dueño en modo pruebas).
// Cada respuesta queda en ops_task_times y en ops_request_events (logEvent).
import { db } from '@/lib/db/drizzle';
import { opsTelegramPending, type OpsTelegramMember } from '@/lib/db/schema';
import { getAuto, num } from '@/lib/operaciones/automations';
import { logEvent } from '@/lib/operaciones/events';
import { escapeHtml, tg, type TgCallbackQuery } from '@/lib/operaciones/telegram';
import { getOwnerMember, getTelegramConfig } from '@/lib/operaciones/telegram-config';
import { isOverReason, OVER_REASONS } from '@/lib/operaciones/tiempos-core';
import {
  getTaskTime,
  pendingJustification,
  promptNext,
  setEstimate,
  setOverReason,
  setRowType,
  submitJustification,
  TIEMPOS_CALLBACK_RE
} from '@/lib/operaciones/tiempos';

async function send(token: string, chatId: number, text: string) {
  await tg(token, 'sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true });
}

async function closeButtons(token: string, chatId: number, messageId: number) {
  await tg(token, 'editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }).catch(() => undefined);
}

async function setUrlPending(tenantId: string, chatId: number, user: string) {
  const row = {
    tenantId,
    kind: `ttu:${user}`.slice(0, 20),
    requestId: null,
    blockerId: null,
    agentActionId: null,
    expiresAt: new Date(Date.now() + num(await getAuto(tenantId, 'delivery'), 'pendingMinutes') * 60_000),
    createdAt: new Date()
  };
  await db.insert(opsTelegramPending).values({ chatId, ...row }).onConflictDoUpdate({ target: opsTelegramPending.chatId, set: row });
}

export async function handleTiemposCallback(
  tenantId: string,
  token: string,
  cb: TgCallbackQuery,
  presser: OpsTelegramMember,
  chatId: number,
  messageId: number,
  answer: (text?: string, alert?: boolean) => Promise<unknown>
): Promise<void> {
  const m = cb.data!.match(TIEMPOS_CALLBACK_RE);
  if (!m) return void (await answer());
  const [, code, arg, rowId] = m;
  const row = await getTaskTime(tenantId, rowId);
  if (!row) return void (await answer('Esta tarea ya no está.', true));
  const tcfg = await getTelegramConfig(tenantId);
  const owner = await getOwnerMember(tenantId);
  const allowed = presser.clickupUserId === row.clickupUserId || (Boolean(tcfg?.testMode) && owner?.id === presser.id);
  if (!allowed) {
    await logEvent(tenantId, { actor: { clickupUserId: presser.clickupUserId, name: presser.username }, type: 'button_rejected', payload: { button: `tt:${code}` } });
    return void (await answer('Este botón no es tuyo.', true));
  }
  const actor = { clickupUserId: row.clickupUserId, name: row.personName };

  if (code === 'e') {
    const min = Number(arg);
    const value = Number.isInteger(min) && min >= 5 && min <= 600 ? min : null;
    const r = await setEstimate(tenantId, row.id, value);
    await closeButtons(token, chatId, messageId);
    if (!r) return void (await answer('Ya estaba respondida.', true));
    await logEvent(tenantId, { requestId: row.requestId, actor, type: 'tiempos', payload: { kind: 'estimacion', minutes: value } });
    return void (await answer(value ? `⏱ Anotado: ${value} min. ¡A por ello!` : 'Vale, sin estimación.'));
  }

  if (code === 't') {
    const r = await setRowType(tenantId, row.id, arg);
    await closeButtons(token, chatId, messageId);
    if (!r) return void (await answer('Ya tenía tipo.', true));
    await logEvent(tenantId, { requestId: row.requestId, actor, type: 'tiempos', payload: { kind: 'tipo', type: arg } });
    await answer('🏷 Anotado');
    if (r.status === 'abierta') await promptNext(tenantId, r);
    return;
  }

  if (code === 'r') {
    if (!isOverReason(arg)) return void (await answer());
    const r = await setOverReason(tenantId, row.id, arg);
    await closeButtons(token, chatId, messageId);
    if (!r) return void (await answer('Ya estaba respondida.', true));
    await answer();
    await setUrlPending(tenantId, chatId, row.clickupUserId);
    return send(
      token,
      chatId,
      `📝 «${escapeHtml(OVER_REASONS[arg])}». Gracias.\nPégame la <b>URL</b> de la tarea (la página, el documento o la tarea de ClickUp) y, si quieres, una frase de qué pasó. Si no hay URL, escribe /no.`
    );
  }
  await answer();
}

/** Respuesta escrita con la URL (kind ttu:<usuario>). */
export async function handleTiemposPending(tenantId: string, token: string, chatId: number, kind: string, text: string): Promise<void> {
  const m = kind.match(/^ttu:(\d+)$/);
  if (!m) return;
  const row = await pendingJustification(tenantId, m[1]);
  if (!row) return send(token, chatId, 'No encuentro ninguna tarea pendiente de explicar.');
  const skip = /^\/no\b/i.test(text.trim());
  if (!skip && !/https?:\/\//.test(text) && text.trim().length < 3) {
    await setUrlPending(tenantId, chatId, m[1]);
    return send(token, chatId, 'Pégame la URL (empieza por https://) o escribe /no si no hay.');
  }
  await submitJustification(tenantId, row.id, skip ? null : text);
  return send(token, chatId, '✅ Anotado. Con esto ajustamos los márgenes para que sean justos.');
}


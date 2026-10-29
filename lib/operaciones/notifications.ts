// Avisos por Telegram: cola con estado en la base de datos (ops_notifications).
//  - Nunca se envía dos veces el mismo aviso: dedupe_key único (se inserta primero, se envía después).
//  - Fallidos: se reintentan con espera creciente (máx. 6 intentos).
//  - "Reclamar" un aviso (attempts+1 y next_attempt_at a +90 s) hace de candado: si el servidor
//    se cae a mitad, el aviso vuelve a intentarse; si no, nadie más lo coge.
//  - Modo pruebas: todo llega al chat del dueño indicando a quién iba dirigido.
import { randomUUID } from 'crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  opsNotifications,
  opsRequests,
  opsTelegramMembers,
  type OpsTelegramMember
} from '@/lib/db/schema';
import { clampMessage, escapeHtml, tg, TelegramError } from '@/lib/operaciones/telegram';
import {
  decodeBotToken,
  DEFAULT_TEAM_TIMEZONE,
  getMemberByUser,
  getOwnerMember,
  getTelegramConfig
} from '@/lib/operaciones/telegram-config';
import { madridNoonMs } from '@/lib/operaciones/clickup';
import { getTeamToday, type TeamMemberToday } from '@/lib/operaciones/team-today';
import type { OpsTask } from '@/lib/operaciones/clickup';

const MAX_ATTEMPTS = 6;
const LEASE_SECONDS = 90;
export const DAILY_WINDOW_MINUTES = 180; // si el servidor estuvo apagado a la hora, se envía hasta 3 h después

type Payload = {
  text: string; // cuerpo en HTML (sin la cabecera de modo pruebas)
  testMode: boolean;
  seenButton?: boolean;
  actions?: boolean; // aviso de encargo con los botones del flujo (Empezar, Bloqueado, Hecho…)
  buttons?: { text: string; data: string }[][]; // botones propios de otros avisos (revisión, bloqueo, resumen…)
  toOwner?: boolean; // aviso dirigido al dueño: en modo pruebas no lleva la cabecera "iba dirigido a"
  photoFileId?: string; // captura adjunta (file_id de Telegram)
  sentText?: string; // lo que realmente se envió (para editarlo al pulsar un botón)
  skipped?: string; // resumen omitido (p. ej. "sin tareas")
};

export type { Payload as NotificationPayload };

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

export function fmtDay(ms: number, timezone: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short'
  }).format(new Date(ms));
}

// 2-3 líneas: el "Resultado esperado" de la descripción preparada, o sus primeras líneas.
function summarize(description: string): string {
  const section = description.match(/##\s*Resultado esperado\s*\n+([\s\S]*?)(?:\n##|$)/i);
  const source = (section ? section[1] : description.replace(/^#+\s.*$/gm, '')).trim();
  const lines = source
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' ');
  return lines.length > 320 ? `${lines.slice(0, 317)}…` : lines;
}

const safeUrl = (u: string) => u.replace(/"/g, '%22');

function taskLine(t: OpsTask, timezone: string): string {
  const due = t.dueDate ? ` · ${fmtDay(t.dueDate, timezone)}` : '';
  return `• <a href="${safeUrl(t.url)}">${escapeHtml(t.name)}</a> <i>(${escapeHtml(t.listName)}${due})</i>`;
}

function section(title: string, tasks: OpsTask[], timezone: string, max = 8): string {
  if (tasks.length === 0) return '';
  const shown = tasks.slice(0, max).map((t) => taskLine(t, timezone));
  if (tasks.length > max) shown.push(`… y ${tasks.length - max} más`);
  return `<b>${title} (${tasks.length})</b>\n${shown.join('\n')}`;
}

export function buildDailyText(name: string, b: TeamMemberToday, timezone: string): string {
  const parts = [
    `☀️ <b>Buenos días, ${escapeHtml(name)}</b>`,
    section('⚠️ Vencidas', b.overdue, timezone),
    section('📅 Para hoy', b.today, timezone)
  ].filter(Boolean);
  return clampMessage(parts.join('\n\n'));
}

// ---------------------------------------------------------------------------
// Encolar: encargo nuevo
// ---------------------------------------------------------------------------

// SOLO se llama cuando ClickUp ha confirmado la tarea (estado "creado").
export async function enqueueNewRequestNotification(requestId: string): Promise<void> {
  const [req] = await db.select().from(opsRequests).where(eq(opsRequests.id, requestId)).limit(1);
  if (!req || req.status !== 'creado' || !req.clickupTaskUrl) return;

  const cfg = await getTelegramConfig(req.tenantId);
  if (!cfg) return; // Telegram no está configurado
  if (!req.assigneeClickupId) return; // sin responsable no hay a quién avisar

  const member = await getMemberByUser(req.tenantId, req.assigneeClickupId);
  const tz = member?.timezone ?? DEFAULT_TEAM_TIMEZONE;
  const due = req.dueDate ? `\n📅 Entrega: <b>${escapeHtml(fmtDay(madridNoonMs(req.dueDate), tz))}</b>` : '';
  const summary = summarize(req.preparedDescription);

  const text = clampMessage(
    [
      `📌 <b>Nuevo encargo</b>`,
      `<b>${escapeHtml(req.title)}</b>`,
      `📂 Lista: ${escapeHtml(req.clickupListName ?? '—')}${due}`,
      summary ? `\n${escapeHtml(summary)}` : '',
      `\n🔗 <a href="${safeUrl(req.clickupTaskUrl)}">Abrir la tarea en ClickUp</a>`
    ]
      .filter((l) => l !== '')
      .join('\n')
  );

  const payload: Payload = { text, testMode: cfg.testMode, seenButton: true, actions: true };
  const inserted = await db
    .insert(opsNotifications)
    .values({
      id: randomUUID(),
      tenantId: req.tenantId,
      kind: 'new_request',
      dedupeKey: `new_request:${req.id}`,
      forClickupUserId: req.assigneeClickupId,
      forName: req.assigneeName,
      requestId: req.id,
      payload
    })
    .onConflictDoNothing()
    .returning({ id: opsNotifications.id });

  if (inserted.length > 0) void processNotifications(req.tenantId);
}

// Encola un aviso del flujo (revisión, bloqueo, respuesta, devolución, resumen). Se inserta primero
// (dedupe_key único) y se envía después. Nunca lanza: un fallo de Telegram no rompe la acción.
export async function enqueueNotification(input: {
  tenantId: string;
  kind: 'review_request' | 'block_alert' | 'reply' | 'returned' | 'digest';
  dedupeKey: string;
  forClickupUserId: string | null;
  forName: string | null;
  requestId?: string | null;
  payload: Omit<Payload, 'testMode'>;
  skipped?: boolean;
}): Promise<void> {
  const cfg = await getTelegramConfig(input.tenantId);
  if (!cfg) return;
  await db
    .insert(opsNotifications)
    .values({
      tenantId: input.tenantId,
      kind: input.kind,
      dedupeKey: input.dedupeKey,
      forClickupUserId: input.forClickupUserId,
      forName: input.forName,
      requestId: input.requestId ?? null,
      payload: { ...input.payload, testMode: cfg.testMode } satisfies Payload,
      status: input.skipped ? 'enviado' : 'pendiente'
    })
    .onConflictDoNothing();
  if (!input.skipped) void processNotifications(input.tenantId);
}

// Teclado del aviso de encargo según el estado del encargo: solo se ofrece lo que tiene sentido ahora.
export function noticeKeyboard(
  req: { id: string; seenAt: Date | null; workStatus: string },
  notifId: string
): { text: string; callback_data: string }[][] {
  const rows: { text: string; callback_data: string }[][] = [];
  const open = ['asignado', 'en_curso', 'devuelto', 'bloqueado'].includes(req.workStatus);
  if (!req.seenAt) rows.push([{ text: '✅ Visto', callback_data: `seen:${notifId}` }]);
  if (!open) return rows;
  const first: { text: string; callback_data: string }[] = [];
  if (['asignado', 'devuelto', 'bloqueado'].includes(req.workStatus)) {
    first.push({ text: '▶️ Empezar', callback_data: `st:${req.id}` });
  }
  if (req.workStatus !== 'bloqueado') first.push({ text: '🚫 Bloqueado', callback_data: `bl:${req.id}` });
  if (first.length) rows.push(first);
  rows.push([
    { text: '✅ Hecho', callback_data: `dn:${req.id}` },
    { text: '👀 Hecho, ¿lo revisas?', callback_data: `dr:${req.id}` }
  ]);
  return rows;
}

const STATUS_LINE: Record<string, string> = {
  asignado: '',
  en_curso: '▶️ En curso',
  bloqueado: '🚫 Bloqueado (esperando respuesta)',
  en_revision: '👀 En revisión',
  devuelto: '↩️ Devuelto: en curso de nuevo',
  completado: '✅ Completado'
};

// Reescribe el aviso de encargo ya enviado (estado actual y botones vigentes). Nunca lanza.
export async function refreshNotice(tenantId: string, requestId: string): Promise<void> {
  try {
    const [req] = await db
      .select()
      .from(opsRequests)
      .where(and(eq(opsRequests.id, requestId), eq(opsRequests.tenantId, tenantId)))
      .limit(1);
    if (!req) return;
    const [n] = await db
      .select()
      .from(opsNotifications)
      .where(
        and(
          eq(opsNotifications.tenantId, tenantId),
          eq(opsNotifications.requestId, requestId),
          eq(opsNotifications.kind, 'new_request'),
          eq(opsNotifications.status, 'enviado')
        )
      )
      .limit(1);
    const cfg = await getTelegramConfig(tenantId);
    if (!n || !cfg || !n.chatId || !n.telegramMessageId) return;
    const payload = n.payload as Payload;
    const lines: string[] = [];
    if (req.seenAt) lines.push('✅ <b>Visto</b>');
    if (STATUS_LINE[req.workStatus]) lines.push(`<b>${STATUS_LINE[req.workStatus]}</b>`);
    const text = `${payload.sentText ?? payload.text}${lines.length ? `\n\n${lines.join(' · ')}` : ''}`;
    await tg(decodeBotToken(cfg), 'editMessageText', {
      chat_id: n.chatId,
      message_id: n.telegramMessageId,
      text: clampMessage(text),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: noticeKeyboard(req, n.id) }
    });
  } catch {
    // el mensaje pudo borrarse o no haber cambiado: no es crítico
  }
}

export async function enqueueTestNotification(tenantId: string): Promise<void> {
  await db.insert(opsNotifications).values({
    tenantId,
    kind: 'test',
    dedupeKey: `test:${Date.now()}`,
    forName: 'Dueño',
    payload: { text: '✅ Prueba de aviso: el bot de Kijutech funciona.', testMode: false } satisfies Payload
  });
  void processNotifications(tenantId);
}

// ---------------------------------------------------------------------------
// Enviar
// ---------------------------------------------------------------------------

type Claimed = {
  id: string;
  tenant_id: string;
  kind: string;
  for_clickup_user_id: string | null;
  for_name: string | null;
  request_id: string | null;
  payload: Payload;
  attempts: number;
};

async function resolveChat(
  c: Claimed
): Promise<{ chatId: number } | { error: string }> {
  // Los avisos de prueba y todo lo de modo pruebas van al dueño.
  if (c.kind === 'test' || c.payload.testMode || c.payload.toOwner) {
    const owner = await getOwnerMember(c.tenant_id);
    if (owner?.telegramChatId) return { chatId: owner.telegramChatId };
    return {
      error: `Modo pruebas: tu Telegram${owner ? ` (${owner.username})` : ''} aún no está vinculado. Vincúlalo en Ajustes → Telegram.`
    };
  }
  if (!c.for_clickup_user_id) return { error: 'El aviso no tiene destinatario' };
  const member = await getMemberByUser(c.tenant_id, c.for_clickup_user_id);
  if (member?.telegramChatId) return { chatId: member.telegramChatId };
  return { error: `${c.for_name ?? 'El destinatario'} no ha vinculado su Telegram` };
}

async function sendOne(c: Claimed): Promise<void> {
  const fail = async (message: string, retryAfterSeconds?: number) => {
    const backoff = Math.min(Math.max(retryAfterSeconds ?? 0, 30 * 2 ** Math.min(c.attempts, 6)), 3600);
    await db
      .update(opsNotifications)
      .set({
        status: 'fallido',
        lastError: message.slice(0, 500),
        nextAttemptAt: new Date(Date.now() + backoff * 1000)
      })
      .where(eq(opsNotifications.id, c.id));
  };

  const cfg = await getTelegramConfig(c.tenant_id);
  if (!cfg) return fail('Telegram no está configurado');
  const dest = await resolveChat(c);
  if ('error' in dest) return fail(dest.error);

  const header =
    c.payload.testMode && c.kind !== 'test' && !c.payload.toOwner
      ? `🧪 <i>Modo pruebas · iba dirigido a: ${escapeHtml(c.for_name ?? '—')}</i>\n\n`
      : '';
  const text = clampMessage(`${header}${c.payload.text}`);

  try {
    let keyboard: { text: string; callback_data: string }[][] | null = null;
    if (c.payload.actions) {
      const [req] = c.request_id
        ? await db.select().from(opsRequests).where(eq(opsRequests.id, c.request_id)).limit(1)
        : [];
      keyboard = req
        ? noticeKeyboard(req, c.id)
        : [[{ text: '✅ Visto', callback_data: `seen:${c.id}` }]];
    } else if (c.payload.seenButton) {
      keyboard = [[{ text: '✅ Visto', callback_data: `seen:${c.id}` }]];
    } else if (c.payload.buttons?.length) {
      keyboard = c.payload.buttons.map((row) => row.map((b) => ({ text: b.text, callback_data: b.data })));
    }
    const markup = keyboard && keyboard.length ? { reply_markup: { inline_keyboard: keyboard } } : {};
    const msg = c.payload.photoFileId
      ? await tg<{ message_id: number }>(decodeBotToken(cfg), 'sendPhoto', {
          chat_id: dest.chatId,
          photo: c.payload.photoFileId,
          caption: clampMessage(text, 1000),
          parse_mode: 'HTML',
          ...markup
        })
      : await tg<{ message_id: number }>(decodeBotToken(cfg), 'sendMessage', {
          chat_id: dest.chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          ...markup
        });
    await db
      .update(opsNotifications)
      .set({
        status: 'enviado',
        sentAt: new Date(),
        chatId: dest.chatId,
        telegramMessageId: msg.message_id,
        lastError: null,
        payload: { ...c.payload, sentText: text }
      })
      .where(eq(opsNotifications.id, c.id));
  } catch (e) {
    const err = e instanceof TelegramError ? e : null;
    await fail(err ? `Telegram: ${err.message}` : 'Error desconocido al enviar', err?.retryAfterSeconds);
  }
}

let processing = false;

// Reclama y envía los avisos pendientes/fallidos cuyo momento ha llegado.
export async function processNotifications(tenantId?: string): Promise<number> {
  if (processing) return 0; // un solo envío a la vez en este proceso
  processing = true;
  let sent = 0;
  try {
    for (let round = 0; round < 5; round++) {
      const rows = (await db.execute(sql`
        UPDATE ops_notifications
        SET attempts = attempts + 1,
            next_attempt_at = now() + make_interval(secs => ${LEASE_SECONDS})
        WHERE id IN (
          SELECT id FROM ops_notifications
          WHERE (status = 'pendiente' OR (status = 'fallido' AND attempts < ${MAX_ATTEMPTS}))
            AND next_attempt_at <= now()
            ${tenantId ? sql`AND tenant_id = ${tenantId}` : sql``}
          ORDER BY created_at
          LIMIT 10
          FOR UPDATE SKIP LOCKED)
        RETURNING id, tenant_id, kind, for_clickup_user_id, for_name, request_id, payload, attempts
      `)) as unknown as Claimed[];
      if (rows.length === 0) break;
      for (const c of rows) {
        await sendOne(c);
        sent++;
      }
    }
  } finally {
    processing = false;
  }
  return sent;
}

// Vuelve a poner un aviso fallido en la cola (botón de Ajustes).
export async function retryNotification(tenantId: string, id: string) {
  await db
    .update(opsNotifications)
    .set({ status: 'pendiente', attempts: 0, nextAttemptAt: new Date() })
    .where(and(eq(opsNotifications.id, id), eq(opsNotifications.tenantId, tenantId), eq(opsNotifications.status, 'fallido')));
  void processNotifications(tenantId);
}

// ---------------------------------------------------------------------------
// Resumen diario
// ---------------------------------------------------------------------------

export function localParts(timezone: string, now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short'
  }).formatToParts(now);
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  return {
    date: `${g('year')}-${g('month')}-${g('day')}`,
    minutes: Number(g('hour')) * 60 + Number(g('minute')),
    weekday: g('weekday') // Mon, Tue, ... Sat, Sun
  };
}

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('es-ES', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Cada persona recibe su resumen a SU hora de entrada, en SU zona horaria, de lunes a viernes.
// Se inserta primero (dedupe por persona y fecha local): un reinicio nunca duplica ni pierde el resumen
// del día, y si el servidor estuvo apagado a esa hora se envía al volver (hasta 3 h después).
export async function runDailySummaries(tenantId: string, now = new Date()): Promise<void> {
  const cfg = await getTelegramConfig(tenantId);
  if (!cfg) return;

  const members = await db
    .select()
    .from(opsTelegramMembers)
    .where(and(eq(opsTelegramMembers.tenantId, tenantId), eq(opsTelegramMembers.dailyEnabled, true)));

  const due: { member: OpsTelegramMember; key: string; tz: string }[] = [];
  for (const m of members) {
    if (!m.telegramChatId) continue; // el resumen programado es solo para personas vinculadas
    const lp = localParts(m.timezone, now);
    if (lp.weekday === 'Sat' || lp.weekday === 'Sun') continue;
    const start = toMinutes(m.workStart);
    if (lp.minutes < start || lp.minutes >= start + DAILY_WINDOW_MINUTES) continue;
    due.push({ member: m, key: `daily:${m.clickupUserId}:${lp.date}`, tz: m.timezone });
  }
  if (due.length === 0) return;

  // ¿Cuáles de hoy ya tienen su fila (enviada, omitida o pendiente)?
  const done = await db
    .select({ key: opsNotifications.dedupeKey })
    .from(opsNotifications)
    .where(and(eq(opsNotifications.tenantId, tenantId), inArray(opsNotifications.dedupeKey, due.map((d) => d.key))));
  const doneKeys = new Set(done.map((d) => d.key));
  const todo = due.filter((d) => !doneKeys.has(d.key));
  if (todo.length === 0) return;

  // Reutiliza la consulta (y la caché de 2 min) de "Equipo hoy".
  const data = await getTeamToday(tenantId);
  for (const d of todo) {
    const b = data.members.find((x) => x.member.id === d.member.clickupUserId);
    const empty = !b || (b.overdue.length === 0 && b.today.length === 0);
    const payload: Payload = empty
      ? { text: '', testMode: cfg.testMode, skipped: 'sin tareas' }
      : { text: buildDailyText(d.member.username, b!, d.tz), testMode: cfg.testMode };
    await db
      .insert(opsNotifications)
      .values({
        tenantId,
        kind: 'daily_summary',
        dedupeKey: d.key,
        forClickupUserId: d.member.clickupUserId,
        forName: d.member.username,
        payload,
        // "Si no tiene nada, no envíes mensaje": se anota como omitido y no se envía.
        status: empty ? 'enviado' : 'pendiente'
      })
      .onConflictDoNothing();
  }
  void processNotifications(tenantId);
}

// Botón "Enviar resumen ahora": fuerza el resumen con datos frescos. En modo pruebas, el de
// TODOS los miembros con tareas llega al dueño; fuera de modo pruebas, solo a los vinculados.
export async function sendDailySummariesNow(
  tenantId: string
): Promise<{ queued: number; withoutTasks: number }> {
  const cfg = await getTelegramConfig(tenantId);
  if (!cfg) throw new Error('Telegram no está configurado');

  const members = await db
    .select()
    .from(opsTelegramMembers)
    .where(eq(opsTelegramMembers.tenantId, tenantId));
  const data = await getTeamToday(tenantId, { force: true });

  let queued = 0;
  let withoutTasks = 0;
  const stamp = Date.now();
  for (const m of members) {
    if (!cfg.testMode && !m.telegramChatId) continue;
    const b = data.members.find((x) => x.member.id === m.clickupUserId);
    if (!b || (b.overdue.length === 0 && b.today.length === 0)) {
      withoutTasks++;
      continue;
    }
    await db.insert(opsNotifications).values({
      tenantId,
      kind: 'daily_summary',
      dedupeKey: `daily-manual:${m.clickupUserId}:${stamp}`,
      forClickupUserId: m.clickupUserId,
      forName: m.username,
      payload: { text: buildDailyText(m.username, b, m.timezone), testMode: cfg.testMode } satisfies Payload
    });
    queued++;
  }
  if (queued > 0) void processNotifications(tenantId);
  return { queued, withoutTasks };
}

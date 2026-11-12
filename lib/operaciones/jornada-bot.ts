// Jornada real (paso 5A) en Telegram: mensajes, teclados, comandos (/empiezo, /descanso 10, /comida,
// /salir, /vuelvo, /termino, /ausente, /jornada), botones (jw:…) y respuestas escritas (motivo de salida,
// ausencia, con qué empieza, hora real de salida). Cada acción queda en ops_work_events (jornada.ts) y en
// ops_request_events (logEvent). La entrada SIEMPRE se registra al empezar una tarea concreta.
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsNotifications, opsRequests, opsTelegramPending, opsWorkEvents, type OpsTelegramMember } from '@/lib/db/schema';
import { getAuto, num } from '@/lib/operaciones/automations';
import { logEvent } from '@/lib/operaciones/events';
import { buildDailyText, enqueueNotification } from '@/lib/operaciones/notifications';
import { escapeHtml, tg, type TgCallbackQuery } from '@/lib/operaciones/telegram';
import { getOwnerMember, getTelegramConfig } from '@/lib/operaciones/telegram-config';
import { getTeamToday } from '@/lib/operaciones/team-today';
import { startWork } from '@/lib/operaciones/workflow';
import {
  fmtDuration,
  lunchPlannedMin,
  STATUS_ICON,
  STATUS_LABEL,
  type DayState,
  type TaskRef
} from '@/lib/operaciones/jornada-core';
import {
  getPersonDay,
  jornadaSettings,
  localTimeMs,
  recordWorkEvent,
  todayIn,
  voidWorkEvent,
  type Person,
  type PersonDay
} from '@/lib/operaciones/jornada';

// jw:<código>:<dato>:<usuario de ClickUp de la persona>. El usuario va en el botón para que, en modo
// pruebas (todo llega al dueño), la acción se apunte a quien iba dirigido.
export const JORNADA_CALLBACK_RE = /^jw:([a-z]{2}):([\w-]{1,40}):(\d{1,20})$/;
export const JORNADA_COMMAND_RE = /^\/(empiezo|jornada|descanso|comida|salir|vuelvo|termino|ausente)(?:@\w+)?(?:\s+([\s\S]*))?$/i;

type Btn = { text: string; data: string };
const short = (t: string, n = 30) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);
const hm = (ms: number, tz: string) => new Intl.DateTimeFormat('es-ES', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));

// --- Teclados -------------------------------------------------------------------------------

export function panelButtons(st: DayState, user: string): Btn[][] {
  const b = (text: string, code: string, arg = '-') => ({ text, data: `jw:${code}:${arg}:${user}` });
  switch (st.status) {
    case 'trabajando':
      return [
        [b('☕ 5 min', 'br', '5'), b('☕ 10 min', 'br', '10'), b('☕ 15 min', 'br', '15')],
        [b('🍽 Voy a comer', 'lu'), b('🚪 Tengo que salir', 'ex')],
        [b('⏹ Termino', 'en')]
      ];
    case 'descanso':
    case 'comida':
      return [[b('↩️ He vuelto', 'bk')]];
    case 'fuera':
      return [[b('↩️ He vuelto', 'bk'), b('⏹ Ya no vuelvo hoy', 'en')]];
    case 'terminado':
      return [[b('▶️ Vuelvo a empezar', 'st')]];
    default:
      return [];
  }
}

export function statusText(day: PersonDay, quotaMin: number): string {
  const st = day.state;
  const tz = day.sch.timezone;
  const lines = [`${STATUS_ICON[st.status]} <b>${STATUS_LABEL[st.status]}</b>`];
  if (st.entradaAt) lines.push(`Entrada: ${hm(st.entradaAt, tz)}${st.firstTask ? ` con «${escapeHtml(st.firstTask.name)}»` : ''}`);
  if (st.current) {
    const planned = st.current.planned ? ` de ${st.current.planned} min` : '';
    lines.push(`Desde las ${hm(st.current.start, tz)}${planned}`);
  }
  if (st.entradaAt) {
    lines.push(`Hoy: ${fmtDuration(st.workedMin)} trabajadas · descansos ${fmtDuration(st.breakMin)} de ${quotaMin} min de cupo${st.lunchMin ? ` · comida ${fmtDuration(st.lunchMin)}` : ''}`);
  }
  return lines.join('\n');
}

/**
 * Mensaje para empezar: los buenos días (con las tareas vencidas y de hoy, del resumen diario) o un
 * «¿Empezamos?», con un botón por tarea. Las tareas viajan en el aviso (payload.jwTasks) para saber su
 * nombre al pulsar sin volver a preguntar a ClickUp.
 */
export async function buildStartPrompt(
  tenantId: string,
  person: Person,
  tz: string,
  kind: 'welcome' | 'ping' | 'later'
): Promise<{ text: string; buttons: Btn[][]; jwTasks: { id: string; name: string }[] }> {
  const data = await getTeamToday(tenantId);
  const b = data.members.find((x) => x.member.id === person.clickupUserId) ?? { member: { id: person.clickupUserId, username: person.name }, overdue: [], today: [] };
  const tasks = [...b.today, ...b.overdue].slice(0, 6);
  const head =
    kind === 'welcome'
      ? buildDailyText(person.name, b, tz, (await getAuto(tenantId, 'daily_team')).template)
      : `⏰ <b>¿Empezamos, ${escapeHtml(person.name)}?</b>${kind === 'ping' ? '\nAún no has marcado tu entrada.' : ''}`;
  const ask = tasks.length
    ? '<b>¿Con qué empiezas?</b> Pulsa la tarea: así queda registrada tu entrada.'
    : 'No tienes tareas con fecha para hoy. Pulsa «Otra cosa» y dime con qué empiezas.';
  const u = person.clickupUserId;
  const buttons: Btn[][] = tasks.map((t) => [{ text: `▶️ ${short(t.name)}`, data: `jw:st:${t.id}:${u}` }]);
  buttons.push([
    { text: '▶️ Otra cosa', data: `jw:st:-:${u}` },
    { text: '⏰ 15 min', data: `jw:lt:15:${u}` },
    { text: '⏰ 30 min', data: `jw:lt:30:${u}` }
  ]);
  buttons.push([{ text: '🏠 Hoy no trabajo', data: `jw:ab:-:${u}` }]);
  return { text: `${head}\n\n${ask}`, buttons, jwTasks: tasks.map((t) => ({ id: t.id, name: t.name })) };
}

// --- Envío ----------------------------------------------------------------------------------

async function send(token: string, chatId: number, text: string, buttons: Btn[][] = []) {
  await tg(token, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(buttons.length ? { reply_markup: { inline_keyboard: buttons.map((r) => r.map((x) => ({ text: x.text, callback_data: x.data }))) } } : {})
  });
}

async function closeButtons(token: string, chatId: number, messageId: number) {
  await tg(token, 'editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }).catch(() => undefined);
}

async function setJwPending(tenantId: string, chatId: number, code: 's' | 'x' | 'a' | 'f', user: string) {
  const row = {
    tenantId,
    kind: `jw${code}:${user}`.slice(0, 20),
    requestId: null,
    blockerId: null,
    agentActionId: null,
    expiresAt: new Date(Date.now() + num(await getAuto(tenantId, 'delivery'), 'pendingMinutes') * 60_000),
    createdAt: new Date()
  };
  await db.insert(opsTelegramPending).values({ chatId, ...row }).onConflictDoUpdate({ target: opsTelegramPending.chatId, set: row });
}

// --- Acciones -------------------------------------------------------------------------------

/** Nombre (y encargo) de la tarea pulsada: del encargo si existe, o del aviso que llevaba el botón. */
async function resolveTask(tenantId: string, user: string, taskId: string): Promise<TaskRef> {
  const [req] = await db
    .select({ id: opsRequests.id, title: opsRequests.title })
    .from(opsRequests)
    .where(and(eq(opsRequests.tenantId, tenantId), eq(opsRequests.clickupTaskId, taskId)))
    .limit(1);
  if (req) return { clickupTaskId: taskId, name: req.title, requestId: req.id };
  const [n] = await db
    .select({ payload: opsNotifications.payload })
    .from(opsNotifications)
    .where(
      and(
        eq(opsNotifications.tenantId, tenantId),
        eq(opsNotifications.kind, 'jornada'),
        eq(opsNotifications.forClickupUserId, user),
        sql`${opsNotifications.payload}->'jwTasks' @> ${JSON.stringify([{ id: taskId }])}::jsonb`
      )
    )
    .orderBy(desc(opsNotifications.createdAt))
    .limit(1);
  const t = ((n?.payload as { jwTasks?: { id: string; name: string }[] } | undefined)?.jwTasks ?? []).find((x) => x.id === taskId);
  return { clickupTaskId: taskId, name: t?.name ?? '(tarea de ClickUp)', requestId: null };
}

async function doStart(tenantId: string, token: string, chatId: number, person: Person, task: TaskRef): Promise<void> {
  const res = await recordWorkEvent(tenantId, person, 'entrada', { source: 'telegram', task });
  if (!res.ok) return send(token, chatId, res.reason);
  // Si la tarea es un encargo suyo sin empezar, queda «en curso» también (ClickUp vía bandeja de salida).
  if (task.requestId) {
    const [req] = await db.select().from(opsRequests).where(eq(opsRequests.id, task.requestId)).limit(1);
    const mine = req && (req.assigneeClickupId === person.clickupUserId || (req.candidateIds ?? []).includes(person.clickupUserId));
    if (req && mine && ['asignado', 'devuelto', 'bloqueado'].includes(req.workStatus)) {
      await startWork(req, { clickupUserId: person.clickupUserId, name: person.name }, { id: person.clickupUserId, name: person.name });
    }
  }
  const cfg = await jornadaSettings(tenantId);
  await send(
    token,
    chatId,
    `▶️ <b>Entrada registrada a las ${hm(res.day.state.entradaAt!, res.day.sch.timezone)}</b> con «${escapeHtml(task.name)}». ¡A por ello!\n\nDescansos de hoy: cupo de ${cfg.breakQuotaMin} min. Usa los botones o /descanso 10, /comida, /salir y /termino.`,
    panelButtons(res.day.state, person.clickupUserId)
  );
}

async function doAction(
  tenantId: string,
  token: string,
  chatId: number,
  person: Person,
  kind: 'descanso' | 'comida' | 'salida_urgente' | 'vuelta' | 'salida' | 'ausencia',
  opts: { planned?: number | null; reason?: string | null } = {}
): Promise<void> {
  const before = await getPersonDay(tenantId, person.clickupUserId);
  const res = await recordWorkEvent(tenantId, person, kind, { source: 'telegram', plannedMinutes: opts.planned ?? null, reason: opts.reason ?? null });
  if (!res.ok) return send(token, chatId, res.reason, before ? panelButtons(before.state, person.clickupUserId) : []);
  const cfg = await jornadaSettings(tenantId);
  const st = res.day.state;
  const tz = res.day.sch.timezone;
  let text: string;
  if (kind === 'descanso') {
    const over = st.breakMin + (opts.planned ?? 0) - cfg.breakQuotaMin;
    text = `☕ <b>Descanso de ${opts.planned} min</b>. Te aviso al terminar.${over > 0 ? `\n⚠️ Con este, hoy pasas tu cupo de ${cfg.breakQuotaMin} min en ${over} min.` : `\nLlevas ${st.breakMin} de ${cfg.breakQuotaMin} min de cupo.`}`;
  } else if (kind === 'comida') {
    text = `🍽 <b>Buen provecho.</b> Tienes ${fmtDuration(opts.planned ?? 60)}; pulsa «He vuelto» al volver.`;
  } else if (kind === 'salida_urgente') {
    text = '🚪 <b>Anotado.</b> Queda en tu registro de hoy. Pulsa «He vuelto» al volver o «Ya no vuelvo hoy».';
  } else if (kind === 'vuelta') {
    const last = st.pauses[st.pauses.length - 1];
    const dur = last?.end ? Math.round((last.end - last.start) / 60000) : 0;
    const over = last?.planned && dur > last.planned ? ` (${dur - last.planned} min más de lo previsto)` : '';
    text = `↩️ <b>De vuelta.</b> Pausa de ${fmtDuration(dur)}${over}.`;
  } else if (kind === 'salida') {
    text = `⏹ <b>Jornada terminada a las ${hm(st.salidaAt!, tz)}.</b>\nHoy: ${fmtDuration(st.workedMin)} trabajadas · ${st.breakCount} descanso(s) (${fmtDuration(st.breakMin)})${st.lunchMin ? ` · comida ${fmtDuration(st.lunchMin)}` : ''}. ¡Hasta mañana!`;
  } else {
    text = `🏠 <b>Anotado: hoy no trabajas</b>${opts.reason ? ` («${escapeHtml(opts.reason)}»)` : ''}. No te escribo más hoy.`;
  }
  await send(token, chatId, text, panelButtons(st, person.clickupUserId));
}

// --- Entrada desde el manejador de Telegram -------------------------------------------------

const personOf = (m: OpsTelegramMember): Person => ({ clickupUserId: m.clickupUserId, name: m.username });

/** Comandos escritos. Siempre se aplican a quien escribe. */
export async function handleJornadaCommand(tenantId: string, token: string, member: OpsTelegramMember, chatId: number, text: string): Promise<void> {
  const m = text.match(JORNADA_COMMAND_RE);
  if (!m) return;
  const cfg = await jornadaSettings(tenantId);
  if (!cfg.enabled) return send(token, chatId, 'La jornada real aún no está activada.');
  const person = personOf(member);
  const cmd = m[1].toLowerCase();
  const arg = (m[2] ?? '').trim();
  const day = await getPersonDay(tenantId, person.clickupUserId);
  if (!day) return send(token, chatId, 'No tienes ficha en Equipo: pide que te la creen.');

  if (cmd === 'jornada') return send(token, chatId, statusText(day, cfg.breakQuotaMin), panelButtons(day.state, person.clickupUserId));
  if (cmd === 'empiezo') {
    if (day.state.status === 'trabajando') return send(token, chatId, 'Ya estás trabajando.', panelButtons(day.state, person.clickupUserId));
    const p = await buildStartPrompt(tenantId, person, day.sch.timezone, 'later');
    return send(token, chatId, p.text, p.buttons);
  }
  if (cmd === 'descanso') {
    const n = Number(arg.match(/\d+/)?.[0]);
    if (Number.isFinite(n) && n >= 1 && n <= 60) return doAction(tenantId, token, chatId, person, 'descanso', { planned: n });
    return send(token, chatId, '¿Cuánto descanso? Pulsa o escribe /descanso 10.', panelButtons(day.state, person.clickupUserId).slice(0, 1));
  }
  if (cmd === 'comida') return doAction(tenantId, token, chatId, person, 'comida', { planned: lunchPlannedMin(day.sch.lunchStart, day.sch.lunchEnd) });
  if (cmd === 'vuelvo') return doAction(tenantId, token, chatId, person, 'vuelta');
  if (cmd === 'termino') return doAction(tenantId, token, chatId, person, 'salida');
  if (cmd === 'salir') {
    if (arg.length >= 3) return doAction(tenantId, token, chatId, person, 'salida_urgente', { reason: arg });
    if (day.state.status !== 'trabajando') return send(token, chatId, 'Solo puedes marcar una salida mientras trabajas.');
    await setJwPending(tenantId, chatId, 'x', person.clickupUserId);
    return send(token, chatId, '🚪 ¿Por qué tienes que salir? Escríbelo: queda en tu registro de hoy (o /cancelar).');
  }
  if (cmd === 'ausente') {
    if (arg.length >= 3) return doAction(tenantId, token, chatId, person, 'ausencia', { reason: arg });
    await setJwPending(tenantId, chatId, 'a', person.clickupUserId);
    return send(token, chatId, '🏠 ¿Por qué no trabajas hoy? (vacaciones, médico…) Escríbelo (o /cancelar).');
  }
}

/** Respuesta escrita a una pregunta de la jornada (kind jw<código>:<usuario>). */
export async function handleJornadaPending(tenantId: string, token: string, chatId: number, kind: string, text: string, presserName: string): Promise<void> {
  const m = kind.match(/^jw([sxaf]):(\d+)$/);
  if (!m) return;
  const user = m[2];
  const day = await getPersonDay(tenantId, user);
  if (!day) return;
  const person: Person = { clickupUserId: user, name: day.person.name };
  const clean = text.trim().slice(0, 500);
  if (m[1] !== 'f' && clean.length < 3) {
    await setJwPending(tenantId, chatId, m[1] as 's' | 'x' | 'a', user);
    return send(token, chatId, 'Escríbelo con un poco más de detalle (o /cancelar).');
  }
  if (m[1] === 's') return doStart(tenantId, token, chatId, person, { name: clean, clickupTaskId: null, requestId: null });
  if (m[1] === 'x') return doAction(tenantId, token, chatId, person, 'salida_urgente', { reason: clean });
  if (m[1] === 'a') return doAction(tenantId, token, chatId, person, 'ausencia', { reason: clean });

  // Hora real de salida tras un cierre automático.
  const hhmm = clean.match(/^(\d{1,2})[:.h](\d{2})$/);
  if (!hhmm || Number(hhmm[1]) > 23 || Number(hhmm[2]) > 59) {
    await setJwPending(tenantId, chatId, 'f', user);
    return send(token, chatId, 'Escribe la hora así: 18:30 (o /cancelar).');
  }
  const [auto] = await db
    .select()
    .from(opsWorkEvents)
    .where(and(eq(opsWorkEvents.tenantId, tenantId), eq(opsWorkEvents.clickupUserId, user), eq(opsWorkEvents.kind, 'salida'), eq(opsWorkEvents.source, 'auto'), isNull(opsWorkEvents.voidedAt)))
    .orderBy(desc(opsWorkEvents.at))
    .limit(1);
  if (!auto) return send(token, chatId, 'No encuentro ninguna salida automática pendiente de corregir.');
  const at = localTimeMs(day.sch.timezone, auto.workDate, `${hhmm[1].padStart(2, '0')}:${hhmm[2]}`);
  const [prev] = await db
    .select({ at: opsWorkEvents.at })
    .from(opsWorkEvents)
    .where(and(eq(opsWorkEvents.tenantId, tenantId), eq(opsWorkEvents.clickupUserId, user), eq(opsWorkEvents.workDate, auto.workDate), isNull(opsWorkEvents.voidedAt), sql`${opsWorkEvents.id} <> ${auto.id}`))
    .orderBy(desc(opsWorkEvents.at))
    .limit(1);
  if (prev && at <= prev.at.getTime()) return send(token, chatId, `Esa hora es anterior a tu último registro de ese día (${hm(prev.at.getTime(), day.sch.timezone)}).`);
  await voidWorkEvent(tenantId, auto.id, presserName, 'Corregido por la persona desde Telegram');
  await db.insert(opsWorkEvents).values({
    tenantId,
    profileId: auto.profileId,
    clickupUserId: user,
    personName: auto.personName,
    workDate: auto.workDate,
    kind: 'salida',
    at: new Date(at),
    source: 'correccion',
    createdByName: presserName,
    reason: 'Hora indicada por la persona tras el cierre automático'
  });
  await logEvent(tenantId, { actor: { clickupUserId: user, name: auto.personName }, type: 'jornada', payload: { kind: 'salida_corregida', date: auto.workDate } });
  await send(token, chatId, `✅ Corregido: el ${auto.workDate} saliste a las ${hhmm[1].padStart(2, '0')}:${hhmm[2]}.`);
}

/** Botones jw:… Solo cuentan si los pulsa la persona (o el dueño en modo pruebas). */
export async function handleJornadaCallback(
  tenantId: string,
  token: string,
  cb: TgCallbackQuery,
  presser: OpsTelegramMember,
  chatId: number,
  messageId: number,
  answer: (text?: string, alert?: boolean) => Promise<unknown>
): Promise<void> {
  const m = cb.data!.match(JORNADA_CALLBACK_RE);
  if (!m) return void (await answer());
  const [, code, arg, user] = m;
  const tcfg = await getTelegramConfig(tenantId);
  const owner = await getOwnerMember(tenantId);
  const allowed = presser.clickupUserId === user || (Boolean(tcfg?.testMode) && owner?.id === presser.id);
  if (!allowed) {
    await logEvent(tenantId, { actor: personOf(presser), type: 'button_rejected', payload: { button: `jw:${code}` } });
    return void (await answer('Este botón no es tuyo.', true));
  }
  const day = await getPersonDay(tenantId, user);
  if (!day) return void (await answer('No tienes ficha en Equipo.', true));
  const person: Person = { clickupUserId: user, name: day.person.name };
  const sch = day.sch;

  switch (code) {
    case 'st': {
      await answer();
      if (arg === '-' && day.state.status !== 'terminado') {
        await setJwPending(tenantId, chatId, 's', user);
        return send(token, chatId, '▶️ ¿Con qué empiezas? Escribe la tarea (o /cancelar).');
      }
      if (arg === '-') return doStart(tenantId, token, chatId, person, { name: 'Vuelta al trabajo', clickupTaskId: null, requestId: null });
      if (day.state.status === 'sin_empezar' || day.state.status === 'terminado' || day.state.status === 'ausente') await closeButtons(token, chatId, messageId);
      return doStart(tenantId, token, chatId, person, await resolveTask(tenantId, user, arg));
    }
    case 'lt': {
      const min = Math.min(Math.max(Number(arg) || 15, 5), 120);
      if (day.state.status !== 'sin_empezar') return void (await answer('Ya has empezado o marcado el día.', true));
      const p = await buildStartPrompt(tenantId, person, sch.timezone, 'later');
      await enqueueNotification({
        tenantId,
        kind: 'jornada',
        dedupeKey: `jw:later:${user}:${todayIn(sch.timezone)}:${Date.now()}`,
        forClickupUserId: user,
        forName: person.name,
        payload: { text: p.text, buttons: p.buttons, jwTasks: p.jwTasks },
        notBefore: new Date(Date.now() + min * 60_000)
      });
      await logEvent(tenantId, { actor: person, type: 'jornada', payload: { kind: 'aplazado', minutes: min } });
      await closeButtons(token, chatId, messageId);
      return void (await answer(`⏰ Te escribo en ${min} min`));
    }
    case 'ab':
      await answer();
      if (day.state.status !== 'sin_empezar') return send(token, chatId, 'Ya has empezado la jornada de hoy.');
      await setJwPending(tenantId, chatId, 'a', user);
      return send(token, chatId, '🏠 ¿Por qué no trabajas hoy? (vacaciones, médico…) Escríbelo (o /cancelar).');
    case 'br': {
      await answer();
      const min = Math.min(Math.max(Number(arg) || 10, 1), 60);
      return doAction(tenantId, token, chatId, person, 'descanso', { planned: min });
    }
    case 'lu':
      await answer();
      return doAction(tenantId, token, chatId, person, 'comida', { planned: lunchPlannedMin(sch.lunchStart, sch.lunchEnd) });
    case 'ex':
      await answer();
      if (day.state.status !== 'trabajando') return send(token, chatId, 'Solo puedes marcar una salida mientras trabajas.');
      await setJwPending(tenantId, chatId, 'x', user);
      return send(token, chatId, '🚪 ¿Por qué tienes que salir? Escríbelo: queda en tu registro de hoy (o /cancelar).');
    case 'bk':
      await answer();
      await closeButtons(token, chatId, messageId);
      return doAction(tenantId, token, chatId, person, 'vuelta');
    case 'en':
      await answer();
      await closeButtons(token, chatId, messageId);
      return doAction(tenantId, token, chatId, person, 'salida');
    case 'go':
      await logEvent(tenantId, { actor: person, type: 'jornada', payload: { kind: 'sigue_trabajando' } });
      await closeButtons(token, chatId, messageId);
      return void (await answer('Vale. Pulsa «Termino» al acabar.'));
    case 'mo': {
      // «5 min más» de descanso: se vuelve a preguntar en N min (lo previsto no cambia: el exceso cuenta).
      const cur = day.state.current;
      if (!cur || cur.kind !== 'descanso') return void (await answer('Ya no estás en descanso.', true));
      const min = Math.min(Math.max(Number(arg) || 5, 1), 30);
      await enqueueNotification({
        tenantId,
        kind: 'jornada',
        dedupeKey: `jw:brk:${cur.eventId}:${Date.now()}`,
        forClickupUserId: user,
        forName: person.name,
        payload: { text: '☕ <b>¿Has vuelto del descanso?</b>', buttons: [[{ text: '↩️ He vuelto', data: `jw:bk:-:${user}` }]] },
        notBefore: new Date(Date.now() + min * 60_000)
      });
      await logEvent(tenantId, { actor: person, type: 'jornada', payload: { kind: 'descanso_ampliado', minutes: min } });
      await closeButtons(token, chatId, messageId);
      return void (await answer(`Vale, ${min} min más (cuenta como descanso).`));
    }
    case 'ly': {
      // «Ya comí»: la comida se apunta en el hueco de la ficha si no hay nada registrado después.
      await answer();
      await closeButtons(token, chatId, messageId);
      if (!sch.lunchStart || !sch.lunchEnd || day.state.status !== 'trabajando') return send(token, chatId, 'Usa /comida la próxima vez al salir a comer.');
      const s = localTimeMs(sch.timezone, day.date, sch.lunchStart);
      const e = localTimeMs(sch.timezone, day.date, sch.lunchEnd);
      const clash = day.events.some((x) => x.at >= s);
      if (clash || !day.state.entradaAt || day.state.entradaAt >= s) return send(token, chatId, 'No puedo apuntarla en el hueco de tu ficha porque hay registros en medio. Avísale a quien lleva las operaciones para corregirla.');
      const r1 = await recordWorkEvent(tenantId, person, 'comida', { source: 'telegram', at: new Date(s), plannedMinutes: lunchPlannedMin(sch.lunchStart, sch.lunchEnd), reason: 'Declarada después (no se marcó al salir)' });
      if (r1.ok) await recordWorkEvent(tenantId, person, 'vuelta', { source: 'telegram', at: new Date(e) });
      return send(token, chatId, `🍽 Apuntada la comida de ${sch.lunchStart} a ${sch.lunchEnd}. La próxima vez márcala con /comida al salir.`);
    }
    case 'ln':
      await logEvent(tenantId, { actor: person, type: 'jornada', payload: { kind: 'sin_comida' } });
      await closeButtons(token, chatId, messageId);
      return void (await answer('Anotado: hoy sin comida.'));
    case 'fo':
      await logEvent(tenantId, { actor: person, type: 'jornada', payload: { kind: 'cierre_confirmado', date: arg } });
      await closeButtons(token, chatId, messageId);
      return void (await answer('Gracias, queda así.'));
    case 'fx':
      await answer();
      await closeButtons(token, chatId, messageId);
      await setJwPending(tenantId, chatId, 'f', user);
      return send(token, chatId, '✏️ ¿A qué hora saliste? Escríbela así: 18:30 (o /cancelar).');
    case 'pn': {
      const cfg = await jornadaSettings(tenantId);
      await answer();
      return send(token, chatId, statusText(day, cfg.breakQuotaMin), panelButtons(day.state, user));
    }
    default:
      return void (await answer());
  }
}

/** Reutilizado por «Enviarme una prueba» (Automatizaciones): buenos días del dueño. */
export async function jornadaTestPrompt(tenantId: string, owner: OpsTelegramMember): Promise<{ text: string; buttons: Btn[][]; jwTasks: { id: string; name: string }[] }> {
  const day = await getPersonDay(tenantId, owner.clickupUserId);
  return buildStartPrompt(tenantId, personOf(owner), day?.sch.timezone ?? 'Europe/Madrid', 'welcome');
}

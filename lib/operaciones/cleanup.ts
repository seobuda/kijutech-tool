// Limpieza asistida de tareas vencidas (paso 7). El bot envía a cada persona sus tareas vencidas de ClickUp
// (de los espacios seleccionados) de una en una, con botones para cerrarlas, reprogramarlas o descartarlas.
//  - Cada tanda es una fila de ops_cleanup_runs y cada tarea una fila de ops_cleanup_items.
//  - Todo cambio en ClickUp pasa por la bandeja de salida (ops_clickup_outbox); todo aviso, por ops_notifications.
//  - Modo pruebas: todo llega al dueño; las tareas de OTRAS personas se SIMULAN (se registran, no se escribe en ClickUp).
//  - Las tareas cerradas o descartadas aquí no cuentan como «Trabajo de este mes» y los cambios de una limpieza no
//    cuentan como actividad del cliente (ver getCleanupTouched, que usa client-activity.ts).
import { and, asc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  opsCleanupItems,
  opsCleanupRuns,
  opsClickupLists,
  opsTelegramPending,
  type OpsCleanupItem,
  type OpsCleanupRun,
  type OpsTelegramMember
} from '@/lib/db/schema';
import { getClickUpToken } from '@/lib/operaciones/queries';
import { getListStatuses } from '@/lib/operaciones/clickup';
import { getTeamToday } from '@/lib/operaciones/team-today';
import { getAuto, num, renderTemplate, DEF } from '@/lib/operaciones/automations';
import { enqueueNotification, fmtDay } from '@/lib/operaciones/notifications';
import { enqueueOutbox } from '@/lib/operaciones/outbox';
import { logEvent } from '@/lib/operaciones/events';
import { getStatusMapFor } from '@/lib/operaciones/status-map';
import { getOwnerMember, getTelegramConfig } from '@/lib/operaciones/telegram-config';
import { getMemberTimezone, listProfiles } from '@/lib/operaciones/team-profiles';
import { clampMessage, escapeHtml, tg, type TgCallbackQuery } from '@/lib/operaciones/telegram';

const OPS_TZ = 'Europe/Madrid';
const DAY_MS = 24 * 3600 * 1000;

type Button = { text: string; data: string };
type Answer = (text?: string, alert?: boolean) => Promise<unknown>;

// ---------------------------------------------------------------------------
// Fechas (días naturales de Madrid)
// ---------------------------------------------------------------------------

export function todayYmd(now = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: OPS_TZ }).format(new Date(now));
}

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Lunes de la semana que viene (si hoy es lunes, el siguiente).
function nextMondayYmd(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
  return addDays(ymd, ((1 - dow + 7) % 7) || 7);
}

const fmtYmd = (ymd: string) =>
  new Intl.DateTimeFormat('es-ES', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${ymd}T12:00:00Z`));

// «24/11», «24/11/2026» o «mañana». Devuelve YYYY-MM-DD o un motivo de rechazo.
export function parseUserDate(raw: string, now = Date.now()): { ok: true; ymd: string } | { ok: false; error: string } {
  const text = raw.trim().toLowerCase();
  const today = todayYmd(now);
  if (text === 'mañana' || text === 'manana') return { ok: true, ymd: addDays(today, 1) };
  const m = text.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/);
  if (!m) return { ok: false, error: 'No entiendo esa fecha. Escríbela como 24/11 o 24/11/2026.' };
  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = m[3] ? Number(m[3]) : Number(today.slice(0, 4));
  if (m[3] && m[3].length === 2) year += 2000;
  const ymd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const check = new Date(`${ymd}T12:00:00Z`);
  if (Number.isNaN(check.getTime()) || check.getUTCDate() !== day || check.getUTCMonth() + 1 !== month) {
    return { ok: false, error: 'Esa fecha no existe. Escríbela como 24/11 o 24/11/2026.' };
  }
  if (ymd < today) return { ok: false, error: 'Esa fecha ya pasó. Escribe una fecha de hoy en adelante.' };
  if (ymd > addDays(today, 730)) return { ok: false, error: 'Esa fecha queda muy lejos. Escribe otra.' };
  return { ok: true, ymd };
}

// ---------------------------------------------------------------------------
// Mensaje de cada tarea
// ---------------------------------------------------------------------------

const safeUrl = (u: string) => u.replace(/"/g, '%22');

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

async function itemCard(run: OpsCleanupRun, item: OpsCleanupItem): Promise<string> {
  const tz = await getMemberTimezone(run.tenantId, run.clickupUserId);
  let due = '';
  if (item.dueMs) {
    const days = Math.max(0, Math.round((Date.parse(`${todayYmd()}T12:00:00Z`) - Date.parse(`${new Date(item.dueMs).toLocaleDateString('en-CA', { timeZone: OPS_TZ })}T12:00:00Z`)) / DAY_MS));
    due = ` · 📅 venció el ${escapeHtml(fmtDay(item.dueMs, tz))}${days > 0 ? ` (hace ${plural(days, 'día', 'días')})` : ''}`;
  }
  const link = item.taskUrl ? `<a href="${safeUrl(item.taskUrl)}">${escapeHtml(item.taskName)}</a>` : `<b>${escapeHtml(item.taskName)}</b>`;
  return `🧹 <b>Limpieza · ${item.position} de ${run.total}</b>\n${link}\n📂 ${escapeHtml(item.listName ?? '—')}${due}`;
}

function itemButtons(item: OpsCleanupItem, run: OpsCleanupRun): Button[][] {
  return [
    [
      { text: '✅ Ya está hecha', data: `cl:d:${item.id}` },
      { text: '📅 Nueva fecha', data: `cl:n:${item.id}` }
    ],
    [{ text: '🗑 Ya no aplica', data: `cl:x:${item.id}` }],
    [{ text: '⏹ Parar limpieza', data: `cl:s:${run.id}` }]
  ];
}

// ---------------------------------------------------------------------------
// Lanzar una limpieza
// ---------------------------------------------------------------------------

export type StartResult = {
  started: { name: string; total: number; more: number }[];
  skipped: { name: string; reason: string }[];
};

export async function startCleanup(
  tenantId: string,
  opts: { clickupUserId: string | 'all'; startedBy: string }
): Promise<{ ok: true; result: StartResult } | { ok: false; error: string }> {
  const auto = await getAuto(tenantId, 'cleanup');
  if (!auto.enabled) return { ok: false, error: 'La limpieza de vencidas está apagada en Automatizaciones.' };
  const cfg = await getTelegramConfig(tenantId);
  if (!cfg) return { ok: false, error: 'Telegram no está configurado.' };
  const owner = await getOwnerMember(tenantId);
  if (cfg.testMode && !owner?.telegramChatId) {
    return { ok: false, error: 'Modo pruebas: tu Telegram aún no está vinculado (Ajustes → Telegram).' };
  }

  let today;
  try {
    today = await getTeamToday(tenantId, { force: true });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudieron leer las tareas de ClickUp.' };
  }
  const profiles = await listProfiles(tenantId);
  const active = new Set(profiles.filter((p) => p.active && p.clickupUserId).map((p) => p.clickupUserId!));
  const max = num(auto, 'maxTasks');
  const result: StartResult = { started: [], skipped: [] };

  const targets = today.members.filter((m) => (opts.clickupUserId === 'all' ? active.has(m.member.id) : m.member.id === opts.clickupUserId));
  if (targets.length === 0) return { ok: false, error: 'No se encontró a esa persona entre los miembros de ClickUp.' };

  for (const t of targets) {
    const name = t.member.username;
    if (t.overdue.length === 0) {
      result.skipped.push({ name, reason: 'no tiene tareas vencidas' });
      continue;
    }
    if (!cfg.testMode) {
      const [linked] = await db.execute(sql`
        SELECT 1 AS ok FROM ops_telegram_members
        WHERE tenant_id = ${tenantId} AND clickup_user_id = ${t.member.id} AND telegram_chat_id IS NOT NULL`) as unknown as { ok: number }[];
      if (!linked) {
        result.skipped.push({ name, reason: 'no ha vinculado su Telegram' });
        continue;
      }
    }
    // Si quedaba una limpieza a medias de esta persona, se da por parada y se empieza de nuevo.
    const [previous] = await db
      .select()
      .from(opsCleanupRuns)
      .where(and(eq(opsCleanupRuns.tenantId, tenantId), eq(opsCleanupRuns.clickupUserId, t.member.id), eq(opsCleanupRuns.status, 'en_curso')))
      .limit(1);
    if (previous) await finishRun(previous.id, 'parada', { silent: true });

    const tasks = t.overdue.slice(0, max); // ya vienen de la más antigua a la más reciente
    const simulated = cfg.testMode && owner?.clickupUserId !== t.member.id;
    const [run] = await db
      .insert(opsCleanupRuns)
      .values({ tenantId, clickupUserId: t.member.id, personName: name, startedBy: opts.startedBy, total: tasks.length })
      .returning();
    await db.insert(opsCleanupItems).values(
      tasks.map((task, i) => ({
        runId: run.id,
        position: i + 1,
        clickupTaskId: task.id,
        taskName: task.name.slice(0, 500),
        taskUrl: task.url,
        listId: task.listId,
        listName: task.listName,
        dueMs: task.dueDate
      }))
    );
    await logEvent(tenantId, {
      actor: { clickupUserId: t.member.id, name },
      type: 'cleanup_started',
      payload: { runId: run.id, total: tasks.length, simulated, startedBy: opts.startedBy }
    });
    const more = t.overdue.length - tasks.length;
    await sendNext(run.id, { intro: { name, more } });
    result.started.push({ name, total: tasks.length, more });
  }
  return { ok: true, result };
}

// Envía la siguiente tarea pendiente de la tanda (o la cierra si no quedan).
async function sendNext(runId: string, opts: { intro?: { name: string; more: number } } = {}): Promise<void> {
  const [run] = await db.select().from(opsCleanupRuns).where(eq(opsCleanupRuns.id, runId)).limit(1);
  if (!run || run.status !== 'en_curso') return;
  const [item] = await db
    .update(opsCleanupItems)
    .set({ status: 'enviada' })
    .where(
      sql`${opsCleanupItems.id} = (SELECT id FROM ops_cleanup_items WHERE run_id = ${runId} AND status = 'pendiente' ORDER BY position LIMIT 1)`
    )
    .returning();
  if (!item) return void (await finishRun(runId, 'completada'));

  let text = await itemCard(run, item);
  if (opts.intro) {
    const auto = await getAuto(run.tenantId, 'cleanup');
    const intro = renderTemplate(DEF.get('cleanup')!, auto.template, { nombre: escapeHtml(opts.intro.name), total: String(run.total) });
    text = `${intro}${opts.intro.more > 0 ? `\n<i>(Quedan ${opts.intro.more} más para otra tanda.)</i>` : ''}\n\n${text}`;
  }
  await enqueueNotification({
    tenantId: run.tenantId,
    kind: 'cleanup',
    dedupeKey: `cleanup:${item.id}`,
    forClickupUserId: run.clickupUserId,
    forName: run.personName,
    payload: { text: clampMessage(text), buttons: itemButtons(item, run) }
  });
}

// Cierra la tanda (una sola vez): da las gracias y deja el evento que recoge el resumen del dueño.
async function finishRun(runId: string, status: 'completada' | 'parada', opts: { silent?: boolean } = {}): Promise<void> {
  const [run] = await db
    .update(opsCleanupRuns)
    .set({ status, finishedAt: new Date() })
    .where(and(eq(opsCleanupRuns.id, runId), eq(opsCleanupRuns.status, 'en_curso')))
    .returning();
  if (!run) return;
  const left = await db
    .update(opsCleanupItems)
    .set({ status: 'omitida' })
    .where(and(eq(opsCleanupItems.runId, runId), inArray(opsCleanupItems.status, ['pendiente', 'enviada'])))
    .returning({ id: opsCleanupItems.id });
  const [fresh] = await db
    .update(opsCleanupRuns)
    .set({ skipped: sql`${opsCleanupRuns.skipped} + ${left.length}` })
    .where(eq(opsCleanupRuns.id, runId))
    .returning();
  const r = fresh ?? run;
  const reviewed = r.closed + r.rescheduled + r.discarded;

  const cfg = await getTelegramConfig(run.tenantId);
  const owner = await getOwnerMember(run.tenantId);
  const simulated = Boolean(cfg?.testMode) && owner?.clickupUserId !== run.clickupUserId;
  await logEvent(run.tenantId, {
    actor: { clickupUserId: run.clickupUserId, name: run.personName },
    type: 'cleanup_finished',
    payload: { runId, status, reviewed, closed: r.closed, rescheduled: r.rescheduled, discarded: r.discarded, skipped: r.skipped, total: r.total, simulated }
  });
  if (opts.silent) return;

  const parts = [
    r.closed ? plural(r.closed, 'cerrada', 'cerradas') : '',
    r.rescheduled ? `${plural(r.rescheduled, 'con nueva fecha', 'con nueva fecha')}` : '',
    r.discarded ? plural(r.discarded, 'descartada', 'descartadas') : ''
  ].filter(Boolean);
  const detail = parts.length ? `: ${parts.join(', ').replace(/, ([^,]*)$/, ' y $1')}` : '';
  const text =
    status === 'completada'
      ? `🙌 <b>Gracias, ${escapeHtml(run.personName)}.</b> Has revisado ${reviewed}${detail}.`
      : `⏹ <b>Limpieza parada.</b> Has revisado ${reviewed} de ${r.total}${detail}. Lo que queda sigue vencido.`;
  await enqueueNotification({
    tenantId: run.tenantId,
    kind: 'cleanup_summary',
    dedupeKey: `cleanup_summary:${runId}`,
    forClickupUserId: run.clickupUserId,
    forName: run.personName,
    payload: { text }
  });
}

// ---------------------------------------------------------------------------
// Botones
// ---------------------------------------------------------------------------

async function pickStatus(tenantId: string, listId: string | null, kind: 'done' | 'discard'): Promise<string | null> {
  if (!listId) return null;
  const [list] = await db
    .select({ statuses: opsClickupLists.statuses })
    .from(opsClickupLists)
    .where(and(eq(opsClickupLists.tenantId, tenantId), eq(opsClickupLists.clickupListId, listId)))
    .limit(1);
  let statuses = list?.statuses ?? null;
  if (!statuses || statuses.length === 0) {
    const conn = await getClickUpToken(tenantId);
    if (conn) statuses = await getListStatuses(conn.token, listId).catch(() => null);
  }
  const byType = (type: string) => statuses?.find((s) => s.type === type)?.status ?? null;
  const mapped = (await getStatusMapFor(tenantId, listId)).done;
  return kind === 'done' ? (mapped ?? byType('done') ?? byType('closed')) : (byType('closed') ?? byType('done') ?? mapped);
}

async function allowedToPress(run: OpsCleanupRun, presser: OpsTelegramMember): Promise<boolean> {
  if (presser.clickupUserId === run.clickupUserId) return true;
  const cfg = await getTelegramConfig(run.tenantId);
  const owner = await getOwnerMember(run.tenantId);
  return Boolean(cfg?.testMode) && owner?.id === presser.id;
}

async function editMessage(token: string, chatId: number, messageId: number, text: string, buttons: Button[][] = []) {
  await tg(token, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text: clampMessage(text),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: { inline_keyboard: buttons.map((row) => row.map((b) => ({ text: b.text, callback_data: b.data }))) }
  }).catch(() => undefined);
}

// Mensaje enviado de una tarea (por si hay que editarlo sin haber recibido el botón, p. ej. «Escribir fecha»).
async function sentMessageOf(item: OpsCleanupItem): Promise<{ chatId: number; messageId: number } | null> {
  const [n] = (await db.execute(sql`
    SELECT chat_id, telegram_message_id FROM ops_notifications
    WHERE dedupe_key = ${`cleanup:${item.id}`} AND status = 'enviado'`)) as unknown as { chat_id: string | null; telegram_message_id: string | null }[];
  return n?.chat_id && n.telegram_message_id ? { chatId: Number(n.chat_id), messageId: Number(n.telegram_message_id) } : null;
}

type Outcome = { kind: 'done' } | { kind: 'discard' } | { kind: 'date'; ymd: string };

// Aplica la decisión: marca la tarea (una sola vez), encola el cambio en ClickUp (salvo simulación) y avanza.
async function resolveItem(
  run: OpsCleanupRun,
  item: OpsCleanupItem,
  outcome: Outcome,
  actorName: string
): Promise<{ ok: true; line: string } | { ok: false; reason: string }> {
  const cfg = await getTelegramConfig(run.tenantId);
  const owner = await getOwnerMember(run.tenantId);
  const simulated = Boolean(cfg?.testMode) && owner?.clickupUserId !== run.clickupUserId;

  let status: string | null = null;
  if (outcome.kind !== 'date') {
    status = await pickStatus(run.tenantId, item.listId, outcome.kind);
    if (!status) return { ok: false, reason: 'No encuentro un estado de «hecho» o «cerrado» en esa lista. Ciérrala en ClickUp.' };
  }

  const newStatus = outcome.kind === 'done' ? 'cerrada' : outcome.kind === 'discard' ? 'descartada' : 'reprogramada';
  const [claimed] = await db
    .update(opsCleanupItems)
    .set({ status: newStatus, answeredAt: new Date(), newDue: outcome.kind === 'date' ? outcome.ymd : null })
    .where(and(eq(opsCleanupItems.id, item.id), eq(opsCleanupItems.status, 'enviada')))
    .returning();
  if (!claimed) return { ok: false, reason: 'Esta tarea ya estaba respondida.' };

  await db
    .update(opsCleanupRuns)
    .set(
      outcome.kind === 'done'
        ? { closed: sql`${opsCleanupRuns.closed} + 1` }
        : outcome.kind === 'discard'
          ? { discarded: sql`${opsCleanupRuns.discarded} + 1` }
          : { rescheduled: sql`${opsCleanupRuns.rescheduled} + 1` }
    )
    .where(eq(opsCleanupRuns.id, run.id));

  if (!simulated) {
    if (outcome.kind === 'date') {
      await enqueueOutbox({
        tenantId: run.tenantId,
        action: 'set_due',
        payload: { taskId: item.clickupTaskId, dueYmd: outcome.ymd },
        dedupeKey: `cleanup:${item.id}:date`
      });
    } else {
      await enqueueOutbox({
        tenantId: run.tenantId,
        action: 'set_status',
        payload: { taskId: item.clickupTaskId, status: status! },
        dedupeKey: `cleanup:${item.id}:status`
      });
      if (outcome.kind === 'discard') {
        await enqueueOutbox({
          tenantId: run.tenantId,
          action: 'comment',
          payload: { taskId: item.clickupTaskId, text: `Descartada en la limpieza de vencidas por ${run.personName}: ya no aplica.` },
          dedupeKey: `cleanup:${item.id}:comment`
        });
      }
    }
  }
  await logEvent(run.tenantId, {
    actor: { clickupUserId: run.clickupUserId, name: run.personName },
    type: outcome.kind === 'done' ? 'cleanup_done' : outcome.kind === 'discard' ? 'cleanup_discarded' : 'cleanup_rescheduled',
    payload: { runId: run.id, itemId: item.id, taskId: item.clickupTaskId, taskName: item.taskName, simulated, pressedBy: actorName, ...(outcome.kind === 'date' ? { newDue: outcome.ymd } : {}), ...(status ? { status } : {}) }
  });

  const sim = simulated ? ' <i>(simulado: no se tocó ClickUp)</i>' : '';
  const line =
    outcome.kind === 'done'
      ? `✅ <b>Cerrada</b> en «${escapeHtml(status!)}»${sim}`
      : outcome.kind === 'discard'
        ? `🗑 <b>Descartada</b> («${escapeHtml(status!)}»)${sim}`
        : `📅 <b>Nueva fecha: ${escapeHtml(fmtYmd(outcome.ymd))}</b>${sim}`;
  return { ok: true, line };
}

export async function handleCleanupCallback(
  tenantId: string,
  token: string,
  cb: TgCallbackQuery,
  presser: OpsTelegramMember,
  chatId: number,
  messageId: number,
  answer: Answer
): Promise<void> {
  const m = cb.data?.match(/^cl:([dxnbwts]):([0-9a-f-]{36})(?::(1|3|w))?$/);
  if (!m) return void (await answer());
  const [, code, id, opt] = m;

  // «Parar»: el id es el de la tanda; los demás botones llevan el de la tarea.
  if (code === 's') {
    const [run] = await db.select().from(opsCleanupRuns).where(and(eq(opsCleanupRuns.id, id), eq(opsCleanupRuns.tenantId, tenantId))).limit(1);
    if (!run) return void (await answer('Limpieza no encontrada.', true));
    if (!(await allowedToPress(run, presser))) return void (await answer('No puedes usar este botón.', true));
    if (run.status !== 'en_curso') return void (await answer('Esta limpieza ya terminó.', true));
    await finishRun(run.id, 'parada');
    await answer('Limpieza parada');
    await editMessage(token, chatId, messageId, `${await stoppedCard(id)}\n\n⏹ <b>Limpieza parada</b>`);
    return;
  }

  const [item] = await db.select().from(opsCleanupItems).where(eq(opsCleanupItems.id, id)).limit(1);
  const [run] = item ? await db.select().from(opsCleanupRuns).where(and(eq(opsCleanupRuns.id, item.runId), eq(opsCleanupRuns.tenantId, tenantId))).limit(1) : [];
  if (!item || !run) return void (await answer('Tarea no encontrada.', true));
  if (!(await allowedToPress(run, presser))) {
    await logEvent(tenantId, { actor: { clickupUserId: presser.clickupUserId, name: presser.username }, type: 'button_rejected', payload: { button: `cl:${code}` } });
    return void (await answer('No puedes usar este botón.', true));
  }
  if (run.status !== 'en_curso' || item.status !== 'enviada') return void (await answer('Esta tarea ya estaba respondida.', true));

  const card = await itemCard(run, item);

  if (code === 'n') {
    await answer();
    await editMessage(token, chatId, messageId, `${card}\n\n📅 <b>¿Para cuándo?</b>`, [
      [
        { text: 'Mañana', data: `cl:t:${item.id}:1` },
        { text: 'En 3 días', data: `cl:t:${item.id}:3` }
      ],
      [
        { text: 'La semana que viene', data: `cl:t:${item.id}:w` },
        { text: '✍️ Escribir fecha', data: `cl:w:${item.id}` }
      ],
      [{ text: '⬅️ Volver', data: `cl:b:${item.id}` }]
    ]);
    return;
  }
  if (code === 'b') {
    await answer();
    await editMessage(token, chatId, messageId, card, itemButtons(item, run));
    return;
  }
  if (code === 'w') {
    await setDatePending(run, chatId, item.id);
    await answer();
    await tg(token, 'sendMessage', {
      chat_id: chatId,
      parse_mode: 'HTML',
      text: `✍️ Escribe la nueva fecha de <b>${escapeHtml(item.taskName)}</b> (por ejemplo 24/11 o 24/11/2026), o /cancelar.`,
      disable_web_page_preview: true
    });
    return;
  }

  const outcome: Outcome =
    code === 'd'
      ? { kind: 'done' }
      : code === 'x'
        ? { kind: 'discard' }
        : { kind: 'date', ymd: opt === '1' ? addDays(todayYmd(), 1) : opt === '3' ? addDays(todayYmd(), 3) : nextMondayYmd(todayYmd()) };
  const res = await resolveItem(run, item, outcome, presser.username);
  if (!res.ok) return void (await answer(res.reason, true));
  await answer('Hecho');
  await editMessage(token, chatId, messageId, `${card}\n\n${res.line}`);
  await sendNext(run.id);
}

// Tarjeta de la tarea que se estaba viendo al parar (ya pasó a «omitida»: la primera omitida por posición).
async function stoppedCard(runId: string): Promise<string> {
  const [target] = await db
    .select()
    .from(opsCleanupItems)
    .where(and(eq(opsCleanupItems.runId, runId), eq(opsCleanupItems.status, 'omitida')))
    .orderBy(asc(opsCleanupItems.position))
    .limit(1);
  const [run] = target ? await db.select().from(opsCleanupRuns).where(eq(opsCleanupRuns.id, runId)).limit(1) : [];
  return target && run ? itemCard(run, target) : '🧹 <b>Limpieza</b>';
}

// ---------------------------------------------------------------------------
// «✍️ Escribir fecha»: el bot espera un texto de esa persona
// ---------------------------------------------------------------------------

async function setDatePending(run: OpsCleanupRun, chatId: number, itemId: string) {
  const minutes = num(await getAuto(run.tenantId, 'delivery'), 'pendingMinutes');
  const row = {
    tenantId: run.tenantId,
    kind: 'cleanup_date',
    requestId: null,
    blockerId: null,
    cleanupItemId: itemId,
    expiresAt: new Date(Date.now() + minutes * 60_000),
    createdAt: new Date()
  };
  await db
    .insert(opsTelegramPending)
    .values({ chatId, ...row })
    .onConflictDoUpdate({ target: opsTelegramPending.chatId, set: row });
}

export async function handleCleanupDateReply(
  tenantId: string,
  token: string,
  member: OpsTelegramMember,
  chatId: number,
  itemId: string,
  text: string
): Promise<string> {
  const [item] = await db.select().from(opsCleanupItems).where(eq(opsCleanupItems.id, itemId)).limit(1);
  const [run] = item ? await db.select().from(opsCleanupRuns).where(and(eq(opsCleanupRuns.id, item.runId), eq(opsCleanupRuns.tenantId, tenantId))).limit(1) : [];
  if (!item || !run || run.status !== 'en_curso' || item.status !== 'enviada') return 'Esa tarea ya estaba respondida.';
  if (!(await allowedToPress(run, member))) return 'No puedes responder a esta limpieza.';

  const parsed = parseUserDate(text);
  if (!parsed.ok) {
    await setDatePending(run, chatId, itemId); // sigue esperando una fecha válida
    return `${parsed.error} (O /cancelar.)`;
  }
  const res = await resolveItem(run, item, { kind: 'date', ymd: parsed.ymd }, member.username);
  if (!res.ok) return res.reason;
  const sent = await sentMessageOf(item);
  if (sent) await editMessage(token, sent.chatId, sent.messageId, `${await itemCard(run, item)}\n\n${res.line}`);
  await sendNext(run.id);
  return res.line.replace(/<[^>]+>/g, '');
}

// ---------------------------------------------------------------------------
// Para el resumen del dueño y para las cuentas de actividad por cliente
// ---------------------------------------------------------------------------

// Tareas tocadas por una limpieza desde una fecha (cerradas, reprogramadas o descartadas).
export async function getCleanupTouched(
  tenantId: string,
  sinceMs: number
): Promise<{ taskId: string; status: string; answeredAt: Date; listName: string | null; taskName: string; taskUrl: string | null; personName: string }[]> {
  const rows = await db
    .select({
      taskId: opsCleanupItems.clickupTaskId,
      status: opsCleanupItems.status,
      answeredAt: opsCleanupItems.answeredAt,
      listName: opsCleanupItems.listName,
      taskName: opsCleanupItems.taskName,
      taskUrl: opsCleanupItems.taskUrl,
      personName: opsCleanupRuns.personName
    })
    .from(opsCleanupItems)
    .innerJoin(opsCleanupRuns, eq(opsCleanupRuns.id, opsCleanupItems.runId))
    .where(
      and(
        eq(opsCleanupRuns.tenantId, tenantId),
        inArray(opsCleanupItems.status, ['cerrada', 'reprogramada', 'descartada']),
        gte(opsCleanupItems.answeredAt, new Date(sinceMs))
      )
    );
  return rows.filter((r): r is typeof r & { answeredAt: Date } => r.answeredAt !== null);
}

// Estado de las limpiezas para Equipo: la tanda activa o la última de cada persona.
export async function getCleanupStatus(tenantId: string): Promise<Record<string, { status: string; reviewed: number; total: number; at: number }>> {
  const rows = (await db.execute(sql`
    SELECT DISTINCT ON (clickup_user_id) clickup_user_id, status, closed + rescheduled + discarded AS reviewed, total,
           coalesce(finished_at, started_at) AS at
    FROM ops_cleanup_runs WHERE tenant_id = ${tenantId}
    ORDER BY clickup_user_id, started_at DESC`)) as unknown as { clickup_user_id: string; status: string; reviewed: number; total: number; at: string }[];
  return Object.fromEntries(rows.map((r) => [r.clickup_user_id, { status: r.status, reviewed: Number(r.reviewed), total: r.total, at: new Date(r.at).getTime() }]));
}

// Personas con ficha activa y el estado de su última limpieza (para los botones de Equipo y Automatizaciones).
export type CleanupPerson = { id: string; name: string; status: { status: string; reviewed: number; total: number; at: number } | null };

export async function getCleanupPeople(tenantId: string): Promise<CleanupPerson[]> {
  const [profiles, status] = await Promise.all([listProfiles(tenantId), getCleanupStatus(tenantId)]);
  return profiles
    .filter((p) => p.active && p.clickupUserId)
    .map((p) => ({ id: p.clickupUserId!, name: p.name, status: status[p.clickupUserId!] ?? null }));
}

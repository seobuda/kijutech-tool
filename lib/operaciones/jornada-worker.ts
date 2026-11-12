// Jornada real (paso 5A): planificador (cada 30 s, desde telegram-worker.ts). Por persona con ficha activa:
//  1. A su hora de entrada: buenos días con sus tareas y botones para empezar (sustituye al resumen diario).
//  2. Si no empieza: vuelve a avisar cada N min (Telegram + correo), hasta el máximo; nunca marca la entrada.
//  3. Descanso cumplido → «¿Has vuelto?». Comida más larga de lo previsto → «¿Has vuelto de comer?».
//  4. Pasado el hueco de comida sin marcarla → pregunta (no la supone).
//  5. Al final de su horario → «¿Terminas?». Pasado el margen sin «Termino» → cierre automático marcado,
//     y en los siguientes buenos días se le pregunta si la hora es correcta.
// Todo mensaje pasa por ops_notifications (clave única: nunca se repite) y toda acción por logEvent.
import { and, desc, eq, gte, isNull, like } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsNotifications, opsWorkEvents } from '@/lib/db/schema';
import { enqueueNotification } from '@/lib/operaciones/notifications';
import { getOwnerMember, getTelegramConfig } from '@/lib/operaciones/telegram-config';
import { opsTelegramMembers } from '@/lib/db/schema';
import { getEmailConfig, sendInternalEmail } from '@/lib/operaciones/resend';
import { htmlToPlain } from '@/lib/operaciones/telegram';
import { fmtDuration, lunchPlannedMin } from '@/lib/operaciones/jornada-core';
import {
  getCurrentDays,
  isWorkDay,
  jornadaSettings,
  localTimeMs,
  memberEmail,
  recordWorkEvent,
  scheduledBounds,
  todayIn,
  type PersonDay
} from '@/lib/operaciones/jornada';
import { buildStartPrompt } from '@/lib/operaciones/jornada-bot';

const WELCOME_WINDOW_MS = 3 * 3600_000; // si el servidor estuvo apagado a esa hora, hasta 3 h después
const OPEN = ['trabajando', 'descanso', 'comida', 'fuera'];
const hm = (ms: number, tz: string) => new Intl.DateTimeFormat('es-ES', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));

type Note = { key: string; status: string; sentAt: Date | null; createdAt: Date };

export async function runJornada(tenantId: string, now = new Date()): Promise<void> {
  const cfg = await jornadaSettings(tenantId);
  if (!cfg.enabled) return;
  const tcfg = await getTelegramConfig(tenantId);
  if (!tcfg) return;
  const nowMs = now.getTime();
  const days = await getCurrentDays(tenantId, now);
  if (days.size === 0) return;
  // Quien lleva las operaciones no ficha; el resto, solo con su Telegram vinculado (en modo pruebas todo va al dueño).
  const owner = await getOwnerMember(tenantId);
  const linked = new Set(
    (await db.select({ u: opsTelegramMembers.clickupUserId, chat: opsTelegramMembers.telegramChatId }).from(opsTelegramMembers).where(eq(opsTelegramMembers.tenantId, tenantId)))
      .filter((m) => m.chat)
      .map((m) => m.u)
  );

  const notes: Note[] = await db
    .select({ key: opsNotifications.dedupeKey, status: opsNotifications.status, sentAt: opsNotifications.sentAt, createdAt: opsNotifications.createdAt })
    .from(opsNotifications)
    .where(and(eq(opsNotifications.tenantId, tenantId), eq(opsNotifications.kind, 'jornada'), gte(opsNotifications.createdAt, new Date(nowMs - 40 * 3600_000))));
  const has = (key: string) => notes.some((n) => n.key === key);

  for (const [u, d] of days) {
    if (u === owner?.clickupUserId || (!tcfg.testMode && !linked.has(u))) continue;
    try {
      await runPerson(tenantId, cfg, d, u, notes, has, nowMs);
    } catch (e) {
      console.error(`[jornada] ${d.person.name}:`, e instanceof Error ? e.message : e);
    }
  }
}

async function queue(tenantId: string, d: PersonDay, key: string, text: string, buttons: { text: string; data: string }[][] = [], extra: Record<string, unknown> = {}) {
  return enqueueNotification({
    tenantId,
    kind: 'jornada',
    dedupeKey: key,
    forClickupUserId: d.person.clickupUserId,
    forName: d.person.name,
    payload: { text, buttons: buttons.length ? buttons : undefined, ...extra }
  });
}

async function runPerson(
  tenantId: string,
  cfg: Awaited<ReturnType<typeof jornadaSettings>>,
  d: PersonDay,
  u: string,
  notes: Note[],
  has: (k: string) => boolean,
  nowMs: number
) {
  const sch = d.sch;
  const tz = sch.timezone;
  const today = todayIn(tz, new Date(nowMs));
  const st = d.state;
  const b = (text: string, code: string, arg = '-') => ({ text, data: `jw:${code}:${arg}:${u}` });

  // 1-2. Buenos días y reintentos (solo un día laborable, sin haber empezado ni marcado ausencia).
  if (d.date === today && st.status === 'sin_empezar' && isWorkDay(sch, today)) {
    const { start, end } = scheduledBounds(sch, today);
    const welcomeKey = `jw:welcome:${u}:${today}`;
    if (!has(welcomeKey) && nowMs >= start && nowMs < start + WELCOME_WINDOW_MS) {
      const p = await buildStartPrompt(tenantId, d.person, tz, 'welcome');
      await queue(tenantId, d, welcomeKey, p.text, p.buttons, { jwTasks: p.jwTasks });
      await askAboutAutoClose(tenantId, d);
      return;
    }
    if (has(welcomeKey) && nowMs < end) {
      const prompts = notes.filter((n) => n.key === welcomeKey || n.key.startsWith(`jw:ping:${u}:${today}:`) || n.key.startsWith(`jw:later:${u}:${today}:`));
      if (prompts.some((n) => n.status !== 'enviado')) return; // aún en cola o programado («Empezaré en…»)
      const last = Math.max(...prompts.map((n) => (n.sentAt ?? n.createdAt).getTime()));
      const pings = notes.filter((n) => n.key.startsWith(`jw:ping:${u}:${today}:`)).length;
      if (pings < cfg.maxPings && nowMs - last >= cfg.repingMin * 60_000) {
        const key = `jw:ping:${u}:${today}:${pings + 1}`;
        const p = await buildStartPrompt(tenantId, d.person, tz, 'ping');
        const inserted = await queue(tenantId, d, key, p.text, p.buttons, { jwTasks: p.jwTasks });
        notes.push({ key, status: 'pendiente', sentAt: null, createdAt: new Date(nowMs) });
        if (inserted && cfg.emailPing) await emailPing(tenantId, d, key, pings + 1);
      }
    }
    return;
  }

  if (!OPEN.includes(st.status)) return;
  const bounds = scheduledBounds(sch, d.date);

  // 3. Descanso cumplido / comida larga.
  const cur = st.current;
  if (cur?.kind === 'descanso' && cur.planned && nowMs >= cur.start + cur.planned * 60_000) {
    await queue(tenantId, d, `jw:brk:${cur.eventId}`, `☕ <b>Se acabó tu descanso de ${cur.planned} min.</b> ¿Has vuelto?`, [[b('↩️ He vuelto', 'bk'), b('☕ 5 min más', 'mo', '5')]]);
  }
  if (cur?.kind === 'comida') {
    const planned = cur.planned ?? lunchPlannedMin(sch.lunchStart, sch.lunchEnd);
    if (nowMs >= cur.start + (planned + cfg.lunchMarginMin) * 60_000) {
      await queue(tenantId, d, `jw:lunchover:${cur.eventId}`, `🍽 <b>Llevas ${fmtDuration(Math.round((nowMs - cur.start) / 60000))} comiendo</b> (tu ficha: ${fmtDuration(planned)}). ¿Has vuelto?`, [[b('↩️ He vuelto', 'bk')]]);
    }
  }

  // 4. Comida sin marcar: pasado su hueco (más el margen) sin ninguna comida registrada.
  if (st.status === 'trabajando' && d.date === today && sch.lunchStart && sch.lunchEnd && !st.pauses.some((p) => p.kind === 'comida')) {
    const ls = localTimeMs(tz, today, sch.lunchStart);
    const le = localTimeMs(tz, today, sch.lunchEnd);
    if (st.entradaAt! < ls && nowMs >= le + cfg.lunchMarginMin * 60_000 && nowMs < bounds.end) {
      await queue(tenantId, d, `jw:lunchq:${u}:${today}`, '🍽 <b>No has marcado la comida.</b> ¿Has comido ya?', [
        [b(`✅ Sí, de ${sch.lunchStart} a ${sch.lunchEnd}`, 'ly')],
        [b('🍽 Voy ahora', 'lu'), b('🚫 Hoy no como', 'ln')]
      ]);
    }
  }

  // 5. Fin del horario: «¿Terminas?» y, pasado el margen, cierre automático marcado.
  if (nowMs >= bounds.end && nowMs < bounds.end + cfg.autoCloseMin * 60_000) {
    const text = `🏁 <b>Tu horario termina a las ${hm(bounds.end, tz)}.</b>\nHoy: ${fmtDuration(st.workedMin)} trabajadas · ${st.breakCount} descanso(s) (${fmtDuration(st.breakMin)}). ¿Terminas?`;
    await queue(tenantId, d, `jw:endq:${u}:${d.date}`, text, [[b('⏹ Termino', 'en'), b('⏳ Sigo un rato', 'go')]]);
  }
  if (nowMs >= bounds.end + cfg.autoCloseMin * 60_000) {
    // Hora del cierre: el inicio de la pausa en curso, o el fin del horario (o su último registro si fue más tarde).
    const at = cur ? cur.start : Math.max(bounds.end, st.lastEventAt ?? 0);
    const res = await recordWorkEvent(tenantId, d.person, 'salida', {
      source: 'auto',
      at: new Date(Math.min(at, nowMs)),
      reason: 'Cierre automático: no marcó «Termino»'
    });
    if (!res.ok) console.error(`[jornada] cierre automático de ${d.person.name}: ${res.reason}`);
  }
}

/** En los buenos días: si su último cierre fue automático, pregunta una vez si la hora es correcta. */
async function askAboutAutoClose(tenantId: string, d: PersonDay) {
  const u = d.person.clickupUserId;
  const [auto] = await db
    .select()
    .from(opsWorkEvents)
    .where(and(eq(opsWorkEvents.tenantId, tenantId), eq(opsWorkEvents.clickupUserId, u), eq(opsWorkEvents.kind, 'salida'), eq(opsWorkEvents.source, 'auto'), isNull(opsWorkEvents.voidedAt), gte(opsWorkEvents.at, new Date(Date.now() - 7 * 86400_000))))
    .orderBy(desc(opsWorkEvents.at))
    .limit(1);
  if (!auto) return;
  const [asked] = await db
    .select({ id: opsNotifications.id })
    .from(opsNotifications)
    .where(and(eq(opsNotifications.tenantId, tenantId), like(opsNotifications.dedupeKey, `jw:fixq:${u}:${auto.workDate}`)))
    .limit(1);
  if (asked) return;
  const b = (text: string, code: string) => ({ text, data: `jw:${code}:${auto.workDate}:${u}` });
  await queue(
    tenantId,
    d,
    `jw:fixq:${u}:${auto.workDate}`,
    `✏️ El ${auto.workDate} no marcaste «Termino» y tu jornada se cerró sola a las <b>${hm(auto.at.getTime(), d.sch.timezone)}</b>. ¿Es correcto?`,
    [[b('✅ Sí, correcto', 'fo'), b('✏️ Salí a otra hora', 'fx')]]
  );
}

async function emailPing(tenantId: string, d: PersonDay, key: string, n: number) {
  try {
    // En modo pruebas el correo va al dueño (la copia oculta del buzón), nunca a la persona.
    const testMode = Boolean((await getTelegramConfig(tenantId))?.testMode);
    const ecfg = await getEmailConfig(tenantId);
    const to = testMode ? ecfg.bcc : await memberEmail(tenantId, d.person.clickupUserId);
    if (!to || !ecfg.apiKey) return;
    await sendInternalEmail(ecfg, {
      to,
      subject: `${testMode ? `[Modo pruebas · iba para ${d.person.name}] ` : ''}¿Empiezas, ${d.person.name}? Aún no has marcado tu entrada`,
      text: htmlToPlain(
        `Hola, ${d.person.name}:\n\nAún no has marcado tu entrada de hoy (aviso ${n}). Abre Telegram y pulsa la tarea con la que empiezas, o «Hoy no trabajo» si no vas a trabajar.\n\nEquipo Kijutech`
      ),
      idempotencyKey: key
    });
  } catch (e) {
    console.error(`[jornada] correo a ${d.person.name}:`, e instanceof Error ? e.message : e);
  }
}

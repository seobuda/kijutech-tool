// Tiempos de tarea (paso 5B): base de datos y mensajes. El cálculo puro está en tiempos-core.ts.
// Se engancha a la jornada (5A): el tiempo de una tarea son los minutos trabajados con ella como tarea
// activa (entrada o «cambio de tarea»), sin pausas. Una fila de ops_task_times por tarea y persona: se abre
// al empezarla y se cierra al terminarla (bot, web o ClickUp). Nunca rompe el flujo del que se llama.
// Diseño y motivos (psicología incluida): docs/DISENO-RENDIMIENTO-EQUIPO.md.
import { and, desc, eq, gte, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsRequests, opsTaskTimes, opsWorkTypes, type OpsTaskTime } from '@/lib/db/schema';
import { getAuto, num } from '@/lib/operaciones/automations';
import { logEvent } from '@/lib/operaciones/events';
import { enqueueNotification } from '@/lib/operaciones/notifications';
import { escapeHtml } from '@/lib/operaciones/telegram';
import { computeDay, type DayState, type TaskRef } from '@/lib/operaciones/jornada-core';
import { getPersonDay, jornadaSettings, loadWorkEvents, recordWorkEvent, shiftDate, todayIn, toDayEvent, type Person } from '@/lib/operaciones/jornada';
import { estimateOptions, finishFeedback, median, OVER_REASONS, precisionHit, taskMinutes, verdictFor } from '@/lib/operaciones/tiempos-core';

// tt:<código>:<dato>:<id de la fila>. Códigos: e (estimación, 0 = saltar), t (tipo), r (motivo de exceso).
export const TIEMPOS_CALLBACK_RE = /^tt:([a-z]):([\w-]{1,22}):([0-9a-f-]{36})$/;

type Btn = { text: string; data: string };

export async function tiemposSettings(tenantId: string) {
  const a = await getAuto(tenantId, 'tiempos');
  const j = await jornadaSettings(tenantId);
  return {
    on: a.enabled && j.enabled, // necesita la jornada: sin ella no hay minutos trabajados
    tiemposEnabled: a.enabled,
    jornadaEnabled: j.enabled,
    askEstimate: Boolean(a.cfg.askEstimate),
    askJustify: Boolean(a.cfg.askJustify),
    precisionPct: num(a, 'precisionPct'),
    minSamples: num(a, 'minSamples')
  };
}

const sameTask = (a: TaskRef | null, b: TaskRef) =>
  Boolean(a) && (b.clickupTaskId ? a!.clickupTaskId === b.clickupTaskId : !a!.clickupTaskId && a!.name === b.name);

// --- Tipos y márgenes -----------------------------------------------------------------------

export async function getWorkType(tenantId: string, key: string | null) {
  if (!key) return null;
  const [t] = await db
    .select()
    .from(opsWorkTypes)
    .where(and(eq(opsWorkTypes.tenantId, tenantId), eq(opsWorkTypes.key, key)))
    .limit(1);
  return t ?? null;
}

/** Minutos reales de las tareas terminadas de un tipo (últimos `days` días, sin anuladas). */
export async function typeSamples(tenantId: string, key: string, days = 120): Promise<number[]> {
  const rows = await db
    .select({ m: opsTaskTimes.workedMinutes })
    .from(opsTaskTimes)
    .where(
      and(
        eq(opsTaskTimes.tenantId, tenantId),
        eq(opsTaskTimes.workTypeKey, key),
        eq(opsTaskTimes.status, 'cerrada'),
        isNull(opsTaskTimes.voidedAt),
        isNotNull(opsTaskTimes.workedMinutes),
        gte(opsTaskTimes.doneAt, new Date(Date.now() - days * 86_400_000))
      )
    );
  return rows.map((r) => r.m!).filter((m) => m > 0);
}

// --- Filas ----------------------------------------------------------------------------------

export async function getTaskTime(tenantId: string, id: string): Promise<OpsTaskTime | null> {
  const [r] = await db.select().from(opsTaskTimes).where(and(eq(opsTaskTimes.tenantId, tenantId), eq(opsTaskTimes.id, id))).limit(1);
  return r ?? null;
}

async function openRow(tenantId: string, person: Person, task: TaskRef, at: Date): Promise<OpsTaskTime> {
  const where = and(
    eq(opsTaskTimes.tenantId, tenantId),
    eq(opsTaskTimes.clickupTaskId, task.clickupTaskId!),
    eq(opsTaskTimes.clickupUserId, person.clickupUserId),
    eq(opsTaskTimes.status, 'abierta'),
    isNull(opsTaskTimes.voidedAt)
  );
  const [existing] = await db.select().from(opsTaskTimes).where(where).limit(1);
  if (existing) return existing;
  const [req] = await db
    .select({ id: opsRequests.id, workTypeKey: opsRequests.workTypeKey })
    .from(opsRequests)
    .where(and(eq(opsRequests.tenantId, tenantId), eq(opsRequests.clickupTaskId, task.clickupTaskId!)))
    .limit(1);
  await db
    .insert(opsTaskTimes)
    .values({
      tenantId,
      clickupTaskId: task.clickupTaskId!,
      requestId: req?.id ?? task.requestId ?? null,
      clickupUserId: person.clickupUserId,
      personName: person.name,
      taskName: task.name.slice(0, 500),
      workTypeKey: req?.workTypeKey ?? null,
      startedAt: at,
      source: 'bot'
    })
    .onConflictDoNothing();
  const [row] = await db.select().from(opsTaskTimes).where(where).limit(1);
  return row;
}

// --- Mensajes -------------------------------------------------------------------------------

async function sendToPerson(tenantId: string, user: string, name: string, dedupeKey: string, text: string, buttons: Btn[][] = []) {
  await enqueueNotification({ tenantId, kind: 'jornada', dedupeKey, forClickupUserId: user, forName: name, payload: { text, buttons } });
}

/** Lo siguiente que hay que preguntar de una tarea recién empezada: el tipo (si falta) o la estimación. */
export async function promptNext(tenantId: string, row: OpsTaskTime): Promise<void> {
  const s = await tiemposSettings(tenantId);
  const name = escapeHtml(row.taskName);
  if (!row.workTypeKey) {
    const types = await db
      .select({ key: opsWorkTypes.key, label: opsWorkTypes.label })
      .from(opsWorkTypes)
      .where(and(eq(opsWorkTypes.tenantId, tenantId), eq(opsWorkTypes.active, true)))
      .orderBy(opsWorkTypes.sortOrder);
    const usable = types.filter((t) => t.key.length <= 22);
    if (!usable.length) return;
    const btns = usable.map((t) => ({ text: t.label, data: `tt:t:${t.key}:${row.id}` }));
    const rows: Btn[][] = [];
    for (let i = 0; i < btns.length; i += 3) rows.push(btns.slice(i, i + 3));
    return sendToPerson(tenantId, row.clickupUserId, row.personName, `tt:type:${row.id}`, `🏷 <b>${name}</b>\n¿Qué tipo de tarea es? Así sabemos su tiempo habitual.`, rows);
  }
  if (!s.askEstimate || row.estimateMinutes !== null) return;
  const type = await getWorkType(tenantId, row.workTypeKey);
  const opts = estimateOptions(median(await typeSamples(tenantId, row.workTypeKey)), type?.minMinutes ?? null, type?.maxMinutes ?? null);
  const buttons: Btn[][] = [opts.map((m) => ({ text: `${m} min`, data: `tt:e:${m}:${row.id}` })), [{ text: 'Saltar', data: `tt:e:0:${row.id}` }]];
  return sendToPerson(
    tenantId,
    row.clickupUserId,
    row.personName,
    `tt:est:${row.id}`,
    `⏱ <b>${name}</b>\n¿Cuánto crees que te llevará?${type ? ` (${escapeHtml(type.label)})` : ''}`,
    buttons
  );
}

// --- Empezar --------------------------------------------------------------------------------

/**
 * Una persona empieza (o cambia a) una tarea. Con la jornada encendida:
 *  - si aún no había empezado la jornada, la empieza con esa tarea (la entrada va siempre con una tarea);
 *  - si ya trabajaba con otra, registra el cambio de tarea activa (lo anterior queda en la anterior);
 *  - con «Tiempos de tarea» también encendida, abre su fila de tiempo y pregunta el tipo o la estimación.
 * Llamado desde el bot (buenos días, cambiar tarea) y desde startWork (botón «Empezar» del aviso).
 */
export async function onTaskStarted(tenantId: string, person: Person, task: TaskRef): Promise<{ ok: boolean; reason?: string }> {
  try {
    const s = await tiemposSettings(tenantId);
    if (!s.jornadaEnabled) return { ok: false, reason: 'La jornada real aún no está activada.' };
    const day = await getPersonDay(tenantId, person.clickupUserId);
    if (!day) return { ok: false, reason: 'No tienes ficha en Equipo.' };
    const st = day.state.status;
    // Tras terminar o con el día marcado como ausente, «Empezar» en un aviso no reabre la jornada (sería un
    // falso positivo: puede estar dejando la tarea en marcha para mañana). Para volver está «▶️ Vuelvo a empezar».
    if (st === 'terminado' || st === 'ausente') {
      return { ok: false, reason: st === 'terminado' ? 'Tu jornada de hoy ya terminó: pulsa «▶️ Vuelvo a empezar» si sigues.' : 'Hoy estás marcado como ausente.' };
    }
    if (st === 'sin_empezar') {
      const r = await recordWorkEvent(tenantId, person, 'entrada', { source: 'telegram', task });
      if (!r.ok) return { ok: false, reason: r.reason };
    } else if (!sameTask(day.state.activeTask, task)) {
      const r = await recordWorkEvent(tenantId, person, 'tarea', { source: 'telegram', task });
      if (!r.ok) return { ok: false, reason: r.reason };
    }
    // El cambio de tarea es de la jornada; medir su tiempo, solo con «Tiempos de tarea» encendida.
    if (!s.on || !task.clickupTaskId) return { ok: true };
    const row = await openRow(tenantId, person, task, new Date());
    if (row) await promptNext(tenantId, row);
    return { ok: true };
  } catch (err) {
    console.error('[tiempos] al empezar tarea:', err instanceof Error ? err.message : err);
    return { ok: false, reason: 'No se pudo registrar el cambio de tarea.' };
  }
}

// --- Terminar -------------------------------------------------------------------------------

/** Minutos trabajados con la tarea activa entre `from` y `to` (todas las jornadas de la persona en medio). */
export async function workedOnTask(tenantId: string, user: string, clickupTaskId: string, from: Date, to: Date, tz: string): Promise<number> {
  const evs = await loadWorkEvents(tenantId, { users: [user], from: shiftDate(todayIn(tz, from), -1), to: todayIn(tz, to) });
  const byDay = new Map<string, ReturnType<typeof toDayEvent>[]>();
  for (const e of evs) byDay.set(e.workDate, [...(byDay.get(e.workDate) ?? []), toDayEvent(e)]);
  const days: DayState[] = [...byDay.values()].map((list) => computeDay(list, to.getTime()));
  return taskMinutes(days, clickupTaskId, from.getTime(), to.getTime());
}

const firstUrl = (t: string | null | undefined) => t?.match(/https?:\/\/\S+/)?.[0]?.slice(0, 1000) ?? null;

/** Cierra las filas abiertas de una tarea (de una persona, o de todas si se cerró en ClickUp). */
export async function closeTaskTimes(
  tenantId: string,
  clickupTaskId: string,
  opts: { user?: string | null; at?: Date; source: 'bot' | 'web' | 'clickup'; note?: string | null }
): Promise<OpsTaskTime[]> {
  const s = await tiemposSettings(tenantId);
  const at = opts.at ?? new Date();
  const open = await db
    .select()
    .from(opsTaskTimes)
    .where(
      and(
        eq(opsTaskTimes.tenantId, tenantId),
        eq(opsTaskTimes.clickupTaskId, clickupTaskId),
        eq(opsTaskTimes.status, 'abierta'),
        isNull(opsTaskTimes.voidedAt),
        opts.user ? eq(opsTaskTimes.clickupUserId, opts.user) : undefined
      )
    );
  const out: OpsTaskTime[] = [];
  for (const row of open) {
    const day = await getPersonDay(tenantId, row.clickupUserId);
    const tz = day?.sch.timezone ?? 'Europe/Madrid';
    const minutes = await workedOnTask(tenantId, row.clickupUserId, clickupTaskId, row.startedAt, at, tz);
    const type = await getWorkType(tenantId, row.workTypeKey);
    const bandMin = type?.minMinutes ?? null;
    const bandMax = type?.maxMinutes ?? null;
    const verdict = verdictFor(minutes, bandMin, bandMax);
    const hit = row.estimateMinutes ? precisionHit(row.estimateMinutes, minutes, s.precisionPct) : null;
    const url = firstUrl(opts.note);
    const [upd] = await db
      .update(opsTaskTimes)
      .set({
        status: 'cerrada',
        doneAt: at,
        workedMinutes: minutes,
        bandMin,
        bandMax,
        verdict,
        precisionHit: hit,
        justifyStatus: verdict === 'pasado' && s.askJustify ? 'pendiente' : 'no_necesaria',
        evidenceUrl: url,
        source: opts.source,
        updatedAt: new Date()
      })
      .where(and(eq(opsTaskTimes.id, row.id), eq(opsTaskTimes.status, 'abierta')))
      .returning();
    if (!upd) continue;
    await logEvent(tenantId, {
      requestId: row.requestId,
      actor: { clickupUserId: row.clickupUserId, name: row.personName },
      type: 'tiempos',
      payload: { kind: 'cerrada', minutes, verdict, estimate: row.estimateMinutes, hit, source: opts.source }
    });
    out.push(upd);
  }
  return out;
}

/** Botones de motivo para una tarea fuera de margen. */
export function reasonButtons(rowId: string): Btn[][] {
  const b = (code: string) => ({ text: OVER_REASONS[code as keyof typeof OVER_REASONS], data: `tt:r:${code}:${rowId}` });
  return [[b('cl'), b('gr')], [b('bl'), b('it')], [b('ot')]];
}

/**
 * Una tarea se ha terminado (Hecho en el bot o la web, o cerrada en ClickUp): cierra su tiempo, enseña a
 * la persona cómo ha ido y, si se pasó del margen, pregunta qué la complicó. Si seguía con esa tarea
 * activa, le pregunta con qué sigue.
 */
export async function onTaskFinished(
  tenantId: string,
  task: { clickupTaskId: string | null; title: string },
  opts: { user?: string | null; source: 'bot' | 'web' | 'clickup'; note?: string | null }
): Promise<void> {
  try {
    if (!task.clickupTaskId) return;
    const s = await tiemposSettings(tenantId);
    if (!s.tiemposEnabled) return;
    const closed = await closeTaskTimes(tenantId, task.clickupTaskId, opts);
    for (const row of closed) {
      const text = finishFeedback({
        taskName: escapeHtml(row.taskName),
        minutes: row.workedMinutes ?? 0,
        estimate: row.estimateMinutes,
        hit: row.precisionHit,
        verdict: (row.verdict ?? 'sin_margen') as 'dentro',
        bandMin: row.bandMin,
        bandMax: row.bandMax
      });
      const buttons = row.justifyStatus === 'pendiente' ? reasonButtons(row.id) : [];
      await sendToPerson(tenantId, row.clickupUserId, row.personName, `tt:done:${row.id}`, text, buttons);
      // ¿Con qué sigues? Solo si seguía trabajando con esta tarea como activa.
      const day = await getPersonDay(tenantId, row.clickupUserId);
      if (s.on && day && day.state.status === 'trabajando' && day.state.activeTask?.clickupTaskId === task.clickupTaskId) {
        const { buildSwitchPrompt } = await import('@/lib/operaciones/jornada-bot');
        const p = await buildSwitchPrompt(tenantId, { clickupUserId: row.clickupUserId, name: row.personName }, task.clickupTaskId, true);
        await enqueueNotification({
          tenantId,
          kind: 'jornada',
          dedupeKey: `tt:next:${row.id}`,
          forClickupUserId: row.clickupUserId,
          forName: row.personName,
          payload: { text: p.text, buttons: p.buttons, jwTasks: p.jwTasks }
        });
      }
    }
  } catch (err) {
    console.error('[tiempos] al terminar tarea:', err instanceof Error ? err.message : err);
  }
}

// --- Respuestas de la persona ---------------------------------------------------------------

export async function setEstimate(tenantId: string, rowId: string, minutes: number | null): Promise<OpsTaskTime | null> {
  const [r] = await db
    .update(opsTaskTimes)
    .set({ estimateMinutes: minutes, updatedAt: new Date() })
    .where(and(eq(opsTaskTimes.tenantId, tenantId), eq(opsTaskTimes.id, rowId), eq(opsTaskTimes.status, 'abierta'), isNull(opsTaskTimes.estimateMinutes)))
    .returning();
  return r ?? null;
}

export async function setRowType(tenantId: string, rowId: string, key: string): Promise<OpsTaskTime | null> {
  const type = await getWorkType(tenantId, key);
  if (!type) return null;
  const [r] = await db
    .update(opsTaskTimes)
    .set({ workTypeKey: key, updatedAt: new Date() })
    .where(and(eq(opsTaskTimes.tenantId, tenantId), eq(opsTaskTimes.id, rowId), isNull(opsTaskTimes.workTypeKey)))
    .returning();
  // El encargo hereda el tipo si no lo tenía (lo normal es que lo ponga quien lo crea).
  if (r?.requestId) {
    await db
      .update(opsRequests)
      .set({ workTypeKey: key })
      .where(and(eq(opsRequests.id, r.requestId), isNull(opsRequests.workTypeKey)));
  }
  return r ?? null;
}

export async function setOverReason(tenantId: string, rowId: string, code: string): Promise<OpsTaskTime | null> {
  const [r] = await db
    .update(opsTaskTimes)
    .set({ overReason: code, updatedAt: new Date() })
    .where(and(eq(opsTaskTimes.tenantId, tenantId), eq(opsTaskTimes.id, rowId), eq(opsTaskTimes.justifyStatus, 'pendiente')))
    .returning();
  return r ?? null;
}

/** La última tarea de la persona que espera la URL (ya eligió motivo). */
export async function pendingJustification(tenantId: string, user: string): Promise<OpsTaskTime | null> {
  const [r] = await db
    .select()
    .from(opsTaskTimes)
    .where(
      and(
        eq(opsTaskTimes.tenantId, tenantId),
        eq(opsTaskTimes.clickupUserId, user),
        eq(opsTaskTimes.justifyStatus, 'pendiente'),
        isNotNull(opsTaskTimes.overReason),
        isNull(opsTaskTimes.voidedAt)
      )
    )
    .orderBy(desc(opsTaskTimes.updatedAt))
    .limit(1);
  return r ?? null;
}

export async function submitJustification(tenantId: string, rowId: string, text: string | null): Promise<OpsTaskTime | null> {
  const url = firstUrl(text);
  const note = text ? text.replace(/https?:\/\/\S+/g, '').trim().slice(0, 1000) || null : null;
  const [r] = await db
    .update(opsTaskTimes)
    .set({
      justifyStatus: 'enviada',
      evidenceUrl: sql`coalesce(${url}, ${opsTaskTimes.evidenceUrl})`,
      overNote: note,
      updatedAt: new Date()
    })
    .where(and(eq(opsTaskTimes.tenantId, tenantId), eq(opsTaskTimes.id, rowId), eq(opsTaskTimes.justifyStatus, 'pendiente')))
    .returning();
  if (r) {
    await logEvent(tenantId, {
      requestId: r.requestId,
      actor: { clickupUserId: r.clickupUserId, name: r.personName },
      type: 'tiempos',
      payload: { kind: 'justificada', reason: r.overReason, url: Boolean(r.evidenceUrl) }
    });
  }
  return r ?? null;
}

/** Filas cerradas en un periodo (pestaña Tiempos y Mi panel). */
export async function loadClosedTimes(tenantId: string, opts: { since: Date; users?: string[]; includeVoided?: boolean }): Promise<OpsTaskTime[]> {
  if (opts.users && !opts.users.length) return [];
  return db
    .select()
    .from(opsTaskTimes)
    .where(
      and(
        eq(opsTaskTimes.tenantId, tenantId),
        eq(opsTaskTimes.status, 'cerrada'),
        gte(opsTaskTimes.doneAt, opts.since),
        opts.users ? inArray(opsTaskTimes.clickupUserId, opts.users) : undefined,
        opts.includeVoided ? undefined : isNull(opsTaskTimes.voidedAt)
      )
    )
    .orderBy(desc(opsTaskTimes.doneAt));
}

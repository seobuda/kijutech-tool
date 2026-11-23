// Vigilancia de ClickUp (paso 6C): tareas creadas o asignadas directamente en ClickUp entran en el circuito.
// Sin webhooks (seguimos en local): cada ~2,5 minutos UNA consulta agrupada de workspace con lo creado o
// actualizado desde la última pasada, en los espacios seleccionados (todo por el cliente con contador).
// Las decisiones las toma el código, sin IA:
//  - Tarea que ya es un encargo (nuestro o espejo): si se cierra en ClickUp, el encargo se completa; si se
//    reasigna a otra persona vinculada, se actualiza el responsable y se avisa al nuevo. Desde el 23 nov también se copian
//    al encargo la fecha, la prioridad, el título, la descripción, la lista y el cliente, y los cambios parciales de
//    responsables (alguien añadido o quitado); sus avisos se ponen al día (syncNewRequestNotices).
//  - Tarea que lleva la marca [kiju:] y no es un encargo: es nuestra, se ignora.
//  - Tarea nueva (creada después de activar la función) o recién asignada a alguien vinculado: encargo
//    «espejo» con origen ClickUp y el mismo aviso con botones. Una tarea nueva que el creador se asigna a sí
//    mismo no avisa. Lo anterior a la activación solo se anota (instantánea), nunca avisa.
//  - «Vinculado» = tiene el Telegram vinculado (en modo pruebas basta con que sea miembro de ClickUp).
import { and, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  opsClickupTaskSnapshots,
  opsClickupWatch,
  opsRequests,
  opsTelegramMembers,
  users,
  type OpsRequest
} from '@/lib/db/schema';
import { fetchWatchTasks, OPS_TIMEZONE, type WatchTask } from '@/lib/operaciones/clickup';
import { getClickUpToken } from '@/lib/operaciones/queries';
import { clientFieldForList, getStructure, selectedSpaces, type CachedStructure } from '@/lib/operaciones/structure';
import { getTelegramConfig } from '@/lib/operaciones/telegram-config';
import { logEvent } from '@/lib/operaciones/events';
import { enqueueNewRequestNotification, refreshNotice, syncNewRequestNotices } from '@/lib/operaciones/notifications';
import { transition } from '@/lib/operaciones/workflow';
import { getAuto, num } from '@/lib/operaciones/automations';

export const WATCH_EVERY_MS = 150_000; // por defecto; se cambia en Automatizaciones
const OVERLAP_MS = 10_000;
const RETRY_FAILED_MS = 60 * 60_000;
const OPEN_STATES = ['asignado', 'en_curso', 'devuelto', 'bloqueado'];

export async function getWatch(tenantId: string) {
  const [w] = await db.select().from(opsClickupWatch).where(eq(opsClickupWatch.tenantId, tenantId)).limit(1);
  return w ?? null;
}

const isClosedType = (t: string) => t === 'closed' || t === 'done';

async function upsertSnapshots(tenantId: string, tasks: WatchTask[]) {
  for (let i = 0; i < tasks.length; i += 500) {
    const chunk = tasks.slice(i, i + 500);
    await db
      .insert(opsClickupTaskSnapshots)
      .values(
        chunk.map((t) => ({
          tenantId,
          clickupTaskId: t.id,
          assigneeIds: t.assignees.map((a) => a.id),
          status: t.statusName.slice(0, 100),
          statusType: t.statusType.slice(0, 30),
          dateUpdatedMs: t.updatedMs
        }))
      )
      .onConflictDoUpdate({
        target: [opsClickupTaskSnapshots.tenantId, opsClickupTaskSnapshots.clickupTaskId],
        set: {
          assigneeIds: sql`excluded.assignee_ids`,
          status: sql`excluded.status`,
          statusType: sql`excluded.status_type`,
          dateUpdatedMs: sql`excluded.date_updated_ms`,
          updatedAt: new Date()
        }
      });
  }
}

// Activa la vigilancia: lectura inicial de las tareas abiertas (sin avisar de nada) y fecha de activación.
export async function enableWatch(tenantId: string): Promise<{ ok: true; baseline: number } | { ok: false; error: string }> {
  const conn = await getClickUpToken(tenantId);
  if (!conn?.workspaceId) return { ok: false, error: 'Conecta ClickUp primero en Ajustes' };
  const structure = await getStructure(tenantId);
  const spaceIds = selectedSpaces(structure).map((s) => s.id);
  if (spaceIds.length === 0) return { ok: false, error: 'No hay espacios seleccionados en Ajustes' };

  const t0 = Date.now();
  const { tasks } = await fetchWatchTasks(conn.token, conn.workspaceId, { spaceIds, updatedAfterMs: null });
  await upsertSnapshots(tenantId, tasks);
  await db
    .insert(opsClickupWatch)
    .values({ tenantId, enabled: true, activatedAt: new Date(t0), cursorMs: t0, lastRunAt: new Date(), lastError: null })
    .onConflictDoUpdate({
      target: opsClickupWatch.tenantId,
      set: { enabled: true, activatedAt: new Date(t0), cursorMs: t0, lastRunAt: new Date(), lastError: null, updatedAt: new Date() }
    });
  return { ok: true, baseline: tasks.length };
}

export async function disableWatch(tenantId: string): Promise<void> {
  await db.update(opsClickupWatch).set({ enabled: false, updatedAt: new Date() }).where(eq(opsClickupWatch.tenantId, tenantId));
}

type Ctx = {
  tenantId: string;
  activatedMs: number;
  names: Map<string, string>; // miembros de ClickUp
  linked: Set<string>; // miembros a los que se puede avisar
  ownerUserId: number;
  structure: CachedStructure;
};

// Planificador (cada 30 s): solo consulta si pasaron ~2,5 min desde la última pasada.
export async function runWatch(tenantId: string, now = new Date()): Promise<void> {
  const w = await getWatch(tenantId);
  if (!w?.enabled || !w.activatedAt) return;
  const everyMs = num(await getAuto(tenantId, 'watch'), 'everySec') * 1000;
  // Reclamar la pasada (atómico): si otra la tiene en marcha o es pronto, no se hace.
  const claimed = await db
    .update(opsClickupWatch)
    .set({ lastRunAt: now })
    .where(
      and(
        eq(opsClickupWatch.tenantId, tenantId),
        eq(opsClickupWatch.enabled, true),
        or(isNull(opsClickupWatch.lastRunAt), lt(opsClickupWatch.lastRunAt, new Date(now.getTime() - everyMs)))
      )
    )
    .returning({ cursor: opsClickupWatch.cursorMs });
  if (claimed.length === 0) return;

  try {
    const conn = await getClickUpToken(tenantId);
    if (!conn?.workspaceId) throw new Error('ClickUp no está conectado');
    const structure = await getStructure(tenantId);
    const spaceIds = selectedSpaces(structure).map((s) => s.id);
    if (spaceIds.length === 0) throw new Error('No hay espacios seleccionados');
    const cursor = claimed[0].cursor ?? w.activatedAt.getTime();

    const { tasks, truncated } = await fetchWatchTasks(conn.token, conn.workspaceId, {
      spaceIds,
      updatedAfterMs: cursor - OVERLAP_MS
    });
    // Tareas cuyo procesamiento falló: no se guarda su instantánea y el cursor no las salta,
    // para que la pasada siguiente las vuelva a intentar (antes se perdían sin reintento).
    const failedMs: number[] = [];
    const failedIds = new Set<string>();

    if (tasks.length > 0) {
      const cfg = await getTelegramConfig(tenantId);
      const tg = await db.select().from(opsTelegramMembers).where(eq(opsTelegramMembers.tenantId, tenantId));
      const names = new Map(structure.members.map((m) => [m.id, m.username]));
      const linked = new Set(
        [...names.keys()].filter((id) => cfg?.testMode || tg.some((m) => m.clickupUserId === id && m.telegramChatId))
      );
      const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.tenantId, tenantId)).orderBy(users.id).limit(1);
      if (!owner) throw new Error('No hay ningún usuario en la cuenta');
      const ctx: Ctx = { tenantId, activatedMs: w.activatedAt.getTime(), names, linked, ownerUserId: owner.id, structure };

      const ids = tasks.map((t) => t.id);
      const snaps = new Map(
        (await db.select().from(opsClickupTaskSnapshots).where(and(eq(opsClickupTaskSnapshots.tenantId, tenantId), inArray(opsClickupTaskSnapshots.clickupTaskId, ids)))).map(
          (s) => [s.clickupTaskId, s]
        )
      );
      const reqs = new Map(
        (await db.select().from(opsRequests).where(and(eq(opsRequests.tenantId, tenantId), inArray(opsRequests.clickupTaskId, ids)))).map(
          (r) => [r.clickupTaskId!, r]
        )
      );

      for (const t of [...tasks].sort((a, b) => a.updatedMs - b.updatedMs)) {
        try {
          const req = reqs.get(t.id);
          if (req) await syncExisting(ctx, req, t, snaps.get(t.id)?.assigneeIds ?? null);
          else if (!isClosedType(t.statusType) && !t.description.includes('[kiju:')) {
            await maybeMirror(ctx, t, snaps.get(t.id)?.assigneeIds ?? null);
          }
        } catch (e) {
          console.error('[watch] tarea', t.id, e instanceof Error ? e.message : e);
          // Se reintenta mientras el cambio sea reciente (1 h); después se da por perdido para
          // que una tarea rota no bloquee el cursor para siempre.
          if (now.getTime() - t.updatedMs < RETRY_FAILED_MS) failedMs.push(t.updatedMs);
          failedIds.add(t.id);
        }
      }
      await upsertSnapshots(tenantId, tasks.filter((t) => !failedIds.has(t.id)));
    }

    const maxSeen = Math.max(cursor, ...tasks.map((t) => t.updatedMs));
    const newCursor = failedMs.length ? Math.max(cursor, Math.min(...failedMs) - 1) : maxSeen;
    const warning = truncated
      ? 'Había más cambios de los que caben en una pasada: el resto se leerá en la siguiente.'
      : failedIds.size
        ? `${failedIds.size} tarea(s) no se pudieron procesar; se reintentarán.`
        : null;
    await db
      .update(opsClickupWatch)
      .set({ cursorMs: newCursor, lastError: warning, updatedAt: new Date() })
      .where(eq(opsClickupWatch.tenantId, tenantId));
  } catch (e) {
    await db
      .update(opsClickupWatch)
      .set({ lastError: (e instanceof Error ? e.message : 'Error desconocido').slice(0, 500), updatedAt: new Date() })
      .where(eq(opsClickupWatch.tenantId, tenantId));
  }
}

// Encargo que ya existe: copia lo que se cambió en ClickUp (datos, cierre y responsables) y pone al día sus avisos.
async function syncExisting(ctx: Ctx, req: OpsRequest, t: WatchTask, snapAssignees: string[] | null) {
  if (req.status !== 'creado') return;
  const changed = await syncFields(ctx, req, t);

  if (isClosedType(t.statusType)) {
    const row = await transition(req, 'completado', [...OPEN_STATES, 'en_revision']);
    if (row) {
      await logEvent(ctx.tenantId, { requestId: req.id, actor: null, type: 'clickup_closed', payload: { status: t.statusName } });
      await refreshNotice(ctx.tenantId, req.id);
      // Tiempos (5B): cerrada directamente en ClickUp → se cierra igual el tiempo de quien la hacía.
      const { onTaskFinished } = await import('@/lib/operaciones/tiempos');
      await onTaskFinished(ctx.tenantId, { clickupTaskId: row.clickupTaskId, title: row.title }, { source: 'clickup' });
    }
  } else if (OPEN_STATES.includes(req.workStatus)) {
    await syncAssignees(ctx, req, t, snapAssignees);
  }
  if (changed) await syncNewRequestNotices(ctx.tenantId, req.id);
}

const KIJU_MARKER = /\s*\[kiju:[^\]]*\]\s*/g;
// Lo que la herramienta añade a la descripción al crear la tarea (transcripción del audio y marca) no es del encargo.
export const cleanTaskDescription = (md: string) => md.split(/\n#{1,3}\s*Transcripción del audio/i)[0].replace(KIJU_MARKER, '\n').trim();
// Para comparar sin falsos cambios: ClickUp devuelve el Markdown con otro formato (viñetas, saltos, escapes).
const letters = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** Fecha, prioridad, título, descripción, lista y cliente de la tarea → encargo. Devuelve si cambió algo. */
async function syncFields(ctx: Ctx, req: OpsRequest, t: WatchTask): Promise<boolean> {
  const set: Partial<typeof opsRequests.$inferInsert> = {};
  const changes: Record<string, unknown> = {};
  const note = (key: string, from: unknown, to: unknown) => (changes[key] = { from, to });

  const due = t.dueMs ? madridDate(t.dueMs) : null;
  if (due !== req.dueDate) {
    set.dueDate = due;
    note('fecha', req.dueDate, due);
  }
  if (t.priority !== req.priority) {
    set.priority = t.priority;
    note('prioridad', req.priority, t.priority);
  }
  const title = t.name.trim().slice(0, 500);
  if (title && title !== req.title) {
    set.title = title;
    note('título', req.title, title);
  }
  const md = cleanTaskDescription(t.markdown);
  const plain = cleanTaskDescription(t.description);
  const mine = letters(req.preparedDescription);
  if ((md || plain) && letters(md) !== mine && letters(plain) !== mine) {
    set.preparedDescription = md || plain;
    changes['descripción'] = true;
  }
  if (t.listId && t.listId !== req.clickupListId) {
    set.clickupListId = t.listId;
    set.clickupListName = t.listName;
    note('lista', req.clickupListName, t.listName);
  }
  // Cliente: solo si la lista tiene el campo «Cliente» (si no lo tiene, el de la herramienta no está en ClickUp y se respeta).
  const field = clientFieldForList(ctx.structure, t.listId || req.clickupListId);
  if (field) {
    const picked = t.dropdowns[field.fieldId];
    const opt = picked ? field.options.find((o) => o.id === picked.optionId) : undefined;
    const optionId = opt?.id ?? null;
    if (optionId !== req.clientOptionId) {
      set.clientOptionId = optionId;
      set.clientName = opt?.label ?? null;
      note('cliente', req.clientName, opt?.label ?? null);
    }
  }

  if (Object.keys(changes).length === 0) return false;
  await db
    .update(opsRequests)
    .set({ ...set, updatedAt: new Date() })
    .where(and(eq(opsRequests.id, req.id), eq(opsRequests.tenantId, ctx.tenantId)));
  Object.assign(req, set);
  await logEvent(ctx.tenantId, { requestId: req.id, actor: null, type: 'clickup_updated', payload: changes });
  return true;
}

/**
 * Responsables cambiados en ClickUp (encargo abierto):
 *  - Ya no está ninguno de los que tenía: pasa a quien esté ahora (avisando a los que tienen Telegram; si nadie lo
 *    tiene, se anota el nuevo responsable sin aviso). Sin nadie asignado, se deja como estaba.
 *  - Sigue alguno: los añadidos (con Telegram) entran como candidatos y se les avisa si aún nadie lo ha empezado; los
 *    quitados salen. Si se quitó a quien lo estaba haciendo, vuelve a «asignado» para los que quedan.
 * «Añadido» se mide contra la lectura anterior de la tarea, para no avisar a quien ya estaba (p. ej. el creador).
 */
async function syncAssignees(ctx: Ctx, req: OpsRequest, t: WatchTask, snapAssignees: string[] | null) {
  const ids = t.assignees.map((a) => a.id);
  if (ids.length === 0) return;
  const known = [...new Set([req.assigneeClickupId, ...(req.candidateIds ?? [])].filter((x): x is string => Boolean(x)))];
  const remaining = known.filter((k) => ids.includes(k));
  const name = (id: string) => ctx.names.get(id) ?? null;
  const names = (list: string[]) => list.map((g) => ctx.names.get(g) ?? g);
  const reset = { seenAt: null, seenBy: null, remindedAt: null, unansweredListedAt: null };
  const notify = async (people: string[], label: string) => {
    for (const g of people) {
      await enqueueNewRequestNotification(req.id, { forUserId: g, forName: ctx.names.get(g), label, dedupeSuffix: String(t.updatedMs) });
    }
  };

  if (remaining.length === 0) {
    const gained = ids.filter((id) => ctx.linked.has(id));
    const first = gained[0] ?? ids[0];
    const row = await transition(req, 'asignado', OPEN_STATES, {
      assigneeClickupId: first,
      assigneeName: name(first),
      candidateIds: gained,
      ...reset
    });
    if (!row) return;
    await logEvent(ctx.tenantId, {
      requestId: req.id,
      actor: null,
      type: 'reassigned',
      payload: { from: req.assigneeName, to: names(ids), ...(gained.length ? {} : { sinTelegram: true }) }
    });
    await refreshNotice(ctx.tenantId, req.id); // los avisos anteriores pasan a «ahora lo lleva X» y pierden los botones
    await notify(gained, 'reasignado en ClickUp');
    return;
  }

  const added = snapAssignees ? ids.filter((id) => !snapAssignees.includes(id) && !known.includes(id) && ctx.linked.has(id)) : [];
  const removed = known.filter((k) => !ids.includes(k));
  if (added.length === 0 && removed.length === 0) return;
  const doerRemoved = Boolean(req.assigneeClickupId && removed.includes(req.assigneeClickupId));
  const who = { responsables: { añadidos: names(added), quitados: names(removed) } };

  if (req.workStatus === 'asignado' || doerRemoved) {
    // Nadie lo ha empezado (o se quitó a quien lo hacía): lo tienen los que quedan más los añadidos.
    const people = [...new Set([...remaining, ...added])];
    const head = doerRemoved ? people[0] : req.assigneeClickupId!;
    const extra = { assigneeClickupId: head, assigneeName: name(head), candidateIds: people };
    // Sin empezar y sigue quien figuraba: no es un cambio de estado (no se toca la hora del estado, que mide la espera).
    const row = doerRemoved
      ? await transition(req, 'asignado', OPEN_STATES, { ...extra, ...reset })
      : (
          await db
            .update(opsRequests)
            .set({ ...extra, updatedAt: new Date() })
            .where(and(eq(opsRequests.id, req.id), eq(opsRequests.workStatus, 'asignado')))
            .returning({ id: opsRequests.id })
        )[0];
    if (!row) return;
    await logEvent(ctx.tenantId, {
      requestId: req.id,
      actor: null,
      type: doerRemoved ? 'reassigned' : 'clickup_updated',
      payload: doerRemoved ? { from: req.assigneeName, to: names(people) } : who
    });
    await refreshNotice(ctx.tenantId, req.id);
    // A quien ya tenía su aviso no se le repite, salvo si el encargo vuelve a estar sin empezar porque se quitó a quien lo hacía.
    await notify(doerRemoved ? people : added, doerRemoved ? 'reasignado en ClickUp' : 'añadido en ClickUp');
    return;
  }

  // En curso con la misma persona: los que salieron dejan de ser candidatos; los añadidos colaboran (solo se anota).
  await db
    .update(opsRequests)
    .set({ candidateIds: (req.candidateIds ?? []).filter((k) => ids.includes(k)), updatedAt: new Date() })
    .where(eq(opsRequests.id, req.id));
  await logEvent(ctx.tenantId, { requestId: req.id, actor: null, type: 'clickup_updated', payload: who });
}

const madridDate = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: OPS_TIMEZONE }).format(new Date(ms));

// Tarea que no es un encargo: ¿hay que crear el espejo y avisar?
async function maybeMirror(ctx: Ctx, t: WatchTask, snapAssignees: string[] | null) {
  if (!t.listId) return;
  const ids = t.assignees.map((a) => a.id);
  let recipients: string[] = [];
  let label = 'creada en ClickUp';
  if (!snapAssignees) {
    // Nunca vista: solo cuenta si se creó después de activar la función; el creador no se avisa a sí mismo.
    if (t.createdMs > ctx.activatedMs) {
      recipients = ids.filter((id) => ctx.linked.has(id) && id !== t.creatorId);
    }
  } else {
    // Ya vista: cuenta quien acaba de entrar como responsable (aunque sea el creador).
    recipients = ids.filter((id) => !snapAssignees.includes(id) && ctx.linked.has(id));
    label = 'asignada en ClickUp';
  }
  if (recipients.length === 0) return;

  // Cliente: el del campo «Cliente» de la tarea, si es una opción real; si no, vacío.
  let clientOptionId: string | null = null;
  let clientName: string | null = null;
  for (const [fieldId, d] of Object.entries(t.dropdowns)) {
    const cached = ctx.structure.clientFields[fieldId];
    if (cached) {
      const o = cached.options.find((x) => x.id === d.optionId);
      if (o) {
        clientOptionId = o.id;
        clientName = o.label;
        break;
      }
    }
  }

  const text = (t.description || t.name).slice(0, 6000);
  const [row] = await db
    .insert(opsRequests)
    .values({
      tenantId: ctx.tenantId,
      createdBy: ctx.ownerUserId,
      clickupListId: t.listId,
      clickupListName: t.listName,
      title: t.name.slice(0, 500),
      originalRequest: text,
      preparedDescription: text,
      assigneeClickupId: recipients[0],
      assigneeName: ctx.names.get(recipients[0]) ?? null,
      candidateIds: recipients,
      dueDate: t.dueMs ? madridDate(t.dueMs) : null,
      priority: t.priority,
      status: 'creado',
      clickupTaskId: t.id,
      clickupTaskUrl: t.url,
      syncedAt: new Date(),
      clientOptionId,
      clientName,
      origin: 'clickup'
    })
    .onConflictDoNothing()
    .returning({ id: opsRequests.id });
  if (!row) return;

  await logEvent(ctx.tenantId, {
    requestId: row.id,
    actor: null,
    type: 'mirror_created',
    payload: { recipients: recipients.map((r) => ctx.names.get(r) ?? r), creatorId: t.creatorId }
  });
  for (const r of recipients) {
    await enqueueNewRequestNotification(row.id, { forUserId: r, forName: ctx.names.get(r), label });
  }
}

// Miembros sin Telegram vinculado que tienen tareas abiertas asignadas recientemente (según las
// instantáneas de la última semana): no se les puede avisar.
export async function getUnlinkedWithTasks(tenantId: string): Promise<{ id: string; name: string; tasks: number }[]> {
  const structure = await getStructure(tenantId);
  const tg = await db.select().from(opsTelegramMembers).where(eq(opsTelegramMembers.tenantId, tenantId));
  const linked = new Set(tg.filter((m) => m.telegramChatId).map((m) => m.clickupUserId));
  const snaps = await db
    .select()
    .from(opsClickupTaskSnapshots)
    .where(
      and(
        eq(opsClickupTaskSnapshots.tenantId, tenantId),
        sql`${opsClickupTaskSnapshots.dateUpdatedMs} > ${Date.now() - 7 * 24 * 3600 * 1000}`,
        sql`coalesce(${opsClickupTaskSnapshots.statusType}, '') NOT IN ('closed', 'done')`
      )
    );
  const counts = new Map<string, number>();
  for (const s of snaps) for (const id of s.assigneeIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  return structure.members
    .filter((m) => !linked.has(m.id) && (counts.get(m.id) ?? 0) > 0)
    .map((m) => ({ id: m.id, name: m.username, tasks: counts.get(m.id)! }));
}

import 'server-only';

// Operaciones ofrece al núcleo (registerWorkSource) lo que otros módulos necesitan saber del trabajo hecho para un
// cliente, sin importar Operaciones (15 nov 2026, módulo Estrategia):
//   - encargos de clientes terminados (título, descripción, nota de cierre, tipo, minutos trabajados);
//   - carga del cliente (horas del mes frente a las contratadas, encargos próximos y abiertos);
//   - una pregunta a quien hizo un encargo («¿En qué URL se publicó?»), por la cola de avisos, con los botones
//     «✍️ Escribir» y «No aplica». La respuesta la recibe el manejador registrado para ese tipo de pregunta.
import { and, asc, eq, gte, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsClientActivity, opsClients, opsRequests, opsTaskTimes } from '@/lib/db/schema';
import type { WorkItem, WorkSource } from '@/lib/core/capabilities';
import { enqueueNotification } from '@/lib/operaciones/notifications';
import { escapeHtml } from '@/lib/operaciones/telegram';

/** Callback de los botones de una pregunta sobre un encargo: mq:w:<tipo>:<encargo> (escribir) y mq:n:… (no aplica). */
export const TASK_QUESTION_CALLBACK_RE = /^mq:(w|n):([a-z]{2,10}):([0-9a-f-]{36})$/;

type ReqRow = typeof opsRequests.$inferSelect;

async function optionMap(tenantId: string): Promise<Map<string, string>> {
  const rows = await db.select({ id: opsClients.id, opt: opsClients.clickupOptionId }).from(opsClients).where(and(eq(opsClients.tenantId, tenantId), isNotNull(opsClients.clickupOptionId)));
  return new Map(rows.map((r) => [r.opt!, r.id]));
}

async function minutesBy(tenantId: string, requestIds: string[]): Promise<Map<string, number>> {
  if (!requestIds.length) return new Map();
  const rows = await db
    .select({ id: opsTaskTimes.requestId, m: sql<number>`coalesce(sum(${opsTaskTimes.workedMinutes}), 0)::int` })
    .from(opsTaskTimes)
    .where(and(eq(opsTaskTimes.tenantId, tenantId), inArray(opsTaskTimes.requestId, requestIds), isNull(opsTaskTimes.voidedAt)))
    .groupBy(opsTaskTimes.requestId);
  return new Map(rows.filter((r) => r.id).map((r) => [r.id!, Number(r.m) || 0]));
}

function toItems(rows: ReqRow[], byOption: Map<string, string>, minutes: Map<string, number>): WorkItem[] {
  const out: WorkItem[] = [];
  for (const r of rows) {
    const clientId = r.clientOptionId ? byOption.get(r.clientOptionId) : undefined;
    if (!clientId) continue;
    out.push({
      taskId: r.clickupTaskId ?? r.id,
      ref: r.id,
      clientId,
      title: r.title,
      description: r.preparedDescription ?? '',
      doneNote: r.doneNote ?? '',
      workType: r.workTypeKey ?? null,
      doneAt: r.workStatusAt.toISOString(),
      minutes: minutes.get(r.id) ?? null,
      assigneeName: r.assigneeName ?? null
    });
  }
  return out;
}

/** «cursor» = fecha de la última fila leída (tenga o no cliente): así la siguiente pasada nunca se atasca. */
async function completedSince(tenantId: string, since: Date, limit: number): Promise<{ items: WorkItem[]; cursor: string | null }> {
  const rows = await db
    .select()
    .from(opsRequests)
    .where(and(eq(opsRequests.tenantId, tenantId), eq(opsRequests.workStatus, 'completado'), isNotNull(opsRequests.clientOptionId), gte(opsRequests.workStatusAt, since)))
    .orderBy(asc(opsRequests.workStatusAt))
    .limit(Math.max(1, Math.min(limit, 500)));
  const items = toItems(rows, await optionMap(tenantId), await minutesBy(tenantId, rows.map((r) => r.id)));
  return { items, cursor: rows.length ? rows[rows.length - 1].workStatusAt.toISOString() : null };
}

async function clientCompleted(tenantId: string, clientId: string, sinceDays: number): Promise<WorkItem[]> {
  const [c] = await db.select({ opt: opsClients.clickupOptionId }).from(opsClients).where(and(eq(opsClients.tenantId, tenantId), eq(opsClients.id, clientId))).limit(1);
  if (!c?.opt) return [];
  const rows = await db
    .select()
    .from(opsRequests)
    .where(and(eq(opsRequests.tenantId, tenantId), eq(opsRequests.workStatus, 'completado'), eq(opsRequests.clientOptionId, c.opt), gte(opsRequests.workStatusAt, new Date(Date.now() - sinceDays * 86_400_000))))
    .orderBy(asc(opsRequests.workStatusAt))
    .limit(300);
  return toItems(rows, new Map([[c.opt, clientId]]), await minutesBy(tenantId, rows.map((r) => r.id)));
}

async function workload(tenantId: string, clientId: string) {
  const [c] = await db.select({ opt: opsClients.clickupOptionId, monthlyHours: opsClients.monthlyHours }).from(opsClients).where(and(eq(opsClients.tenantId, tenantId), eq(opsClients.id, clientId))).limit(1);
  if (!c) return null;
  const [a] = await db.select().from(opsClientActivity).where(eq(opsClientActivity.clientId, clientId)).limit(1);
  let openTasks = 0;
  if (c.opt) {
    const [n] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(opsRequests)
      .where(and(eq(opsRequests.tenantId, tenantId), eq(opsRequests.clientOptionId, c.opt), ne(opsRequests.workStatus, 'completado')));
    openTasks = Number(n?.n ?? 0);
  }
  return {
    hoursMonth: a ? Number(a.hoursMonth) : null,
    monthlyHours: c.monthlyHours !== null ? Number(c.monthlyHours) : null,
    upcoming: a ? a.upcomingTasks : null,
    horizonDays: a ? a.horizonDays : null,
    openTasks
  };
}

async function askAboutTask(tenantId: string, ref: string, kind: string, html: string): Promise<boolean> {
  if (!/^[a-z]{2,10}$/.test(kind) || !/^[0-9a-f-]{36}$/.test(ref)) return false;
  const [r] = await db.select().from(opsRequests).where(and(eq(opsRequests.tenantId, tenantId), eq(opsRequests.id, ref))).limit(1);
  if (!r) return false;
  const toOwner = !r.assigneeClickupId;
  return enqueueNotification({
    tenantId,
    kind: 'reminder',
    dedupeKey: `mq:${kind}:${ref}`,
    forClickupUserId: r.assigneeClickupId ?? null,
    forName: r.assigneeName ?? null,
    requestId: r.id,
    payload: {
      text: `${html}\n<i>Encargo: ${escapeHtml(r.title)}</i>`,
      toOwner,
      buttons: [[{ text: '✍️ Escribir', data: `mq:w:${kind}:${r.id}` }, { text: 'No aplica', data: `mq:n:${kind}:${r.id}` }]]
    }
  });
}

export const OPS_WORK_SOURCE: WorkSource = { completedSince, clientCompleted, workload, askAboutTask };

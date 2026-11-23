import 'server-only';

// Operaciones ofrece al núcleo (registerWorkSource) lo que otros módulos necesitan saber del trabajo hecho para un
// cliente, sin importar Operaciones (15 nov 2026, módulo Estrategia):
//   - encargos de clientes terminados (título, descripción, nota de cierre, tipo, minutos trabajados);
//   - carga del cliente (horas del mes frente a las contratadas, encargos próximos y abiertos);
//   - una pregunta a quien hizo un encargo («¿En qué URL se publicó?»), por la cola de avisos, con los botones
//     «✍️ Escribir» y «No aplica». La respuesta la recibe el manejador registrado para ese tipo de pregunta.
//   - (16 nov 2026, el estratega) encargos abiertos de un cliente, lo que suele tardar el equipo por tipo de trabajo,
//     los tipos de trabajo y crear un encargo para un cliente (mismo camino que la herramienta «crear_encargo»: la IA
//     de notas elige lista, responsable y fecha con las fichas, y se sube a ClickUp con reintentos).
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsClientActivity, opsClients, opsRequests, opsTaskTimes, roles, userRoles, users } from '@/lib/db/schema';
import type { NewTaskInput, OpenWorkItem, WorkItem, WorkSource } from '@/lib/core/capabilities';
import { getPrompt } from '@/lib/ai/gateway';
import { publicError } from '@/lib/errors';
import { listClients } from '@/lib/operaciones/clients';
import { enqueueNotification } from '@/lib/operaciones/notifications';
import { NOTE_PROMPT_KEY, proposeRequests } from '@/lib/operaciones/request-proposer';
import { getStructure, validClient } from '@/lib/operaciones/structure';
import { syncToClickUp } from '@/lib/operaciones/sync';
import { escapeHtml } from '@/lib/operaciones/telegram';
import { getWorkTypes, validWorkTypeKey } from '@/lib/operaciones/work-types';

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

async function clientOpen(tenantId: string, clientId: string): Promise<OpenWorkItem[]> {
  const [c] = await db.select({ opt: opsClients.clickupOptionId }).from(opsClients).where(and(eq(opsClients.tenantId, tenantId), eq(opsClients.id, clientId))).limit(1);
  if (!c?.opt) return [];
  const rows = await db
    .select({ id: opsRequests.id, title: opsRequests.title, workType: opsRequests.workTypeKey, status: opsRequests.workStatus, dueDate: opsRequests.dueDate })
    .from(opsRequests)
    .where(and(eq(opsRequests.tenantId, tenantId), eq(opsRequests.clientOptionId, c.opt), ne(opsRequests.workStatus, 'completado')))
    .orderBy(desc(opsRequests.createdAt))
    .limit(100);
  return rows.map((r) => ({ ref: r.id, title: r.title, workType: r.workType ?? null, status: r.status, dueDate: r.dueDate ?? null }));
}

/** Mediana de minutos trabajados por tipo de trabajo en los encargos terminados (solo los que tienen tiempos). */
async function effortByType(tenantId: string, sinceDays: number): Promise<Record<string, { medianMinutes: number; n: number }>> {
  const rows = await db
    .select({ type: opsRequests.workTypeKey, m: sql<number>`coalesce(sum(${opsTaskTimes.workedMinutes}), 0)::int` })
    .from(opsTaskTimes)
    .innerJoin(opsRequests, eq(opsRequests.id, opsTaskTimes.requestId))
    .where(
      and(
        eq(opsTaskTimes.tenantId, tenantId),
        isNull(opsTaskTimes.voidedAt),
        eq(opsRequests.workStatus, 'completado'),
        gte(opsRequests.workStatusAt, new Date(Date.now() - Math.max(1, sinceDays) * 86_400_000))
      )
    )
    .groupBy(opsRequests.id, opsRequests.workTypeKey);
  const by = new Map<string, number[]>();
  for (const r of rows) {
    const m = Number(r.m) || 0;
    if (m <= 0) continue;
    const k = r.type || 'sin_tipo';
    by.set(k, [...(by.get(k) ?? []), m]);
  }
  const out: Record<string, { medianMinutes: number; n: number }> = {};
  for (const [k, list] of by) {
    const v = [...list].sort((a, b) => a - b);
    const mid = Math.floor(v.length / 2);
    out[k] = { medianMinutes: v.length % 2 ? v[mid] : Math.round((v[mid - 1] + v[mid]) / 2), n: v.length };
  }
  return out;
}

async function workTypes(tenantId: string) {
  return (await getWorkTypes(tenantId)).map((w) => ({ key: w.key, label: w.label }));
}

async function ownerUserId(tenantId: string): Promise<number | null> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .innerJoin(userRoles, eq(userRoles.userId, users.id))
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(and(eq(users.tenantId, tenantId), eq(roles.name, 'super_admin')))
    .orderBy(users.id)
    .limit(1);
  return row?.id ?? null;
}

/**
 * Crea un encargo para un cliente desde otro módulo: la IA de notas elige lista, responsable y fecha con las fichas
 * (como «crear_encargo»); el título, la descripción y el tipo son los que llegan. Se sube a ClickUp con reintentos.
 */
async function createTask(tenantId: string, input: NewTaskInput): Promise<{ ok: boolean; ref: string | null; url: string | null; message: string }> {
  try {
    const client = (await listClients(tenantId)).find((c) => c.id === input.clientId);
    if (!client) return { ok: false, ref: null, url: null, message: 'El cliente no está en Operaciones.' };
    const structure = await getStructure(tenantId);
    const spaceId = client.usualSpaceId ?? structure.spaces.find((s) => s.selected && s.lists.length)?.id;
    const space = structure.spaces.find((s) => s.id === spaceId);
    if (!space) return { ok: false, ref: null, url: null, message: 'El cliente no tiene espacio habitual de ClickUp en su ficha.' };
    const prompt = await getPrompt(NOTE_PROMPT_KEY);
    if (!prompt) return { ok: false, ref: null, url: null, message: 'El prompt de conversión de notas está desactivado.' };
    const text = `Cliente: ${client.name}\nEncargo: ${input.title}\n\n${input.description}`.slice(0, 6000);
    const { items } = await proposeRequests(tenantId, { text, spaceId: space.id, spaceName: space.name, assigneeClickupId: null, assigneeName: null }, prompt);
    const item = items.find((i) => i.listId);
    if (!item) return { ok: false, ref: null, url: null, message: 'No he encontrado una lista de ClickUp que encaje: créalo a mano.' };
    const createdBy = await ownerUserId(tenantId);
    if (!createdBy) return { ok: false, ref: null, url: null, message: 'No hay administrador en la cuenta.' };
    const lists = new Map(structure.spaces.flatMap((s) => s.lists.map((l) => [l.id, l.name])));
    const clientFields = validClient(structure, item.listId, item.clientOptionId ?? '');
    const [row] = await db
      .insert(opsRequests)
      .values({
        tenantId,
        createdBy,
        clickupListId: item.listId,
        clickupListName: lists.get(item.listId) ?? null,
        title: input.title.slice(0, 500),
        originalRequest: `Propuesto por el estratega y aprobado por ${input.requestedBy}.`.slice(0, 8000),
        preparedDescription: input.description,
        assigneeClickupId: item.assigneeId || null,
        assigneeName: item.assigneeName || null,
        dueDate: item.dueDate || null,
        priority: item.priority,
        workTypeKey: await validWorkTypeKey(tenantId, input.workType ?? item.workTypeKey ?? null),
        ...clientFields,
        // Proyecto del que nace (cimientos, 23 nov 2026): el estratega o el plan de mejora de un proyecto.
        projectId: input.projectId ?? null,
        status: 'pendiente_clickup'
      })
      .returning({ id: opsRequests.id });
    const res = await syncToClickUp(row.id, tenantId, false);
    return {
      ok: true,
      ref: row.id,
      url: res.ok ? (res.taskUrl ?? null) : null,
      message: res.ok ? `Encargo creado${item.assigneeName ? ` para ${item.assigneeName}` : ''}.` : 'Encargo guardado, pero ClickUp falló: reinténtalo desde Encargos o Salud.'
    };
  } catch (e) {
    console.error('[operaciones] crear encargo desde otro módulo:', e instanceof Error ? e.message : e);
    return { ok: false, ref: null, url: null, message: publicError(e, 'No se pudo crear el encargo') };
  }
}

/** Estado de varios encargos (registro de intervenciones del núcleo). Operaciones no tiene «cancelado»: un encargo
 * borrado simplemente no aparece. */
async function requestStatus(tenantId: string, refs: string[]): Promise<{ ref: string; doneAt: string | null; cancelled: boolean }[]> {
  const ids = [...new Set(refs.filter((r) => /^[0-9a-f-]{36}$/i.test(r)))].slice(0, 500);
  if (!ids.length) return [];
  const rows = await db
    .select({ id: opsRequests.id, workStatus: opsRequests.workStatus, at: opsRequests.workStatusAt })
    .from(opsRequests)
    .where(and(eq(opsRequests.tenantId, tenantId), inArray(opsRequests.id, ids)));
  return rows.map((r) => ({ ref: r.id, doneAt: r.workStatus === 'completado' ? r.at.toISOString() : null, cancelled: false }));
}

export const OPS_WORK_SOURCE: WorkSource = { completedSince, clientCompleted, workload, askAboutTask, clientOpen, effortByType, workTypes, createTask, requestStatus };

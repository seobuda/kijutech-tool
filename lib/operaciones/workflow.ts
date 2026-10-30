// Flujo de trabajo de un encargo desde Telegram (y desde «Mi bandeja»):
//   asignado → en_curso → (bloqueado) → en_revision → completado      («devuelto» = vuelve a en curso)
// Reglas:
//  - Cada transición es atómica (UPDATE … WHERE work_status IN (…)): pulsar dos veces no duplica nada.
//  - Todo cambio en ClickUp (estado o comentario) pasa por la bandeja de salida con reintentos (outbox.ts).
//  - Si la lista no tiene el estado equivalente (ops_status_map), solo se deja un comentario.
//  - Cada acción queda en ops_request_events (persona, encargo, tipo, hora).
//  - La revisión la hace el «revisor» del encargo (reviewers.ts), intercambiable.
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsRequests, type OpsRequest } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';
import { logEvent, type Actor } from '@/lib/operaciones/events';
import { enqueueOutbox } from '@/lib/operaciones/outbox';
import { getStatusMapFor } from '@/lib/operaciones/status-map';
import { enqueueNotification, refreshNotice } from '@/lib/operaciones/notifications';
import { getReviewer } from '@/lib/operaciones/reviewers';
import { escapeHtml } from '@/lib/operaciones/telegram';

export type Step = 'inProgress' | 'inReview' | 'done';
export type ActionResult = { ok: true; req: OpsRequest } | { ok: false; reason: string };

const OPEN = ['asignado', 'en_curso', 'devuelto', 'bloqueado'];

const STEP_LABEL: Record<Step, string> = {
  inProgress: '▶️ en curso',
  inReview: '👀 en revisión',
  done: '✅ completada'
};

export async function getRequest(tenantId: string, id: string): Promise<OpsRequest | null> {
  const [r] = await db
    .select()
    .from(opsRequests)
    .where(and(eq(opsRequests.id, id), eq(opsRequests.tenantId, tenantId)))
    .limit(1);
  return r ?? null;
}

// Transición atómica: solo se aplica si el encargo sigue en uno de los estados de origen.
export async function transition(
  req: OpsRequest,
  to: string,
  from: string[],
  extra: Partial<typeof opsRequests.$inferInsert> = {}
): Promise<OpsRequest | null> {
  const [row] = await db
    .update(opsRequests)
    .set({ ...extra, workStatus: to, workStatusAt: new Date(), updatedAt: new Date() })
    .where(and(eq(opsRequests.id, req.id), eq(opsRequests.tenantId, req.tenantId), inArray(opsRequests.workStatus, from)))
    .returning();
  return row ?? null;
}

// Refleja el paso en ClickUp: cambia el estado si la lista lo tiene mapeado; si no, deja un comentario.
export async function pushToClickUp(req: OpsRequest, step: Step, actorName: string, comment?: string | null) {
  if (!req.clickupTaskId) return;
  const map = await getStatusMapFor(req.tenantId, req.clickupListId);
  const target = map[step];
  const stamp = Date.now();
  const extra = comment ? ` — ${comment}` : '';
  if (target) {
    await enqueueOutbox({
      tenantId: req.tenantId,
      requestId: req.id,
      action: 'set_status',
      payload: { taskId: req.clickupTaskId, status: target },
      dedupeKey: `status:${req.id}:${step}:${stamp}`
    });
    if (comment) {
      await enqueueOutbox({
        tenantId: req.tenantId,
        requestId: req.id,
        action: 'comment',
        payload: { taskId: req.clickupTaskId, text: `[Kijutech] ${actorName}: ${comment}` },
        dedupeKey: `comment:${req.id}:${step}:${stamp}`
      });
    }
  } else {
    await enqueueOutbox({
      tenantId: req.tenantId,
      requestId: req.id,
      action: 'comment',
      payload: {
        taskId: req.clickupTaskId,
        text: `[Kijutech] ${actorName}: ${STEP_LABEL[step]}${extra} (la lista no tiene un estado equivalente: no se cambió el estado)`
      },
      dedupeKey: `comment:${req.id}:${step}:${stamp}`
    });
  }
}

export async function commentOnTask(req: OpsRequest, text: string, key: string) {
  if (!req.clickupTaskId) return;
  await enqueueOutbox({
    tenantId: req.tenantId,
    requestId: req.id,
    action: 'comment',
    payload: { taskId: req.clickupTaskId, text: `[Kijutech] ${text}` },
    dedupeKey: `comment:${req.id}:${key}:${Date.now()}`
  });
}

// Aviso inmediato a la persona responsable del encargo.
export async function notifyPerson(
  req: OpsRequest,
  kind: 'reply' | 'returned',
  html: string,
  buttons?: { text: string; data: string }[][]
) {
  await enqueueNotification({
    tenantId: req.tenantId,
    kind,
    dedupeKey: `${kind}:${req.id}:${Date.now()}`,
    forClickupUserId: req.assigneeClickupId,
    forName: req.assigneeName,
    requestId: req.id,
    payload: { text: html, buttons }
  });
}

// ▶️ Empezar
// principal: si el encargo tenía varios responsables avisados, quien pulsa Empezar pasa a ser el principal.
export async function startWork(
  req: OpsRequest,
  actor: Actor,
  principal?: { id: string; name: string }
): Promise<ActionResult> {
  const takeOver = principal && principal.id !== req.assigneeClickupId && (req.candidateIds ?? []).includes(principal.id);
  const row = await transition(req, 'en_curso', ['asignado', 'devuelto', 'bloqueado'], {
    seenAt: req.seenAt ?? new Date(),
    ...(takeOver ? { assigneeClickupId: principal.id, assigneeName: principal.name } : {})
  });
  if (!row) return { ok: false, reason: 'Este encargo ya no está pendiente de empezar.' };
  await logEvent(req.tenantId, {
    requestId: req.id,
    actor,
    type: 'start',
    payload: takeOver ? { principal: principal.name } : undefined
  });
  await pushToClickUp(row, 'inProgress', actor.name);
  await refreshNotice(req.tenantId, req.id);
  return { ok: true, req: row };
}

// 🕐 Más tarde: la persona ha visto el aviso y empezará después. Cuenta como «visto»; no cambia el estado.
export async function laterWork(req: OpsRequest, person: Actor): Promise<ActionResult> {
  if (req.workStatus !== 'asignado') return { ok: false, reason: 'Este encargo ya no está pendiente de empezar.' };
  await db
    .update(opsRequests)
    .set({ seenAt: sql`coalesce(${opsRequests.seenAt}, now())`, seenBy: sql`coalesce(${opsRequests.seenBy}, ${person.name})` })
    .where(eq(opsRequests.id, req.id));
  await logEvent(req.tenantId, { requestId: req.id, actor: person, type: 'later' });
  // El aviso de esa persona recuerda que pulsó «Más tarde» (ya no se le ofrece ese botón).
  if (person.clickupUserId) {
    await db.execute(sql`
      UPDATE ops_notifications SET payload = jsonb_set(payload, '{later}', 'true')
      WHERE tenant_id = ${req.tenantId} AND request_id = ${req.id} AND kind = 'new_request'
        AND for_clickup_user_id = ${person.clickupUserId}`);
  }
  await refreshNotice(req.tenantId, req.id);
  return { ok: true, req };
}

// ✅ Hecho / 👀 Hecho, ¿lo revisas?  (note = enlace o comentario, opcional)
export async function finishWork(
  req: OpsRequest,
  actor: Actor,
  note: string | null,
  askReview: boolean
): Promise<ActionResult> {
  const cleanNote = note?.trim() || null;
  // «Hecho» en un encargo con revisor también pasa a revisión.
  const review = askReview || Boolean(req.reviewerKey);
  const reviewerKey = review ? (req.reviewerKey ?? 'owner') : req.reviewerKey;
  const row = await transition(req, review ? 'en_revision' : 'completado', OPEN, {
    doneNote: cleanNote,
    reviewerKey
  });
  if (!row) return { ok: false, reason: 'Este encargo ya está entregado.' };

  await logEvent(req.tenantId, {
    requestId: req.id,
    actor,
    type: review ? 'done_review' : 'done',
    payload: { note: cleanNote }
  });
  await pushToClickUp(row, review ? 'inReview' : 'done', actor.name, cleanNote);
  if (review) {
    const reviewer = getReviewer(reviewerKey);
    if (reviewer) await reviewer.requestReview({ req: row, submittedBy: actor, note: cleanNote });
  }
  await refreshNotice(req.tenantId, req.id);
  return { ok: true, req: row };
}

// Quien revisa acepta: la tarea se completa.
export async function acceptWork(req: OpsRequest, reviewer: Actor): Promise<ActionResult> {
  const row = await transition(req, 'completado', ['en_revision']);
  if (!row) return { ok: false, reason: 'Este encargo ya no está en revisión.' };
  await logEvent(req.tenantId, { requestId: req.id, actor: reviewer, type: 'accepted' });
  await pushToClickUp(row, 'done', reviewer.name, 'Revisado y aceptado');
  await notifyPerson(row, 'reply', `✅ <b>Aprobado</b>: ${escapeHtml(row.title)}\nQuien revisa ha aceptado tu entrega.`);
  await refreshNotice(req.tenantId, req.id);
  return { ok: true, req: row };
}

// Quien revisa devuelve con un motivo: vuelve a «en curso» y la persona lo recibe.
export async function returnWork(req: OpsRequest, reviewer: Actor, reason: string): Promise<ActionResult> {
  const cleanReason = reason.trim() || 'Sin motivo indicado';
  const row = await transition(req, 'devuelto', ['en_revision']);
  if (!row) return { ok: false, reason: 'Este encargo ya no está en revisión.' };
  await logEvent(req.tenantId, { requestId: req.id, actor: reviewer, type: 'returned', payload: { reason: cleanReason } });
  await pushToClickUp(row, 'inProgress', reviewer.name, `Devuelto: ${cleanReason}`);
  await notifyPerson(
    row,
    'returned',
    `↩️ <b>Te han devuelto el encargo</b>\n<b>${escapeHtml(row.title)}</b>\nMotivo: ${escapeHtml(cleanReason)}${
      row.clickupTaskUrl ? `\n🔗 <a href="${row.clickupTaskUrl.replace(/"/g, '%22')}">Abrir la tarea</a>` : ''
    }`,
    [
      [
        { text: '🚫 Bloqueado', data: `bl:${row.id}` },
        { text: '✅ Hecho', data: `dn:${row.id}` }
      ],
      [{ text: '👀 Hecho, ¿lo revisas?', data: `dr:${row.id}` }]
    ]
  );
  await refreshNotice(req.tenantId, req.id);
  return { ok: true, req: row };
}

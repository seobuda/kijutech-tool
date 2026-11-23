import 'server-only';

// Núcleo: comunicaciones con clientes (cimientos, 23 nov 2026; docs/DISENO-TECNICO-CIMIENTOS.md §2).
// Todo lo que sale hacia un cliente, lo escriba una persona, un agente o el sistema, pasa por aquí:
//   1. Se eligen los destinatarios por el tipo de mensaje (qué recibe cada contacto). Si no hay ninguno, no se crea:
//      se devuelve «sin_destinatario» y quien lo pedía queda bloqueado hasta que alguien añada el contacto.
//   2. Si la política lo pide (por defecto, siempre), queda «pendiente de aprobación» y se avisa al dueño.
//   3. Aprobado, se envía por la cola de trabajos (comms.send) con el buzón que haya registrado un módulo: una sola vez.
//   4. Las respuestas del cliente entran por el buzón y se unen a su hilo (receiveClientReply).
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clientContactSubscriptions, clientContacts, clientMessages, clients, tenants, type ClientMessage } from '@/lib/db/schema';
import { clientReplyListeners, commsApprovalNotifier, mailSender } from '@/lib/core/capabilities';
import { enqueueJob, registerJobKind } from '@/lib/core/jobs';
import { COMMS_KINDS, needsApproval, ourThreadKeys, recipientsFor, threadKeyFor, type CommsKind, type ContactForRouting, type SubscriptionKind } from '@/lib/core/comms-rules';

export type Author = { kind: 'persona' | 'agente' | 'sistema'; name: string; userId?: number | null; agentKey?: string | null };

export type NewClientMessage = {
  tenantId: string;
  clientId: string;
  projectId?: string | null;
  kind: CommsKind;
  subject: string;
  body: string;
  author: Author;
  /** Evita duplicados si el mismo origen lo pide dos veces (p. ej. «preguntas:<proyecto>:<semana>»). */
  dedupeKey?: string;
  /** Obliga a pasar por aprobación aunque la política diga «nunca» (p. ej. un agente que ha leído webs en ese turno). */
  forceApproval?: boolean;
};

export type CreateResult =
  | { ok: true; id: string; status: 'pendiente_aprobacion' | 'aprobado'; recipients: string[] }
  | { ok: false; reason: 'sin_destinatario' | 'cliente_no_encontrado' | 'tipo_no_valido' | 'texto_vacio' | 'duplicado'; detail: string };

// --- Contactos y suscripciones ----------------------------------------------------------------------------------------

/** Contactos del cliente con lo que recibe cada uno (para la regla de destinatarios y la ficha). */
export async function contactsForRouting(tenantId: string, clientId: string): Promise<ContactForRouting[]> {
  const contacts = await db
    .select({ id: clientContacts.id, name: clientContacts.name, email: clientContacts.email, active: clientContacts.active })
    .from(clientContacts)
    .where(and(eq(clientContacts.tenantId, tenantId), eq(clientContacts.clientId, clientId)));
  if (!contacts.length) return [];
  const subs = await db
    .select({ contactId: clientContactSubscriptions.contactId, kind: clientContactSubscriptions.kind, projectId: clientContactSubscriptions.projectId })
    .from(clientContactSubscriptions)
    .where(and(eq(clientContactSubscriptions.tenantId, tenantId), inArray(clientContactSubscriptions.contactId, contacts.map((c) => c.id))));
  return contacts.map((c) => ({ ...c, subscriptions: subs.filter((s) => s.contactId === c.id).map((s) => ({ kind: s.kind, projectId: s.projectId })) }));
}

/** Fija lo que recibe un contacto (sustituye lo anterior de ese ámbito: todos los proyectos o uno). */
export async function setContactSubscriptions(tenantId: string, contactId: string, kinds: SubscriptionKind[], projectId: string | null = null): Promise<void> {
  const [c] = await db.select({ id: clientContacts.id }).from(clientContacts).where(and(eq(clientContacts.id, contactId), eq(clientContacts.tenantId, tenantId))).limit(1);
  if (!c) throw new Error('Contacto no encontrado');
  await db.transaction(async (tx) => {
    await tx
      .delete(clientContactSubscriptions)
      .where(
        and(
          eq(clientContactSubscriptions.contactId, contactId),
          projectId ? eq(clientContactSubscriptions.projectId, projectId) : sql`${clientContactSubscriptions.projectId} IS NULL`
        )
      );
    const unique = [...new Set(kinds)];
    if (unique.length) await tx.insert(clientContactSubscriptions).values(unique.map((kind) => ({ tenantId, contactId, kind, projectId })));
  });
}

/** ¿Hay a quién enviar este tipo de mensaje? (para bloquear un paso antes de intentarlo). */
export async function canReach(tenantId: string, clientId: string, kind: CommsKind, projectId: string | null = null): Promise<boolean> {
  return recipientsFor(await contactsForRouting(tenantId, clientId), kind, projectId).length > 0;
}

async function approvalRequired(tenantId: string, clientId: string): Promise<boolean> {
  const [row] = await db
    .select({ tenantDefault: tenants.commsApprovalDefault, clientSetting: clients.commsApproval })
    .from(clients)
    .innerJoin(tenants, eq(tenants.id, clients.tenantId))
    .where(and(eq(clients.id, clientId), eq(clients.tenantId, tenantId)))
    .limit(1);
  return needsApproval(row?.tenantDefault, row?.clientSetting);
}

// --- Crear, aprobar, descartar ----------------------------------------------------------------------------------------

export async function createClientMessage(m: NewClientMessage): Promise<CreateResult> {
  if (!COMMS_KINDS.includes(m.kind)) return { ok: false, reason: 'tipo_no_valido', detail: `Tipo de mensaje desconocido: ${m.kind}` };
  const subject = m.subject.trim().slice(0, 300);
  const body = m.body.trim().slice(0, 20000);
  if (!subject || !body) return { ok: false, reason: 'texto_vacio', detail: 'Falta el asunto o el texto' };
  const [client] = await db.select({ id: clients.id, name: clients.name }).from(clients).where(and(eq(clients.id, m.clientId), eq(clients.tenantId, m.tenantId))).limit(1);
  if (!client) return { ok: false, reason: 'cliente_no_encontrado', detail: 'Cliente no encontrado' };
  const to = recipientsFor(await contactsForRouting(m.tenantId, m.clientId), m.kind, m.projectId ?? null);
  if (!to.length) {
    return {
      ok: false,
      reason: 'sin_destinatario',
      detail: `${client.name} no tiene ningún contacto con correo que reciba «${m.kind}». Añádelo en la ficha (Contactos) para poder escribirle.`
    };
  }
  const approval = m.forceApproval === true || (await approvalRequired(m.tenantId, m.clientId));
  const id = crypto.randomUUID();
  const domain = (await mailSender()?.domain(m.tenantId).catch(() => null)) ?? 'kijutech.local';
  const dedupeKey = (m.dedupeKey ?? `msg:${id}`).slice(0, 200);
  const inserted = await db
    .insert(clientMessages)
    .values({
      id,
      tenantId: m.tenantId,
      clientId: m.clientId,
      projectId: m.projectId ?? null,
      kind: m.kind,
      subject,
      bodyText: body,
      toContactIds: to.map((c) => c.id),
      authorKind: m.author.kind,
      authorName: m.author.name.slice(0, 255),
      authorUserId: m.author.userId ?? null,
      authorAgentKey: m.author.agentKey ?? null,
      status: approval ? 'pendiente_aprobacion' : 'aprobado',
      approvalRequired: approval,
      threadKey: threadKeyFor(id, domain),
      dedupeKey
    })
    .onConflictDoNothing({ target: [clientMessages.tenantId, clientMessages.dedupeKey] })
    .returning({ id: clientMessages.id });
  if (!inserted.length) return { ok: false, reason: 'duplicado', detail: 'Ese mensaje ya estaba creado' };
  if (approval) {
    await commsApprovalNotifier()?.notify({ tenantId: m.tenantId, messageId: id, clientName: client.name, kind: m.kind, subject, body, author: m.author.name }).catch((e) =>
      console.error('[comunicaciones] aviso de aprobación:', e instanceof Error ? e.message : e)
    );
  } else {
    await enqueueSend(m.tenantId, id);
  }
  return { ok: true, id, status: approval ? 'pendiente_aprobacion' : 'aprobado', recipients: to.map((c) => c.name) };
}

async function enqueueSend(tenantId: string, id: string): Promise<void> {
  await enqueueJob({ tenantId, kind: 'comms.send', payload: { messageId: id }, priority: 2, dedupeKey: `comms.send:${id}`, maxAttempts: 5 });
}

export type DecisionResult = { ok: true } | { ok: false; error: string };

/** Aprueba (y, si se corrige, sustituye el texto) un mensaje pendiente. Solo pasa si sigue pendiente. */
export async function approveClientMessage(tenantId: string, id: string, by: string, corrected?: { subject?: string; body?: string }): Promise<DecisionResult> {
  const set: Partial<ClientMessage> = { status: 'aprobado', decidedBy: by.slice(0, 255), decidedAt: new Date(), updatedAt: new Date() };
  if (corrected?.subject?.trim()) set.subject = corrected.subject.trim().slice(0, 300);
  if (corrected?.body?.trim()) set.bodyText = corrected.body.trim().slice(0, 20000);
  const rows = await db
    .update(clientMessages)
    .set(set)
    .where(and(eq(clientMessages.id, id), eq(clientMessages.tenantId, tenantId), eq(clientMessages.status, 'pendiente_aprobacion')))
    .returning({ id: clientMessages.id });
  if (!rows.length) return { ok: false, error: 'Este mensaje ya no está pendiente' };
  await enqueueSend(tenantId, id);
  return { ok: true };
}

export async function rejectClientMessage(tenantId: string, id: string, by: string, reason?: string): Promise<DecisionResult> {
  const rows = await db
    .update(clientMessages)
    .set({ status: 'rechazado', decidedBy: by.slice(0, 255), decidedAt: new Date(), rejectReason: reason?.trim().slice(0, 1000) || null, updatedAt: new Date() })
    .where(and(eq(clientMessages.id, id), eq(clientMessages.tenantId, tenantId), eq(clientMessages.status, 'pendiente_aprobacion')))
    .returning({ id: clientMessages.id });
  return rows.length ? { ok: true } : { ok: false, error: 'Este mensaje ya no está pendiente' };
}

export type PendingMessage = { id: string; clientId: string; clientName: string; projectId: string | null; kind: string; subject: string; body: string; author: string; to: string[]; since: Date };

/** Mensajes que esperan aprobación (Para ti). */
export async function pendingClientMessages(tenantId: string, limit = 50): Promise<PendingMessage[]> {
  const rows = await db
    .select({ m: clientMessages, clientName: clients.name })
    .from(clientMessages)
    .innerJoin(clients, eq(clients.id, clientMessages.clientId))
    .where(and(eq(clientMessages.tenantId, tenantId), eq(clientMessages.status, 'pendiente_aprobacion')))
    .orderBy(clientMessages.createdAt)
    .limit(limit);
  const ids = [...new Set(rows.flatMap((r) => r.m.toContactIds))];
  const names = ids.length ? await db.select({ id: clientContacts.id, name: clientContacts.name, email: clientContacts.email }).from(clientContacts).where(inArray(clientContacts.id, ids)) : [];
  const byId = new Map(names.map((n) => [n.id, `${n.name}${n.email ? ` <${n.email}>` : ''}`]));
  return rows.map(({ m, clientName }) => ({
    id: m.id,
    clientId: m.clientId,
    clientName,
    projectId: m.projectId,
    kind: m.kind,
    subject: m.subject,
    body: m.bodyText,
    author: m.authorName,
    to: m.toContactIds.map((i) => byId.get(i) ?? '—'),
    since: m.createdAt
  }));
}

/** Últimos mensajes de un cliente (ficha). */
export async function clientMessageHistory(tenantId: string, clientId: string, limit = 30): Promise<ClientMessage[]> {
  return db
    .select()
    .from(clientMessages)
    .where(and(eq(clientMessages.tenantId, tenantId), eq(clientMessages.clientId, clientId)))
    .orderBy(desc(clientMessages.createdAt))
    .limit(limit);
}

// --- Enviar (trabajo de la cola) -------------------------------------------------------------------------------------

/** Envía un mensaje aprobado. Idempotente: si ya se envió, no hace nada. Lo usa el trabajo «comms.send». */
export async function sendApprovedMessage(tenantId: string, id: string): Promise<{ sent: boolean; detail: string }> {
  const [m] = await db.select().from(clientMessages).where(and(eq(clientMessages.id, id), eq(clientMessages.tenantId, tenantId))).limit(1);
  if (!m) return { sent: false, detail: 'no existe' };
  if (m.status === 'enviado') return { sent: false, detail: 'ya enviado' };
  if (m.status !== 'aprobado' && m.status !== 'fallido') return { sent: false, detail: `estado ${m.status}` };
  const sender = mailSender();
  if (!sender) throw new Error('No hay buzón conectado para enviar correos a clientes');
  const people = await db
    .select({ id: clientContacts.id, name: clientContacts.name, email: clientContacts.email, active: clientContacts.active })
    .from(clientContacts)
    .where(inArray(clientContacts.id, [...m.toContactIds, ...m.ccContactIds]));
  const pick = (ids: string[]) => ids.map((i) => people.find((p) => p.id === i)).filter((p): p is (typeof people)[number] & { email: string } => Boolean(p?.active && p.email)).map((p) => ({ email: p.email, name: p.name }));
  const to = pick(m.toContactIds);
  if (!to.length) {
    await db.update(clientMessages).set({ status: 'fallido', lastError: 'Ningún destinatario sigue activo y con correo', updatedAt: new Date() }).where(eq(clientMessages.id, id));
    return { sent: false, detail: 'sin destinatario' };
  }
  try {
    const r = await sender.send(tenantId, { to, cc: pick(m.ccContactIds), subject: m.subject, text: m.bodyText, messageId: m.threadKey, idempotencyKey: `cm-${m.id}` });
    await db.update(clientMessages).set({ status: 'enviado', sentAt: new Date(), providerMessageId: r.providerId.slice(0, 300), lastError: null, updatedAt: new Date() }).where(eq(clientMessages.id, id));
    return { sent: true, detail: `a ${to.length}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.update(clientMessages).set({ status: 'fallido', lastError: msg.slice(0, 1000), updatedAt: new Date() }).where(eq(clientMessages.id, id));
    throw e;
  }
}

/** Registra el trabajo de envío en la cola (lo llama wireApp). */
export function registerCommsJobs(): void {
  registerJobKind({
    kind: 'comms.send',
    timeoutS: 60,
    maxConcurrent: 2,
    maxAttempts: 5,
    run: async (ctx, payload) => sendApprovedMessage(ctx.tenantId, String(payload.messageId ?? ''))
  });
}

// --- Respuestas del cliente -----------------------------------------------------------------------------------------

/**
 * Una respuesta que ha entrado por el buzón (In-Reply-To / References). Si responde a un mensaje nuestro, se avisa a
 * los módulos interesados (p. ej. SEO completa el expediente con ella). Devuelve el mensaje al que responde, o null.
 */
export async function receiveClientReply(r: { tenantId: string; inboundId: string; clientId: string | null; inReplyTo: string | null; references: string | null; subject: string; text: string; from: string }): Promise<{ messageId: string } | null> {
  const keys = [...new Set([...ourThreadKeys(r.inReplyTo), ...ourThreadKeys(r.references)])];
  if (!keys.length) return null;
  const [m] = await db
    .select()
    .from(clientMessages)
    .where(and(eq(clientMessages.tenantId, r.tenantId), inArray(sql`lower(${clientMessages.threadKey})`, keys)))
    .limit(1);
  if (!m) return null;
  for (const fn of clientReplyListeners()) {
    await fn({ tenantId: r.tenantId, inboundId: r.inboundId, clientId: r.clientId ?? m.clientId, threadKeys: keys, subject: r.subject, text: r.text, from: r.from, messageId: m.id, projectId: m.projectId, kind: m.kind }).catch((e) =>
      console.error('[comunicaciones] respuesta:', e instanceof Error ? e.message : e)
    );
  }
  return { messageId: m.id };
}

import 'server-only';

// Núcleo: preguntas al cliente (25 nov 2026; docs/DISENO-PREGUNTAS-CLIENTE.md). Lo usan todos los departamentos.
//   1. Banco editable por servicio (client_question_templates). A cada cliente le tocan las de General y las de los
//      servicios que le hacemos (Operaciones lo dice por setClientServicesSource). Las periódicas vuelven a abrirse
//      cuando pasa su plazo desde la última respuesta.
//   2. Los módulos aportan preguntas de datos que les faltan (SEO: huecos del expediente) y reciben su respuesta.
//   3. Cada cliente tiene sus preguntas (client_questions): se pueden editar, quitar o responder a mano.
//   4. Envío por las comunicaciones del núcleo (aprobación incluida): correo corto (≤5) o cuestionario en línea con un
//      enlace privado que caduca (client_questionnaires; solo se guarda el hash del token).
//   5. La respuesta por correo la lee Haiku con cita literal; la del cuestionario llega ya ordenada. Cada respuesta va
//      a su destino: un campo de la ficha (solo si estaba vacío), la memoria del cliente o el módulo que la pidió.
import { createHash, randomBytes } from 'node:crypto';
import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  clientCommsTemplates,
  clientContacts,
  clientMessages,
  clientQuestionTemplates,
  clientQuestionnaires,
  clientQuestions,
  clients,
  type ClientQuestion
} from '@/lib/db/schema';
import { clientAnswerHandler, clientQuestionSources, clientServicesSource, registerClientReplyListener, telegramOutbound, type ServiceInfo } from '@/lib/core/capabilities';
import { contactsForRouting, createClientMessage, setContactSubscriptions, type Author } from '@/lib/core/comms';
import { recipientsFor } from '@/lib/core/comms-rules';
import { addMemory } from '@/lib/core/clients';
import { enqueueJob, registerJobKind, registerProcess } from '@/lib/core/jobs';
import { callAI, getPrompt } from '@/lib/ai/gateway';
import { extractJsonFromLLMResponse } from '@/lib/ai/parsers/json-extractor';
import {
  AUTO_COOLDOWN_DAYS,
  cleanAnswer,
  cleanExtracted,
  cleanProposals,
  COMMS_TEMPLATE_KEYS,
  DEFAULT_COMMS_TEMPLATES,
  ensureLink,
  FICHA_TARGETS,
  fillTemplate,
  isFichaTarget,
  isMemoryTarget,
  joinLabels,
  looksLikeToken,
  MEMORY_TARGETS,
  moduleOfTarget,
  numberedList,
  QUESTIONNAIRE_DAYS,
  stripQuotedReply,
  suggestedDelivery,
  templatesToClose,
  templatesToOpen,
  validateQuestionInput,
  type CommsTemplateKey,
  type Delivery,
  type ProposedQuestion
} from '@/lib/core/questions-rules';

export class QuestionsError extends Error {
  constructor(public userMessage: string) {
    super(userMessage);
  }
}

export const READ_PROMPT = 'clientes_leer_respuestas';
export const PROPOSE_PROMPT = 'clientes_proponer_preguntas';
const READ_MODEL = 'claude-haiku-5-5';
const PROPOSE_MODEL = 'claude-sonnet-5-5';
export const DAILY_PROCESS = 'clientes.preguntas.diaria';
/** Una pregunta de dato respondida no se vuelve a abrir antes de este plazo aunque el módulo siga pidiéndola. */
const DATO_REASK_DAYS = 90;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const squash = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

// --- Servicios ----------------------------------------------------------------------------------------------------

export async function allServices(tenantId: string): Promise<ServiceInfo[]> {
  return (await clientServicesSource()?.all(tenantId).catch(() => [])) ?? [];
}
async function servicesOf(tenantId: string, clientId: string): Promise<string[]> {
  return (await clientServicesSource()?.ofClient(tenantId, clientId).catch(() => [])) ?? [];
}

async function ownClient(tenantId: string, clientId: string) {
  const [c] = await db.select().from(clients).where(and(eq(clients.id, clientId), eq(clients.tenantId, tenantId))).limit(1);
  if (!c) throw new QuestionsError('Cliente no encontrado');
  return c;
}

// --- Banco --------------------------------------------------------------------------------------------------------

export type TemplateInput = { serviceKey: string | null; text: string; help?: string | null; answerType: string; target: string; askWhen: string; repeatDays?: number | null };

export async function listTemplates(tenantId: string) {
  return db.select().from(clientQuestionTemplates).where(eq(clientQuestionTemplates.tenantId, tenantId)).orderBy(asc(clientQuestionTemplates.sortOrder), asc(clientQuestionTemplates.createdAt));
}

async function checkService(tenantId: string, key: string | null): Promise<string | null> {
  if (key === null || key === '') return null;
  const all = await allServices(tenantId);
  if (!all.some((s) => s.key === key)) throw new QuestionsError('Servicio no válido');
  return key;
}

export async function createTemplate(tenantId: string, input: TemplateInput, by: string, origin: 'manual' | 'ia' = 'manual'): Promise<string> {
  const v = validateQuestionInput(input);
  if (!v.ok) throw new QuestionsError(v.error);
  const serviceKey = await checkService(tenantId, input.serviceKey);
  const [{ max }] = await db
    .select({ max: sql<number>`coalesce(max(${clientQuestionTemplates.sortOrder}), 0)::int` })
    .from(clientQuestionTemplates)
    .where(and(eq(clientQuestionTemplates.tenantId, tenantId), serviceKey ? eq(clientQuestionTemplates.serviceKey, serviceKey) : isNull(clientQuestionTemplates.serviceKey)));
  const [row] = await db
    .insert(clientQuestionTemplates)
    .values({ tenantId, serviceKey, ...v.value, sortOrder: Number(max) + 10, origin, updatedBy: by.slice(0, 255) })
    .returning({ id: clientQuestionTemplates.id });
  return row.id;
}

export async function updateTemplate(tenantId: string, id: string, input: Omit<TemplateInput, 'serviceKey'> & { active: boolean }, by: string): Promise<void> {
  const v = validateQuestionInput(input);
  if (!v.ok) throw new QuestionsError(v.error);
  const rows = await db
    .update(clientQuestionTemplates)
    .set({ ...v.value, active: input.active, updatedBy: by.slice(0, 255), updatedAt: new Date() })
    .where(and(eq(clientQuestionTemplates.id, id), eq(clientQuestionTemplates.tenantId, tenantId)))
    .returning({ id: clientQuestionTemplates.id });
  if (!rows.length) throw new QuestionsError('Pregunta no encontrada');
  // Las pendientes que salen de ella (sin texto propio del cliente) se ponen al día.
  await db
    .update(clientQuestions)
    .set({ text: v.value.text, help: v.value.help, answerType: v.value.answerType, target: v.value.target, updatedAt: new Date() })
    .where(and(eq(clientQuestions.templateId, id), eq(clientQuestions.status, 'pendiente'), eq(clientQuestions.customText, false)));
}

/** Borra una pregunta del banco. Las pendientes que salían de ella se quitan; las ya enviadas o respondidas se quedan. */
export async function deleteTemplate(tenantId: string, id: string): Promise<void> {
  const [t] = await db.select({ id: clientQuestionTemplates.id }).from(clientQuestionTemplates).where(and(eq(clientQuestionTemplates.id, id), eq(clientQuestionTemplates.tenantId, tenantId))).limit(1);
  if (!t) throw new QuestionsError('Pregunta no encontrada');
  await db.transaction(async (tx) => {
    await tx.delete(clientQuestions).where(and(eq(clientQuestions.templateId, id), eq(clientQuestions.status, 'pendiente'), eq(clientQuestions.customText, false)));
    await tx.delete(clientQuestionTemplates).where(eq(clientQuestionTemplates.id, id));
  });
}

/** Sube o baja una pregunta dentro de su servicio. */
export async function moveTemplate(tenantId: string, id: string, dir: 'up' | 'down'): Promise<void> {
  const all = await listTemplates(tenantId);
  const t = all.find((x) => x.id === id);
  if (!t) throw new QuestionsError('Pregunta no encontrada');
  const group = all.filter((x) => x.serviceKey === t.serviceKey);
  const i = group.findIndex((x) => x.id === id);
  const j = dir === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= group.length) return;
  const order = group.map((x) => x.id);
  [order[i], order[j]] = [order[j], order[i]];
  await db.transaction(async (tx) => {
    for (let k = 0; k < order.length; k++) await tx.update(clientQuestionTemplates).set({ sortOrder: (k + 1) * 10 }).where(eq(clientQuestionTemplates.id, order[k]));
  });
}

// --- Textos de los correos ----------------------------------------------------------------------------------------

export type CommsTemplateView = { key: CommsTemplateKey; subject: string; body: string; custom: boolean; updatedBy: string | null; updatedAt: string | null };

export async function getCommsTemplates(tenantId: string): Promise<Record<CommsTemplateKey, CommsTemplateView>> {
  const rows = await db.select().from(clientCommsTemplates).where(eq(clientCommsTemplates.tenantId, tenantId));
  const out = {} as Record<CommsTemplateKey, CommsTemplateView>;
  for (const key of COMMS_TEMPLATE_KEYS) {
    const r = rows.find((x) => x.key === key);
    out[key] = r
      ? { key, subject: r.subject, body: r.body, custom: true, updatedBy: r.updatedBy, updatedAt: r.updatedAt.toISOString() }
      : { key, ...DEFAULT_COMMS_TEMPLATES[key], custom: false, updatedBy: null, updatedAt: null };
  }
  return out;
}

export async function saveCommsTemplate(tenantId: string, key: string, subject: string, body: string, by: string): Promise<void> {
  if (!(COMMS_TEMPLATE_KEYS as readonly string[]).includes(key)) throw new QuestionsError('Plantilla no válida');
  const s = subject.replace(/\s+/g, ' ').trim().slice(0, 300);
  const b = body.replace(/\r\n/g, '\n').trim().slice(0, 8000);
  if (!s || b.length < 10) throw new QuestionsError('Falta el asunto o el texto');
  if (key === 'preguntas_correo' && !b.includes('{preguntas}')) throw new QuestionsError('El texto debe llevar {preguntas}: ahí van las preguntas');
  if (key === 'preguntas_cuestionario' && !b.includes('{enlace}')) throw new QuestionsError('El texto debe llevar {enlace}: ahí va el enlace al cuestionario');
  await db
    .insert(clientCommsTemplates)
    .values({ tenantId, key, subject: s, body: b, updatedBy: by.slice(0, 255) })
    .onConflictDoUpdate({ target: [clientCommsTemplates.tenantId, clientCommsTemplates.key], set: { subject: s, body: b, updatedBy: by.slice(0, 255), updatedAt: new Date() } });
}

/** Vuelve al texto por defecto (borra el propio). */
export async function resetCommsTemplate(tenantId: string, key: string): Promise<void> {
  await db.delete(clientCommsTemplates).where(and(eq(clientCommsTemplates.tenantId, tenantId), eq(clientCommsTemplates.key, key)));
}

// --- Las preguntas de cada cliente: poner al día --------------------------------------------------------------------

/**
 * Pone al día las preguntas de un cliente: abre las del banco que le tocan (y las periódicas vencidas), quita las
 * pendientes que ya no tocan, devuelve a pendiente las de un correo descartado y recalcula las de los módulos.
 */
export async function syncClientQuestions(tenantId: string, clientId: string): Promise<void> {
  const [services, templates, rows, svcAll] = await Promise.all([
    servicesOf(tenantId, clientId),
    listTemplates(tenantId),
    db.select().from(clientQuestions).where(and(eq(clientQuestions.tenantId, tenantId), eq(clientQuestions.clientId, clientId))),
    allServices(tenantId)
  ]);
  const now = new Date();
  // Orden: primero las generales, luego cada servicio (en el orden de los servicios), luego los datos que faltan y las
  // sueltas. Dentro de cada bloque, el orden del banco.
  const order = (t: { serviceKey: string | null; sortOrder: number }) => (t.serviceKey === null ? 0 : (Math.max(0, svcAll.findIndex((x) => x.key === t.serviceKey)) + 1) * 10000) + t.sortOrder;
  for (const r of rows) {
    if (r.origin !== 'banco' || !r.templateId || (r.status !== 'pendiente' && r.status !== 'enviada')) continue;
    const t = templates.find((x) => x.id === r.templateId);
    if (t && order(t) !== r.sortOrder) await db.update(clientQuestions).set({ sortOrder: order(t) }).where(eq(clientQuestions.id, r.id));
  }

  // Correo de preguntas descartado al aprobar: sus preguntas vuelven a «por preguntar».
  const sentIds = [...new Set(rows.filter((r) => r.status === 'enviada' && r.messageId).map((r) => r.messageId!))];
  if (sentIds.length) {
    const rejected = await db.select({ id: clientMessages.id }).from(clientMessages).where(and(inArray(clientMessages.id, sentIds), eq(clientMessages.status, 'rechazado')));
    if (rejected.length) {
      const ids = rejected.map((r) => r.id);
      const qIds = rows.filter((r) => r.messageId && ids.includes(r.messageId)).map((r) => r.questionnaireId).filter((x): x is string => Boolean(x));
      if (qIds.length) await db.update(clientQuestionnaires).set({ status: 'anulado' }).where(and(inArray(clientQuestionnaires.id, qIds), eq(clientQuestionnaires.status, 'activo')));
      await db
        .update(clientQuestions)
        .set({ status: 'pendiente', messageId: null, questionnaireId: null, askedAt: null, answer: null, answerText: null, answeredVia: null, updatedAt: now })
        .where(and(eq(clientQuestions.clientId, clientId), eq(clientQuestions.status, 'enviada'), inArray(clientQuestions.messageId, ids)));
      for (const r of rows) if (r.messageId && ids.includes(r.messageId) && r.status === 'enviada') r.status = 'pendiente';
    }
  }

  // Banco.
  const toOpen = templatesToOpen(templates, services, rows, now);
  if (toOpen.length) {
    await db
      .insert(clientQuestions)
      .values(
        toOpen.map((id) => {
          const t = templates.find((x) => x.id === id)!;
          return { tenantId, clientId, origin: 'banco', templateId: t.id, serviceKey: t.serviceKey, text: t.text, help: t.help, answerType: t.answerType, target: t.target, sortOrder: order(t) };
        })
      )
      .onConflictDoNothing();
  }
  const toClose = templatesToClose(templates, services, rows);
  if (toClose.length) await db.delete(clientQuestions).where(and(inArray(clientQuestions.id, toClose), eq(clientQuestions.status, 'pendiente')));

  // Módulos (datos que les faltan). Si el cliente ya tiene una pregunta del banco que cubre lo mismo, no se abre.
  const bankTargets = new Set(
    [...rows.filter((r) => r.origin === 'banco' && r.status !== 'no_aplica').map((r) => r.target), ...toOpen.map((id) => templates.find((t) => t.id === id)!.target)]
  );
  for (const [module, source] of clientQuestionSources()) {
    let list: Awaited<ReturnType<typeof source>>;
    try {
      list = await source(tenantId, clientId);
    } catch (e) {
      console.error(`[preguntas] fuente ${module}:`, e instanceof Error ? e.message : e);
      continue;
    }
    list = list.filter((q) => q.sourceKey.startsWith(`${module}:`) && !(q.coveredBy && bankTargets.has(q.coveredBy)));
    const keys = new Set(list.map((q) => q.sourceKey));
    const mine = rows.filter((r) => r.origin === 'dato' && r.sourceKey?.startsWith(`${module}:`));
    // Pendientes cuyo dato ya no falta: se quitan (nunca se enviaron).
    const gone = mine.filter((r) => r.status === 'pendiente' && !keys.has(r.sourceKey!)).map((r) => r.id);
    if (gone.length) await db.delete(clientQuestions).where(and(inArray(clientQuestions.id, gone), eq(clientQuestions.status, 'pendiente')));
    for (const q of list) {
      const open = mine.find((r) => r.sourceKey === q.sourceKey && (r.status === 'pendiente' || r.status === 'enviada'));
      if (open) {
        if (open.status === 'pendiente' && !open.customText && open.text !== q.text)
          await db.update(clientQuestions).set({ text: q.text, help: q.help, updatedAt: now }).where(eq(clientQuestions.id, open.id));
        continue;
      }
      // «No aplica» en una pregunta de dato: no se vuelve a abrir mientras siga el mismo dato. Respondida hace poco: tampoco
      // (el módulo puede tardar en dar el dato por bueno; no se le pregunta dos veces lo mismo al cliente).
      if (mine.some((r) => r.sourceKey === q.sourceKey && r.status === 'no_aplica')) continue;
      if (mine.some((r) => r.sourceKey === q.sourceKey && r.status === 'respondida' && now.getTime() - (r.answeredAt ?? r.updatedAt).getTime() < DATO_REASK_DAYS * 86_400_000)) continue;
      await db
        .insert(clientQuestions)
        .values({ tenantId, clientId, origin: 'dato', sourceKey: q.sourceKey, serviceKey: q.serviceKey, projectId: q.projectId, text: q.text, help: q.help, answerType: q.answerType, target: q.target, sortOrder: 900000 })
        .onConflictDoNothing();
    }
  }
}

// --- Vista de la pestaña Preguntas ----------------------------------------------------------------------------------

export type ClientQuestionView = {
  id: string;
  origin: string;
  serviceKey: string | null;
  text: string;
  help: string | null;
  customText: boolean;
  answerType: string;
  target: string;
  status: string;
  answerText: string | null;
  answerQuote: string | null;
  answeredVia: string | null;
  answeredBy: string | null;
  answeredAt: string | null;
  applied: string | null;
  /** Lo que pone la ficha ahora, si la respuesta es distinta (para «Usar esta respuesta»). */
  fichaNow: string | null;
  askedAt: string | null;
  via: Delivery | null;
  /** Borrador del cliente en el cuestionario (aún sin enviar). */
  draft: string | null;
  /** Correo en el que va (para distinguir «preparada, esperando aprobación» de «enviada»). */
  messageId: string | null;
};

export type ClientQuestionsView = {
  clientId: string;
  clientName: string;
  services: ServiceInfo[];
  clientServices: string[];
  questions: ClientQuestionView[];
  recipients: { id: string; name: string; email: string }[];
  /** Contactos activos con correo que aún no reciben «Preguntas» (para marcarlos aquí mismo). */
  candidates: { id: string; name: string; email: string; receives: string[] }[];
  pendingMessage: { id: string; subject: string; body: string; createdAt: string; to: string[] } | null;
  questionnaire: { id: string; messageId: string | null; createdAt: string; expiresAt: string; lastSeenAt: string | null; total: number; answered: number; drafts: number } | null;
  lastSent: { subject: string; sentAt: string | null; createdAt: string; status: string } | null;
  templates: Record<CommsTemplateKey, { subject: string; body: string }>;
};

export async function clientQuestionsView(tenantId: string, clientId: string): Promise<ClientQuestionsView> {
  const client = await ownClient(tenantId, clientId);
  await syncClientQuestions(tenantId, clientId);
  const [services, clientServices, rows, contacts, [pending], [lastMsg], [qn], templates] = await Promise.all([
    allServices(tenantId),
    servicesOf(tenantId, clientId),
    db
      .select()
      .from(clientQuestions)
      .where(and(eq(clientQuestions.tenantId, tenantId), eq(clientQuestions.clientId, clientId)))
      .orderBy(asc(clientQuestions.sortOrder), asc(clientQuestions.createdAt)),
    contactsForRouting(tenantId, clientId),
    db
      .select()
      .from(clientMessages)
      .where(and(eq(clientMessages.tenantId, tenantId), eq(clientMessages.clientId, clientId), eq(clientMessages.kind, 'preguntas'), eq(clientMessages.status, 'pendiente_aprobacion')))
      .orderBy(desc(clientMessages.createdAt))
      .limit(1),
    db
      .select()
      .from(clientMessages)
      .where(and(eq(clientMessages.tenantId, tenantId), eq(clientMessages.clientId, clientId), eq(clientMessages.kind, 'preguntas')))
      .orderBy(desc(clientMessages.createdAt))
      .limit(1),
    db
      .select()
      .from(clientQuestionnaires)
      .where(and(eq(clientQuestionnaires.tenantId, tenantId), eq(clientQuestionnaires.clientId, clientId), eq(clientQuestionnaires.status, 'activo')))
      .orderBy(desc(clientQuestionnaires.createdAt))
      .limit(1),
    getCommsTemplates(tenantId)
  ]);
  const recipients = recipientsFor(contacts, 'preguntas', null).map((c) => ({ id: c.id, name: c.name, email: c.email! }));
  const candidates = contacts
    .filter((c) => c.active && c.email?.includes('@') && !recipients.some((r) => r.id === c.id))
    .map((c) => ({ id: c.id, name: c.name, email: c.email!, receives: c.subscriptions.filter((s) => s.projectId === null).map((s) => s.kind) }));
  const toNames = pending ? contacts.filter((c) => pending.toContactIds.includes(c.id)).map((c) => `${c.name} <${c.email}>`) : [];
  const fichaValue = (target: string): string | null => {
    if (!isFichaTarget(target)) return null;
    const v = (client as Record<string, unknown>)[FICHA_TARGETS[target].column];
    return typeof v === 'string' && v.trim() ? v : null;
  };
  const qnRows = qn ? rows.filter((r) => r.questionnaireId === qn.id) : [];
  return {
    clientId,
    clientName: client.name,
    services,
    clientServices,
    questions: rows.map((r) => ({
      id: r.id,
      origin: r.origin,
      serviceKey: r.serviceKey,
      text: r.text,
      help: r.help,
      customText: r.customText,
      answerType: r.answerType,
      target: r.target,
      status: r.status,
      answerText: r.status === 'respondida' ? r.answerText : null,
      answerQuote: r.answerQuote,
      answeredVia: r.answeredVia,
      answeredBy: r.answeredBy,
      answeredAt: r.answeredAt?.toISOString() ?? null,
      applied: r.applied,
      fichaNow: r.applied === 'distinta' ? fichaValue(r.target) : null,
      askedAt: r.askedAt?.toISOString() ?? null,
      via: r.status === 'enviada' ? (r.questionnaireId ? 'cuestionario' : 'correo') : null,
      draft: r.status === 'enviada' && r.answerText ? r.answerText : null,
      messageId: r.messageId
    })),
    recipients,
    candidates,
    pendingMessage: pending ? { id: pending.id, subject: pending.subject, body: pending.bodyText, createdAt: pending.createdAt.toISOString(), to: toNames } : null,
    questionnaire: qn
      ? {
          id: qn.id,
          messageId: qn.messageId,
          createdAt: qn.createdAt.toISOString(),
          expiresAt: qn.expiresAt.toISOString(),
          lastSeenAt: qn.lastSeenAt?.toISOString() ?? null,
          total: qnRows.length,
          answered: qnRows.filter((r) => r.status === 'respondida').length,
          drafts: qnRows.filter((r) => r.status === 'enviada' && r.answerText).length
        }
      : null,
    lastSent: lastMsg ? { subject: lastMsg.subject, sentAt: lastMsg.sentAt?.toISOString() ?? null, createdAt: lastMsg.createdAt.toISOString(), status: lastMsg.status } : null,
    templates: Object.fromEntries(COMMS_TEMPLATE_KEYS.map((k) => [k, { subject: templates[k].subject, body: templates[k].body }])) as ClientQuestionsView['templates']
  };
}

/** Cuántas hay por preguntar (para el número de la pestaña), sin poner al día (barato). */
export async function pendingQuestionsCount(tenantId: string, clientId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(clientQuestions)
    .where(and(eq(clientQuestions.tenantId, tenantId), eq(clientQuestions.clientId, clientId), eq(clientQuestions.status, 'pendiente')));
  return Number(r?.n ?? 0);
}

// --- Cambios en las preguntas de un cliente ----------------------------------------------------------------------------

async function ownQuestion(tenantId: string, id: string): Promise<ClientQuestion> {
  const [q] = await db.select().from(clientQuestions).where(and(eq(clientQuestions.id, id), eq(clientQuestions.tenantId, tenantId))).limit(1);
  if (!q) throw new QuestionsError('Pregunta no encontrada');
  return q;
}

/** Pregunta solo para este cliente. */
export async function addLooseQuestion(tenantId: string, clientId: string, input: { text: string; help?: string | null; answerType: string; target: string }): Promise<string> {
  await ownClient(tenantId, clientId);
  const v = validateQuestionInput({ ...input, askWhen: 'alta' });
  if (!v.ok) throw new QuestionsError(v.error);
  const [row] = await db
    .insert(clientQuestions)
    .values({ tenantId, clientId, origin: 'suelta', text: v.value.text, help: v.value.help, answerType: v.value.answerType, target: v.value.target, customText: true, sortOrder: 100000 })
    .returning({ id: clientQuestions.id });
  return row.id;
}

/** Cambia el texto solo para este cliente (el banco ya no lo pisa). */
export async function editClientQuestion(tenantId: string, id: string, text: string, help: string | null): Promise<void> {
  const q = await ownQuestion(tenantId, id);
  if (q.status !== 'pendiente') throw new QuestionsError('Solo se puede cambiar una pregunta que aún no se ha enviado');
  const v = validateQuestionInput({ text, help, answerType: q.answerType, target: isFichaTarget(q.target) || isMemoryTarget(q.target) ? q.target : 'memoria', askWhen: 'alta' });
  if (!v.ok) throw new QuestionsError(v.error);
  await db.update(clientQuestions).set({ text: v.value.text, help: v.value.help, customText: true, updatedAt: new Date() }).where(eq(clientQuestions.id, id));
}

/** «No aplica» (no se le pregunta a este cliente) o volver a «por preguntar». */
export async function setQuestionStatus(tenantId: string, id: string, to: 'no_aplica' | 'pendiente'): Promise<void> {
  const q = await ownQuestion(tenantId, id);
  if (to === 'no_aplica' && q.status === 'respondida') throw new QuestionsError('Ya está respondida');
  if (to === 'pendiente' && q.status === 'pendiente') return;
  if (to === 'pendiente' && q.status === 'respondida') {
    // Volver a preguntar una respondida: se queda la respuesta en el historial y se abre una nueva.
    await db
      .insert(clientQuestions)
      .values({ tenantId, clientId: q.clientId, origin: q.origin, templateId: q.templateId, sourceKey: q.sourceKey, serviceKey: q.serviceKey, projectId: q.projectId, text: q.text, help: q.help, customText: q.customText, answerType: q.answerType, target: q.target, sortOrder: q.sortOrder })
      .onConflictDoNothing();
    return;
  }
  // Una suelta marcada como «no aplica» no tiene sentido guardarla: se borra.
  if (to === 'no_aplica' && q.origin === 'suelta' && q.status === 'pendiente') {
    await db.delete(clientQuestions).where(eq(clientQuestions.id, id));
    return;
  }
  await db
    .update(clientQuestions)
    .set({ status: to, messageId: to === 'pendiente' ? null : q.messageId, questionnaireId: to === 'pendiente' ? null : q.questionnaireId, askedAt: to === 'pendiente' ? null : q.askedAt, updatedAt: new Date() })
    .where(eq(clientQuestions.id, id));
}

/** Respuesta apuntada por una persona (p. ej. se lo dijo por teléfono). */
export async function answerManually(tenantId: string, id: string, raw: unknown, by: string): Promise<void> {
  const q = await ownQuestion(tenantId, id);
  if (q.status === 'no_aplica') throw new QuestionsError('Esta pregunta está marcada como «no aplica»');
  const v = cleanAnswer(q.answerType, raw);
  if (!v) throw new QuestionsError('Escribe la respuesta');
  await applyAnswer(q, { value: v.value, text: v.text, quote: v.text, via: 'manual', by });
}

/** La ficha decía otra cosa: se sustituye por la respuesta del cliente. */
export async function applyAnswerToFicha(tenantId: string, id: string): Promise<void> {
  const q = await ownQuestion(tenantId, id);
  if (q.status !== 'respondida' || !q.answerText || !isFichaTarget(q.target)) throw new QuestionsError('Esta respuesta no va a la ficha');
  const column = FICHA_TARGETS[q.target].column;
  await db.update(clients).set({ [column]: q.answerText.slice(0, 5000), updatedAt: new Date() }).where(and(eq(clients.id, q.clientId), eq(clients.tenantId, tenantId)));
  await db.update(clientQuestions).set({ applied: 'aplicada', updatedAt: new Date() }).where(eq(clientQuestions.id, id));
}

// --- Guardar una respuesta en su destino ----------------------------------------------------------------------------

type AnswerIn = { value: unknown; text: string; quote: string; via: 'correo' | 'cuestionario' | 'manual'; by: string };

async function applyAnswer(q: ClientQuestion, a: AnswerIn): Promise<void> {
  let applied: 'aplicada' | 'distinta' | 'no' = 'no';
  try {
    if (isFichaTarget(q.target)) {
      const column = FICHA_TARGETS[q.target].column;
      const [c] = await db.select().from(clients).where(eq(clients.id, q.clientId)).limit(1);
      const now = c ? (c as Record<string, unknown>)[column] : null;
      const cur = typeof now === 'string' ? now.trim() : '';
      if (!cur) {
        await db.update(clients).set({ [column]: a.text.slice(0, 5000), updatedAt: new Date() }).where(eq(clients.id, q.clientId));
        applied = 'aplicada';
      } else applied = squash(cur) === squash(a.text) ? 'aplicada' : 'distinta';
    } else if (isMemoryTarget(q.target)) {
      const text = `${q.text.replace(/\?$/, '')}? → ${a.text}`.replace(/\?\?/g, '?').slice(0, 1000);
      await addMemory(q.tenantId, q.clientId, { kind: MEMORY_TARGETS[q.target].kind, text, status: 'aceptado', sourceType: a.via === 'correo' ? 'email' : 'manual', sourceId: q.id });
      applied = 'aplicada';
    } else {
      const module = moduleOfTarget(q.target);
      const handler = module ? clientAnswerHandler(module) : null;
      if (handler) {
        await handler({ tenantId: q.tenantId, clientId: q.clientId, projectId: q.projectId, target: q.target, value: a.value, text: a.text, quote: a.quote, via: a.via, by: a.by });
        applied = 'aplicada';
      }
    }
  } catch (e) {
    // La respuesta no se pierde aunque falle su destino: queda en la pregunta.
    console.error('[preguntas] destino de la respuesta:', e instanceof Error ? e.message : e);
  }
  await db
    .update(clientQuestions)
    .set({
      status: 'respondida',
      answer: (a.value ?? null) as object | null,
      answerText: a.text.slice(0, 5000),
      answerQuote: a.quote.slice(0, 2000),
      answeredVia: a.via,
      answeredBy: a.by.slice(0, 255),
      answeredAt: new Date(),
      applied,
      updatedAt: new Date()
    })
    .where(eq(clientQuestions.id, q.id));
}

// --- Contactos que reciben las preguntas ------------------------------------------------------------------------------

/** Marca un contacto para recibir «Preguntas» (sin tocar lo demás que ya recibe). */
export async function addQuestionsRecipient(tenantId: string, clientId: string, contactId: string): Promise<void> {
  const [c] = await db.select({ id: clientContacts.id }).from(clientContacts).where(and(eq(clientContacts.id, contactId), eq(clientContacts.clientId, clientId), eq(clientContacts.tenantId, tenantId))).limit(1);
  if (!c) throw new QuestionsError('Contacto no encontrado');
  const routing = await contactsForRouting(tenantId, clientId);
  const now = routing.find((r) => r.id === contactId)?.subscriptions.filter((s) => s.projectId === null).map((s) => s.kind) ?? [];
  if (now.includes('preguntas') || now.includes('todo')) return;
  await setContactSubscriptions(tenantId, contactId, [...now, 'preguntas'] as Parameters<typeof setContactSubscriptions>[2]);
}

// --- Preparar el envío ---------------------------------------------------------------------------------------------

export type PrepareInput = { ids: string[]; delivery: Delivery; subject?: string; body?: string };
export type PrepareResult = { status: 'pendiente_aprobacion' | 'aprobado'; delivery: Delivery; count: number };

function baseUrl(): string {
  return (process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '');
}

/** Textos del correo para unas preguntas (lo que se ve en la vista previa, sin el enlace). */
export function renderQuestionsEmail(tpl: { subject: string; body: string }, input: { clientName: string; texts: string[]; services: string[]; delivery: Delivery }) {
  const vars: Record<string, string> = {
    cliente: input.clientName,
    n: String(input.texts.length),
    preguntas: numberedList(input.texts),
    servicios: joinLabels(input.services) || 'nuestro trabajo'
  };
  return { subject: fillTemplate(tpl.subject, vars), body: fillTemplate(input.delivery === 'cuestionario' ? ensureLink(tpl.body) : tpl.body, vars) };
}

export async function prepareQuestionsSend(tenantId: string, clientId: string, input: PrepareInput, author: Author): Promise<PrepareResult> {
  const client = await ownClient(tenantId, clientId);
  const ids = [...new Set(input.ids)].slice(0, 60);
  if (!ids.length) throw new QuestionsError('Elige al menos una pregunta');
  const rows = await db
    .select()
    .from(clientQuestions)
    .where(and(eq(clientQuestions.tenantId, tenantId), eq(clientQuestions.clientId, clientId), inArray(clientQuestions.id, ids), inArray(clientQuestions.status, ['pendiente', 'enviada'])))
    .orderBy(asc(clientQuestions.sortOrder), asc(clientQuestions.createdAt));
  if (rows.length !== ids.length) throw new QuestionsError('Alguna pregunta ya no está por preguntar: recarga la página');
  const [waiting] = await db
    .select({ id: clientMessages.id })
    .from(clientMessages)
    .where(and(eq(clientMessages.tenantId, tenantId), eq(clientMessages.clientId, clientId), eq(clientMessages.kind, 'preguntas'), eq(clientMessages.status, 'pendiente_aprobacion')))
    .limit(1);
  if (waiting) throw new QuestionsError('Ya hay un correo de preguntas esperando aprobación: apruébalo o descártalo primero');

  const delivery: Delivery = input.delivery === 'cuestionario' ? 'cuestionario' : 'correo';
  const tpls = await getCommsTemplates(tenantId);
  const key: CommsTemplateKey = delivery === 'cuestionario' ? 'preguntas_cuestionario' : 'preguntas_correo';
  const svcAll = await allServices(tenantId);
  const svcLabels = [...new Set(rows.map((r) => r.serviceKey).filter((k): k is string => Boolean(k)))].map((k) => svcAll.find((s) => s.key === k)?.label ?? k);
  const rendered = renderQuestionsEmail(tpls[key], { clientName: client.name, texts: rows.map((r) => r.text), services: svcLabels, delivery });
  const subject = (input.subject?.trim() || rendered.subject).slice(0, 300);
  let body = (input.body?.trim() || rendered.body).slice(0, 20000);

  let questionnaire: { id: string } | null = null;
  if (delivery === 'cuestionario') {
    // Un solo cuestionario activo por cliente: el anterior se anula y lo que no está en el nuevo vuelve a pendiente.
    const prev = await db
      .select({ id: clientQuestionnaires.id })
      .from(clientQuestionnaires)
      .where(and(eq(clientQuestionnaires.tenantId, tenantId), eq(clientQuestionnaires.clientId, clientId), eq(clientQuestionnaires.status, 'activo')));
    if (prev.length) {
      await finalizeDrafts(tenantId, prev.map((p) => p.id));
      await db.update(clientQuestionnaires).set({ status: 'anulado' }).where(inArray(clientQuestionnaires.id, prev.map((p) => p.id)));
    }
    const token = randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + QUESTIONNAIRE_DAYS * 86_400_000);
    const [qn] = await db
      .insert(clientQuestionnaires)
      .values({ tenantId, clientId, tokenHash: hashToken(token), expiresAt, createdByName: author.name.slice(0, 255) })
      .returning({ id: clientQuestionnaires.id });
    questionnaire = qn;
    body = fillTemplate(ensureLink(body), { enlace: `${baseUrl()}/cuestionario/${token}`, caduca: expiresAt.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) });
  }

  const r = await createClientMessage({ tenantId, clientId, kind: 'preguntas', subject, body, author, dedupeKey: `cq:${clientId}:${crypto.randomUUID()}` });
  if (!r.ok) {
    if (questionnaire) await db.update(clientQuestionnaires).set({ status: 'anulado' }).where(eq(clientQuestionnaires.id, questionnaire.id));
    throw new QuestionsError(r.detail);
  }
  if (questionnaire) await db.update(clientQuestionnaires).set({ messageId: r.id }).where(eq(clientQuestionnaires.id, questionnaire.id));
  await db
    .update(clientQuestions)
    .set({ status: 'enviada', askedAt: new Date(), messageId: r.id, questionnaireId: questionnaire?.id ?? null, answer: null, answerText: null, answeredVia: null, updatedAt: new Date() })
    .where(inArray(clientQuestions.id, rows.map((x) => x.id)));
  return { status: r.status, delivery, count: rows.length };
}

/**
 * Envío automático (lo pide un módulo, p. ej. SEO tras reunir el expediente): todas las pendientes, por el canal que
 * toque según cuántas sean. No hace nada si no hay a quién escribir, si hay uno esperando aprobación o si ya se le
 * escribió hace menos de AUTO_COOLDOWN_DAYS. Siempre pasa por la política de aprobación.
 */
export async function autoPrepareQuestions(tenantId: string, clientId: string, author: Author): Promise<{ prepared: boolean; reason: string }> {
  await syncClientQuestions(tenantId, clientId);
  const recent = await db
    .select({ id: clientMessages.id })
    .from(clientMessages)
    .where(
      and(
        eq(clientMessages.tenantId, tenantId),
        eq(clientMessages.clientId, clientId),
        eq(clientMessages.kind, 'preguntas'),
        sql`(${clientMessages.status} = 'pendiente_aprobacion' OR ${clientMessages.createdAt} > now() - make_interval(days => ${AUTO_COOLDOWN_DAYS}))`
      )
    )
    .limit(1);
  if (recent.length) return { prepared: false, reason: 'ya se le escribió hace poco o hay uno esperando aprobación' };
  if (!recipientsFor(await contactsForRouting(tenantId, clientId), 'preguntas', null).length) return { prepared: false, reason: 'sin contacto para preguntas' };
  const pending = await db
    .select({ id: clientQuestions.id })
    .from(clientQuestions)
    .where(and(eq(clientQuestions.tenantId, tenantId), eq(clientQuestions.clientId, clientId), eq(clientQuestions.status, 'pendiente')))
    .orderBy(asc(clientQuestions.sortOrder), asc(clientQuestions.createdAt))
    .limit(60);
  if (!pending.length) return { prepared: false, reason: 'nada que preguntar' };
  const r = await prepareQuestionsSend(tenantId, clientId, { ids: pending.map((p) => p.id), delivery: suggestedDelivery(pending.length) }, author);
  return { prepared: true, reason: `${r.count} pregunta(s) por ${r.delivery}` };
}

/** Lo pide un módulo: se encola (no bloquea a quien lo pide). */
export async function requestAutoQuestions(tenantId: string, clientId: string, who: string): Promise<void> {
  await enqueueJob({ tenantId, kind: 'clientes.preguntas.auto', payload: { clientId, who: who.slice(0, 120) }, scopeType: 'cliente', scopeId: clientId, priority: 6, dedupeKey: `clientes.preguntas.auto:${clientId}` });
}

// --- Cuestionario en línea (página pública con enlace privado) --------------------------------------------------------

export type PublicQuestionnaire = {
  clientName: string;
  expiresAt: string;
  status: 'activo' | 'completado' | 'caducado' | 'anulado';
  questions: { id: string; group: string; text: string; help: string | null; answerType: string; value: unknown; text_value: string | null; answered: boolean }[];
};

async function questionnaireByToken(token: string) {
  if (!looksLikeToken(token)) return null;
  const [qn] = await db.select().from(clientQuestionnaires).where(eq(clientQuestionnaires.tokenHash, hashToken(token))).limit(1);
  return qn ?? null;
}

/** Lo que ve el cliente al abrir el enlace. Null si el enlace no existe. */
export async function openQuestionnaire(token: string): Promise<PublicQuestionnaire | null> {
  const qn = await questionnaireByToken(token);
  if (!qn) return null;
  const [c] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, qn.clientId)).limit(1);
  const svcAll = await allServices(qn.tenantId);
  const expired = qn.status === 'activo' && qn.expiresAt.getTime() < Date.now();
  const status = expired ? 'caducado' : (qn.status as PublicQuestionnaire['status']);
  if (status === 'activo') await db.update(clientQuestionnaires).set({ lastSeenAt: new Date() }).where(eq(clientQuestionnaires.id, qn.id));
  const rows =
    status === 'activo'
      ? await db
          .select()
          .from(clientQuestions)
          .where(and(eq(clientQuestions.questionnaireId, qn.id), inArray(clientQuestions.status, ['enviada', 'respondida'])))
          .orderBy(asc(clientQuestions.sortOrder), asc(clientQuestions.createdAt))
      : [];
  return {
    clientName: c?.name ?? '',
    expiresAt: qn.expiresAt.toISOString(),
    status,
    questions: rows.map((r) => ({
      id: r.id,
      // Encabezado para el cliente: generales, cada servicio, datos que confirmar y otras.
      group: r.origin === 'dato' ? 'Datos que queremos confirmar' : r.origin === 'suelta' ? 'Otras preguntas' : r.serviceKey ? svcAll.find((x) => x.key === r.serviceKey)?.label ?? 'Otras preguntas' : 'Sobre vuestro negocio',
      text: r.text, help: r.help, answerType: r.answerType, value: r.answer ?? null, text_value: r.answerText, answered: r.status === 'respondida' }))
  };
}

async function activeQuestionnaire(token: string) {
  const qn = await questionnaireByToken(token);
  if (!qn || qn.status !== 'activo' || qn.expiresAt.getTime() < Date.now()) throw new QuestionsError('Este enlace ya no está activo. Si necesitáis uno nuevo, respondednos al correo.');
  return qn;
}

/** Guarda lo que escribe el cliente en una pregunta (borrador: se entrega al pulsar «Enviar respuestas»). */
export async function saveQuestionnaireDraft(token: string, questionId: string, raw: unknown): Promise<void> {
  const qn = await activeQuestionnaire(token);
  const [q] = await db
    .select()
    .from(clientQuestions)
    .where(and(eq(clientQuestions.id, questionId), eq(clientQuestions.questionnaireId, qn.id), eq(clientQuestions.status, 'enviada')))
    .limit(1);
  if (!q) throw new QuestionsError('Esta pregunta ya no se puede cambiar');
  const v = cleanAnswer(q.answerType, raw);
  await db
    .update(clientQuestions)
    .set({ answer: (v?.value ?? null) as object | null, answerText: v?.text ?? null, answeredVia: v ? 'cuestionario' : null, updatedAt: new Date() })
    .where(eq(clientQuestions.id, q.id));
  await db.update(clientQuestionnaires).set({ lastSeenAt: new Date() }).where(eq(clientQuestionnaires.id, qn.id));
}

/** Entrega los borradores de unos cuestionarios como respuestas (al enviar, al anularlo o al caducar). */
async function finalizeDrafts(tenantId: string, questionnaireIds: string[]): Promise<number> {
  if (!questionnaireIds.length) return 0;
  const drafts = await db
    .select()
    .from(clientQuestions)
    .where(and(eq(clientQuestions.tenantId, tenantId), inArray(clientQuestions.questionnaireId, questionnaireIds), eq(clientQuestions.status, 'enviada'), isNotNull(clientQuestions.answerText)));
  for (const q of drafts) await applyAnswer(q, { value: q.answer, text: q.answerText!, quote: q.answerText!, via: 'cuestionario', by: 'Cliente (cuestionario)' });
  return drafts.length;
}

/** El cliente pulsa «Enviar respuestas». */
export async function submitQuestionnaire(token: string): Promise<{ answered: number; total: number }> {
  const qn = await activeQuestionnaire(token);
  const answered = await finalizeDrafts(qn.tenantId, [qn.id]);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(clientQuestions).where(eq(clientQuestions.questionnaireId, qn.id));
  await db.update(clientQuestionnaires).set({ status: 'completado', completedAt: new Date() }).where(eq(clientQuestionnaires.id, qn.id));
  const [c] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, qn.clientId)).limit(1);
  await telegramOutbound()
    ?.notifyOwner(qn.tenantId, `clientes.cuestionario:${qn.id}`, `📋 <b>${esc(c?.name ?? 'Un cliente')}</b> ha rellenado el cuestionario: ${answered} de ${Number(total)} preguntas respondidas. Míralas en Clientes → ${esc(c?.name ?? '')} → Preguntas.`)
    .catch(() => undefined);
  return { answered, total: Number(total) };
}

/** Anular el cuestionario activo de un cliente (lo ya escrito se guarda; lo que falta vuelve a «por preguntar»). */
export async function cancelQuestionnaire(tenantId: string, clientId: string, questionnaireId: string): Promise<void> {
  const [qn] = await db
    .select()
    .from(clientQuestionnaires)
    .where(and(eq(clientQuestionnaires.id, questionnaireId), eq(clientQuestionnaires.tenantId, tenantId), eq(clientQuestionnaires.clientId, clientId)))
    .limit(1);
  if (!qn || qn.status !== 'activo') throw new QuestionsError('Ese cuestionario ya no está activo');
  await finalizeDrafts(tenantId, [qn.id]);
  await db.update(clientQuestionnaires).set({ status: 'anulado' }).where(eq(clientQuestionnaires.id, qn.id));
  await db
    .update(clientQuestions)
    .set({ status: 'pendiente', messageId: null, questionnaireId: null, askedAt: null, answer: null, answerText: null, answeredVia: null, updatedAt: new Date() })
    .where(and(eq(clientQuestions.questionnaireId, qn.id), eq(clientQuestions.status, 'enviada')));
}

// --- Leer una respuesta por correo -------------------------------------------------------------------------------

export async function readEmailAnswers(tenantId: string, payload: { messageId: string; text: string; from: string }): Promise<{ saved: number; by: string }> {
  const asked = await db
    .select()
    .from(clientQuestions)
    .where(and(eq(clientQuestions.tenantId, tenantId), eq(clientQuestions.messageId, payload.messageId), eq(clientQuestions.status, 'enviada')))
    .orderBy(asc(clientQuestions.sortOrder), asc(clientQuestions.createdAt));
  if (!asked.length) return { saved: 0, by: 'nada' };
  const clientId = asked[0].clientId;
  const [c] = await db.select({ name: clients.name }).from(clients).where(eq(clients.id, clientId)).limit(1);
  const text = stripQuotedReply(payload.text);
  const list = asked.map((q, i) => ({ id: q.id, n: i + 1, type: q.answerType }));
  let found: ReturnType<typeof cleanExtracted> = [];
  let by = 'nada';
  const prompt = await getPrompt(READ_PROMPT);
  if (prompt) {
    try {
      const vals: Record<string, string> = {
        cliente: c?.name ?? '',
        preguntas: asked.map((q, i) => `${i + 1}. ${q.text} [tipo: ${q.answerType}]${q.help ? ` (para qué: ${q.help})` : ''}`).join('\n'),
        respuesta: `<<<DATO NO FIABLE\n${text.slice(0, 8000)}\nFIN>>>`
      };
      // Una sola pasada: el texto del cliente no puede colarse en otro hueco de la plantilla.
      const fill = (t: string) => t.replace(/\{(cliente|preguntas|respuesta)\}/g, (_m, k: string) => vals[k] ?? '');
      const res = await callAI({
        tenantId,
        function: READ_PROMPT,
        promptKey: READ_PROMPT,
        model: READ_MODEL,
        preferredProvider: 'anthropic',
        maxTokens: 3000,
        messages: [
          { role: 'system', content: prompt.system_prompt },
          { role: 'user', content: fill(prompt.user_prompt_template) }
        ]
      });
      found = cleanExtracted(extractJsonFromLLMResponse(res.content), list, text);
      by = 'ia';
    } catch (e) {
      console.error('[preguntas] lectura con IA:', e instanceof Error ? e.message : e);
    }
  }
  const who = `Cliente (${payload.from.slice(0, 150)})`;
  for (const f of found) {
    const q = asked.find((x) => x.id === f.id)!;
    await applyAnswer(q, { value: f.value, text: f.text, quote: f.quote, via: 'correo', by: who });
  }
  const name = esc(c?.name ?? 'El cliente');
  await telegramOutbound()
    ?.notifyOwner(
      tenantId,
      `clientes.preguntas.leidas:${payload.messageId}:${Date.now()}`,
      found.length
        ? `📋 <b>${name}</b> ha respondido a las preguntas: ${found.length} de ${asked.length} guardadas. Míralas en Clientes → ${name} → Preguntas.`
        : `📋 <b>${name}</b> ha respondido a las preguntas, pero no he sabido sacar ninguna respuesta. Léelo en el correo y apúntalas en Clientes → ${name} → Preguntas («Responder a mano»).`
    )
    .catch(() => undefined);
  return { saved: found.length, by };
}

// --- Propuestas de la IA -------------------------------------------------------------------------------------------

/**
 * Propone preguntas para un servicio (o para un cliente concreto, con su ficha como contexto). No guarda nada: una
 * persona elige cuáles entran. Sonnet: es razonamiento de experto, pocas veces al mes (no compensa un modelo menor).
 */
export async function proposeQuestions(tenantId: string, input: { serviceKey: string | null; goal: string; clientId?: string | null }): Promise<ProposedQuestion[]> {
  const prompt = await getPrompt(PROPOSE_PROMPT);
  if (!prompt) throw new QuestionsError('El prompt para proponer preguntas no está activo (IA → Prompts)');
  const goal = input.goal.replace(/\s+/g, ' ').trim().slice(0, 600);
  const services = await allServices(tenantId);
  const service = input.serviceKey ? services.find((s) => s.key === input.serviceKey)?.label ?? input.serviceKey : 'General (para cualquier cliente)';
  let context = 'Ninguno: preguntas genéricas para cualquier cliente de este servicio.';
  let existing: string[] = (await listTemplates(tenantId)).filter((t) => t.serviceKey === (input.serviceKey ?? null)).map((t) => t.text);
  if (input.clientId) {
    const c = await ownClient(tenantId, input.clientId);
    context = [
      `Cliente: ${c.name}`,
      c.sector && `Sector: ${c.sector}`,
      c.business && `A qué se dedica: ${c.business}`,
      c.offerings && `Qué ofrece: ${c.offerings}`,
      c.area && `Zona: ${c.area}`,
      c.goals && `Objetivos: ${c.goals}`
    ]
      .filter(Boolean)
      .join('\n')
      .slice(0, 3000);
    const rows = await db.select({ text: clientQuestions.text, answer: clientQuestions.answerText }).from(clientQuestions).where(eq(clientQuestions.clientId, input.clientId));
    existing = [...existing, ...rows.map((r) => r.text)];
    const answered = rows.filter((r) => r.answer).map((r) => `- ${r.text} → ${r.answer}`).slice(0, 40);
    if (answered.length) context += `\n\nYa sabemos (no lo vuelvas a preguntar):\n${answered.join('\n')}`.slice(0, 3000);
  }
  const vals: Record<string, string> = {
    servicio: service,
    objetivo: goal || 'Lo necesario para empezar a trabajar bien este servicio.',
    contexto: `<<<DATO NO FIABLE\n${context}\nFIN>>>`,
    existentes: existing.length ? existing.map((t) => `- ${t}`).join('\n').slice(0, 6000) : '(ninguna)'
  };
  const fill = (t: string) => t.replace(/\{(servicio|objetivo|contexto|existentes)\}/g, (_m, k: string) => vals[k] ?? '');
  const res = await callAI({
    tenantId,
    function: PROPOSE_PROMPT,
    promptKey: PROPOSE_PROMPT,
    model: PROPOSE_MODEL,
    preferredProvider: 'anthropic',
    maxTokens: 4000,
    messages: [
      { role: 'system', content: prompt.system_prompt },
      { role: 'user', content: fill(prompt.user_prompt_template) }
    ]
  });
  return cleanProposals(extractJsonFromLLMResponse(res.content), existing);
}

// --- Pasada diaria y registro en la cola --------------------------------------------------------------------------

/** Cada día: pone al día las preguntas de los clientes con servicios (periódicas) y cierra cuestionarios caducados. */
export async function dailyQuestionsPass(tenantId: string): Promise<{ clients: number; expired: number }> {
  const ids = (await clientServicesSource()?.clientsWithServices(tenantId).catch(() => [])) ?? [];
  for (const id of ids) {
    try {
      await syncClientQuestions(tenantId, id);
    } catch (e) {
      console.error('[preguntas] pasada diaria:', e instanceof Error ? e.message : e);
    }
  }
  const expired = await db
    .select({ id: clientQuestionnaires.id, clientId: clientQuestionnaires.clientId })
    .from(clientQuestionnaires)
    .where(and(eq(clientQuestionnaires.tenantId, tenantId), eq(clientQuestionnaires.status, 'activo'), lt(clientQuestionnaires.expiresAt, new Date())));
  for (const qn of expired) await cancelQuestionnaire(tenantId, qn.clientId, qn.id).catch(() => undefined);
  return { clients: ids.length, expired: expired.length };
}

let registered = false;
export function registerQuestionsJobs(): void {
  if (registered) return;
  registered = true;
  registerJobKind({
    kind: 'clientes.preguntas.leer',
    timeoutS: 120,
    maxConcurrent: 2,
    maxAttempts: 2,
    run: async (ctx, payload) => readEmailAnswers(ctx.tenantId, { messageId: String(payload.messageId ?? ''), text: String(payload.text ?? ''), from: String(payload.from ?? '') })
  });
  registerJobKind({
    kind: 'clientes.preguntas.auto',
    timeoutS: 60,
    maxConcurrent: 2,
    maxAttempts: 1,
    run: async (ctx, payload) => autoPrepareQuestions(ctx.tenantId, String(payload.clientId ?? ''), { kind: 'sistema', name: String(payload.who ?? 'Sistema') })
  });
  registerJobKind({ kind: DAILY_PROCESS, timeoutS: 300, maxConcurrent: 1, maxAttempts: 2, run: async (ctx) => dailyQuestionsPass(ctx.tenantId) });
  registerProcess({ key: DAILY_PROCESS, scopeType: 'cuenta', label: 'Preguntas al cliente: periódicas y cuestionarios caducados', defaultEveryMinutes: 1440, enqueue: () => ({ kind: DAILY_PROCESS, priority: 8 }) });
  // La respuesta entra por el buzón (Operaciones) y el núcleo la une a su hilo: si el correo llevaba preguntas, se lee.
  registerClientReplyListener('clientes.preguntas', async (r) => {
    if (r.kind !== 'preguntas') return;
    const [linked] = await db.select({ id: clientQuestions.id }).from(clientQuestions).where(eq(clientQuestions.messageId, r.messageId)).limit(1);
    if (!linked) return;
    await enqueueJob({
      tenantId: r.tenantId,
      kind: 'clientes.preguntas.leer',
      payload: { messageId: r.messageId, text: r.text.slice(0, 10000), from: r.from.slice(0, 200) },
      scopeType: 'cliente',
      scopeId: r.clientId ?? undefined,
      priority: 3,
      dedupeKey: `clientes.preguntas.leer:${r.inboundId}`
    });
  });
}

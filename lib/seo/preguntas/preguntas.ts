import 'server-only';

// SEO · Correo de 3 preguntas (Hito 2, 24 nov 2026; docs/DISENO-TECNICO-HITO2.md §4).
//   Preparar: con el expediente al día, si hay algo que el sistema no ha podido averiguar solo, se prepara un correo
//   con como mucho 3 preguntas (reglas y plantilla, sin IA) por las comunicaciones del núcleo: sale del buzón del
//   agente (agente@…) solo cuando Enric lo aprueba, a los contactos del cliente marcados para «Preguntas». Uno por
//   proyecto cada 30 días.
//   Leer: la respuesta del cliente entra por el buzón del agente; el núcleo la une a su hilo y avisa aquí
//   (registerClientReplyListener). Haiku saca cada respuesta a su campo con la cita literal; se guarda en el
//   expediente con origen «cliente», PROVISIONAL: una persona la confirma. El agente del correo, por su parte, ve
//   nuestras preguntas en el hilo y propone la respuesta de agradecimiento (también con aprobación).
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clientMessages, clients, projects, seoDossierFacts } from '@/lib/db/schema';
import { canReach, createClientMessage, type Author } from '@/lib/core/comms';
import { registerClientReplyListener, telegramOutbound } from '@/lib/core/capabilities';
import { enqueueJob, registerJobKind } from '@/lib/core/jobs';
import { callAI, getPrompt } from '@/lib/ai/gateway';
import { extractJsonFromLLMResponse } from '@/lib/ai/parsers/json-extractor';
import { scoreFacts, type FactDraft, type FactSource } from '@/lib/seo/expediente/rules';
import {
  cleanAnswers,
  COOLDOWN_DAYS,
  fieldsFromDedupeKey,
  pickQuestions,
  questionCandidates,
  questionsDedupeKey,
  questionsEmail,
  ruleAnswers,
  stripQuotedReply,
  type Answer,
  type Question,
  type QuestionField
} from '@/lib/seo/preguntas/rules';

export const ANSWERS_PROMPT = 'seo_leer_respuestas';
const ANSWERS_MODEL = 'claude-haiku-5-5';

export type QuestionsState = {
  questions: Question[];
  canSend: boolean;
  /** Por qué no se puede preparar ahora (null = se puede). */
  blocked: string | null;
  last: { id: string; status: string; subject: string; createdAt: string; sentAt: string | null; fields: QuestionField[] } | null;
  answers: number;
};

async function projectClient(tenantId: string, projectId: string) {
  const [p] = await db
    .select({ id: projects.id, name: projects.name, clientId: projects.clientId, clientName: clients.name })
    .from(projects)
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
    .limit(1);
  return p ?? null;
}

async function dossierFacts(projectId: string) {
  return db
    .select({ field: seoDossierFacts.field, value: seoDossierFacts.value, source: seoDossierFacts.source, status: seoDossierFacts.status, confidence: seoDossierFacts.confidence })
    .from(seoDossierFacts)
    .where(eq(seoDossierFacts.projectId, projectId));
}

/** Lo que se preguntaría ahora, el último correo de preguntas del proyecto y si se puede preparar otro. */
export async function questionsState(tenantId: string, projectId: string): Promise<QuestionsState | null> {
  const p = await projectClient(tenantId, projectId);
  if (!p) return null;
  const [facts, [last]] = await Promise.all([
    dossierFacts(projectId),
    db
      .select()
      .from(clientMessages)
      .where(and(eq(clientMessages.tenantId, tenantId), eq(clientMessages.projectId, projectId), eq(clientMessages.kind, 'preguntas')))
      .orderBy(desc(clientMessages.createdAt))
      .limit(1)
  ]);
  const questions = pickQuestions(questionCandidates(facts.map((f) => ({ ...f, source: f.source as FactSource }))));
  const answers = last?.sentAt ? facts.filter((f) => f.source === 'cliente').length : 0;
  let blocked: string | null = null;
  if (!p.clientId) blocked = 'El proyecto no tiene cliente.';
  else if (!facts.length) blocked = 'Primero hay que reunir el expediente.';
  else if (!questions.length) blocked = 'No hay nada que preguntar: el expediente no tiene huecos ni datos dudosos.';
  else if (last && last.status === 'pendiente_aprobacion') blocked = 'Ya hay un correo de preguntas esperando tu aprobación.';
  else if (last && last.status !== 'fallido' && Date.now() - last.createdAt.getTime() < COOLDOWN_DAYS * 86_400_000)
    blocked = `Ya se preparó uno el ${last.createdAt.toLocaleDateString('es-ES')}: como mucho uno cada ${COOLDOWN_DAYS} días.`;
  else if (!(await canReach(tenantId, p.clientId, 'preguntas', projectId)))
    blocked = 'El cliente no tiene ningún contacto con correo que reciba «Preguntas»: márcalo en la ficha (Contactos).';
  return {
    questions,
    canSend: !blocked,
    blocked,
    last: last
      ? { id: last.id, status: last.status, subject: last.subject, createdAt: last.createdAt.toISOString(), sentAt: last.sentAt?.toISOString() ?? null, fields: fieldsFromDedupeKey(last.dedupeKey) }
      : null,
    answers
  };
}

export type PrepareResult = { ok: true; status: string; questions: number } | { ok: false; error: string };

/** Prepara el correo (queda pendiente de aprobación según la política del cliente). */
export async function prepareQuestions(tenantId: string, projectId: string, author: Author): Promise<PrepareResult> {
  const state = await questionsState(tenantId, projectId);
  if (!state) return { ok: false, error: 'Proyecto no encontrado' };
  if (state.blocked) return { ok: false, error: state.blocked };
  const p = (await projectClient(tenantId, projectId))!;
  const { subject, body } = questionsEmail({ businessName: p.clientName ?? p.name, questions: state.questions });
  const day = new Date().toISOString().slice(0, 10);
  const r = await createClientMessage({
    tenantId,
    clientId: p.clientId!,
    projectId,
    kind: 'preguntas',
    subject,
    body,
    author,
    dedupeKey: questionsDedupeKey(projectId, day, state.questions.map((q) => q.field))
  });
  if (!r.ok) return { ok: false, error: r.detail };
  return { ok: true, status: r.status, questions: state.questions.length };
}

/** Tras reunir el expediente: si hay preguntas y se puede, se prepara solo (siempre pasa por la política de aprobación). */
export async function maybeAutoQuestions(tenantId: string, projectId: string): Promise<void> {
  const state = await questionsState(tenantId, projectId);
  if (!state?.canSend) return;
  await enqueueJob({ tenantId, kind: 'seo.preguntas.preparar', payload: { projectId }, scopeType: 'proyecto', scopeId: projectId, priority: 6, dedupeKey: `seo.preguntas:${projectId}` });
}

// --- Leer la respuesta --------------------------------------------------------------------------------------------

async function extractAnswers(tenantId: string, projectId: string, clientName: string, questions: string, asked: QuestionField[], text: string): Promise<{ answers: Answer[]; by: 'ia' | 'reglas' }> {
  const prompt = await getPrompt(ANSWERS_PROMPT);
  if (prompt) {
    try {
      const vals: Record<string, string> = {
        cliente: clientName,
        campos: asked.join(', '),
        preguntas: questions,
        respuesta: `<<<DATO NO FIABLE\n${text.slice(0, 6000)}\nFIN>>>`
      };
      // Una sola pasada: el texto del cliente no puede colarse en otro hueco de la plantilla.
      const fill = (t: string) => t.replace(/\{(cliente|campos|preguntas|respuesta)\}/g, (_m, k: string) => vals[k] ?? '');
      const res = await callAI({
        tenantId,
        projectId,
        function: 'seo_leer_respuestas',
        promptKey: ANSWERS_PROMPT,
        model: ANSWERS_MODEL,
        preferredProvider: 'anthropic',
        maxTokens: 2000,
        messages: [
          { role: 'system', content: prompt.system_prompt },
          { role: 'user', content: fill(prompt.user_prompt_template) }
        ]
      });
      return { answers: cleanAnswers(extractJsonFromLLMResponse(res.content), asked, text), by: 'ia' };
    } catch (e) {
      console.error('[seo] preguntas: lectura con IA:', e instanceof Error ? e.message : e);
    }
  }
  return { answers: ruleAnswers(asked, text), by: 'reglas' };
}

/** Lee la respuesta del cliente y guarda lo que contesta en el expediente, como provisional. */
export async function readAnswers(tenantId: string, payload: { messageId: string; projectId: string; text: string; from: string }): Promise<{ saved: number; by: string }> {
  const [m] = await db.select().from(clientMessages).where(and(eq(clientMessages.id, payload.messageId), eq(clientMessages.tenantId, tenantId))).limit(1);
  if (!m || m.kind !== 'preguntas' || m.projectId !== payload.projectId) return { saved: 0, by: 'nada' };
  const asked = fieldsFromDedupeKey(m.dedupeKey);
  const p = await projectClient(tenantId, payload.projectId);
  if (!asked.length || !p) return { saved: 0, by: 'nada' };
  const questions = m.bodyText
    .split('\n')
    .filter((l) => /^\d\.\s/.test(l))
    .map((l, i) => `${l} [campo: ${asked[i] ?? '?'}]`)
    .join('\n');
  // Solo lo que escribió el cliente: sin nuestro correo citado debajo (si no, las opciones que le dimos parecerían respuestas).
  const text = stripQuotedReply(payload.text);
  const { answers, by } = await extractAnswers(tenantId, payload.projectId, p.clientName ?? p.name, questions, asked, text);
  if (!answers.length) {
    await telegramOutbound()
      ?.notifyOwner(tenantId, `seo.preguntas.leidas:${m.id}:${Date.now()}`, `📋 <b>${esc(p.clientName ?? p.name)}</b> ha respondido a las preguntas de SEO, pero no he sabido sacar ningún dato. Míralo en el correo y escríbelo en Proyectos → ${esc(p.name)} → Expediente.`)
      .catch(() => undefined);
    return { saved: 0, by };
  }
  const existing = await dossierFacts(payload.projectId);
  const drafts: FactDraft[] = [
    ...existing.filter((f) => f.status !== 'descartado' && !(f.source === 'cliente' && answers.some((a) => a.field === f.field))).map((f) => ({ field: f.field, value: f.value, source: f.source as FactSource })),
    ...answers.map((a): FactDraft => ({ field: a.field, value: a.value, source: 'cliente' }))
  ];
  const scored = scoreFacts(drafts);
  const day = new Date().toLocaleDateString('es-ES');
  for (const a of answers) {
    const conf = scored.find((s) => s.source === 'cliente' && s.field === a.field)?.confidence ?? 90;
    const ref = `Respuesta del cliente (${payload.from}, ${day}): «${a.quote}»`.slice(0, 1000);
    await db
      .insert(seoDossierFacts)
      .values({ tenantId, projectId: payload.projectId, field: a.field, value: a.value as object, source: 'cliente', sourceRef: ref, confidence: conf, status: 'provisional' })
      .onConflictDoUpdate({
        target: [seoDossierFacts.projectId, seoDossierFacts.field, seoDossierFacts.source],
        set: { value: a.value as object, sourceRef: ref, confidence: conf, status: 'provisional', decidedBy: null, decidedAt: null, updatedAt: new Date() }
      });
  }
  await telegramOutbound()
    ?.notifyOwner(
      tenantId,
      `seo.preguntas.leidas:${m.id}:${Date.now()}`,
      `📋 <b>${esc(p.clientName ?? p.name)}</b> ha respondido a las preguntas de SEO: ${answers.length} ${answers.length === 1 ? 'dato' : 'datos'} para confirmar en Proyectos → ${esc(p.name)} → Expediente (${answers.map((a) => a.field).join(', ')}).`
    )
    .catch(() => undefined);
  return { saved: answers.length, by };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

let registered = false;
export function registerPreguntasJobs(): void {
  if (registered) return;
  registered = true;
  registerJobKind({
    kind: 'seo.preguntas.preparar',
    timeoutS: 60,
    maxConcurrent: 2,
    maxAttempts: 1,
    run: async (ctx, payload) => prepareQuestions(ctx.tenantId, String(payload.projectId ?? ''), { kind: 'sistema', name: 'Departamento SEO (expediente)' })
  });
  registerJobKind({
    kind: 'seo.preguntas.leer',
    timeoutS: 120,
    maxConcurrent: 2,
    maxAttempts: 2,
    run: async (ctx, payload) =>
      readAnswers(ctx.tenantId, { messageId: String(payload.messageId ?? ''), projectId: String(payload.projectId ?? ''), text: String(payload.text ?? ''), from: String(payload.from ?? '') })
  });
  // La respuesta llega por el buzón (Operaciones) y el núcleo la une a su hilo: aquí solo se encola la lectura.
  registerClientReplyListener('seo.preguntas', async (r) => {
    if (r.kind !== 'preguntas' || !r.projectId) return;
    await enqueueJob({
      tenantId: r.tenantId,
      kind: 'seo.preguntas.leer',
      payload: { messageId: r.messageId, projectId: r.projectId, text: r.text.slice(0, 8000), from: r.from.slice(0, 200) },
      scopeType: 'proyecto',
      scopeId: r.projectId,
      priority: 3,
      dedupeKey: `seo.preguntas.leer:${r.inboundId}`
    });
  });
}


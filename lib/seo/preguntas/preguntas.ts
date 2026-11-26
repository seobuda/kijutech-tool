import 'server-only';

// SEO · Preguntas al cliente sobre el expediente (Hito 2, 24 nov 2026; desde el 25 nov por las Preguntas del núcleo).
//   Desde el 25 nov 2026 SEO ya no envía su propio correo: aporta a las Preguntas del cliente (lib/core/questions.ts)
//   los datos que le faltan o no cuadran en el expediente (registerClientQuestionSource, reglas sin IA) y recibe la
//   respuesta (registerClientAnswerHandler), que guarda en el expediente con origen «cliente», PROVISIONAL: una persona
//   la confirma. Tras reunir el expediente pide al núcleo el envío automático (siempre con aprobación).
//   Lo antiguo (correos de 3 preguntas enviados antes del 25 nov) se sigue leyendo aquí: readAnswers.
import { and, eq, like, ne } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clientMessages, clientQuestions, clients, projects, seoDossierFacts } from '@/lib/db/schema';
import { registerClientAnswerHandler, registerClientQuestionSource, registerClientReplyListener, telegramOutbound, type ModuleAnswer, type ModuleQuestion } from '@/lib/core/capabilities';
import { requestAutoQuestions, syncClientQuestions } from '@/lib/core/questions';
import { enqueueJob, registerJobKind } from '@/lib/core/jobs';
import { callAI, getPrompt } from '@/lib/ai/gateway';
import { extractJsonFromLLMResponse } from '@/lib/ai/parsers/json-extractor';
import { scoreFacts, type FactDraft, type FactSource } from '@/lib/seo/expediente/rules';
import { cleanAnswers, fieldsFromDedupeKey, questionCandidates, ruleAnswers, stripQuotedReply, type Answer, type Question, type QuestionField } from '@/lib/seo/preguntas/rules';

export const ANSWERS_PROMPT = 'seo_leer_respuestas';
const ANSWERS_MODEL = 'claude-haiku-5-5';

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

/** Preguntas del expediente de un proyecto (una por campo que falta o no cuadra). */
async function dossierQuestions(projectId: string): Promise<Question[]> {
  const facts = await dossierFacts(projectId);
  if (!facts.length) return [];
  // Lo que el cliente ya contestó y espera que una persona lo confirme no se le vuelve a preguntar (si se descarta, sí).
  const answered = new Set(facts.filter((f) => f.source === 'cliente' && f.status !== 'descartado').map((f) => f.field));
  // Una propuesta de la IA sin confirmar no se le enseña al cliente: para las preguntas, ese dato falta.
  const usable = facts.filter((f) => f.source !== 'ia' || f.status === 'confirmado');
  return questionCandidates(usable.map((f) => ({ ...f, source: f.source as FactSource }))).filter((q) => !answered.has(q.field));
}

const FIELD_TYPE: Record<QuestionField, ModuleQuestion['answerType']> = { nombre: 'texto', web: 'texto', telefono: 'texto', direccion: 'direccion', servicios: 'lista', zona: 'texto' };
const FIELD_HELP: Record<QuestionField, string> = {
  nombre: 'Para que vuestro nombre salga igual en Google, en la web y en los directorios.',
  web: 'Para saber qué web tenemos que trabajar.',
  telefono: 'Debe ser el mismo en Google, en la web y en los directorios.',
  direccion: 'Debe ser la misma en Google, en la web y en los directorios.',
  servicios: 'Para saber qué páginas trabajar primero.',
  zona: 'Decide para qué búsquedas locales trabajamos la web.'
};
// La pregunta del banco SEO que cubre el mismo dato: si el cliente ya la tiene, no se pregunta dos veces.
const COVERED_BY: Partial<Record<QuestionField, string>> = { servicios: 'ficha.offerings', zona: 'ficha.area' };

/** Fuente para las Preguntas del cliente: los huecos del expediente de sus proyectos SEO. */
async function seoQuestionSource(tenantId: string, clientId: string): Promise<ModuleQuestion[]> {
  const projs = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.tenantId, tenantId), eq(projects.clientId, clientId), ne(projects.status, 'archived')));
  const out: ModuleQuestion[] = [];
  for (const p of projs) {
    for (const q of await dossierQuestions(p.id)) {
      const key = `seo:${p.id}:${q.field}`;
      out.push({ sourceKey: key, target: key, text: q.text, help: FIELD_HELP[q.field], answerType: FIELD_TYPE[q.field], serviceKey: 'seo', projectId: p.id, coveredBy: COVERED_BY[q.field] ?? null });
    }
  }
  return out;
}

/** Guarda en el expediente, como provisionales, lo que ha contestado el cliente. */
async function saveClientFacts(tenantId: string, projectId: string, answers: Answer[], from: string): Promise<void> {
  const existing = await dossierFacts(projectId);
  const drafts: FactDraft[] = [
    ...existing.filter((f) => f.status !== 'descartado' && !(f.source === 'cliente' && answers.some((a) => a.field === f.field))).map((f) => ({ field: f.field, value: f.value, source: f.source as FactSource })),
    ...answers.map((a): FactDraft => ({ field: a.field, value: a.value, source: 'cliente' }))
  ];
  const scored = scoreFacts(drafts);
  const day = new Date().toLocaleDateString('es-ES');
  for (const a of answers) {
    const conf = scored.find((s) => s.source === 'cliente' && s.field === a.field)?.confidence ?? 90;
    const ref = `Respuesta del cliente (${from}, ${day}): «${a.quote}»`.slice(0, 1000);
    await db
      .insert(seoDossierFacts)
      .values({ tenantId, projectId, field: a.field, value: a.value as object, source: 'cliente', sourceRef: ref, confidence: conf, status: 'provisional' })
      .onConflictDoUpdate({
        target: [seoDossierFacts.projectId, seoDossierFacts.field, seoDossierFacts.source],
        set: { value: a.value as object, sourceRef: ref, confidence: conf, status: 'provisional', decidedBy: null, decidedAt: null, updatedAt: new Date() }
      });
  }
}

/** Respuesta a una pregunta del expediente («seo:<proyecto>:<campo>»): se limpia como su campo y va al expediente. */
async function seoAnswerHandler(a: ModuleAnswer): Promise<void> {
  const m = /^seo:([0-9a-f-]{36}):([a-z_]+)$/.exec(a.target);
  if (!m) return;
  const [, projectId, field] = m;
  const [p] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, a.tenantId))).limit(1);
  if (!p) return;
  // La cita ya se comprobó en el núcleo (correo), o es lo que escribió el cliente (cuestionario) o una persona.
  const answers = cleanAnswers({ respuestas: [{ campo: field, valor: a.value, cita: a.quote }] }, [field as QuestionField], a.quote);
  if (answers.length) await saveClientFacts(a.tenantId, projectId, answers, a.by);
}

/** Lo que el Expediente enseña de las preguntas: cuántas del expediente esperan, y el cliente para ir a su ficha. */
export async function dossierQuestionsSummary(tenantId: string, projectId: string): Promise<{ clientId: string | null; pending: number; sent: number; answered: number }> {
  const [p] = await db.select({ clientId: projects.clientId }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  if (!p?.clientId) return { clientId: null, pending: 0, sent: 0, answered: 0 };
  await syncClientQuestions(tenantId, p.clientId).catch(() => undefined);
  const rows = await db
    .select({ status: clientQuestions.status })
    .from(clientQuestions)
    .where(and(eq(clientQuestions.tenantId, tenantId), eq(clientQuestions.clientId, p.clientId), like(clientQuestions.sourceKey, `seo:${projectId}:%`)));
  return { clientId: p.clientId, pending: rows.filter((r) => r.status === 'pendiente').length, sent: rows.filter((r) => r.status === 'enviada').length, answered: rows.filter((r) => r.status === 'respondida').length };
}

/** Tras reunir el expediente: pide al núcleo que prepare las preguntas del cliente (siempre pasa por aprobación). */
export async function maybeAutoQuestions(tenantId: string, projectId: string): Promise<void> {
  const [p] = await db.select({ clientId: projects.clientId }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  if (!p?.clientId) return;
  await requestAutoQuestions(tenantId, p.clientId, 'Departamento SEO (expediente)');
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
  await saveClientFacts(tenantId, payload.projectId, answers, payload.from);
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
  // Desde el 25 nov las preguntas las prepara el núcleo: un trabajo antiguo que quede en la cola se pasa allí.
  registerJobKind({
    kind: 'seo.preguntas.preparar',
    timeoutS: 60,
    maxConcurrent: 2,
    maxAttempts: 1,
    run: async (ctx, payload) => maybeAutoQuestions(ctx.tenantId, String(payload.projectId ?? ''))
  });
  registerClientQuestionSource('seo', seoQuestionSource);
  registerClientAnswerHandler('seo', seoAnswerHandler);
  registerJobKind({
    kind: 'seo.preguntas.leer',
    timeoutS: 120,
    maxConcurrent: 2,
    maxAttempts: 2,
    run: async (ctx, payload) =>
      readAnswers(ctx.tenantId, { messageId: String(payload.messageId ?? ''), projectId: String(payload.projectId ?? ''), text: String(payload.text ?? ''), from: String(payload.from ?? '') })
  });
  // Correos antiguos (antes del 25 nov, con el proyecto y los campos en la clave): su respuesta se sigue leyendo aquí.
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


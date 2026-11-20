import 'server-only';

// Dudas del equipo al jefe de Operaciones (20 nov 2026, fase 2 de docs/DISENO-JEFE-OPERACIONES.md). Decisión de Enric:
// un AGENTE LIBRE (Opus) que razona y consulta la plataforma como lo haría un supervisor humano, con GARANTÍAS EN CÓDIGO:
//   1. Termina siempre con responder_al_equipo (fuente + ids) o escalar_a_enric. El código COMPRUEBA la fuente: si dice
//      «base» o «casos» sin haberlos consultado, o cita ids que no existen, la respuesta cuenta como «general».
//   2. Las respuestas de IA general pasan por Enric mientras el ajuste esté en «aprobación» (Enviar · Cambiar · Responder
//      yo · Descartar). «Cambiar»: Enric dice qué y el jefe lo vuelve a analizar; queda anotado para aprender.
//   3. Red de seguridad: contraseñas, sueldo, despidos o quejas de clientes se escalan aunque el agente no lo haga.
//   4. Sin bucles: N preguntas del mismo tema sin resolver (3 por defecto) → «creo que no te estoy ayudando» y a Enric.
//   5. «No me sirve / ya lo probé» pide qué probó y escala; «Me sirve» suma a las entradas de la base usadas.
//   6. Cada respuesta de Enric (o aprobada) sale como propuesta de entrada para la base de conocimiento.
// Contesta por el bot principal (el chat de siempre). Solo lectura: el jefe no tiene herramientas de cambio.
// Este módulo NO importa otros módulos: Telegram, encargos y herramientas de Operaciones llegan por el núcleo.
import { and, desc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { agtIntegrations, agtTeamQuestions, type AgtAgent, type AgtTeamQuestion } from '@/lib/db/schema';
import {
  getTool,
  registerModuleButtons,
  registerReportSection,
  registerTools,
  telegramOutbound,
  type AgentTool,
  type InboundMessage,
  type OutboundButton,
  type ToolContext
} from '@/lib/core/capabilities';
import { reportError } from '@/lib/core/errors';
import { embedQuery, listCategories, publishedIds, recordFeedback, submitRequest } from '@/lib/core/knowledge';
import { addMessage, getAgent, getOrCreateConversation, OPS_HEAD_KEY } from '@/lib/agentes/store';
import { runAgent, tidyForChannel, type ToolCallLog } from '@/lib/agentes/engine';
import { transcribe } from '@/lib/agentes/voice';

export type Tier = 'ficha' | 'base' | 'casos' | 'general';
const TIERS: Tier[] = ['ficha', 'base', 'casos', 'general'];
const OPEN: AgtTeamQuestion['status'][] = ['respondida', 'pendiente_aprobacion', 'escalada'];

const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
const s = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);

// --- Ajustes (Agentes → Departamentos → Operaciones) ------------------------------------------------------------------

export type TeamSettings = { generalAutonomy: 'aprobacion' | 'autonomo'; maxAttempts: number; followupMinutes: number };
export const TEAM_DEFAULTS: TeamSettings = { generalAutonomy: 'aprobacion', maxAttempts: 3, followupMinutes: 30 };
const SETTINGS_PROVIDER = 'equipo';

export async function getTeamSettings(tenantId: string): Promise<TeamSettings> {
  const [row] = await db.select({ config: agtIntegrations.config }).from(agtIntegrations).where(and(eq(agtIntegrations.tenantId, tenantId), eq(agtIntegrations.provider, SETTINGS_PROVIDER))).limit(1);
  return cleanSettings({ ...TEAM_DEFAULTS, ...((row?.config ?? {}) as Partial<TeamSettings>) });
}

export function cleanSettings(v: Partial<TeamSettings>): TeamSettings {
  const int = (x: unknown, d: number, min: number, max: number) => {
    const n = Math.round(Number(x));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : d;
  };
  return {
    generalAutonomy: v.generalAutonomy === 'autonomo' ? 'autonomo' : 'aprobacion',
    maxAttempts: int(v.maxAttempts, TEAM_DEFAULTS.maxAttempts, 2, 6),
    followupMinutes: int(v.followupMinutes, TEAM_DEFAULTS.followupMinutes, 5, 240)
  };
}

export async function saveTeamSettings(tenantId: string, v: Partial<TeamSettings>): Promise<TeamSettings> {
  const config = cleanSettings(v);
  const values = { status: 'conectada', config, updatedAt: new Date() };
  await db.insert(agtIntegrations).values({ tenantId, provider: SETTINGS_PROVIDER, ...values }).onConflictDoUpdate({ target: [agtIntegrations.tenantId, agtIntegrations.provider], set: values });
  return config;
}

// --- Reglas puras (también en las pruebas) ----------------------------------------------------------------------------

/** Red de seguridad: temas que siempre decide Enric aunque el agente no los escale. */
export const SENSITIVE_RE = /contrase(?:ñ|n)a|password|\bsueldo|n[oó]mina|salario|despid|aumento de sueldo|queja del cliente|cliente (?:est[aá] )?(?:muy )?(?:enfadad|cabread|molest)|reclamaci[oó]n/i;
/** Mensajes que no son una pregunta («gracias», «ok»…): no se tratan como duda. */
export const THANKS_RE = /^(?:¡)?(?:gracias|muchas gracias|ok|okey|vale|perfecto|genial|de acuerdo|entendido|guay|top|👍|🙏|👌)[!.\s👍🙏👌]*$/i;

type Capture =
  | { kind: 'responder'; respuesta: string; fuente: Tier; ids: string[]; tema: string }
  | { kind: 'escalar'; motivo: string; resumen: string; propuesta: string; tema: string };

/**
 * La fuente que declara el agente solo vale si de verdad consultó esa fuente (y, en base y casos, si los ids existen).
 * Si no, cuenta como «general»: esa es la que pasa por la aprobación de Enric.
 */
export function verifyTier(claimed: Tier, calls: Pick<ToolCallLog, 'name' | 'ok'>[], ctx: { validBaseIds: string[]; validCaseIds: string[]; hadRequest: boolean }): Tier {
  const used = (n: string) => calls.some((c) => c.name === n && c.ok);
  if (claimed === 'base') return used('buscar_conocimiento') && ctx.validBaseIds.length > 0 ? 'base' : 'general';
  if (claimed === 'casos') return used('casos_anteriores') && ctx.validCaseIds.length > 0 ? 'casos' : 'general';
  if (claimed === 'ficha') return ctx.hadRequest || ['ficha_cliente', 'encargos_recientes', 'mis_tareas', 'calendario_equipo'].some(used) ? 'ficha' : 'general';
  return 'general';
}

export function normTopic(t: string): string {
  return (
    String(t ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'general'
  );
}

const TIER_LABEL: Record<Tier | 'enric', string> = {
  ficha: '📒 Según la ficha y los encargos',
  base: '📚 De nuestra base de conocimiento',
  casos: '🔁 Ya se resolvió antes',
  general: '💡 Sugerencia general (no está en nuestra base)',
  enric: '💬 Respuesta de Enric'
};

// --- Herramientas del jefe ----------------------------------------------------------------------------------------

const captures = new Map<string, Capture>();
const capKey = (ctx: ToolContext) => `${ctx.tenantId}:${ctx.conversationId ?? ''}`;

const misTareas: AgentTool = {
  name: 'mis_tareas',
  module: 'agentes',
  title: 'Tareas de quien pregunta',
  description: 'Tareas de hoy y vencidas de la persona del equipo que te está escribiendo (de ClickUp), con su enlace.',
  risk: 'lectura',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  async run(ctx) {
    const t = getTool('tareas_de_persona');
    if (!t) return { ok: false, content: 'No puedo consultar las tareas ahora.' };
    return t.run(ctx, { persona: ctx.actor.name });
  }
};

const casosAnteriores: AgentTool = {
  name: 'casos_anteriores',
  module: 'agentes',
  title: 'Casos ya resueltos',
  description: 'Busca dudas del equipo que ya se resolvieron (por Enric o con una respuesta que sirvió), también de otros clientes o personas. Devuelve hasta 3 con su id, la pregunta y la respuesta final.',
  risk: 'lectura',
  inputSchema: { type: 'object', properties: { pregunta: { type: 'string' } }, required: ['pregunta'], additionalProperties: false },
  async run(ctx, input) {
    const hits = await findCases(ctx.tenantId, s(input.pregunta, 500), 3);
    if (hits.length === 0) return { ok: true, content: 'No hay casos parecidos resueltos antes.' };
    return {
      ok: true,
      content: hits
        .map((h, n) => `${n + 1}. Caso ${h.id} (${h.createdAt.toISOString().slice(0, 10)}, ${h.answeredBy === 'enric' ? 'respondió Enric' : 'le sirvió a la persona'})\nPregunta: ${clip(h.question, 500)}\nRespuesta: ${clip(h.finalAnswer || h.aiAnswer || '', 1500)}`)
        .join('\n\n')
    };
  }
};

const responder: AgentTool = {
  name: 'responder_al_equipo',
  module: 'agentes',
  title: 'Responder a la persona del equipo',
  description:
    'Tu respuesta final a la persona del equipo (en HTML de Telegram: <b>, <i>, <a href>; pasos numerados si hay que hacer algo). Indica la fuente REAL: «ficha» (ficha del cliente o datos de encargos), «base» (base de conocimiento: pasa los ids), «casos» (casos anteriores: pasa los ids) o «general» (tu conocimiento, no está en nuestra base). «tema»: el área en 1-3 palabras (p. ej. «wordpress formularios», «search console»). Llámala una sola vez, al final.',
  risk: 'lectura',
  inputSchema: {
    type: 'object',
    properties: {
      respuesta: { type: 'string' },
      fuente: { type: 'string', enum: TIERS },
      ids: { type: 'array', items: { type: 'string' }, description: 'Ids de las entradas de la base o de los casos usados' },
      tema: { type: 'string' }
    },
    required: ['respuesta', 'fuente', 'tema'],
    additionalProperties: false
  },
  async run(ctx, input) {
    const respuesta = s(input.respuesta, 6000);
    if (!respuesta) return { ok: false, content: 'Falta la respuesta.' };
    const fuente = TIERS.includes(input.fuente as Tier) ? (input.fuente as Tier) : 'general';
    const ids = Array.isArray(input.ids) ? input.ids.map((x) => s(x, 40)).filter(Boolean).slice(0, 10) : [];
    captures.set(capKey(ctx), { kind: 'responder', respuesta, fuente, ids, tema: s(input.tema, 60) });
    return { ok: true, content: 'Anotado: se la entrego a la persona (o a Enric si necesita su visto bueno). No escribas nada más.' };
  }
};

const escalar: AgentTool = {
  name: 'escalar_a_enric',
  module: 'agentes',
  title: 'Pasar la duda a Enric',
  description:
    'Pasa la duda a Enric cuando no te toca a ti (plazos, prioridades, precios, quejas, temas personales, accesos) o cuando no estás ayudando. «resumen»: qué necesita la persona y qué se ha probado. «propuesta»: lo que responderías tú, si tienes algo (Enric puede enviarlo con un botón). «motivo»: «tema_sensible» o «sin_respuesta».',
  risk: 'lectura',
  inputSchema: {
    type: 'object',
    properties: { motivo: { type: 'string', enum: ['tema_sensible', 'sin_respuesta'] }, resumen: { type: 'string' }, propuesta: { type: 'string' }, tema: { type: 'string' } },
    required: ['motivo', 'resumen'],
    additionalProperties: false
  },
  async run(ctx, input) {
    captures.set(capKey(ctx), { kind: 'escalar', motivo: input.motivo === 'tema_sensible' ? 'tema_sensible' : 'sin_respuesta', resumen: s(input.resumen, 2000), propuesta: s(input.propuesta, 4000), tema: s(input.tema, 60) });
    return { ok: true, content: 'Anotado: se lo paso a Enric y se lo digo a la persona. No escribas nada más.' };
  }
};

export const TEAM_TOOLS: AgentTool[] = [misTareas, casosAnteriores, responder, escalar];

// --- Casos anteriores ------------------------------------------------------------------------------------------------

async function findCases(tenantId: string, query: string, limit: number): Promise<AgtTeamQuestion[]> {
  const resolved = and(
    eq(agtTeamQuestions.tenantId, tenantId),
    inArray(agtTeamQuestions.status, ['resuelta', 'cerrada']),
    sql`(${agtTeamQuestions.answeredBy} = 'enric' OR ${agtTeamQuestions.feedback} = 'sirve')`
  );
  const emb = query ? await embedQuery(tenantId, query).catch(() => null) : null;
  if (emb) {
    const v = `[${emb.vector.join(',')}]`;
    const rows = await db
      .select()
      .from(agtTeamQuestions)
      .where(and(resolved, eq(agtTeamQuestions.embeddingModel, emb.model), isNotNull(agtTeamQuestions.embedding), sql`(${agtTeamQuestions.embedding} <=> ${v}::vector) < 0.6`))
      .orderBy(sql`${agtTeamQuestions.embedding} <=> ${v}::vector`)
      .limit(limit);
    if (rows.length) return rows;
  }
  // Sin embeddings (o sin parecidos): por palabras.
  const words = query
    .toLowerCase()
    .split(/[^a-záéíóúñü0-9]+/i)
    .filter((w) => w.length > 4)
    .slice(0, 6);
  if (words.length === 0) return [];
  const like = sql.join(
    words.map((w) => sql`${agtTeamQuestions.question} ILIKE ${`%${w}%`}`),
    sql` OR `
  );
  return db.select().from(agtTeamQuestions).where(and(resolved, sql`(${like})`)).orderBy(desc(agtTeamQuestions.createdAt)).limit(limit);
}

async function embedQuestion(q: AgtTeamQuestion): Promise<void> {
  const emb = await embedQuery(q.tenantId, questionText(q)).catch(() => null);
  if (emb) await db.update(agtTeamQuestions).set({ embedding: emb.vector, embeddingModel: emb.model }).where(eq(agtTeamQuestions.id, q.id));
}

const questionText = (q: Pick<AgtTeamQuestion, 'question' | 'followups'>) => [q.question, ...((q.followups as { text: string }[]) ?? []).map((f) => f.text)].join('\n');

/** Ejemplos de correcciones de Enric en dudas parecidas: se le pasan al jefe para que aprenda (no se reentrena nada). */
async function learningExamples(tenantId: string, query: string): Promise<string> {
  const emb = await embedQuery(tenantId, query).catch(() => null);
  const base = and(eq(agtTeamQuestions.tenantId, tenantId), isNotNull(agtTeamQuestions.finalAnswer), sql`jsonb_array_length(${agtTeamQuestions.revisions}) > 0 OR ${agtTeamQuestions.answeredBy} = 'enric'`);
  const rows = emb
    ? await db
        .select()
        .from(agtTeamQuestions)
        .where(and(base, eq(agtTeamQuestions.embeddingModel, emb.model), isNotNull(agtTeamQuestions.embedding)))
        .orderBy(sql`${agtTeamQuestions.embedding} <=> ${`[${emb.vector.join(',')}]`}::vector`)
        .limit(3)
    : await db.select().from(agtTeamQuestions).where(base).orderBy(desc(agtTeamQuestions.updatedAt)).limit(3);
  if (rows.length === 0) return '';
  const blocks = rows.map((r) => {
    const revs = (r.revisions as { instruction: string }[]) ?? [];
    return [`- Pregunta: ${clip(r.question, 300)}`, r.aiFirstAnswer ? `  Tu propuesta: ${clip(r.aiFirstAnswer, 400)}` : '', ...revs.map((x) => `  Enric pidió: ${clip(x.instruction, 300)}`), `  Respuesta final${r.answeredBy === 'enric' ? ' (de Enric)' : ''}: ${clip(r.finalAnswer ?? '', 500)}`].filter(Boolean).join('\n');
  });
  return `\nCómo ha corregido Enric respuestas parecidas (aprende de esto: su criterio manda):\n${blocks.join('\n')}`;
}

// --- La conversación ----------------------------------------------------------------------------------------------

const chains = new Map<string, Promise<unknown>>();
function inChain(key: string, fn: () => Promise<void>): Promise<void> {
  const prev = chains.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  chains.set(key, next);
  void next
    .catch((e) => console.error('[agentes] dudas del equipo:', e instanceof Error ? e.message : e))
    .finally(() => {
      if (chains.get(key) === next) chains.delete(key);
    });
  return next;
}

/** Para las pruebas: espera a que terminen las dudas en curso. */
export async function waitTeamIdle(): Promise<void> {
  await Promise.all([...chains.values()].map((p) => p.catch(() => undefined)));
}

async function sendTo(tenantId: string, chatId: string, html: string, buttons?: OutboundButton[][]): Promise<void> {
  const out = telegramOutbound();
  if (out) await out.sendText(tenantId, chatId, clip(html, 3900), buttons);
}

async function toOwner(tenantId: string, key: string, html: string, buttons?: OutboundButton[][]): Promise<void> {
  const out = telegramOutbound();
  if (out) await out.notifyOwner(tenantId, key, clip(html, 3900), buttons);
}

const feedbackButtons = (id: string): OutboundButton[][] => [
  [
    { text: '✅ Me sirve', data: `x:tq:ok:${id}` },
    { text: '❌ No me sirve', data: `x:tq:no:${id}` }
  ],
  [{ text: '🙋 Que lo vea Enric', data: `x:tq:en:${id}` }]
];

/** Mensajes del equipo (no del dueño) por el bot principal. false = nadie lo atiende (jefe apagado): se ignora como antes. */
export async function handleTeamInbound(m: InboundMessage, opts: { force?: boolean } = {}): Promise<boolean> {
  if (m.isOwner || m.channel !== 'telegram' || m.bot) return false;
  const jefe = await getAgent(m.tenantId, OPS_HEAD_KEY);
  // force: la prueba de Enric con «/jefe» funciona aunque el jefe esté apagado para el equipo.
  if (!jefe || (!jefe.active && !opts.force)) return false;
  void inChain(`${m.tenantId}:${m.peer}`, () => processTeamMessage(m, jefe));
  return true;
}

async function processTeamMessage(m: InboundMessage, jefe: AgtAgent): Promise<void> {
  const out = telegramOutbound();
  if (out) await out.sendTyping(m.tenantId, m.peer, 'typing');
  let text = m.text.trim();
  if (m.audio) {
    const t = await transcribe(m.tenantId, m.audio);
    if (!t.ok) return void (await sendTo(m.tenantId, m.peer, `🎙 ${esc(t.error)}`));
    text = [text, t.text].filter(Boolean).join('\n').trim();
  }
  if (!text) return;
  const settings = await getTeamSettings(m.tenantId);

  // ¿Sigue una duda abierta de hace poco?
  const since = new Date(Date.now() - settings.followupMinutes * 60_000);
  const [open] = await db
    .select()
    .from(agtTeamQuestions)
    .where(and(eq(agtTeamQuestions.tenantId, m.tenantId), eq(agtTeamQuestions.chatId, m.peer), inArray(agtTeamQuestions.status, OPEN), gte(agtTeamQuestions.updatedAt, since)))
    .orderBy(desc(agtTeamQuestions.updatedAt))
    .limit(1);

  if (THANKS_RE.test(text)) {
    if (open && open.status === 'respondida' && !open.feedback) {
      await closeWithFeedback(open, true);
      return void (await sendTo(m.tenantId, m.peer, '¡De nada! 🙌'));
    }
    return void (await sendTo(m.tenantId, m.peer, '🙌'));
  }

  const followup = { at: new Date().toISOString(), text: clip(text, 4000) };
  if (open && (open.status === 'pendiente_aprobacion' || open.status === 'escalada')) {
    await db.update(agtTeamQuestions).set({ followups: [...((open.followups as object[]) ?? []), followup], updatedAt: new Date() }).where(eq(agtTeamQuestions.id, open.id));
    if (open.status === 'escalada') await toOwner(m.tenantId, `tq:add:${open.id}:${Date.now()}`, `➕ <b>${esc(open.askedByName)}</b> añade a su duda:\n<i>${esc(clip(text, 1500))}</i>`);
    return void (await sendTo(m.tenantId, m.peer, '📝 Lo añado a tu pregunta; Enric lo verá.'));
  }

  let q: AgtTeamQuestion;
  let isFollowup = false;
  if (open && open.status === 'respondida' && !open.feedback) {
    isFollowup = true;
    [q] = await db.update(agtTeamQuestions).set({ followups: [...((open.followups as object[]) ?? []), followup], updatedAt: new Date() }).where(eq(agtTeamQuestions.id, open.id)).returning();
  } else {
    [q] = await db
      .insert(agtTeamQuestions)
      .values({ tenantId: m.tenantId, askedByClickupId: m.clickupUserId, askedByName: m.peerName, chatId: m.peer, requestId: m.replyToRequestId ?? null, question: clip(text, 8000), status: 'respondida' })
      .returning();
  }

  // Red de seguridad: estos temas los decide Enric siempre.
  if (SENSITIVE_RE.test(text)) return void (await escalate(q, 'tema_sensible', { resumen: 'Tema que siempre decide Enric (detectado por la red de seguridad).' }));
  // Sin bucles: una duda que vuelve una y otra vez se escala.
  if (isFollowup && ((q.followups as object[]) ?? []).length + 1 >= settings.maxAttempts) {
    return void (await escalate(q, 'intentos', { resumen: 'La persona ha vuelto a preguntar varias veces sobre lo mismo sin resolverlo.', propuesta: q.aiAnswer ?? '' }));
  }

  const conv = await getOrCreateConversation(m.tenantId, jefe.id, 'telegram', m.peer, m.peerName);
  await addMessage({ tenantId: m.tenantId, conversationId: conv.id, role: 'user', content: text });
  const context = [
    isFollowup ? `Es la continuación de su duda «${clip(q.question, 1500)}». Ya le respondiste: «${clip(q.aiAnswer ?? '', 2000)}». Ahora dice: «${clip(text, 2000)}»` : `Duda de ${m.peerName}: «${clip(text, 4000)}»`,
    m.replyToSummary ? `\nResponde a este encargo:\n${m.replyToSummary}` : ''
  ].join('\n');
  await answerWithAgent(q, jefe, conv.id, context, settings, { hadRequest: Boolean(m.replyToSummary) });
}

/** Ejecuta al jefe y entrega el resultado (a la persona, a la aprobación de Enric o escalado). */
async function answerWithAgent(q: AgtTeamQuestion, jefe: AgtAgent, conversationId: string, context: string, settings: TeamSettings, opts: { hadRequest: boolean; instruction?: string }): Promise<void> {
  const ctx: ToolContext = { tenantId: q.tenantId, agentKey: jefe.key, channel: 'telegram', conversationId, actor: { name: q.askedByName, isOwner: false, clickupUserId: q.askedByClickupId } };
  const cats = await listCategories(q.tenantId).catch(() => []);
  const extra = [
    `\nModo equipo: hablas con ${q.askedByName}, del equipo (no con Enric). No ves contratos, cuotas ni costes. Termina SIEMPRE con responder_al_equipo o escalar_a_enric.`,
    cats.length ? `Áreas de la base (úsalas como «tema» si encajan): ${cats.map((c) => c.name).join(', ')}.` : '',
    await learningExamples(q.tenantId, context).catch(() => '')
  ].join('\n');
  const userText = opts.instruction ? `${context}\n\nTu propuesta anterior: «${clip(q.aiAnswer ?? '', 3000)}»\nEnric te pide este cambio: «${opts.instruction}»\nRehaz la respuesta aplicándolo y llama a responder_al_equipo.` : context;
  captures.delete(capKey(ctx));
  const run = await runAgent({ tenantId: q.tenantId, agent: jefe, ctx, userText, extraSystem: extra, maxTokens: 6000 });
  const cap = captures.get(capKey(ctx));
  captures.delete(capKey(ctx));
  const cost = Number(q.costUsd ?? 0) + run.costUsd;
  const toolCalls = [...((q.toolCalls as object[]) ?? []), ...run.toolCalls.map((c) => ({ name: c.name, ok: c.ok, input: c.input }))].slice(-40);
  await db.update(agtTeamQuestions).set({ costUsd: cost.toFixed(6), toolCalls, updatedAt: new Date() }).where(eq(agtTeamQuestions.id, q.id));
  await addMessage({ tenantId: q.tenantId, conversationId, role: 'assistant', content: cap?.kind === 'responder' ? cap.respuesta : cap?.kind === 'escalar' ? `[escalado a Enric] ${cap.resumen}` : run.text, toolCalls: run.toolCalls.length ? run.toolCalls : null, costUsd: run.costUsd }).catch(() => undefined);
  const fresh = (await getQuestion(q.tenantId, q.id)) ?? q;

  if (opts.instruction && cap?.kind !== 'responder') {
    // Rehacer con el cambio de Enric sin una respuesta nueva: se le dice, con lo que haya, y sigue en sus manos.
    const draft = cap?.kind === 'escalar' ? cap.propuesta || cap.resumen : run.error ? '' : run.text;
    if (draft) {
      const [row] = await db.update(agtTeamQuestions).set({ aiAnswer: tidyForChannel(draft, 'telegram'), revisions: [...((fresh.revisions as object[]) ?? []), { at: new Date().toISOString(), instruction: opts.instruction, before: fresh.aiAnswer }], status: 'pendiente_aprobacion', updatedAt: new Date() }).where(eq(agtTeamQuestions.id, q.id)).returning();
      return void (await askApproval(row));
    }
    return void (await toOwner(q.tenantId, `tq:err:${q.id}:${Date.now()}`, `⚠️ No he podido rehacer la respuesta para <b>${esc(q.askedByName)}</b>. Pulsa «Responder» en el mensaje anterior para contestar tú.`));
  }
  if (!cap) {
    // Sin respuesta por la herramienta (fallo de la IA o no la llamó): a Enric, con lo que haya.
    return void (await escalate(fresh, 'sin_respuesta', { resumen: run.error ? 'La IA ha fallado al responder.' : 'El jefe no ha llegado a una respuesta.', propuesta: run.error ? '' : run.text }));
  }
  if (cap.kind === 'escalar') {
    await db.update(agtTeamQuestions).set({ topicKey: normTopic(cap.tema) }).where(eq(agtTeamQuestions.id, q.id));
    return void (await escalate({ ...fresh, topicKey: normTopic(cap.tema) }, cap.motivo === 'tema_sensible' ? 'tema_sensible' : 'sin_respuesta', { resumen: cap.resumen, propuesta: cap.propuesta }));
  }

  // Garantía 1: la fuente se comprueba.
  const validBaseIds = cap.fuente === 'base' ? await publishedIds(q.tenantId, cap.ids) : [];
  const validCaseIds = cap.fuente === 'casos' ? await existingCases(q.tenantId, cap.ids) : [];
  const tier = verifyTier(cap.fuente, run.toolCalls, { validBaseIds, validCaseIds, hadRequest: opts.hadRequest || Boolean(q.requestId) });
  const topic = normTopic(cap.tema);
  const answer = tidyForChannel(cap.respuesta, 'telegram');
  const sources = tier === 'base' ? validBaseIds.map((id) => ({ type: 'base', id })) : tier === 'casos' ? validCaseIds.map((id) => ({ type: 'caso', id })) : [{ type: tier }];
  const revision = opts.instruction ? [...((fresh.revisions as object[]) ?? []), { at: new Date().toISOString(), instruction: opts.instruction, before: fresh.aiAnswer }] : (fresh.revisions as object[]);
  const [saved] = await db
    .update(agtTeamQuestions)
    .set({ tier, topicKey: topic, sources, aiAnswer: answer, aiFirstAnswer: fresh.aiFirstAnswer ?? answer, revisions: revision, awaitingChatId: null, awaitingKind: null, updatedAt: new Date() })
    .where(eq(agtTeamQuestions.id, q.id))
    .returning();

  // Una versión rehecha con el cambio de Enric vuelve a Enric, salga de donde salga: él la está revisando.
  if (opts.instruction) {
    await db.update(agtTeamQuestions).set({ status: 'pendiente_aprobacion' }).where(eq(agtTeamQuestions.id, q.id));
    return void (await askApproval({ ...saved, status: 'pendiente_aprobacion' }));
  }

  // Garantía 4: sin bucles. Dudas del mismo tema en 24 h sin resolver (incluida esta).
  {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)` })
      .from(agtTeamQuestions)
      .where(and(eq(agtTeamQuestions.tenantId, q.tenantId), eq(agtTeamQuestions.chatId, q.chatId), eq(agtTeamQuestions.topicKey, topic), gte(agtTeamQuestions.createdAt, new Date(Date.now() - 86_400_000)), sql`(${agtTeamQuestions.feedback} IS NULL OR ${agtTeamQuestions.feedback} = 'no_sirve')`));
    const attempts = Number(n) + ((saved.followups as object[]) ?? []).length;
    if (attempts >= settings.maxAttempts) return void (await escalate(saved, 'intentos', { resumen: `Es la duda número ${attempts} sobre «${topic.replace(/_/g, ' ')}» en 24 h sin resolverse.`, propuesta: answer }));
  }

  // Garantía 2: la IA general pasa por Enric mientras esté en «aprobación».
  if (tier === 'general' && settings.generalAutonomy === 'aprobacion') {
    await db.update(agtTeamQuestions).set({ status: 'pendiente_aprobacion' }).where(eq(agtTeamQuestions.id, q.id));
    await sendTo(q.tenantId, q.chatId, '🔎 Déjame confirmarlo con Enric y te contesto por aquí.');
    return void (await askApproval(saved));
  }
  await deliver(saved, answer, tier);
}

async function existingCases(tenantId: string, ids: string[]): Promise<string[]> {
  const valid = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (!valid.length) return [];
  const rows = await db.select({ id: agtTeamQuestions.id }).from(agtTeamQuestions).where(and(eq(agtTeamQuestions.tenantId, tenantId), inArray(agtTeamQuestions.id, valid), inArray(agtTeamQuestions.status, ['resuelta', 'cerrada'])));
  return rows.map((r) => r.id);
}

export async function getQuestion(tenantId: string, id: string): Promise<AgtTeamQuestion | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [q] = await db.select().from(agtTeamQuestions).where(and(eq(agtTeamQuestions.tenantId, tenantId), eq(agtTeamQuestions.id, id))).limit(1);
  return q ?? null;
}

async function deliver(q: AgtTeamQuestion, answer: string, tier: Tier): Promise<void> {
  await db.update(agtTeamQuestions).set({ status: 'respondida', answeredBy: 'ia', answeredAt: new Date() }).where(eq(agtTeamQuestions.id, q.id));
  await sendTo(q.tenantId, q.chatId, `<b>${TIER_LABEL[tier]}</b>\n\n${answer}`, feedbackButtons(q.id));
}

function ownerContext(q: AgtTeamQuestion): string {
  const fu = ((q.followups as { text: string }[]) ?? []).map((f) => `➕ <i>${esc(clip(f.text, 400))}</i>`);
  return [`<b>${esc(q.askedByName)}</b> pregunta:`, `<i>${esc(clip(q.question, 1200))}</i>`, ...fu, q.feedbackNote ? `❌ No le sirvió: <i>${esc(clip(q.feedbackNote, 600))}</i>` : ''].filter(Boolean).join('\n');
}

async function askApproval(q: AgtTeamQuestion): Promise<void> {
  const html = [`🧑‍💼 <b>Jefe de operaciones</b>: respuesta para aprobar (no está en nuestra base)`, '', ownerContext(q), '', `<b>Propuesta:</b>\n${q.aiAnswer ?? ''}`].join('\n');
  await toOwner(q.tenantId, `tq:apr:${q.id}:${Date.now()}`, html, [
    [
      { text: '✅ Enviar', data: `x:tq:se:${q.id}` },
      { text: '✏️ Cambiar', data: `x:tq:ch:${q.id}` }
    ],
    [
      { text: '📝 Responder yo', data: `x:tq:rp:${q.id}` },
      { text: '🗑 Descartar', data: `x:tq:dx:${q.id}` }
    ]
  ]);
}

const REASON_LABEL: Record<string, string> = {
  tema_sensible: 'tema que decides tú',
  sin_respuesta: 'no ha encontrado respuesta',
  no_sirve: 'la respuesta no le sirvió',
  pide_enric: 'pide que lo veas tú',
  intentos: 'ha preguntado varias veces sin resolverlo'
};

async function escalate(q: AgtTeamQuestion, reason: 'tema_sensible' | 'sin_respuesta' | 'no_sirve' | 'pide_enric' | 'intentos', info: { resumen?: string; propuesta?: string }): Promise<void> {
  const propuesta = (info.propuesta ?? '').trim();
  const [row] = await db
    .update(agtTeamQuestions)
    .set({ status: 'escalada', escalationReason: reason, escalatedAt: new Date(), ...(propuesta ? { aiAnswer: propuesta, aiFirstAnswer: q.aiFirstAnswer ?? propuesta } : {}), awaitingChatId: null, awaitingKind: null, updatedAt: new Date() })
    .where(eq(agtTeamQuestions.id, q.id))
    .returning();
  const member =
    reason === 'intentos'
      ? '🙋 Creo que no te estoy ayudando lo suficiente con esto. Se lo paso a Enric para que te responda él por aquí.'
      : reason === 'tema_sensible'
        ? '🙋 Esto lo decide Enric. Se lo he pasado y te responderá por aquí.'
        : '🙋 Se lo he pasado a Enric. Te responderá por aquí.';
  await sendTo(q.tenantId, q.chatId, member);
  const html = [`🙋 <b>Duda del equipo para ti</b> (${REASON_LABEL[reason]})`, '', ownerContext(row ?? q), info.resumen ? `\n<b>Resumen del jefe:</b> ${esc(clip(info.resumen, 1200))}` : '', propuesta ? `\n<b>Lo que respondería:</b>\n${propuesta}` : ''].filter(Boolean).join('\n');
  const buttons: OutboundButton[][] = [[{ text: '📝 Responder', data: `x:tq:rp:${q.id}` }]];
  if (propuesta)
    buttons.unshift([
      { text: '✅ Enviar la propuesta', data: `x:tq:se:${q.id}` },
      { text: '✏️ Cambiar', data: `x:tq:ch:${q.id}` }
    ]);
  buttons.push([{ text: '🗑 Lo hablo yo con la persona', data: `x:tq:dx:${q.id}` }]);
  await toOwner(q.tenantId, `tq:esc:${q.id}:${Date.now()}`, html, buttons);
}

async function closeWithFeedback(q: AgtTeamQuestion, helpful: boolean, note?: string): Promise<void> {
  await db
    .update(agtTeamQuestions)
    .set({ feedback: helpful ? 'sirve' : 'no_sirve', feedbackNote: note ?? null, ...(helpful ? { status: 'cerrada', closedAt: new Date() } : {}), awaitingChatId: null, awaitingKind: null, updatedAt: new Date() })
    .where(eq(agtTeamQuestions.id, q.id));
  const baseIds = ((q.sources as { type: string; id?: string }[]) ?? []).filter((x) => x.type === 'base' && x.id).map((x) => x.id as string);
  await recordFeedback(q.tenantId, baseIds, helpful).catch(() => undefined);
  if (helpful) await embedQuestion(q).catch(() => undefined);
}

/** Respuesta definitiva (de Enric o aprobada): a la persona, guardada para aprender y propuesta para la base. */
async function finalize(q: AgtTeamQuestion, answer: string, by: 'ia' | 'enric'): Promise<void> {
  const [row] = await db
    .update(agtTeamQuestions)
    .set({ status: 'resuelta', finalAnswer: answer, answeredBy: by, tier: by === 'enric' ? 'enric' : q.tier, answeredAt: new Date(), awaitingChatId: null, awaitingKind: null, updatedAt: new Date() })
    .where(eq(agtTeamQuestions.id, q.id))
    .returning();
  const label = by === 'enric' ? TIER_LABEL.enric : TIER_LABEL[(q.tier as Tier) ?? 'general'] ?? TIER_LABEL.general;
  await sendTo(q.tenantId, q.chatId, `<b>${label}</b>\n\n${by === 'enric' ? esc(answer) : answer}`, by === 'ia' ? feedbackButtons(q.id) : undefined);
  await embedQuestion(row ?? q).catch(() => undefined);
  // Lo que responde o aprueba Enric es conocimiento: se propone como entrada (con sus botones de siempre).
  try {
    const r = await submitRequest(q.tenantId, { text: `Duda del equipo:\n${questionText(q)}\n\nRespuesta${by === 'enric' ? ' de Enric' : ' (aprobada por Enric)'}:\n${answer.replace(/<[^>]+>/g, '')}`, source: 'respuesta', byName: 'Enric', byUserId: null });
    await db.update(agtTeamQuestions).set({ kbArticleId: r.id }).where(eq(agtTeamQuestions.id, q.id));
  } catch (e) {
    console.error('[agentes] propuesta para la base desde una duda:', e instanceof Error ? e.message : e);
  }
}

// --- Botones («x:tq:…») y textos que se piden con ellos -------------------------------------------------------------

export async function handleTeamButton(i: { tenantId: string; data: string; chatId: string; by: string; isOwner: boolean }) {
  const m = i.data.match(/^(ok|no|en|se|ch|rp|dx):([0-9a-f-]{36})$/);
  if (!m) return { answer: 'Botón no válido.', alert: true };
  const q = await getQuestion(i.tenantId, m[2]);
  if (!q) return { answer: 'Esa duda ya no existe.', alert: true, keyboard: null };
  const action = m[1];

  // Botones de la persona que preguntó.
  if (action === 'ok' || action === 'no' || action === 'en') {
    if (i.chatId !== q.chatId) return { answer: 'Este botón es de quien hizo la pregunta.', alert: true };
    if (q.feedback === 'sirve' || q.status === 'cerrada') return { answer: 'Ya está anotado. ¡Gracias!', keyboard: null };
    if (action === 'ok') {
      await closeWithFeedback(q, true);
      return { answer: '¡Me alegro! 👍', keyboard: null };
    }
    if (action === 'en') {
      await escalate(q, 'pide_enric', { resumen: 'La persona ha pedido que lo veas tú.', propuesta: q.aiAnswer ?? '' });
      return { answer: 'Se lo paso a Enric.', keyboard: null };
    }
    await db.update(agtTeamQuestions).set({ awaitingChatId: i.chatId, awaitingKind: 'nota', updatedAt: new Date() }).where(eq(agtTeamQuestions.id, q.id));
    return { awaitText: '¿Qué has probado o por qué no te sirve? Escríbelo en una línea y se lo paso a Enric.', keyboard: null };
  }

  // Botones de Enric.
  if (!i.isOwner) return { answer: 'Solo Enric decide aquí.', alert: true };
  if (q.status === 'resuelta' || q.status === 'cerrada' || q.status === 'descartada') return { answer: 'Esta duda ya está cerrada.', keyboard: null };
  if (action === 'se') {
    if (!q.aiAnswer) return { answer: 'No hay propuesta que enviar: responde tú.', alert: true };
    await finalize(q, q.aiAnswer, 'ia');
    return { answer: 'Enviada.', keyboard: null, reply: `✅ Enviada a ${esc(q.askedByName)}. Te llega también como propuesta para la base de conocimiento.` };
  }
  if (action === 'dx') {
    await db.update(agtTeamQuestions).set({ status: 'descartada', closedAt: new Date(), awaitingChatId: null, awaitingKind: null, updatedAt: new Date() }).where(eq(agtTeamQuestions.id, q.id));
    await sendTo(q.tenantId, q.chatId, 'Enric lo hablará contigo directamente.');
    return { answer: 'Descartada.', keyboard: null };
  }
  const kind = action === 'ch' ? 'cambio' : 'respuesta';
  await db.update(agtTeamQuestions).set({ awaitingChatId: i.chatId, awaitingKind: kind, updatedAt: new Date() }).where(eq(agtTeamQuestions.id, q.id));
  return { awaitText: action === 'ch' ? `✏️ ¿Qué cambio en la respuesta para ${esc(q.askedByName)}? Escríbelo y lo vuelvo a analizar.` : `📝 Escribe tu respuesta para ${esc(q.askedByName)}. Le llegará tal cual.` };
}

export async function handleTeamText(i: { tenantId: string; chatId: string; text: string; by: string; isOwner: boolean }): Promise<string> {
  const [q] = await db.select().from(agtTeamQuestions).where(and(eq(agtTeamQuestions.tenantId, i.tenantId), eq(agtTeamQuestions.awaitingChatId, i.chatId))).orderBy(desc(agtTeamQuestions.updatedAt)).limit(1);
  if (!q) return 'Eso ya no está activo.';
  const text = i.text.trim();
  if (!text) return 'No he recibido nada; vuelve a pulsar el botón.';
  if (q.awaitingKind === 'nota') {
    await closeWithFeedback(q, false, clip(text, 2000));
    const fresh = (await getQuestion(i.tenantId, q.id)) ?? q;
    await escalate(fresh, 'no_sirve', { resumen: 'La respuesta no le sirvió.', propuesta: '' });
    return 'Gracias. Se lo paso a Enric.';
  }
  if (!i.isOwner) return 'Solo Enric decide aquí.';
  if (q.awaitingKind === 'respuesta') {
    await finalize(q, clip(text, 6000), 'enric');
    return `💬 Enviada a ${esc(q.askedByName)}. Te llega también como propuesta para la base de conocimiento.`;
  }
  if (q.awaitingKind === 'cambio') {
    const jefe = await getAgent(i.tenantId, OPS_HEAD_KEY);
    if (!jefe) return 'No encuentro al jefe de operaciones.';
    await db.update(agtTeamQuestions).set({ awaitingChatId: null, awaitingKind: null }).where(eq(agtTeamQuestions.id, q.id));
    const settings = await getTeamSettings(i.tenantId);
    void inChain(`${i.tenantId}:${q.chatId}`, async () => {
      const conv = await getOrCreateConversation(i.tenantId, jefe.id, 'telegram', q.chatId, q.askedByName);
      await answerWithAgent(q, jefe, conv.id, `Duda de ${q.askedByName}: «${clip(questionText(q), 4000)}»`, settings, { hadRequest: Boolean(q.requestId), instruction: clip(text, 2000) });
    }).catch((e) => reportError({ error: e, source: 'agentes', area: 'dudas del equipo: cambio de Enric', tenantId: i.tenantId }));
    return '✏️ Lo vuelvo a analizar con tu cambio y te paso la nueva versión.';
  }
  return 'Eso ya no está activo.';
}

// --- Lo mismo desde la pantalla (Agentes → Equipo) --------------------------------------------------------------------

const decidable = (q: AgtTeamQuestion | null): q is AgtTeamQuestion => Boolean(q) && !['resuelta', 'cerrada', 'descartada'].includes(q!.status);

export async function webApprove(tenantId: string, id: string): Promise<{ ok: boolean; message: string }> {
  const q = await getQuestion(tenantId, id);
  if (!decidable(q)) return { ok: false, message: 'Esta duda ya está cerrada.' };
  if (!q.aiAnswer) return { ok: false, message: 'No hay propuesta que enviar: responde tú.' };
  await finalize(q, q.aiAnswer, 'ia');
  return { ok: true, message: 'Enviada.' };
}

export async function webAnswer(tenantId: string, id: string, text: string): Promise<{ ok: boolean; message: string }> {
  const q = await getQuestion(tenantId, id);
  if (!decidable(q)) return { ok: false, message: 'Esta duda ya está cerrada.' };
  const t = text.trim();
  if (!t) return { ok: false, message: 'Escribe la respuesta.' };
  await finalize(q, clip(t, 6000), 'enric');
  return { ok: true, message: 'Enviada.' };
}

export async function webDiscard(tenantId: string, id: string): Promise<{ ok: boolean; message: string }> {
  const q = await getQuestion(tenantId, id);
  if (!decidable(q)) return { ok: false, message: 'Esta duda ya está cerrada.' };
  await db.update(agtTeamQuestions).set({ status: 'descartada', closedAt: new Date(), awaitingChatId: null, awaitingKind: null, updatedAt: new Date() }).where(eq(agtTeamQuestions.id, q.id));
  await sendTo(q.tenantId, q.chatId, 'Enric lo hablará contigo directamente.');
  return { ok: true, message: 'Descartada.' };
}

// --- Para las pantallas y el informe -----------------------------------------------------------------------------------

export async function listTeamQuestions(tenantId: string, opts: { status?: string; limit?: number } = {}): Promise<AgtTeamQuestion[]> {
  const conds = [eq(agtTeamQuestions.tenantId, tenantId)];
  if (opts.status === 'abiertas') conds.push(inArray(agtTeamQuestions.status, OPEN));
  else if (opts.status) conds.push(eq(agtTeamQuestions.status, opts.status));
  return db.select().from(agtTeamQuestions).where(and(...conds)).orderBy(desc(agtTeamQuestions.createdAt)).limit(Math.min(opts.limit ?? 100, 300));
}

export async function teamWeekLines(tenantId: string, from: string, to: string): Promise<string[] | null> {
  const rows = await db
    .select({ tier: agtTeamQuestions.tier, status: agtTeamQuestions.status, feedback: agtTeamQuestions.feedback, reason: agtTeamQuestions.escalationReason, topic: agtTeamQuestions.topicKey, cost: agtTeamQuestions.costUsd })
    .from(agtTeamQuestions)
    .where(and(eq(agtTeamQuestions.tenantId, tenantId), sql`${agtTeamQuestions.createdAt} >= ${from}::date`, sql`${agtTeamQuestions.createdAt} < (${to}::date + 1)`));
  if (rows.length === 0) return null;
  const count = (f: (r: (typeof rows)[number]) => boolean) => rows.filter(f).length;
  const cost = rows.reduce((a, r) => a + Number(r.cost ?? 0), 0);
  const topics = new Map<string, number>();
  for (const r of rows.filter((x) => x.status === 'escalada' || x.feedback === 'no_sirve')) if (r.topic) topics.set(r.topic, (topics.get(r.topic) ?? 0) + 1);
  const hot = [...topics.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  return [
    `${rows.length} dudas: ${count((r) => r.tier === 'ficha')} con la ficha, ${count((r) => r.tier === 'base')} con la base, ${count((r) => r.tier === 'casos')} con casos anteriores, ${count((r) => r.tier === 'general')} con IA general, ${count((r) => r.tier === 'enric')} respondidas por ti.`,
    `Escaladas: ${count((r) => Boolean(r.reason))}. Le sirvió: ${count((r) => r.feedback === 'sirve')}; no le sirvió: ${count((r) => r.feedback === 'no_sirve')}. Sin resolver: ${count((r) => OPEN.includes(r.status))}. Coste: ${cost.toFixed(2)} $.`,
    ...(hot.length ? [`Temas que más cuestan (candidatos para la base): ${hot.map(([t, n]) => `${t.replace(/_/g, ' ')} (${n})`).join(', ')}.`] : [])
  ];
}

let registered = false;
/** Lo llama lib/agentes/register.ts: herramientas del jefe, botones y sección del informe semanal. */
export function registerTeamCapabilities(): void {
  if (registered) return;
  registered = true;
  registerTools(TEAM_TOOLS);
  registerModuleButtons('tq', { callback: handleTeamButton, text: handleTeamText });
  registerReportSection('equipo', { title: '🙋 Dudas del equipo', order: 30, weekly: (t, from, to) => teamWeekLines(t, from, to) });
}

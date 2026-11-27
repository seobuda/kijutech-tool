import 'server-only';

// Agentes · conversación con un agente desde la pantalla de un módulo (capacidad agentChat del núcleo; Jefe SEO, D3,
// 27 nov 2026, con la auditoría Opus). El envío guarda el mensaje y encola la respuesta como trabajo «agt.chat»: la acción
// del servidor no espera a la IA (Opus con herramientas tarda; una acción larga bloquea las demás de la página) y un
// candado por hilo (clave única del trabajo abierto) evita que dos personas se pisen o que un doble clic cobre dos veces.
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { agtConversations, agtMessages, jobs } from '@/lib/db/schema';
import { AGENT_THREAD_RE, type AgentChat, type AgentChatMessage, type AgentChatSend } from '@/lib/core/capabilities';
import { enqueueJob, registerJobKind } from '@/lib/core/jobs';
import { reportError } from '@/lib/core/errors';
import { runAgent, summarize, type HistoryItem } from '@/lib/agentes/engine';
import { addMessage, countMessages, ensureDefaultAgents, getAgent, getOrCreateConversation, recentMessages, setSummary } from '@/lib/agentes/store';

export const CHAT_JOB = 'agt.chat';
const dedupe = (conversationId: string) => `${CHAT_JOB}:${conversationId}`;
const MAX_TEXT = 4000;

type ChatPayload = { conversationId: string; agentKey: string; userMessageId: string; text: string; actor: { name: string; isOwner: boolean }; thread: string; context: string | null; maxTokens: number };

async function send(r: AgentChatSend): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!AGENT_THREAD_RE.test(r.thread)) return { ok: false, error: 'Hilo no válido.' };
  const text = r.text.trim().slice(0, MAX_TEXT);
  if (!text) return { ok: false, error: 'Escribe un mensaje.' };
  await ensureDefaultAgents(r.tenantId);
  const agent = await getAgent(r.tenantId, r.agentKey);
  if (!agent || !agent.active) return { ok: false, error: 'Ese agente no está disponible (está apagado en Agentes).' };
  const conv = await getOrCreateConversation(r.tenantId, agent.id, 'web', r.thread, r.threadName.slice(0, 200));
  // Si ya está respondiendo en este hilo, no se encola otra respuesta ni se guarda el mensaje.
  if (await busy(r.tenantId, conv.id)) return { ok: false, error: 'El agente aún está respondiendo en este hilo. Espera a que termine.' };
  // Hilo compartido: cada mensaje lleva quién lo escribe.
  const msg = await addMessage({ tenantId: r.tenantId, conversationId: conv.id, role: 'user', content: `${r.actor.name}: ${text}` });
  const payload: ChatPayload = { conversationId: conv.id, agentKey: agent.key, userMessageId: msg.id, text: `${r.actor.name}: ${text}`, actor: r.actor, thread: r.thread, context: r.context?.slice(0, 2000) ?? null, maxTokens: Math.min(32_000, Math.max(4096, r.maxTokens ?? 4096)) };
  let job: { created: boolean };
  try {
    job = await enqueueJob({ tenantId: r.tenantId, kind: CHAT_JOB, payload, dedupeKey: dedupe(conv.id), scopeType: 'cuenta', priority: 2 });
  } catch (e) {
    // Sin trabajo detrás, el mensaje se quedaría sin respuesta: fuera, y que lo reenvíe.
    await db.delete(agtMessages).where(eq(agtMessages.id, msg.id)).catch(() => undefined);
    throw e;
  }
  if (!job.created) {
    // Otra persona envió a la vez y ganó el candado: se quita este mensaje (recién creado, nadie lo ha respondido).
    await db.delete(agtMessages).where(eq(agtMessages.id, msg.id));
    return { ok: false, error: 'El agente aún está respondiendo en este hilo. Espera a que termine.' };
  }
  return { ok: true };
}

async function busy(tenantId: string, conversationId: string): Promise<boolean> {
  const [j] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.dedupeKey, dedupe(conversationId)), sql`${jobs.status} IN ('pendiente', 'en_curso')`))
    .limit(1);
  return Boolean(j);
}

async function history(tenantId: string, agentKey: string, thread: string, limit = 60): Promise<{ messages: AgentChatMessage[]; busy: boolean }> {
  if (!AGENT_THREAD_RE.test(thread)) return { messages: [], busy: false };
  const agent = await getAgent(tenantId, agentKey);
  if (!agent) return { messages: [], busy: false };
  const [conv] = await db
    .select({ id: agtConversations.id })
    .from(agtConversations)
    .where(and(eq(agtConversations.tenantId, tenantId), eq(agtConversations.agentId, agent.id), eq(agtConversations.channel, 'web'), eq(agtConversations.peer, thread)))
    .limit(1);
  if (!conv) return { messages: [], busy: false };
  const rows = await db.select().from(agtMessages).where(eq(agtMessages.conversationId, conv.id)).orderBy(desc(agtMessages.createdAt)).limit(Math.min(200, limit));
  const messages = rows.reverse().map((m) => ({
    id: m.id,
    role: m.role as 'user' | 'assistant',
    content: m.content,
    createdAt: m.createdAt.toISOString(),
    costUsd: m.costUsd != null ? Number(m.costUsd) : null,
    tools: Array.isArray(m.toolCalls) ? (m.toolCalls as { name: string; ok: boolean; proposed?: boolean }[]).map((t) => `${t.name}${t.proposed ? ' (propuesta)' : t.ok ? '' : ' (falló)'}`) : []
  }));
  return { messages, busy: await busy(tenantId, conv.id) };
}

/** El trabajo: responde al mensaje guardado con el historial del hilo (sin repetir ese mensaje) y resume si es largo. */
export async function answerChat(tenantId: string, p: ChatPayload, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const agent = await getAgent(tenantId, p.agentKey);
  const [conv] = await db.select().from(agtConversations).where(and(eq(agtConversations.id, p.conversationId), eq(agtConversations.tenantId, tenantId))).limit(1);
  if (!agent || !conv) return { error: 'agente o conversación no encontrados' };
  const recent = await recentMessages(conv.id, 18);
  const history: HistoryItem[] = recent.filter((m) => m.id !== p.userMessageId).slice(-16).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
  let run: Awaited<ReturnType<typeof runAgent>>;
  try {
    run = await runAgent({
      tenantId,
      agent,
      ctx: { tenantId, agentKey: agent.key, channel: 'web', conversationId: conv.id, thread: p.thread, actor: { name: p.actor.name, isOwner: p.actor.isOwner, clickupUserId: null } },
      userText: p.text,
      history,
      summary: conv.summary,
      extraSystem: p.context ?? undefined,
      maxTokens: p.maxTokens
    });
  } catch (e) {
    reportError({ error: e, source: 'agentes', area: `chat del agente ${agent.key}`, tenantId, actor: p.actor.name, channel: 'web' });
    run = { text: 'No he podido responder (ha fallado algo por dentro). Prueba otra vez en un momento.', toolCalls: [], costUsd: 0, inputTokens: 0, outputTokens: 0, error: 'fallo', cards: [] };
  }
  // Pasado el tiempo máximo el trabajo ya figura como fallido (y el hilo libre): una respuesta tardía no se escribe.
  if (signal?.aborted) return { costUsd: run.costUsd, error: 'fuera de tiempo' };
  await addMessage({ tenantId, conversationId: conv.id, role: 'assistant', content: run.text, toolCalls: run.toolCalls.length ? run.toolCalls : null, costUsd: run.costUsd });
  // Igual que por Telegram: cada 20 mensajes, lo anterior a los últimos 16 queda resumido.
  const total = await countMessages(conv.id);
  if (total >= 36 && total % 20 < 2) {
    const older = (await recentMessages(conv.id, 36)).slice(0, -16).map((x) => ({ role: x.role as 'user' | 'assistant', content: x.content }));
    const s = await summarize(tenantId, agent, conv.summary, older);
    if (s) await setSummary(conv.id, s);
  }
  return { costUsd: run.costUsd, tools: run.toolCalls.length, error: run.error };
}

export const AGENT_CHAT: AgentChat = { send, history };

let registered = false;
export function registerAgentChatJobs(): void {
  if (registered) return;
  registered = true;
  registerJobKind({
    kind: CHAT_JOB,
    // Hasta 8 vueltas con la IA (120 s cada una como mucho): de sobra, y un solo intento (reintentar cobraría dos veces).
    // Con 3 huecos en la cola, si los ocupan trabajos largos de otros tipos la respuesta espera a que se libere uno.
    timeoutS: 900,
    maxConcurrent: 2,
    maxAttempts: 1,
    run: async (ctx, payload) => answerChat(ctx.tenantId, payload as unknown as ChatPayload, ctx.signal)
  });
}

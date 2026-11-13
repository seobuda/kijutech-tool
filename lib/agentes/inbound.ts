import 'server-only';

// Conversación con el agente principal por Telegram y por correo (13 nov 2026). Llega por el registro del núcleo
// (dispatchInbound): el bot de Operaciones entrega aquí los mensajes libres y los audios del dueño, y el buzón del agente
// los correos autenticados del dueño.
//   - Audio → transcripción (OpenAI) → el agente → respuesta escrita y, si le hablaste con audio o pides «audio», también
//     en voz (nota de voz de Telegram).
//   - Un mensaje cada vez por conversación (si mandas dos seguidos, el segundo espera al primero).
//   - Cada 20 mensajes se actualiza el resumen de la conversación (contexto corto y barato).
// Fase 1: solo el dueño. El equipo podrá hablar con agentes con herramientas limitadas más adelante.
import { emailOutbound, telegramOutbound, type InboundMessage, type ToolContext } from '@/lib/core/capabilities';
import { addMessage, countMessages, getOrCreateConversation, principalAgent, recentMessages, setSummary } from '@/lib/agentes/store';
import { runAgent, summarize, type HistoryItem } from '@/lib/agentes/engine';
import { speak, speakableText, transcribe } from '@/lib/agentes/voice';

const chains = new Map<string, Promise<unknown>>();
const VOICE_REQUEST_RE = /\b(resp[oó]ndeme|contesta(me)?|d[ií]melo)\b.{0,30}\b(audio|voz|nota de voz)\b|\ben (audio|voz)\b/i;
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function handleInbound(m: InboundMessage): Promise<boolean> {
  if (!m.isOwner) return false; // fase 1: solo quien lleva las operaciones
  const agent = await principalAgent(m.tenantId);
  if (!agent) return false;
  const key = `${m.tenantId}:${m.channel}:${m.peer}`;
  const prev = chains.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(() => converse(m, agent));
  chains.set(key, next);
  void next
    .catch((e) => console.error('[agente] conversación:', e instanceof Error ? e.message : e))
    .finally(() => {
      if (chains.get(key) === next) chains.delete(key);
    });
  // No se espera: el webhook de Telegram responde al momento (si tardara, Telegram reenviaría el mensaje y el agente
  // contestaría dos veces). El servidor es un proceso permanente y el trabajo sigue en segundo plano.
  return true;
}

async function converse(m: InboundMessage, agent: NonNullable<Awaited<ReturnType<typeof principalAgent>>>): Promise<void> {
  const tgOut = m.channel === 'telegram' ? telegramOutbound() : null;
  const say = async (html: string) => {
    if (tgOut) await tgOut.sendText(m.tenantId, m.peer, html);
  };
  if (tgOut) await tgOut.sendTyping(m.tenantId, m.peer, m.audio ? 'record_voice' : 'typing');

  let text = m.text.trim();
  let transcript: string | null = null;
  if (m.audio) {
    const t = await transcribe(m.tenantId, m.audio);
    if (!t.ok) return void (await say(`🎙 ${escape(t.error)}`));
    transcript = t.text;
    text = [text, t.text].filter(Boolean).join('\n');
  }
  if (!text) return;

  const conv = await getOrCreateConversation(m.tenantId, agent.id, m.channel, m.peer, m.peerName);
  const history: HistoryItem[] = (await recentMessages(conv.id, 16)).map((x) => ({ role: x.role as 'user' | 'assistant', content: x.content }));
  await addMessage({ tenantId: m.tenantId, conversationId: conv.id, role: 'user', content: text, audio: m.audio ? { seconds: m.audio.seconds, transcript } : null });

  const ctx: ToolContext = { tenantId: m.tenantId, agentKey: agent.key, channel: m.channel, conversationId: conv.id, actor: { name: m.peerName, isOwner: true, clickupUserId: m.clickupUserId } };
  if (tgOut) await tgOut.sendTyping(m.tenantId, m.peer, 'typing');
  const run = await runAgent({ tenantId: m.tenantId, agent, ctx, userText: text, history, summary: conv.summary });
  await addMessage({ tenantId: m.tenantId, conversationId: conv.id, role: 'assistant', content: run.text, toolCalls: run.toolCalls.length ? run.toolCalls : null, costUsd: run.costUsd });

  if (m.channel === 'email') {
    const out = emailOutbound();
    if (out && m.email) {
      await out.reply(m.tenantId, { to: m.peer, subject: m.email.subject, text: run.text, inReplyTo: m.email.messageId, references: m.email.references, key: `agt:mail:${m.email.messageId ?? conv.id}:${Date.now()}` });
    }
  } else if (tgOut) {
    const heard = transcript ? `<i>🎙 «${escape(transcript.length > 220 ? `${transcript.slice(0, 220)}…` : transcript)}»</i>\n\n` : '';
    await tgOut.sendText(m.tenantId, m.peer, `${heard}${run.text}`);
    if ((m.audio || VOICE_REQUEST_RE.test(text)) && !run.error) {
      await tgOut.sendTyping(m.tenantId, m.peer, 'record_voice');
      const v = await speak(m.tenantId, speakableText(run.text), agent.voice);
      if (v.ok) await tgOut.sendVoice(m.tenantId, m.peer, v.ogg);
    }
  }

  // Resumen cada 20 mensajes: lo anterior a los últimos 16 queda resumido.
  const total = await countMessages(conv.id);
  if (total >= 36 && total % 20 < 2) {
    const older = (await recentMessages(conv.id, 36)).slice(0, -16).map((x) => ({ role: x.role as 'user' | 'assistant', content: x.content }));
    const s = await summarize(m.tenantId, agent, conv.summary, older);
    if (s) await setSummary(conv.id, s);
  }
}

/** Para las pruebas: espera a que terminen las conversaciones en curso. */
export async function waitIdle(): Promise<void> {
  await Promise.all([...chains.values()].map((p) => p.catch(() => undefined)));
}

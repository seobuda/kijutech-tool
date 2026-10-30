// Bloqueos: una persona pulsa «Bloqueado» en Telegram y cuenta qué necesita (texto o captura).
// La IA revisa la tarea, su descripción, la nota original y los comentarios de ClickUp:
//  - si la respuesta está ahí → responde sola a la persona, citando la fuente (queda en el resumen);
//  - si no → se escala a quien lleva las operaciones, resumido, con opciones y recomendación.
// Solo los bloqueos de encargos urgentes (prioridad 1) llegan al instante; el resto va al resumen
// de las 13:00 / 18:00 y a «Mi bandeja».
import { DEF, getAuto, renderTemplate } from '@/lib/operaciones/automations';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { opsBlockers, opsRequests, type OpsBlocker, type OpsRequest } from '@/lib/db/schema';
import { callAI, getPrompt } from '@/lib/ai/gateway';
import { extractJsonFromLLMResponse } from '@/lib/ai/parsers/json-extractor';
import { getTaskContext } from '@/lib/operaciones/clickup';
import { getClickUpToken } from '@/lib/operaciones/queries';
import { fillTemplate } from '@/lib/operaciones/format';
import { logEvent, type Actor } from '@/lib/operaciones/events';
import { enqueueNotification, refreshNotice } from '@/lib/operaciones/notifications';
import { getOwnerMember } from '@/lib/operaciones/telegram-config';
import { escapeHtml } from '@/lib/operaciones/telegram';
import { commentOnTask, notifyPerson, pushToClickUp, transition } from '@/lib/operaciones/workflow';

const TRIAGE_PROMPT_KEY = 'ops_blocker_triage';
const TRIAGE_MAX_TOKENS = 1500;

const triageSchema = z.object({
  puede_responder: z.coerce.boolean().default(false),
  respuesta: z.string().default(''),
  fuente: z.string().default(''),
  resumen: z.string().default(''),
  opciones: z.array(z.string()).default([]),
  recomendacion: z.string().default('')
});

const clamp = (t: string, n: number) => (t.length > n ? `${t.slice(0, n)}…` : t);

export async function getBlocker(tenantId: string, id: string): Promise<OpsBlocker | null> {
  const [b] = await db
    .select()
    .from(opsBlockers)
    .where(and(eq(opsBlockers.id, id), eq(opsBlockers.tenantId, tenantId)))
    .limit(1);
  return b ?? null;
}

// La persona comunica un bloqueo. Devuelve enseguida; la IA trabaja en segundo plano.
export async function reportBlock(
  req: OpsRequest,
  actor: Actor,
  text: string,
  fileId: string | null
): Promise<{ ok: true; blocker: OpsBlocker } | { ok: false; reason: string }> {
  const question = text.trim() || '(captura sin texto)';
  const row = await transition(req, 'bloqueado', ['asignado', 'en_curso', 'devuelto']);
  if (!row) return { ok: false, reason: 'Este encargo no se puede marcar como bloqueado ahora.' };

  const [blocker] = await db
    .insert(opsBlockers)
    .values({
      tenantId: req.tenantId,
      requestId: req.id,
      askedByClickupId: actor.clickupUserId,
      askedByName: actor.name,
      question,
      attachmentFileId: fileId
    })
    .returning();

  await logEvent(req.tenantId, {
    requestId: req.id,
    actor,
    type: 'blocked',
    payload: { blockerId: blocker.id, question, hasPhoto: Boolean(fileId) }
  });
  await commentOnTask(row, `${actor.name} está bloqueado/a: ${question}`, 'blocked');
  await refreshNotice(req.tenantId, req.id);

  void triageBlocker(blocker.id).catch((e) =>
    console.error('[operaciones] triaje de bloqueo:', e instanceof Error ? e.message : e)
  );
  return { ok: true, blocker };
}

function commentsText(c: { author: string; text: string; date: number }[]): string {
  if (c.length === 0) return '(sin comentarios)';
  return c
    .slice(-15)
    .map((x) => `- ${x.author}: ${x.text.replace(/\s+/g, ' ').trim()}`)
    .join('\n');
}

export async function triageBlocker(blockerId: string): Promise<void> {
  const [b] = await db.select().from(opsBlockers).where(eq(opsBlockers.id, blockerId)).limit(1);
  if (!b || b.status !== 'abierto' || !b.requestId) return;
  const [req] = await db.select().from(opsRequests).where(eq(opsRequests.id, b.requestId)).limit(1);
  if (!req) return;

  // Una captura sin texto no se puede razonar: va directa a quien lleva las operaciones.
  if (b.question === '(captura sin texto)') {
    return escalate(req, b, { resumen: 'La persona ha enviado solo una captura, sin texto.', opciones: [], recomendacion: '' });
  }

  let description = req.preparedDescription;
  let comments = '(no se pudieron leer los comentarios)';
  let status = req.workStatus;
  try {
    const conn = await getClickUpToken(req.tenantId);
    if (conn && req.clickupTaskId) {
      const ctx = await getTaskContext(conn.token, req.clickupTaskId);
      description = ctx.description || description;
      comments = commentsText(ctx.comments);
      status = ctx.status || status;
    }
  } catch {
    // si ClickUp no responde, se razona con lo que hay en la base de datos
  }

  const prompt = await getPrompt(TRIAGE_PROMPT_KEY);
  if (!prompt) {
    return escalate(req, b, {
      resumen: `(El prompt «${TRIAGE_PROMPT_KEY}» no está activo: no se ha podido revisar con IA.)`,
      opciones: [],
      recomendacion: ''
    });
  }

  const userPrompt = fillTemplate(prompt.user_prompt_template, {
    titulo: req.title,
    estado: status,
    descripcion: clamp(description, 6000),
    nota_original: clamp(req.originalRequest, 4000),
    comentarios: clamp(comments, 4000),
    persona: b.askedByName ?? 'la persona',
    pregunta: b.question
  });

  let parsed: z.infer<typeof triageSchema>;
  try {
    const response = await callAI({
      tenantId: req.tenantId,
      function: 'ops_blocker_triage',
      promptKey: TRIAGE_PROMPT_KEY,
      maxTokens: TRIAGE_MAX_TOKENS,
      messages: [
        { role: 'system', content: prompt.system_prompt },
        { role: 'user', content: userPrompt }
      ]
    });
    parsed = triageSchema.parse(extractJsonFromLLMResponse(response.content));
  } catch (e) {
    return escalate(req, b, {
      resumen: `(La IA no pudo revisarlo: ${e instanceof Error ? e.message : 'error'}.)`,
      opciones: [],
      recomendacion: ''
    });
  }

  // Solo se responde sola si la respuesta existe Y cita de dónde sale; si no, se escala.
  if (parsed.puede_responder && parsed.respuesta.trim() && parsed.fuente.trim()) {
    return answerByAgent(req, b, parsed.respuesta.trim(), parsed.fuente.trim());
  }
  return escalate(req, b, {
    resumen: parsed.resumen.trim() || b.question,
    opciones: parsed.opciones,
    recomendacion: parsed.recomendacion.trim()
  });
}

async function answerByAgent(req: OpsRequest, b: OpsBlocker, answer: string, source: string) {
  const [upd] = await db
    .update(opsBlockers)
    .set({ status: 'respondido_agente', aiAnswer: answer, aiSource: source, answeredAt: new Date() })
    .where(and(eq(opsBlockers.id, b.id), eq(opsBlockers.status, 'abierto')))
    .returning();
  if (!upd) return;
  const row = await transition(req, 'en_curso', ['bloqueado']);
  await logEvent(req.tenantId, {
    requestId: req.id,
    actor: { clickupUserId: b.askedByClickupId, name: b.askedByName ?? '—' },
    type: 'agent_answered',
    payload: { blockerId: b.id, source }
  });
  await notifyPerson(
    req,
    'reply',
    `🤖 <b>Respuesta a tu bloqueo</b>\n<b>${escapeHtml(req.title)}</b>\n\n${escapeHtml(answer)}\n\n📎 Fuente: ${escapeHtml(source)}\n\nSi no te sirve, vuelve a pulsar «Bloqueado» y se lo paso a quien lleva las operaciones.`
  );
  await commentOnTask(req, `Respuesta automática a ${b.askedByName ?? 'la persona'} (fuente: ${source}): ${answer}`, 'agent');
  if (row) await pushToClickUp(row, 'inProgress', 'Agente');
  await refreshNotice(req.tenantId, req.id);
}

export function blockerOwnerText(req: OpsRequest, b: OpsBlocker): string {
  const options = Array.isArray(b.aiOptions) ? (b.aiOptions as string[]) : [];
  return [
    '🚫 <b>Bloqueo que necesita tu decisión</b>',
    `<b>${escapeHtml(req.title)}</b>`,
    `Persona: ${escapeHtml(b.askedByName ?? '—')}`,
    `Pregunta: ${escapeHtml(b.question)}`,
    b.aiSummary ? `\n<b>Resumen:</b> ${escapeHtml(b.aiSummary)}` : '',
    options.length ? `\n<b>Opciones:</b>\n${options.map((o) => `• ${escapeHtml(o)}`).join('\n')}` : '',
    b.aiRecommendation ? `\n<b>Recomendación:</b> ${escapeHtml(b.aiRecommendation)}` : '',
    req.clickupTaskUrl ? `\n🔗 <a href="${req.clickupTaskUrl.replace(/"/g, '%22')}">Abrir la tarea</a>` : ''
  ]
    .filter(Boolean)
    .join('\n');
}

async function escalate(
  req: OpsRequest,
  b: OpsBlocker,
  r: { resumen: string; opciones: string[]; recomendacion: string }
) {
  const [upd] = await db
    .update(opsBlockers)
    .set({ status: 'escalado', aiSummary: r.resumen, aiOptions: r.opciones, aiRecommendation: r.recomendacion || null })
    .where(and(eq(opsBlockers.id, b.id), eq(opsBlockers.status, 'abierto')))
    .returning();
  if (!upd) return;
  await logEvent(req.tenantId, {
    requestId: req.id,
    actor: { clickupUserId: b.askedByClickupId, name: b.askedByName ?? '—' },
    type: 'escalated',
    payload: { blockerId: b.id }
  });
  await notifyPerson(
    req,
    'reply',
    `🙋 He pasado tu pregunta a quien lleva las operaciones.\n<b>${escapeHtml(req.title)}</b>\nTe responderá por aquí.`
  );
  // Cortafuegos: solo lo urgente (prioridad 1) llega al instante.
  const urgentAuto = await getAuto(req.tenantId, 'urgent_block');
  if (req.priority === 1 && urgentAuto.enabled) {
    const owner = await getOwnerMember(req.tenantId);
    if (owner) {
      await enqueueNotification({
        tenantId: req.tenantId,
        kind: 'block_alert',
        dedupeKey: `block:${b.id}`,
        forClickupUserId: owner.clickupUserId,
        forName: owner.username,
        requestId: req.id,
        payload: {
          text: renderTemplate(DEF.get('urgent_block')!, urgentAuto.template, { detalle: blockerOwnerText(req, upd) }),
          toOwner: true,
          photoFileId: b.attachmentFileId ?? undefined,
          buttons: [[{ text: '💬 Responder', data: `rp:${b.id}` }]]
        }
      });
    }
  }
}

// Responde quien lleva las operaciones (desde Telegram o desde «Mi bandeja»).
export async function ownerAnswerBlocker(
  blocker: OpsBlocker,
  owner: Actor,
  answer: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const text = answer.trim();
  if (!text) return { ok: false, reason: 'La respuesta está vacía.' };
  const [upd] = await db
    .update(opsBlockers)
    .set({ status: 'respondido_owner', ownerAnswer: text, answeredAt: new Date() })
    .where(and(eq(opsBlockers.id, blocker.id), inArray(opsBlockers.status, ['escalado', 'abierto'])))
    .returning();
  if (!upd || !upd.requestId) return { ok: false, reason: 'Este bloqueo ya está respondido.' };
  const [req] = await db.select().from(opsRequests).where(eq(opsRequests.id, upd.requestId)).limit(1);
  if (!req) return { ok: true };

  const row = await transition(req, 'en_curso', ['bloqueado']);
  await logEvent(req.tenantId, { requestId: req.id, actor: owner, type: 'owner_replied', payload: { blockerId: blocker.id } });
  await notifyPerson(
    req,
    'reply',
    `💬 <b>Respuesta a tu bloqueo</b>\n<b>${escapeHtml(req.title)}</b>\n\n${escapeHtml(text)}`
  );
  await commentOnTask(req, `Respuesta de ${owner.name} a ${blocker.askedByName ?? 'la persona'}: ${text}`, 'owner-reply');
  if (row) await pushToClickUp(row, 'inProgress', owner.name);
  await refreshNotice(req.tenantId, req.id);
  return { ok: true };
}

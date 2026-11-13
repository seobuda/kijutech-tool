import 'server-only';

// Trabajos de los subagentes (13 nov 2026). El agente principal encarga un trabajo («revisa el último artículo de la web
// de Athos») con la herramienta encargar_a_agente; queda en agt_jobs y lo hace el subagente en segundo plano:
//   - El planificador (registro del núcleo) reclama UN trabajo cada vez de forma atómica (FOR UPDATE SKIP LOCKED); si un
//     trabajo se queda «trabajando» más de 15 min (servidor reiniciado) se reintenta, como mucho 3 veces.
//   - El informe se guarda, se manda a Enric por Telegram (cola de avisos, con clave única) y se añade a la conversación
//     de donde salió el encargo, para que el agente principal lo tenga en cuenta.
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { agtAgents, agtJobs, type AgtJob } from '@/lib/db/schema';
import { telegramOutbound, type AgentTool, type ToolContext } from '@/lib/core/capabilities';
import { addMessage, getAgent, listAgents } from '@/lib/agentes/store';
import { runAgent } from '@/lib/agentes/engine';

const STALE_MS = 15 * 60_000;
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function createJob(input: { tenantId: string; agentKey: string; title: string; instruction: string; requestedBy: string; conversationId: string | null; data?: Record<string, unknown> }): Promise<AgtJob | { failure: string }> {
  const agent = await getAgent(input.tenantId, input.agentKey);
  if (!agent || !agent.active) return { failure: 'Ese agente no existe o está desactivado.' };
  if (agent.kind !== 'subagente') return { failure: 'Solo se encargan trabajos a subagentes.' };
  const [job] = await db
    .insert(agtJobs)
    .values({
      tenantId: input.tenantId,
      agentId: agent.id,
      conversationId: input.conversationId,
      requestedBy: input.requestedBy.slice(0, 255),
      title: input.title.slice(0, 300),
      instruction: input.instruction.slice(0, 8000),
      input: input.data ?? {}
    })
    .returning();
  return job;
}

/** Reclama el siguiente trabajo (atómico). */
async function claimJob(tenantId: string): Promise<AgtJob | null> {
  const rows = (await db.execute(sql`
    UPDATE agt_jobs SET status = 'trabajando', claimed_at = now(), attempts = attempts + 1
    WHERE id = (
      SELECT id FROM agt_jobs
      WHERE tenant_id = ${tenantId}
        AND (status = 'en_cola' OR (status = 'trabajando' AND claimed_at < now() - ${`${STALE_MS / 1000} seconds`}::interval AND attempts < 3))
      ORDER BY created_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`)) as unknown as { id: string }[];
  if (!rows[0]) return null;
  const [job] = await db.select().from(agtJobs).where(eq(agtJobs.id, rows[0].id)).limit(1);
  return job ?? null;
}

let running = false;

/** Planificador: un trabajo por vuelta (los trabajos tardan; no se solapan). */
export async function runAgentJobs(tenantId: string): Promise<void> {
  if (running) return;
  running = true;
  try {
    // Los que agotaron sus intentos quedan como fallidos.
    await db.execute(sql`
      UPDATE agt_jobs SET status = 'fallido', error = 'Se interrumpió varias veces (¿reinicio del servidor?)', finished_at = now()
      WHERE tenant_id = ${tenantId} AND status = 'trabajando' AND attempts >= 3 AND claimed_at < now() - ${`${STALE_MS / 1000} seconds`}::interval`);
    const job = await claimJob(tenantId);
    if (!job) return;
    await processJob(job);
  } finally {
    running = false;
  }
}

export async function processJob(job: AgtJob): Promise<void> {
  const agent = await getAgent(job.tenantId, job.agentId);
  if (!agent) {
    await db.update(agtJobs).set({ status: 'fallido', error: 'El agente ya no existe', finishedAt: new Date() }).where(eq(agtJobs.id, job.id));
    return;
  }
  const ctx: ToolContext = { tenantId: job.tenantId, agentKey: agent.key, channel: 'job', conversationId: job.conversationId, actor: { name: job.requestedBy, isOwner: true, clickupUserId: null } };
  const data = job.input as Record<string, unknown>;
  const userText = [`Encargo: ${job.title}`, job.instruction, Object.keys(data).length ? `Datos: ${JSON.stringify(data).slice(0, 2000)}` : ''].filter(Boolean).join('\n\n');
  const run = await runAgent({ tenantId: job.tenantId, agent, ctx, userText, maxTokens: 8000 });
  const failed = Boolean(run.error);
  await db
    .update(agtJobs)
    .set({ status: failed ? 'fallido' : 'hecho', result: run.text, error: run.error, costUsd: run.costUsd.toFixed(6), finishedAt: new Date() })
    .where(eq(agtJobs.id, job.id));

  const out = telegramOutbound();
  const preview = run.text.length > 2500 ? `${run.text.slice(0, 2500)}…\n\n(Informe completo en Agentes → Trabajos)` : run.text;
  if (out) {
    await out.notifyOwner(
      job.tenantId,
      `agtjob:${job.id}`,
      `${failed ? '⚠️' : '📋'} <b>${escape(agent.name)}: ${escape(job.title)}</b>\n\n${escape(preview)}`
    );
  }
  if (job.conversationId) {
    await addMessage({ tenantId: job.tenantId, conversationId: job.conversationId, role: 'assistant', content: `[Informe de ${agent.name} — ${job.title}]\n${run.text}`.slice(0, 20_000) });
  }
}

// --- Herramientas del módulo -----------------------------------------------------------------------------

export const encargarAgente: AgentTool = {
  name: 'encargar_a_agente',
  module: 'agentes',
  title: 'Encargar un trabajo a un subagente',
  description:
    'Encarga un trabajo en segundo plano a un subagente (por ejemplo «revisor_web» para revisar una página o un artículo). Da instrucciones completas: qué revisar (URL si la hay), de qué cliente y qué se espera del informe. El informe llega a Enric por Telegram cuando termina (unos minutos).',
  risk: 'lectura',
  inputSchema: {
    type: 'object',
    properties: {
      agente: { type: 'string', description: 'Clave del subagente (p. ej. revisor_web)' },
      titulo: { type: 'string', description: 'Título corto del trabajo' },
      instrucciones: { type: 'string', description: 'Qué tiene que hacer, con la URL y el cliente si se saben' }
    },
    required: ['agente', 'titulo', 'instrucciones'],
    additionalProperties: false
  },
  async run(ctx, input) {
    const subagents = (await listAgents(ctx.tenantId)).filter((a) => a.kind === 'subagente' && a.active);
    const key = String(input.agente ?? '').trim();
    const target = subagents.find((a) => a.key === key) ?? subagents.find((a) => a.name.toLowerCase().includes(key.toLowerCase()));
    if (!target) return { ok: false, content: `No hay ese subagente. Disponibles: ${subagents.map((a) => `${a.key} (${a.role})`).join('; ') || 'ninguno'}` };
    const job = await createJob({ tenantId: ctx.tenantId, agentKey: target.key, title: String(input.titulo ?? 'Trabajo'), instruction: String(input.instrucciones ?? ''), requestedBy: ctx.actor.name, conversationId: ctx.conversationId });
    if ('failure' in job) return { ok: false, content: job.failure };
    return { ok: true, content: `Encargado a ${target.name} («${job.title}»). El informe llegará por Telegram en unos minutos.` };
  }
};

export const estadoTrabajos: AgentTool = {
  name: 'estado_trabajos',
  module: 'agentes',
  title: 'Estado de los trabajos de los subagentes',
  description: 'Últimos trabajos encargados a los subagentes, con su estado y el principio del informe.',
  risk: 'lectura',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  async run(ctx) {
    const rows = await db
      .select({ j: agtJobs, name: agtAgents.name })
      .from(agtJobs)
      .innerJoin(agtAgents, eq(agtAgents.id, agtJobs.agentId))
      .where(and(eq(agtJobs.tenantId, ctx.tenantId)))
      .orderBy(desc(agtJobs.createdAt))
      .limit(10);
    if (!rows.length) return { ok: true, content: 'No hay trabajos encargados todavía.' };
    return { ok: true, content: rows.map((r) => `- ${r.name}: «${r.j.title}» · ${r.j.status}${r.j.result ? ` · ${r.j.result.slice(0, 200).replace(/\s+/g, ' ')}` : ''}`).join('\n') };
  }
};

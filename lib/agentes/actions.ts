'use server';

// Acciones web del módulo Agentes (solo administración): fichas de agentes, probar un agente desde la web, integraciones
// y reintentar trabajos. Cada una comprueba el permiso en el servidor; las credenciales nunca vuelven al navegador.
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db/drizzle';
import { agtAgents, agtJobs } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { wireApp } from '@/lib/app-wiring';
import { getTool } from '@/lib/core/capabilities';
import { addMessage, getAgent, getOrCreateConversation, listAgents, recentMessages, SERVER_TOOLS } from '@/lib/agentes/store';
import { runAgent } from '@/lib/agentes/engine';
import { VOICES } from '@/lib/agentes/voice';
import { deleteIntegration, getIntegration, isProvider, PROVIDERS, readCredentials, saveIntegration, testDataForSeo } from '@/lib/agentes/integrations';

type Res<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const PATH = '/dashboard/agentes';

const agentSchema = z.object({
  id: z.string().uuid().nullable(),
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{1,39}$/, 'La clave: minúsculas, números y guion bajo (p. ej. redactor_seo)'),
  name: z.string().trim().min(2).max(120),
  kind: z.enum(['principal', 'subagente']),
  role: z.string().trim().max(1000),
  instructions: z.string().trim().max(20_000),
  tools: z.array(z.string().trim().max(64)).max(60),
  model: z.string().trim().max(80).nullable(),
  voice: z.string().trim().max(30).nullable(),
  monthlyBudgetUsd: z.number().min(0).max(5000).nullable(),
  active: z.boolean()
});

export async function saveAgentAction(input: z.infer<typeof agentSchema>): Promise<Res<{ id: string }>> {
  try {
    const user = await requirePermission('admin');
    wireApp();
    const parsed = agentSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos no válidos' };
    const d = parsed.data;
    const tools = [...new Set(d.tools)].filter((t) => SERVER_TOOLS[t] || getTool(t));
    if (d.voice && !(VOICES as readonly string[]).includes(d.voice)) return { ok: false, error: 'Voz no válida' };
    if (d.model && !/^[a-z0-9.\-]+$/i.test(d.model)) return { ok: false, error: 'Modelo no válido' };
    const values = {
      key: d.key,
      name: d.name,
      kind: d.kind,
      role: d.role,
      instructions: d.instructions,
      tools,
      model: d.model || null,
      voice: d.voice || null,
      monthlyBudgetUsd: d.monthlyBudgetUsd !== null ? d.monthlyBudgetUsd.toFixed(2) : null,
      active: d.active,
      updatedAt: new Date()
    };
    if (d.id) {
      const [row] = await db.update(agtAgents).set(values).where(and(eq(agtAgents.id, d.id), eq(agtAgents.tenantId, user.tenantId))).returning({ id: agtAgents.id });
      if (!row) return { ok: false, error: 'Ese agente no existe' };
      revalidatePath(PATH);
      return { ok: true, id: row.id };
    }
    const exists = await getAgent(user.tenantId, d.key);
    if (exists) return { ok: false, error: 'Ya hay un agente con esa clave' };
    const [row] = await db.insert(agtAgents).values({ ...values, tenantId: user.tenantId }).returning({ id: agtAgents.id });
    revalidatePath(PATH);
    return { ok: true, id: row.id };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo guardar el agente') };
  }
}

export async function deleteAgentAction(id: string): Promise<Res> {
  try {
    const user = await requirePermission('admin');
    if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Datos no válidos' };
    const agents = await listAgents(user.tenantId);
    const a = agents.find((x) => x.id === id);
    if (!a) return { ok: false, error: 'Ese agente no existe' };
    if (a.kind === 'principal' && agents.filter((x) => x.kind === 'principal').length === 1) return { ok: false, error: 'No se puede borrar el único agente principal: desactívalo si quieres pararlo.' };
    await db.delete(agtAgents).where(and(eq(agtAgents.id, id), eq(agtAgents.tenantId, user.tenantId)));
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo borrar') };
  }
}

/** Probar un agente desde la web (conversación «web» del usuario). Las acciones de cambio se proponen igual por Telegram. */
export async function chatWithAgentAction(agentId: string, text: string): Promise<Res<{ reply: string; tools: string[]; costUsd: number }>> {
  try {
    const user = await requirePermission('admin');
    wireApp();
    const msg = z.string().trim().min(1).max(4000).safeParse(text);
    if (!msg.success || !z.string().uuid().safeParse(agentId).success) return { ok: false, error: 'Escribe un mensaje' };
    const agent = await getAgent(user.tenantId, agentId);
    if (!agent) return { ok: false, error: 'Ese agente no existe' };
    const conv = await getOrCreateConversation(user.tenantId, agent.id, 'web', `web:${user.id}`, user.name || user.email);
    const history = (await recentMessages(conv.id, 16)).map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    await addMessage({ tenantId: user.tenantId, conversationId: conv.id, role: 'user', content: msg.data });
    const run = await runAgent({
      tenantId: user.tenantId,
      agent,
      ctx: { tenantId: user.tenantId, agentKey: agent.key, channel: agent.kind === 'subagente' ? 'job' : 'web', conversationId: conv.id, actor: { name: user.name || user.email, isOwner: true, clickupUserId: null } },
      userText: msg.data,
      history,
      summary: conv.summary,
      maxTokens: agent.kind === 'subagente' ? 8000 : 4096
    });
    await addMessage({ tenantId: user.tenantId, conversationId: conv.id, role: 'assistant', content: run.text, toolCalls: run.toolCalls.length ? run.toolCalls : null, costUsd: run.costUsd });
    return { ok: true, reply: run.text, tools: run.toolCalls.map((t) => `${t.name}${t.proposed ? ' (propuesta)' : t.ok ? '' : ' (falló)'}`), costUsd: run.costUsd };
  } catch (e) {
    return { ok: false, error: publicError(e, 'El agente no ha podido responder') };
  }
}

export async function retryJobAction(id: string): Promise<Res> {
  try {
    const user = await requirePermission('admin');
    if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Datos no válidos' };
    const [row] = await db
      .update(agtJobs)
      .set({ status: 'en_cola', attempts: 0, error: null, claimedAt: null, finishedAt: null })
      .where(and(eq(agtJobs.id, id), eq(agtJobs.tenantId, user.tenantId)))
      .returning({ id: agtJobs.id });
    if (!row) return { ok: false, error: 'Ese trabajo no existe' };
    revalidatePath(`${PATH}/trabajos`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo reintentar') };
  }
}

// --- Integraciones ---------------------------------------------------------------------------------------

export async function saveIntegrationAction(provider: string, fields: Record<string, string>): Promise<Res<{ message: string }>> {
  try {
    const user = await requirePermission('admin');
    if (!isProvider(provider)) return { ok: false, error: 'Integración desconocida' };
    const def = PROVIDERS[provider];
    const current = readCredentials(await getIntegration(user.tenantId, provider));
    const creds: Record<string, string> = { ...current };
    for (const f of def.fields) {
      const v = typeof fields[f.key] === 'string' ? fields[f.key].trim().slice(0, 500) : '';
      // Un campo secreto vacío conserva el guardado (no se vuelve a enseñar).
      if (v) creds[f.key] = v;
      if (!creds[f.key] && f.secret) return { ok: false, error: `Falta «${f.label}»` };
      if (!creds[f.key] && !f.secret && f.key !== 'project') return { ok: false, error: `Falta «${f.label}»` };
    }
    if (provider === 'dataforseo') {
      const t = await testDataForSeo(creds);
      if (!t.ok) return { ok: false, error: `DataForSEO no aceptó las credenciales (${t.error}).` };
      await saveIntegration(user.tenantId, provider, creds, { status: 'conectada' });
      revalidatePath(`${PATH}/integraciones`);
      return { ok: true, message: `Conectada. ${t.detail}.` };
    }
    if (provider === 'clarity') {
      // No se prueba al guardar: Clarity solo permite 10 consultas al día y la prueba gastaría una.
      await saveIntegration(user.tenantId, provider, creds, { status: 'conectada' });
      revalidatePath(`${PATH}/integraciones`);
      return { ok: true, message: 'Guardada. Se comprobará en la primera consulta de un agente.' };
    }
    // Google: se guarda el cliente OAuth y queda pendiente hasta autorizar con «Conectar con Google».
    await saveIntegration(user.tenantId, provider, creds, { status: creds.refreshToken ? 'conectada' : 'pendiente' });
    revalidatePath(`${PATH}/integraciones`);
    return { ok: true, message: creds.refreshToken ? 'Guardada.' : 'Guardada. Ahora pulsa «Conectar con Google» para autorizar.' };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo guardar la integración') };
  }
}

export async function deleteIntegrationAction(provider: string): Promise<Res> {
  try {
    const user = await requirePermission('admin');
    if (!isProvider(provider)) return { ok: false, error: 'Integración desconocida' };
    await deleteIntegration(user.tenantId, provider);
    revalidatePath(`${PATH}/integraciones`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo quitar') };
  }
}

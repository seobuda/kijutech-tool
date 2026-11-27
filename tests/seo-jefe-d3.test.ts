// SEO · Jefe SEO D3: conversación con el Jefe desde Plan de servicio (capacidad agentChat del núcleo) y cambios propuestos
// al plan. La IA y el expediente se simulan; la base de datos es real (cuenta de prueba propia, se borra al terminar).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';

const h = vi.hoisted(() => ({
  script: [] as unknown[],
  calls: [] as { system?: string; max_tokens?: number }[]
}));

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    messages = {
      create: async (params: { system?: string; max_tokens?: number }) => {
        h.calls.push({ system: params.system, max_tokens: params.max_tokens });
        return h.script.shift() ?? { content: [{ type: 'text', text: 'Vale.' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } };
      }
    };
  }
  return { default: Anthropic };
});
vi.mock('@/lib/ai/gateway', async (orig) => {
  const m = await orig<typeof import('@/lib/ai/gateway')>();
  return {
    ...m,
    resolveActiveProvider: async () => ({ provider: 'anthropic', model: 'claude-opus-5-5', apiKey: 'test', keyMode: 'platform' }),
    getModelPricing: async () => ({ inputCostPer1k: '0.004', outputCostPer1k: '0.02' })
  };
});
// Expediente simulado: dos datos reales con los que respaldar un cambio.
vi.mock('@/lib/seo/jefe/expediente', () => ({
  buildStrategicDossier: async (_t: string, projectId: string) => ({
    projectId,
    generatedAt: new Date().toISOString(),
    evidence: new Map([
      ['L:sin_ficha', { id: 'L:sin_ficha', type: 'L', label: 'No hay ficha', data: {} }],
      ['Q:taller motos sabadell', { id: 'Q:taller motos sabadell', type: 'Q', label: 'taller motos sabadell', data: { pos: 6 } }]
    ]),
    text: '',
    summary: { client: 'x', gsc: 'x', monthlyHours: 10, dataGaps: [], eligible: [], profile: 'local_fisico' }
  })
}));

import { db } from '@/lib/db/drizzle';
import { agtAgents, agtDepartments, agtMessages, clients, jobs, projects, seoJefeProposals, seoMasterPlans, tenants, users } from '@/lib/db/schema';
import { AGENT_THREAD_RE, agentChat, getTool } from '@/lib/core/capabilities';
import { registerAgentesCapabilities } from '@/lib/agentes/register';
import { answerChat, CHAT_JOB } from '@/lib/agentes/chat';
import { ensureDefaultAgents, getAgent, SEO_HEAD_KEY } from '@/lib/agentes/store';
import { registerJefeTools } from '@/lib/seo/jefe/tools';
import { acceptedChangesForNextPlan, decidePlanChange, expireStaleChanges, listPlanChanges, proposePlanChange } from '@/lib/seo/jefe/cambios';
import { PlanError } from '@/lib/seo/jefe/errors';
import { jefeThread, JEFE_AGENT_KEY } from '@/lib/seo/jefe/chat';

const SLUG = 'prueba-seo-jefe-d3';
const EMAIL = 'prueba-seo-jefe-d3@kijutech.invalid';
let T = '';
let P = '';
let OTHER = '';

async function cleanup() {
  const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, SLUG));
  if (t) {
    await db.delete(jobs).where(eq(jobs.tenantId, t.id));
    await db.delete(seoJefeProposals).where(eq(seoJefeProposals.tenantId, t.id));
    await db.delete(projects).where(eq(projects.tenantId, t.id));
    await db.delete(clients).where(eq(clients.tenantId, t.id));
    await db.delete(users).where(eq(users.tenantId, t.id));
    await db.delete(tenants).where(eq(tenants.id, t.id));
  }
  await db.delete(users).where(eq(users.email, EMAIL));
}

beforeAll(async () => {
  await cleanup();
  const [t] = await db.insert(tenants).values({ name: 'Prueba Jefe SEO D3', slug: SLUG }).returning();
  T = t.id;
  const [u] = await db.insert(users).values({ tenantId: T, name: 'Prueba', email: EMAIL, passwordHash: 'x' }).returning();
  const [c] = await db.insert(clients).values({ tenantId: T, name: 'Taller Prueba' }).returning();
  const [p] = await db.insert(projects).values({ tenantId: T, name: 'SEO taller', clientId: c.id, createdBy: u.id, service: 'seo' }).returning();
  const [o] = await db.insert(projects).values({ tenantId: T, name: 'SEO otro', clientId: c.id, createdBy: u.id, service: 'seo' }).returning();
  P = p.id;
  OTHER = o.id;
  registerAgentesCapabilities();
  registerJefeTools();
});
afterAll(cleanup);

describe('Jefe SEO D3: agente, departamento e hilo', () => {
  it('el Jefe SEO y el departamento SEO se crean solos', async () => {
    await ensureDefaultAgents(T);
    const a = await getAgent(T, SEO_HEAD_KEY);
    expect(a?.kind).toBe('jefe');
    expect(a?.departmentKey).toBe('seo');
    expect(a?.tools).toEqual(expect.arrayContaining(['seo_plan_maestro', 'seo_proponer_cambio_plan', 'seo_expediente_estrategico']));
    const [d] = await db.select().from(agtDepartments).where(and(eq(agtDepartments.tenantId, T), eq(agtDepartments.key, 'seo')));
    expect(d?.headAgentKey).toBe(SEO_HEAD_KEY);
    expect(JEFE_AGENT_KEY).toBe(SEO_HEAD_KEY);
  });
  it('el hilo lo fija el servidor: «web:» (chat de prueba de Agentes) y formatos raros no valen', () => {
    expect(AGENT_THREAD_RE.test(jefeThread(P))).toBe(true);
    expect(AGENT_THREAD_RE.test('web:123')).toBe(false);
    expect(AGENT_THREAD_RE.test('seo:a b')).toBe(false);
  });
});

describe('Jefe SEO D3: cambios propuestos', () => {
  it('sin un dato real del expediente no hay propuesta; con él queda pendiente y sin duplicados', async () => {
    await expect(proposePlanChange(T, P, { tipo: 'anadir', titulo: 'Reclamar la ficha de Google', motivo: 'No hay ficha y es un taller con local.', evidencias: ['Q:inventada'] }, { threadPeer: null, leyoWebs: false })).rejects.toBeInstanceOf(PlanError);
    const r = await proposePlanChange(T, P, { tipo: 'anadir', titulo: 'Reclamar la ficha de Google', motivo: 'No hay ficha y es un taller con local.', evidencias: ['L:sin_ficha', 'Q:inventada'] }, { threadPeer: jefeThread(P), leyoWebs: false });
    expect(r.rejected).toEqual(['Q:inventada']);
    await expect(proposePlanChange(T, P, { tipo: 'anadir', titulo: 'reclamar la FICHA de google', motivo: 'Lo mismo otra vez, repetido.', evidencias: ['L:sin_ficha'] }, { threadPeer: null, leyoWebs: false })).rejects.toThrow(/ya está propuesto/);
    const list = await listPlanChanges(T, P);
    expect(list).toHaveLength(1);
    expect(list[0].payload.evidencias).toEqual(['L:sin_ficha']);
  });
  it('rechazar exige motivo; aceptado entra en el plan siguiente; al aprobar otra versión, lo pendiente caduca', async () => {
    const [c] = await listPlanChanges(T, P);
    await expect(decidePlanChange(T, P, c.id, 'rechazada', 'Prueba', 'no')).rejects.toBeInstanceOf(PlanError);
    await decidePlanChange(T, P, c.id, 'aprobada', 'Prueba', null);
    await expect(decidePlanChange(T, P, c.id, 'aprobada', 'Prueba', null)).rejects.toThrow(/ya no está pendiente/);
    expect((await acceptedChangesForNextPlan(T, P, null)).map((x) => x.titulo)).toEqual(['Reclamar la ficha de Google']);
    // Un pendiente sobre la v1 caduca al aprobarse la v2.
    await db.insert(seoJefeProposals).values({ tenantId: T, projectId: P, kind: 'cambio', baseVersion: 1, payload: { tipo: 'mover', titulo: 'x', motivo: 'y', evidencias: [] }, status: 'pendiente' });
    await expireStaleChanges(db, P, 2);
    const after = await listPlanChanges(T, P);
    expect(after.find((x) => x.payload.titulo === 'x')?.status).toBe('caducada');
  });
});

describe('Jefe SEO D3: conversación encolada', () => {
  it('enviar guarda el mensaje y encola UNA respuesta por hilo; el segundo envío espera', async () => {
    const chat = agentChat()!;
    expect(chat).toBeTruthy();
    const base = { tenantId: T, agentKey: SEO_HEAD_KEY, thread: jefeThread(P), threadName: 'Plan · SEO taller', actor: { name: 'Ana', isOwner: false }, context: `Proyecto ${P}`, maxTokens: 16_000 };
    expect(await chat.send({ ...base, thread: 'web:x', text: 'hola' })).toEqual({ ok: false, error: 'Hilo no válido.' });
    expect(await chat.send({ ...base, text: '¿Por qué la ficha va primero?' })).toEqual({ ok: true });
    const second = await chat.send({ ...base, actor: { name: 'Luis', isOwner: false }, text: 'Y otra cosa' });
    expect(second.ok).toBe(false);
    const h1 = await chat.history(T, SEO_HEAD_KEY, jefeThread(P));
    expect(h1.busy).toBe(true);
    expect(h1.messages.map((m) => m.content)).toEqual(['Ana: ¿Por qué la ficha va primero?']);
  });
  it('el trabajo responde con el proyecto del hilo aunque el modelo pida otro, y libera el hilo', async () => {
    const [job] = await db.select().from(jobs).where(and(eq(jobs.tenantId, T), eq(jobs.kind, CHAT_JOB)));
    // El modelo intenta proponer sobre OTRO proyecto: la herramienta usa el del hilo.
    h.script.push(
      { content: [{ type: 'tool_use', id: 'tu1', name: 'seo_proponer_cambio_plan', input: { proyecto: OTHER, tipo: 'ajustar', titulo: 'Subir prioridad del taller', motivo: 'Está en la posición 6, cerca del top.', evidencias: ['Q:taller motos sabadell'] } }], stop_reason: 'tool_use', usage: { input_tokens: 10, output_tokens: 5 } },
      { content: [{ type: 'text', text: 'Lo dejo **propuesto** para que lo decidáis.' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } }
    );
    const r = await answerChat(T, job.payload as never);
    expect(r.error).toBeNull();
    expect(h.calls.at(-1)?.max_tokens).toBe(16_000);
    expect(h.calls.at(-1)?.system).toContain(`Proyecto ${P}`);
    expect((await listPlanChanges(T, OTHER)).length).toBe(0);
    const mine = await listPlanChanges(T, P);
    const prop = mine.find((c) => c.payload.titulo === 'Subir prioridad del taller');
    expect(prop?.status).toBe('pendiente');
    const [row] = await db.select({ threadPeer: seoJefeProposals.threadPeer }).from(seoJefeProposals).where(eq(seoJefeProposals.id, prop!.id));
    expect(row.threadPeer).toBe(jefeThread(P));
    await db.update(jobs).set({ status: 'hecho' }).where(eq(jobs.id, job.id));
    const h2 = await agentChat()!.history(T, SEO_HEAD_KEY, jefeThread(P));
    expect(h2.busy).toBe(false);
    expect(h2.messages.at(-1)?.content).toContain('<b>propuesto</b>');
    expect(h2.messages.at(-1)?.tools).toEqual(['seo_proponer_cambio_plan (propuesta)']);
  });
  it('la herramienta de plan dice que no hay plan y el texto de riesgo es genérico', async () => {
    const t = getTool('seo_plan_maestro')!;
    const r = await t.run({ tenantId: T, agentKey: SEO_HEAD_KEY, channel: 'web', conversationId: null, thread: jefeThread(P), actor: { name: 'x', isOwner: false, clickupUserId: null } }, { proyecto: 'cualquiera' });
    expect(r.content).toMatch(/aún no tiene plan/);
    expect(getTool('seo_proponer_cambio_plan')?.risk).toBe('cambio');
    const msgs = await db.select().from(agtMessages).where(eq(agtMessages.tenantId, T));
    expect(msgs.length).toBe(2);
    const [a] = await db.select().from(agtAgents).where(and(eq(agtAgents.tenantId, T), eq(agtAgents.key, SEO_HEAD_KEY)));
    expect(a.model).toBe('claude-opus-5-5');
    expect((await db.select().from(seoMasterPlans).where(eq(seoMasterPlans.tenantId, T))).length).toBe(0);
  });
});

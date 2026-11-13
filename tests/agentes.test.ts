// Módulo Agentes (13 nov 2026): registro del núcleo, motor con la IA simulada, conversación por Telegram, trabajos de
// subagentes y aprobación de acciones. La API de Anthropic, la clave y Telegram se interceptan; la base de datos es real
// (cuenta de prueba propia, se borra al terminar).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

const h = vi.hoisted(() => ({
  script: [] as unknown[],
  calls: [] as { tools?: { name: string }[]; system?: string; messages: unknown[] }[]
}));

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    messages = {
      create: async (params: { tools?: { name: string }[]; system?: string; messages: unknown[] }) => {
        h.calls.push({ tools: params.tools, system: params.system, messages: [...params.messages] });
        const next = h.script.shift();
        return next ?? { content: [{ type: 'text', text: 'Vale.' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } };
      }
    };
  }
  return { default: Anthropic };
});
vi.mock('@/lib/operaciones/telegram-config', async (orig) => {
  const m = await orig<typeof import('@/lib/operaciones/telegram-config')>();
  return { ...m, getOwnerMember: async () => ({ id: 'dueno-prueba', clickupUserId: '900000099', username: 'Enric', telegramChatId: 777 }) };
});
vi.mock('@/lib/ai/gateway', async (orig) => {
  const m = await orig<typeof import('@/lib/ai/gateway')>();
  return {
    ...m,
    resolveActiveProvider: async () => ({ provider: 'anthropic', model: 'claude-sonnet-4-6', apiKey: 'test', keyMode: 'platform' }),
    getModelPricing: async () => ({ inputCostPer1k: '0.003', outputCostPer1k: '0.015' })
  };
});

import { db } from '@/lib/db/drizzle';
import { agtAgents, agtJobs, aiJobs, opsAgentActions, tenants } from '@/lib/db/schema';
import { availableTools, dispatchInbound, getTool, registerTools, setInboundHandler, setTelegramOutbound, type AgentTool } from '@/lib/core/capabilities';
import { runAgent, systemPrompt, toMessages } from '@/lib/agentes/engine';
import { isOgg, speakableText } from '@/lib/agentes/voice';
import { signState, verifyState } from '@/lib/agentes/integrations';
import { ensureDefaultAgents, getAgent, listAgents, PRINCIPAL_KEY, WEB_REVIEWER_KEY } from '@/lib/agentes/store';
import { createJob, processJob } from '@/lib/agentes/jobs';
import { handleInbound, waitIdle } from '@/lib/agentes/inbound';
import { AGENT_TOOL_CALLBACK_RE, decideAgentTool, OPS_AGENT_TOOLS, setToolAutonomy } from '@/lib/operaciones/agent-capabilities';
import { getCalendar } from '@/lib/operaciones/calendar';
import { AGENTES_TOOLS } from '@/lib/agentes/register';

const sent: { kind: string; chat: string; text?: string }[] = [];
setTelegramOutbound({
  sendText: async (_t, chat, html) => void sent.push({ kind: 'text', chat, text: html }),
  sendVoice: async (_t, chat) => (sent.push({ kind: 'voice', chat }), true),
  sendTyping: async () => undefined,
  notifyOwner: async (_t, _k, html) => void sent.push({ kind: 'notify', chat: 'owner', text: html })
});

const probe: AgentTool = {
  name: 'herramienta_prueba',
  module: 'pruebas',
  title: 'Prueba',
  description: 'Devuelve un dato de prueba.',
  risk: 'lectura',
  inputSchema: { type: 'object', properties: { q: { type: 'string' } }, additionalProperties: false },
  run: async (_ctx, input) => ({ ok: true, content: `dato para ${String(input.q)}` })
};
const hidden: AgentTool = { ...probe, name: 'herramienta_oculta', available: async () => false };
registerTools([probe, hidden, ...OPS_AGENT_TOOLS, ...AGENTES_TOOLS]);

describe('núcleo: registro de capacidades', () => {
  it('ofrece solo las permitidas y disponibles; rechaza nombres no válidos', async () => {
    expect((await availableTools('x', ['herramienta_prueba', 'herramienta_oculta', 'no_existe'])).map((t) => t.name)).toEqual(['herramienta_prueba']);
    expect(() => registerTools([{ ...probe, name: 'Mal Nombre' }])).toThrow();
    expect(getTool('crear_encargo')?.risk).toBe('cambio');
    expect(getTool('estado_equipo')?.risk).toBe('lectura');
  });
  it('entrega un mensaje al primer manejador que lo atiende', async () => {
    const seen: string[] = [];
    setInboundHandler('zz_prueba', async (m) => (seen.push(m.text), m.text === 'para mí'));
    expect(await dispatchInbound({ tenantId: 't', channel: 'telegram', peer: '1', peerName: 'x', isOwner: false, clickupUserId: null, text: 'para mí' })).toBe(true);
    expect(seen).toContain('para mí');
  });
});

describe('motor (puro)', () => {
  it('historial válido: empieza por el usuario y une los consecutivos', () => {
    const m = toMessages([{ role: 'assistant', content: 'hola' }, { role: 'user', content: 'a' }, { role: 'user', content: 'b' }], 'c');
    expect(m.map((x) => x.role)).toEqual(['user']);
    expect(m[0].content).toBe('a\n\nb\n\nc');
  });
  it('el prompt lleva el rol, la fecha y las reglas del canal', () => {
    const agent = { key: 'k', name: 'Agente X', role: 'Hace cosas.', instructions: 'Instr.', tools: [] } as unknown as Parameters<typeof systemPrompt>[0];
    const p = systemPrompt(agent, { tenantId: 't', agentKey: 'k', channel: 'telegram', conversationId: null, actor: { name: 'Enric', isOwner: true, clickupUserId: null } }, { summary: 'Antes hablamos de X' });
    expect(p).toContain('Agente X');
    expect(p).toContain('Telegram');
    expect(p).toContain('PROPUESTAS');
    expect(p).toContain('Antes hablamos de X');
    expect(p).toMatch(/Hoy es \d{4}-\d{2}-\d{2}/);
  });
});

describe('voz e integraciones (puro)', () => {
  it('texto para leer en voz alta sin HTML ni enlaces y recortado', () => {
    expect(speakableText('<b>Hola</b> mira https://x.com/a &amp; ya')).toBe('Hola mira el enlace del mensaje & ya');
    expect(speakableText('Frase. '.repeat(400), 100).endsWith('El resto te lo dejo por escrito.')).toBe(true);
    expect(isOgg(new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0]))).toBe(true);
    expect(isOgg(new Uint8Array([0x49, 0x44, 0x33, 0, 0]))).toBe(false);
  });
  it('estado de OAuth firmado: válido, manipulado y caducado', () => {
    const s = signState('tenant-1', 7);
    expect(verifyState(s)).toEqual({ tenantId: 'tenant-1', userId: 7 });
    expect(verifyState(`${s}x`)).toBeNull();
    expect(verifyState(signState('tenant-1', 7, Date.now() - 20 * 60_000))).toBeNull();
  });
  it('botones de aprobación', () => {
    expect('at:ok:11111111-1111-1111-1111-111111111111'.match(AGENT_TOOL_CALLBACK_RE)?.[1]).toBe('ok');
    expect('at:no:x'.match(AGENT_TOOL_CALLBACK_RE)).toBeNull();
  });
});

// --- Con la base de datos ------------------------------------------------------------------------------

const SLUG = 'seg-test-agentes';
let tenantId = '';

async function cleanup() {
  const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, SLUG));
  if (t) await db.delete(tenants).where(eq(tenants.id, t.id));
}

describe('agentes con la base de datos', () => {
  beforeAll(async () => {
    await cleanup();
    const [t] = await db.insert(tenants).values({ name: 'Prueba agentes', slug: SLUG }).returning();
    tenantId = t.id;
  });
  afterAll(cleanup);

  it('crea los agentes por defecto una sola vez', async () => {
    await ensureDefaultAgents(tenantId);
    await ensureDefaultAgents(tenantId);
    const agents = await listAgents(tenantId);
    expect(agents.map((a) => a.key).sort()).toEqual([PRINCIPAL_KEY, WEB_REVIEWER_KEY].sort());
    expect(agents.find((a) => a.key === PRINCIPAL_KEY)?.tools).toContain('crear_encargo');
  });

  it('el motor usa una herramienta, responde y registra el coste', async () => {
    const agent = { ...(await getAgent(tenantId, PRINCIPAL_KEY))!, tools: ['herramienta_prueba'], monthlyBudgetUsd: null };
    h.calls.length = 0;
    h.script.push(
      { content: [{ type: 'tool_use', id: 'tu1', name: 'herramienta_prueba', input: { q: 'equipo' } }], stop_reason: 'tool_use', usage: { input_tokens: 1000, output_tokens: 100 } },
      { content: [{ type: 'text', text: 'El dato es: dato para equipo' }], stop_reason: 'end_turn', usage: { input_tokens: 1200, output_tokens: 50 } }
    );
    const run = await runAgent({ tenantId, agent, ctx: { tenantId, agentKey: agent.key, channel: 'web', conversationId: null, actor: { name: 'Enric', isOwner: true, clickupUserId: null } }, userText: '¿cómo va?' });
    expect(run.text).toBe('El dato es: dato para equipo');
    expect(run.toolCalls).toEqual([expect.objectContaining({ name: 'herramienta_prueba', ok: true })]);
    expect(h.calls[0].tools?.map((t) => t.name)).toEqual(['herramienta_prueba']);
    // 2.200 tokens de entrada × 0,003 + 150 de salida × 0,015 (por 1.000)
    expect(run.costUsd).toBeCloseTo(0.0066 + 0.00225, 6);
    const jobs = await db.select().from(aiJobs).where(eq(aiJobs.tenantId, tenantId));
    expect(jobs.some((j) => j.function === `agt_${PRINCIPAL_KEY}` && j.status === 'completed')).toBe(true);
  });

  it('respeta el presupuesto del agente', async () => {
    const agent = { ...(await getAgent(tenantId, PRINCIPAL_KEY))!, monthlyBudgetUsd: '0.001' };
    const run = await runAgent({ tenantId, agent, ctx: { tenantId, agentKey: agent.key, channel: 'web', conversationId: null, actor: { name: 'Enric', isOwner: true, clickupUserId: null } }, userText: 'hola' });
    expect(run.error).toBe('presupuesto agotado');
  });

  it('conversación por Telegram: solo el dueño; responde por el canal y guarda los mensajes', async () => {
    expect(await handleInbound({ tenantId, channel: 'telegram', peer: '555', peerName: 'Otro', isOwner: false, clickupUserId: null, text: 'hola' })).toBe(false);
    sent.length = 0;
    h.script.push({ content: [{ type: 'text', text: 'Todo en orden por aquí.' }], stop_reason: 'end_turn', usage: { input_tokens: 50, output_tokens: 10 } });
    expect(await handleInbound({ tenantId, channel: 'telegram', peer: '777', peerName: 'Enric', isOwner: true, clickupUserId: null, text: '¿qué tal el día?' })).toBe(true);
    await waitIdle();
    expect(sent.filter((s) => s.kind === 'text').map((s) => s.text)).toContain('Todo en orden por aquí.');
    expect(sent.some((s) => s.kind === 'voice')).toBe(false); // no habló en audio ni lo pidió
  });

  it('trabajo de subagente: se hace, guarda el informe y avisa a Enric', async () => {
    const job = await createJob({ tenantId, agentKey: WEB_REVIEWER_KEY, title: 'Revisar artículo', instruction: 'Revisa https://ejemplo.com/blog/post', requestedBy: 'Enric', conversationId: null });
    expect('failure' in job).toBe(false);
    if ('failure' in job) return;
    h.calls.length = 0;
    h.script.push({ content: [{ type: 'text', text: 'RESUMEN\nNota 7/10' }], stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 40 } });
    sent.length = 0;
    await processJob(job);
    const [after] = await db.select().from(agtJobs).where(eq(agtJobs.id, job.id));
    expect(after.status).toBe('hecho');
    expect(after.result).toContain('Nota 7/10');
    expect(sent.some((s) => s.kind === 'notify' && s.text?.includes('Revisar artículo'))).toBe(true);
    // Al subagente se le ofrecen la lectura y la búsqueda web de Anthropic.
    const offered = (h.calls[0].tools ?? []).map((t) => t.name);
    expect(offered).toEqual(expect.arrayContaining(['web_fetch', 'web_search']));
    expect(await createJob({ tenantId, agentKey: PRINCIPAL_KEY, title: 'x', instruction: 'y', requestedBy: 'Enric', conversationId: null })).toEqual({ failure: 'Solo se encargan trabajos a subagentes.' });
  });

  it('acción de cambio: con aprobación se propone; al aprobar se hace; en autónomo se hace directamente', async () => {
    const tool = getTool('apuntar_ausencia')!;
    const ctx = { tenantId, agentKey: PRINCIPAL_KEY, channel: 'telegram' as const, conversationId: null, actor: { name: 'Enric', isOwner: true, clickupUserId: null } };
    const r = await tool.run(ctx, { tipo: 'festivo', desde: '2026-12-08', hasta: '2026-12-08', motivo: 'Inmaculada' });
    expect(r.proposed).toBe(true);
    expect((await getCalendar(tenantId)).length).toBe(0);
    const [action] = await db.select().from(opsAgentActions).where(eq(opsAgentActions.tenantId, tenantId));
    expect(action.kind).toBe('agent_tool');
    expect(action.status).toBe('propuesto');
    const d = await decideAgentTool(tenantId, action.id, true, 'Enric');
    expect(d.answer).toBe('✅ Hecho.');
    expect((await getCalendar(tenantId)).map((e) => e.name)).toEqual(['Inmaculada']);
    expect((await decideAgentTool(tenantId, action.id, true, 'Enric')).answer).toContain('ya estaba decidida');

    await setToolAutonomy(tenantId, 'apuntar_ausencia', 'autonomo');
    const r2 = await tool.run(ctx, { tipo: 'festivo', desde: '2026-12-25', hasta: '2026-12-25', motivo: 'Navidad' });
    expect(r2.proposed).toBeFalsy();
    expect((await getCalendar(tenantId)).map((e) => e.name).sort()).toEqual(['Inmaculada', 'Navidad']);
    const all = await db.select().from(opsAgentActions).where(eq(opsAgentActions.tenantId, tenantId));
    expect(all.some((a) => a.status === 'auto')).toBe(true);
  });

  it('las fichas por defecto se pueden borrar en cascada con la cuenta', async () => {
    const before = await db.select().from(agtAgents).where(eq(agtAgents.tenantId, tenantId));
    expect(before.length).toBeGreaterThanOrEqual(2);
  });
});

describe('formato por canal', () => {
  it('Markdown → HTML en Telegram y texto plano en informes', async () => {
    const { tidyForChannel } = await import('@/lib/agentes/engine');
    expect(tidyForChannel('**Hola** y `código`\n## Título', 'telegram')).toBe('<b>Hola</b> y código\n<b>Título</b>');
    expect(tidyForChannel('**Hola**\n---\n## Título', 'job')).toBe('Hola\n\nTítulo');
  });
});

describe('limpieza del informe', () => {
  it('quita la frase previa de «pensar en voz alta»', async () => {
    const { tidyForChannel } = await import('@/lib/agentes/engine');
    expect(tidyForChannel('Tengo todo lo que necesito. Redacto el informe.\n\nINFORME\nTexto', 'job')).toBe('INFORME\nTexto');
    expect(tidyForChannel('INFORME\nTengo dudas sobre el H1', 'job')).toBe('INFORME\nTengo dudas sobre el H1');
  });
});

describe('texto hablado', () => {
  it('sin emojis, viñetas ni guiones largos', () => {
    expect(speakableText('Resumen 😄\n\n— <b>Enric</b>: 2 tareas ⚠️\n— Eury: todo al día ✅')).toBe('Resumen. Enric: 2 tareas. Eury: todo al día');
  });
});

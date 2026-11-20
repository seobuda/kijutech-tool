// Dudas del equipo al jefe de Operaciones (20 nov 2026). La IA (SDK de Anthropic) responde con un guion de bloques
// (herramientas y texto), Telegram se intercepta y los embeddings se simulan; la base de datos es real (cuenta propia).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';

type Block = { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown };
const h = vi.hoisted(() => ({ script: [] as Block[][], calls: 0 }));

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    messages = {
      create: async () => {
        h.calls++;
        const content = h.script.shift() ?? [{ type: 'text', text: 'Sin guion.' }];
        return { content, stop_reason: content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn', usage: { input_tokens: 100, output_tokens: 50 } };
      }
    };
  }
  return { default: Anthropic };
});
vi.mock('@/lib/ai/gateway', async (orig) => {
  const m = await orig<typeof import('@/lib/ai/gateway')>();
  return {
    ...m,
    resolveActiveProvider: async () => ({ provider: 'anthropic', model: 'claude-sonnet-4-6', apiKey: 'test', keyMode: 'platform' }),
    getEmbeddingConfig: async () => ({ provider: 'gemini', model: 'emb-test', apiKey: 'test' }),
    getModelPricing: async () => ({ inputCostPer1k: '0.004', outputCostPer1k: '0.020' }),
    callAI: async () => ({ content: JSON.stringify({ titulo: 'Entrada desde una duda', problema: 'p', solucion: '1. Paso', categoria: 'web', etiquetas: [], enlaces: [], nota_para_enric: '' }), jobId: 'j', provider: 'anthropic', model: 'x', input_tokens: 1, output_tokens: 1 })
  };
});
vi.mock('@/lib/ai/clustering/layers/1-embeddings', () => ({
  embedTexts: async (texts: string[]) =>
    texts.map((t) => {
      const v = new Array(1536).fill(0);
      for (const w of t.toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length > 3)) {
        let n = 0;
        for (const ch of w) n = (n * 31 + ch.charCodeAt(0)) % 1536;
        v[n] += 1;
      }
      if (v.every((x) => x === 0)) v[0] = 1;
      return v;
    })
}));

import { db } from '@/lib/db/drizzle';
import { agtAgents, agtTeamQuestions, kbArticles, tenants } from '@/lib/db/schema';
import { setTelegramOutbound, type OutboundButton } from '@/lib/core/capabilities';
import { registerKnowledgeCapabilities, saveArticle } from '@/lib/core/knowledge';
import { ensureDefaultAgents, getAgent, OPS_HEAD_KEY, PRINCIPAL_KEY, SYSTEM_HEAD_KEY, HEAD_MODEL } from '@/lib/agentes/store';
import { handleInbound } from '@/lib/agentes/inbound';
import { handleTeamButton, handleTeamText, registerTeamCapabilities, saveTeamSettings, SENSITIVE_RE, THANKS_RE, verifyTier, waitTeamIdle } from '@/lib/agentes/team';

const SLUG = 'test-equipo-jefe';
const MEMBER_CHAT = '777001';
const OWNER_CHAT = '777000';
let tenant = '';
const toMember: { chat: string; html: string; buttons?: OutboundButton[][] }[] = [];
const toOwner: { key: string; html: string; buttons?: OutboundButton[][] }[] = [];

const tool = (name: string, input: unknown): Block => ({ type: 'tool_use', id: `t${Math.random().toString(36).slice(2, 8)}`, name, input });
const ask = async (text: string, extra: Record<string, unknown> = {}) => {
  const handled = await handleInbound({ tenantId: tenant, channel: 'telegram', peer: MEMBER_CHAT, peerName: 'Mayi', isOwner: false, clickupUserId: '55', text, ...extra });
  await waitTeamIdle();
  return handled;
};
const lastQuestion = async () => (await db.select().from(agtTeamQuestions).where(eq(agtTeamQuestions.tenantId, tenant)).orderBy(agtTeamQuestions.createdAt)).at(-1)!;
const owner = (data: string) => handleTeamButton({ tenantId: tenant, data, chatId: OWNER_CHAT, by: 'Enric', isOwner: true });
const member = (data: string) => handleTeamButton({ tenantId: tenant, data, chatId: MEMBER_CHAT, by: 'Mayi', isOwner: false });

describe('reglas puras del jefe de operaciones', () => {
  it('la fuente solo vale si se consultó (y con ids reales)', () => {
    const calls = [{ name: 'buscar_conocimiento', ok: true }];
    expect(verifyTier('base', calls, { validBaseIds: ['a'], validCaseIds: [], hadRequest: false })).toBe('base');
    expect(verifyTier('base', calls, { validBaseIds: [], validCaseIds: [], hadRequest: false })).toBe('general');
    expect(verifyTier('base', [], { validBaseIds: ['a'], validCaseIds: [], hadRequest: false })).toBe('general');
    expect(verifyTier('casos', [{ name: 'casos_anteriores', ok: true }], { validBaseIds: [], validCaseIds: ['c'], hadRequest: false })).toBe('casos');
    expect(verifyTier('ficha', [], { validBaseIds: [], validCaseIds: [], hadRequest: true })).toBe('ficha');
    expect(verifyTier('ficha', [{ name: 'ficha_cliente', ok: false }], { validBaseIds: [], validCaseIds: [], hadRequest: false })).toBe('general');
  });
  it('red de seguridad y mensajes que no son dudas', () => {
    expect(SENSITIVE_RE.test('¿Cuándo me suben el sueldo?')).toBe(true);
    expect(SENSITIVE_RE.test('¿cuál es la contraseña del WordPress?')).toBe(true);
    expect(SENSITIVE_RE.test('¿Cómo configuro el formulario?')).toBe(false);
    expect(THANKS_RE.test('¡Gracias!')).toBe(true);
    expect(THANKS_RE.test('gracias, pero ¿y el móvil?')).toBe(false);
  });
});

describe('dudas del equipo al jefe de operaciones', () => {
  beforeAll(async () => {
    await db.delete(tenants).where(eq(tenants.slug, SLUG));
    const [t] = await db.insert(tenants).values({ name: 'Prueba jefe de operaciones', slug: SLUG }).returning();
    tenant = t.id;
    registerKnowledgeCapabilities();
    registerTeamCapabilities();
    setTelegramOutbound({
      sendText: async (_t, chat, html, buttons) => void toMember.push({ chat, html, buttons }),
      sendVoice: async () => false,
      sendTyping: async () => {},
      notifyOwner: async (_t, key, html, buttons) => void toOwner.push({ key, html, buttons })
    });
    await ensureDefaultAgents(tenant);
  });
  afterAll(async () => {
    await db.delete(tenants).where(eq(tenants.slug, SLUG));
  });
  beforeEach(async () => {
    toMember.length = 0;
    toOwner.length = 0;
    h.script.length = 0;
    await db.delete(agtTeamQuestions).where(eq(agtTeamQuestions.tenantId, tenant));
    await saveTeamSettings(tenant, { generalAutonomy: 'aprobacion', maxAttempts: 3, followupMinutes: 30 });
    await db.update(agtAgents).set({ active: true }).where(and(eq(agtAgents.tenantId, tenant), eq(agtAgents.key, OPS_HEAD_KEY)));
  });

  it('crea el jefe de operaciones apagado, al frente de Operaciones y con Opus; los jefes con Opus', async () => {
    const fresh = await getAgent(tenant, OPS_HEAD_KEY);
    expect(fresh).toMatchObject({ kind: 'jefe', departmentKey: 'operaciones', model: HEAD_MODEL });
    expect(fresh!.tools).toEqual(expect.arrayContaining(['buscar_conocimiento', 'casos_anteriores', 'responder_al_equipo', 'escalar_a_enric', 'mis_tareas']));
    expect(fresh!.tools).not.toContain('crear_encargo');
    expect((await getAgent(tenant, PRINCIPAL_KEY))!.model).toBe(HEAD_MODEL);
    expect((await getAgent(tenant, SYSTEM_HEAD_KEY))!.model).toBe(HEAD_MODEL);
  });

  it('apagado: el mensaje del equipo se ignora como antes', async () => {
    await db.update(agtAgents).set({ active: false }).where(and(eq(agtAgents.tenantId, tenant), eq(agtAgents.key, OPS_HEAD_KEY)));
    expect(await ask('¿Cómo hago una redirección?')).toBe(false);
    expect(toMember).toHaveLength(0);
  });

  it('responde con la base: llega a la persona al momento, con la fuente y los botones; «Me sirve» suma a la entrada', async () => {
    const art = await saveArticle(tenant, null, { title: 'Redirecciones en WordPress', problem: '', solution: '1. Rank Math → Redirecciones', categoryId: null, tags: [], links: [] }, null, 'publicada');
    h.script.push([tool('buscar_conocimiento', { pregunta: 'redirección wordpress' })], [tool('responder_al_equipo', { respuesta: '1. Abre Rank Math\n2. Redirecciones', fuente: 'base', ids: [art], tema: 'WordPress redirecciones' })], [{ type: 'text', text: 'Hecho.' }]);
    expect(await ask('¿Cómo hago una redirección en WordPress?')).toBe(true);
    const q = await lastQuestion();
    expect(q).toMatchObject({ status: 'respondida', tier: 'base', topicKey: 'wordpress_redirecciones', answeredBy: 'ia' });
    expect(toMember.at(-1)!.html).toContain('base de conocimiento');
    expect(JSON.stringify(toMember.at(-1)!.buttons)).toContain(`x:tq:ok:${q.id}`);
    expect(toOwner).toHaveLength(0);
    await member(`ok:${q.id}`);
    expect((await lastQuestion()).status).toBe('cerrada');
    const [a] = await db.select().from(kbArticles).where(eq(kbArticles.id, art));
    expect(a.helpfulCount).toBe(1);
  });

  it('dice «base» sin consultarla: cuenta como IA general y pasa por Enric; «Enviar» la manda y la propone para la base', async () => {
    h.script.push([tool('responder_al_equipo', { respuesta: 'Prueba a vaciar la caché.', fuente: 'base', ids: ['00000000-0000-0000-0000-000000000000'], tema: 'caché' })], [{ type: 'text', text: 'ok' }]);
    await ask('La web no muestra los cambios');
    const q = await lastQuestion();
    expect(q).toMatchObject({ status: 'pendiente_aprobacion', tier: 'general' });
    expect(toMember.at(-1)!.html).toContain('confirmarlo con Enric');
    expect(JSON.stringify(toOwner.at(-1)!.buttons)).toContain(`x:tq:se:${q.id}`);
    // Los botones de Enric no los puede pulsar la persona.
    expect((await handleTeamButton({ tenantId: tenant, data: `se:${q.id}`, chatId: MEMBER_CHAT, by: 'Mayi', isOwner: false })).alert).toBe(true);
    await owner(`se:${q.id}`);
    const done = await lastQuestion();
    expect(done).toMatchObject({ status: 'resuelta', finalAnswer: 'Prueba a vaciar la caché.', answeredBy: 'ia' });
    expect(toMember.at(-1)!.html).toContain('vaciar la caché');
    expect(done.kbArticleId).toBeTruthy();
    const [kb] = await db.select().from(kbArticles).where(eq(kbArticles.id, done.kbArticleId!));
    expect(kb).toMatchObject({ status: 'propuesta', sourceType: 'respuesta' });
  });

  it('«Cambiar»: Enric dice qué, el jefe lo rehace, vuelve a Enric y queda anotado para aprender', async () => {
    h.script.push([tool('responder_al_equipo', { respuesta: 'Versión 1', fuente: 'general', tema: 'cache' })], [{ type: 'text', text: 'ok' }]);
    await ask('¿Cómo vacío la caché de WP Rocket?');
    const q = await lastQuestion();
    const r = await owner(`ch:${q.id}`);
    expect(r.awaitText).toContain('¿Qué cambio');
    h.script.push([tool('responder_al_equipo', { respuesta: 'Versión 2 con copia de seguridad', fuente: 'general', tema: 'cache' })], [{ type: 'text', text: 'ok' }]);
    await handleTeamText({ tenantId: tenant, chatId: OWNER_CHAT, text: 'Añade hacer copia antes', by: 'Enric', isOwner: true });
    await waitTeamIdle();
    const v2 = await lastQuestion();
    expect(v2).toMatchObject({ status: 'pendiente_aprobacion', aiAnswer: 'Versión 2 con copia de seguridad', aiFirstAnswer: 'Versión 1' });
    expect(v2.revisions).toEqual([expect.objectContaining({ instruction: 'Añade hacer copia antes', before: 'Versión 1' })]);
    expect(toOwner.at(-1)!.html).toContain('Versión 2');
  });

  it('red de seguridad: un tema sensible se escala sin preguntar a la IA', async () => {
    const before = h.calls;
    await ask('¿Cuándo me suben el sueldo?');
    expect(h.calls).toBe(before);
    expect(await lastQuestion()).toMatchObject({ status: 'escalada', escalationReason: 'tema_sensible' });
    expect(toMember.at(-1)!.html).toContain('Esto lo decide Enric');
    expect(toOwner.at(-1)!.html).toContain('Duda del equipo para ti');
  });

  it('«No me sirve»: pide qué probó, lo apunta y escala; Enric responde y le llega a la persona', async () => {
    await saveTeamSettings(tenant, { generalAutonomy: 'autonomo' });
    h.script.push([tool('responder_al_equipo', { respuesta: 'Revisa el SMTP.', fuente: 'general', tema: 'formularios' })], [{ type: 'text', text: 'ok' }]);
    await ask('El formulario no envía correos');
    const q = await lastQuestion();
    expect(q.status).toBe('respondida'); // autónomo: la IA general va directa
    expect((await member(`no:${q.id}`)).awaitText).toContain('¿Qué has probado');
    await handleTeamText({ tenantId: tenant, chatId: MEMBER_CHAT, text: 'Ya lo revisé y está bien', by: 'Mayi', isOwner: false });
    expect(await lastQuestion()).toMatchObject({ status: 'escalada', escalationReason: 'no_sirve', feedback: 'no_sirve', feedbackNote: 'Ya lo revisé y está bien' });
    expect(toOwner.at(-1)!.html).toContain('Ya lo revisé');
    await owner(`rp:${q.id}`);
    await handleTeamText({ tenantId: tenant, chatId: OWNER_CHAT, text: 'Es el plugin de seguridad: desactiva la casilla X.', by: 'Enric', isOwner: true });
    expect(await lastQuestion()).toMatchObject({ status: 'resuelta', answeredBy: 'enric', tier: 'enric' });
    expect(toMember.at(-1)!.html).toContain('Respuesta de Enric');
  });

  it('sin bucles: la duda que vuelve una y otra vez se escala con «creo que no te estoy ayudando»', async () => {
    await saveTeamSettings(tenant, { generalAutonomy: 'autonomo', maxAttempts: 2 });
    h.script.push([tool('responder_al_equipo', { respuesta: 'Mira el panel.', fuente: 'general', tema: 'analytics' })], [{ type: 'text', text: 'ok' }]);
    await ask('No veo las conversiones en Analytics');
    const before = h.calls;
    await ask('Sigo sin verlas');
    expect(h.calls).toBe(before);
    expect(await lastQuestion()).toMatchObject({ status: 'escalada', escalationReason: 'intentos' });
    expect(toMember.at(-1)!.html).toContain('no te estoy ayudando');
  });

  it('el jefe escala solo cuando no le toca (escalar_a_enric) y el mensaje llega con el encargo al que responde', async () => {
    h.script.push([tool('escalar_a_enric', { motivo: 'tema_sensible', resumen: 'Pide cambiar la fecha de entrega', propuesta: '', tema: 'plazos' })], [{ type: 'text', text: 'ok' }]);
    await ask('¿Puedo entregarlo el lunes en vez del viernes?', { replyToRequestId: '11111111-1111-1111-1111-111111111111', replyToSummary: 'Encargo: «Artículo blog»\nCliente: Pepe' });
    const q = await lastQuestion();
    expect(q).toMatchObject({ status: 'escalada', escalationReason: 'tema_sensible', requestId: '11111111-1111-1111-1111-111111111111', topicKey: 'plazos' });
    expect(toOwner.at(-1)!.html).toContain('cambiar la fecha');
  });
});

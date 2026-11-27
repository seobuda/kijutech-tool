// Organigrama y bot de Sistema (20 nov 2026). Telegram se intercepta (fetch simulado: se ve qué bot envía cada mensaje),
// la IA también; la base de datos es real (cuentas de prueba propias, se borran al terminar).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';

const h = vi.hoisted(() => ({ systems: [] as string[] }));

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    messages = {
      create: async (params: { system?: unknown }) => {
        h.systems.push(JSON.stringify(params.system ?? ''));
        return { content: [{ type: 'text', text: 'Todo en orden.' }], stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 } };
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
    getModelPricing: async () => ({ inputCostPer1k: '0.003', outputCostPer1k: '0.015' })
  };
});

import { db } from '@/lib/db/drizzle';
import { agtAgents, opsClickupConnections, opsNotifications, opsTelegramBots, opsTelegramConfig, opsTelegramMembers, sysErrorGroups, tenants } from '@/lib/db/schema';
import { encrypt } from '@/lib/ai/encryption';
import { setInboundHandler, SYSTEM_BOT, type InboundMessage } from '@/lib/core/capabilities';
import { flushErrors, registerConsoleTenantResolver, reportError } from '@/lib/core/errors';
import { getAgent, listAgents, listDepartments, PRINCIPAL_KEY, SYSTEM_HEAD_KEY } from '@/lib/agentes/store';
import { handleInbound, waitIdle } from '@/lib/agentes/inbound';
import { registerOperacionesCapabilities } from '@/lib/operaciones/agent-capabilities';
import { enqueueNotification, processNotifications } from '@/lib/operaciones/notifications';
import { DeptBotError, deptWebhookSecret, saveDeptBot } from '@/lib/operaciones/dept-bots';
import { handleUpdate } from '@/lib/operaciones/telegram-handler';
import { estadoSistemaTool, queueSystemDigest } from '@/lib/operaciones/system-report';
import { POST as webhookPost } from '@/app/api/telegram/webhook/route';

const SLUG = 'seg-test-organigrama';
const SLUG2 = 'seg-test-organigrama-2';
const MAIN = '111111:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const SYS = '222222:BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const OWNER_CHAT = 555001;
let tenant = '';

type Call = { token: string; method: string; body: Record<string, unknown> };
const calls: Call[] = [];
let failSysSend = false;
const fakeFetch = vi.fn(async (url: string | URL, init?: RequestInit) => {
  const m = String(url).match(/\/bot([^/]+)\/(\w+)$/);
  if (!m) return new Response('{}', { status: 404 });
  const body = init?.body && typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};
  calls.push({ token: m[1], method: m[2], body });
  if (m[2] === 'getMe') return Response.json({ ok: true, result: { id: 1, first_name: m[1] === SYS ? 'Kijutech Sistema' : 'Kijutech', username: m[1] === SYS ? 'kiju_sistema_bot' : 'kiju_bot' } });
  if (m[2] === 'sendMessage' && m[1] === SYS && failSysSend) return Response.json({ ok: false, error_code: 403, description: 'Forbidden: bot can\'t initiate conversation with a user' });
  if (m[2] === 'sendMessage') return Response.json({ ok: true, result: { message_id: calls.length } });
  return Response.json({ ok: true, result: true });
});
const sentBy = (token: string, method = 'sendMessage') => calls.filter((c) => c.token === token && c.method === method);

async function waitStatus(key: string) {
  for (let i = 0; i < 40; i++) {
    await processNotifications(tenant);
    const [r] = await db.select().from(opsNotifications).where(and(eq(opsNotifications.tenantId, tenant), eq(opsNotifications.dedupeKey, key)));
    if (r && r.status !== 'pendiente') return r;
    await new Promise((res) => setTimeout(res, 50));
  }
  throw new Error(`El aviso ${key} no salió`);
}
const healthNotice = (key: string, extra: Record<string, unknown> = {}) =>
  enqueueNotification({ tenantId: tenant, kind: 'health', dedupeKey: key, forClickupUserId: '1', forName: 'Enric', payload: { text: `Aviso ${key}`, toOwner: true, ...extra } });

async function cleanup() {
  await db.delete(tenants).where(inArray(tenants.slug, [SLUG, SLUG2]));
}

describe('organigrama y bot de Sistema', () => {
  beforeAll(async () => {
    vi.stubGlobal('fetch', fakeFetch);
    registerOperacionesCapabilities();
    await cleanup();
    const [t] = await db.insert(tenants).values({ name: 'Prueba organigrama', slug: SLUG }).returning();
    tenant = t.id;
    const enc = encrypt(MAIN);
    await db.insert(opsClickupConnections).values({ tenantId: tenant, apiKeyEncrypted: 'x', apiKeyIv: 'x', workspaceId: 'w', workspaceName: 'W', meClickupId: '1', meUsername: 'Enric' });
    await db.insert(opsTelegramConfig).values({ tenantId: tenant, botTokenEncrypted: enc.encrypted, botTokenIv: enc.iv, botUsername: 'kiju_bot', testMode: false, receiveMode: 'webhook', webhookUrl: `https://brain.test/api/telegram/webhook?t=${tenant}` });
    await db.insert(opsTelegramMembers).values([
      { tenantId: tenant, clickupUserId: '1', username: 'Enric', telegramChatId: OWNER_CHAT, linkedAt: new Date() },
      { tenantId: tenant, clickupUserId: '2', username: 'Jesus', telegramChatId: 555002, linkedAt: new Date() }
    ]);
  });
  afterAll(async () => {
    registerConsoleTenantResolver(() => null);
    vi.unstubAllGlobals();
    await cleanup();
  });
  beforeEach(() => {
    calls.length = 0;
    failSysSend = false;
  });

  it('crea los departamentos y el jefe de sistema; los agentes que ya existían pasan a su departamento', async () => {
    const depts = await listDepartments(tenant);
    expect(depts.map((d) => d.key)).toEqual(['gabinete', 'operaciones', 'cuentas', 'seo', 'sistema', 'seguridad']);
    expect(depts.find((d) => d.key === 'sistema')).toMatchObject({ headAgentKey: SYSTEM_HEAD_KEY, botKey: SYSTEM_BOT, reportsTo: 'direccion' });
    const head = await getAgent(tenant, SYSTEM_HEAD_KEY);
    expect(head).toMatchObject({ kind: 'jefe', departmentKey: 'sistema' });
    expect(head!.tools).toContain('estado_sistema');

    const [t2] = await db.insert(tenants).values({ name: 'Prueba organigrama 2', slug: SLUG2 }).returning();
    await db.insert(agtAgents).values({ tenantId: t2.id, key: PRINCIPAL_KEY, name: 'Operations manager', kind: 'principal' });
    const agents = await listAgents(t2.id);
    expect(agents.find((a) => a.key === PRINCIPAL_KEY)?.departmentKey).toBe('gabinete');
  });

  it('sin bot de Sistema, un aviso técnico sale por el bot principal (nunca se pierde)', async () => {
    await healthNotice('org:1');
    const row = await waitStatus('org:1');
    expect(row.status).toBe('enviado');
    expect((row.payload as { bot?: string }).bot).toBe(SYSTEM_BOT);
    expect(sentBy(MAIN)).toHaveLength(1);
    expect(sentBy(SYS)).toHaveLength(0);
  });

  it('guardar el bot de Sistema: comprueba el token, pone su webhook con su secreto y saluda (queda listo)', async () => {
    await expect(saveDeptBot(tenant, 'sistema', MAIN)).rejects.toBeInstanceOf(DeptBotError);
    await expect(saveDeptBot(tenant, 'sistema', 'no-es-un-token')).rejects.toBeInstanceOf(DeptBotError);
    const r = await saveDeptBot(tenant, 'sistema', SYS);
    expect(r).toMatchObject({ botUsername: 'kiju_sistema_bot', ready: true });
    const hook = sentBy(SYS, 'setWebhook')[0].body;
    expect(hook.url).toBe(`https://brain.test/api/telegram/webhook?t=${tenant}&b=sistema`);
    expect(hook.secret_token).toBe(deptWebhookSecret(tenant, 'sistema'));
    expect(sentBy(SYS)[0].body.chat_id).toBe(OWNER_CHAT);
  });

  it('con el bot listo, los avisos técnicos salen por él; lo informativo, sin sonido', async () => {
    await healthNotice('org:2', { silent: true });
    const row = await waitStatus('org:2');
    expect(sentBy(SYS)).toHaveLength(1);
    expect(sentBy(SYS)[0].body).toMatchObject({ chat_id: OWNER_CHAT, disable_notification: true });
    expect(sentBy(MAIN)).toHaveLength(0);
    expect((row.payload as { sentVia?: string }).sentVia).toBe(SYSTEM_BOT);
    // Los avisos que no son técnicos siguen en el chat principal.
    await enqueueNotification({ tenantId: tenant, kind: 'digest', dedupeKey: 'org:3', forClickupUserId: '1', forName: 'Enric', payload: { text: 'Resumen', toOwner: true } });
    await waitStatus('org:3');
    expect(sentBy(MAIN)).toHaveLength(1);
  });

  it('el parte de Sistema va por su bot, sin sonido, con el estado de cada parte', async () => {
    await queueSystemDigest(tenant, 'sysdigest:test-org');
    const row = await waitStatus('sysdigest:test-org');
    expect(row.payload).toMatchObject({ bot: SYSTEM_BOT, silent: true });
    expect(String((row.payload as { text: string }).text)).toContain('Parte de Sistema');
    expect(sentBy(SYS)).toHaveLength(1);
    const tool = await estadoSistemaTool.run({ tenantId: tenant, agentKey: SYSTEM_HEAD_KEY, channel: 'telegram', conversationId: null, actor: { name: 'Enric', isOwner: true, clickupUserId: '1' } }, { secciones: ['pruebas', 'errores'] });
    expect(tool.ok).toBe(true);
    expect(tool.content).toContain('Pruebas simuladas');
    expect(tool.content).not.toContain('Gasto de IA');
  });

  it('webhook del bot de Sistema: secreto propio; solo atiende al dueño; «Iniciar» lo deja listo', async () => {
    const post = (secret: string, update: unknown) =>
      webhookPost(new Request(`https://brain.test/api/telegram/webhook?t=${tenant}&b=sistema`, { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': secret }, body: JSON.stringify(update) }));
    const msg = (chat: number, text: string) => ({ update_id: 1, message: { message_id: 1, chat: { id: chat, type: 'private' }, from: { id: chat }, text } });
    expect((await post('mal', msg(OWNER_CHAT, '/start'))).status).toBe(403);
    expect((await post(deptWebhookSecret(tenant, 'otro'), msg(OWNER_CHAT, '/start'))).status).toBe(403);

    await db.update(opsTelegramBots).set({ readyAt: null }).where(eq(opsTelegramBots.tenantId, tenant));
    expect((await post(deptWebhookSecret(tenant, 'sistema'), msg(OWNER_CHAT, '/start'))).status).toBe(200);
    const [b] = await db.select().from(opsTelegramBots).where(eq(opsTelegramBots.tenantId, tenant));
    expect(b.readyAt).not.toBeNull();
    expect(String(sentBy(SYS)[0].body.text)).toContain('jefe de Sistema');

    calls.length = 0;
    await post(deptWebhookSecret(tenant, 'sistema'), msg(555002, 'hola'));
    expect(String(sentBy(SYS)[0].body.text)).toContain('solo para la dirección');
  });

  it('sin «Iniciar», los avisos vuelven al bot principal', async () => {
    await db.update(opsTelegramBots).set({ readyAt: null }).where(eq(opsTelegramBots.tenantId, tenant));
    await healthNotice('org:4');
    await waitStatus('org:4');
    expect(sentBy(MAIN)).toHaveLength(1);
    expect(sentBy(SYS)).toHaveLength(0);
    await db.update(opsTelegramBots).set({ readyAt: new Date() }).where(eq(opsTelegramBots.tenantId, tenant));
  });

  it('un mensaje al bot de Sistema llega al núcleo marcado con su bot', async () => {
    const got: InboundMessage[] = [];
    setInboundHandler('agentes', async (m) => (got.push(m), true));
    await handleUpdate(tenant, SYS, { update_id: 2, message: { message_id: 2, chat: { id: OWNER_CHAT, type: 'private' }, text: '¿Cómo está el sistema?' } }, 'sistema');
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ bot: 'sistema', isOwner: true, text: '¿Cómo está el sistema?' });
    setInboundHandler('agentes', handleInbound);
  });

  it('el jefe de sistema contesta por su propio bot', async () => {
    h.systems.length = 0;
    await handleInbound({ tenantId: tenant, channel: 'telegram', peer: String(OWNER_CHAT), peerName: 'Enric', isOwner: true, clickupUserId: '1', text: '¿Cómo está el sistema?', bot: 'sistema' });
    await waitIdle();
    expect(h.systems.at(-1)).toContain('jefe del departamento de Sistema');
    expect(sentBy(SYS).some((c) => String(c.body.text).includes('Todo en orden.'))).toBe(true);
    expect(sentBy(MAIN)).toHaveLength(0);
  });

  it('lo que se registra durante una prueba simulada queda en la cuenta de pruebas, no en la real', async () => {
    registerConsoleTenantResolver(() => tenant);
    reportError({ source: 'pruebaorg', area: 'organigrama', message: 'fallo de prueba del organigrama' });
    registerConsoleTenantResolver(() => null);
    await flushErrors();
    const [g] = await db.select().from(sysErrorGroups).where(eq(sysErrorGroups.source, 'pruebaorg'));
    expect(g.tenantId).toBe(tenant);
    await db.delete(sysErrorGroups).where(eq(sysErrorGroups.source, 'pruebaorg'));
  });
});

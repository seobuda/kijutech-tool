// Encargos pedidos al agente por Telegram (19 nov 2026). Un audio pidiendo «que Jesús se forme en datos estructurados»
// fallaba: sin cliente, la IA solo veía las listas del primer espacio, dejaba la tarea sin lista (o la mandaba entera a
// «no convertido») y crear_encargo la descartaba en silencio. Ahora: sin cliente, la IA ve las listas de TODOS los
// espacios; el trabajo interno es un encargo (reglas en código); si falta la lista, pregunta con opciones y acepta
// «lista». La IA se simula; la base de datos es real (cuenta de prueba propia, se borra al terminar).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';

const h = vi.hoisted(() => ({ replies: [] as string[], calls: [] as { system: string; user: string }[] }));

vi.mock('@/lib/ai/gateway', async (orig) => {
  const m = await orig<typeof import('@/lib/ai/gateway')>();
  return {
    ...m,
    getPrompt: async () => ({ system_prompt: 'PROMPT DEL PANEL', user_prompt_template: 'Espacio: {espacio}\nListas:\n{listas}\nNota:\n{nota}' }),
    callAI: async (req: { messages: { role: string; content: string }[] }) => {
      h.calls.push({ system: req.messages[0].content, user: req.messages[1].content });
      return { content: h.replies.shift() ?? '{"encargos": [], "no_convertido": []}' };
    }
  };
});

import { db } from '@/lib/db/drizzle';
import { opsAgentActions, opsClickupConnections, opsClickupLists, opsClickupMembers, opsClickupSpaces, tenants } from '@/lib/db/schema';
import { OPS_AGENT_TOOLS, setToolAutonomy } from '@/lib/operaciones/agent-capabilities';
import { AGENCY_WORK_RULES } from '@/lib/operaciones/request-proposer';
import type { ToolContext } from '@/lib/core/capabilities';

const SLUG = 'seg-test-encargos-telegram';
let tenant = '';
const tool = OPS_AGENT_TOOLS.find((t) => t.name === 'crear_encargo')!;
const ctx = (): ToolContext => ({ tenantId: tenant, agentKey: 'principal', channel: 'telegram', conversationId: null, actor: { name: 'Enric', isOwner: true, clickupUserId: '1' } });
const item = (titulo: string, lista_id: string) =>
  ({ titulo, resultado_esperado: 'Hecho', pasos: ['a', 'b'], criterios_aceptacion: ['c', 'd'], datos_que_faltan: [], lista_id, responsable: 'Jesus M', fecha: '', prioridad: 3, cliente: '' });
const reply = (encargos: unknown[], no: string[] = []) => JSON.stringify({ encargos, no_convertido: no });
const PETICION = 'Que Jesús investigue y se forme hoy en datos estructurados, después de las optimizaciones de velocidad. Más adelante los aplicaremos en todas las webs.';

async function cleanup() {
  await db.delete(tenants).where(inArray(tenants.slug, [SLUG]));
}

describe('crear_encargo desde Telegram', () => {
  beforeAll(async () => {
    await cleanup();
    const [t] = await db.insert(tenants).values({ name: 'Prueba encargos Telegram', slug: SLUG }).returning();
    tenant = t.id;
    await db.insert(opsClickupConnections).values({ tenantId: tenant, apiKeyEncrypted: 'x', apiKeyIv: 'x', workspaceId: 'w', workspaceName: 'W', meClickupId: '1', meUsername: 'Enric', structureSyncedAt: new Date() });
    await db.insert(opsClickupSpaces).values([
      { tenantId: tenant, clickupSpaceId: 'S1', name: 'Clientes', selected: true },
      { tenantId: tenant, clickupSpaceId: 'S2', name: 'Kijutech', selected: true }
    ]);
    await db.insert(opsClickupLists).values([
      { tenantId: tenant, clickupListId: 'L1', clickupSpaceId: 'S1', name: 'Webs', folderName: 'RF Serveis' },
      { tenantId: tenant, clickupListId: 'L2', clickupSpaceId: 'S2', name: 'Formación', folderName: 'Interno' },
      { tenantId: tenant, clickupListId: 'L3', clickupSpaceId: 'S2', name: 'Procesos', folderName: 'Interno' }
    ]);
    await db.insert(opsClickupMembers).values([
      { tenantId: tenant, clickupUserId: '1', username: 'Enric' },
      { tenantId: tenant, clickupUserId: '2', username: 'Jesus M' }
    ]);
    // «Sombra»: la acción se anota con lo que se habría hecho, sin Telegram ni ClickUp.
    await setToolAutonomy(tenant, 'crear_encargo', 'sombra');
  });
  afterAll(cleanup);

  it('sin cliente, la IA ve las listas de todos los espacios y las reglas del trabajo interno', async () => {
    h.replies.push(reply([item('Investigar y formarse en datos estructurados', 'L2')], ['Más adelante, aplicarlos en todas las webs']));
    const r = await tool.run(ctx(), { texto: PETICION });
    expect(r.ok).toBe(true);
    const call = h.calls.at(-1)!;
    expect(call.system).toBe('PROMPT DEL PANEL' + AGENCY_WORK_RULES);
    expect(call.user).toContain('todos los espacios');
    expect(call.user).toContain('id: L1 | nombre: Clientes / RF Serveis / Webs');
    expect(call.user).toContain('id: L2 | nombre: Kijutech / Interno / Formación');
    const [a] = await db.select().from(opsAgentActions).where(and(eq(opsAgentActions.tenantId, tenant), eq(opsAgentActions.status, 'sombra')));
    const items = (a.proposal as { data: { items: { title: string; listId: string; assigneeName: string }[] } }).data.items;
    expect(items).toMatchObject([{ title: 'Investigar y formarse en datos estructurados', listId: 'L2', assigneeName: 'Jesus M' }]);
    expect(a.summary).toContain('Kijutech / Interno / Formación');
  });

  it('si un encargo se queda sin lista, no se pierde: pregunta cuál con opciones (las internas primero)', async () => {
    h.replies.push(reply([item('Investigar y formarse en datos estructurados', '')], ['Contexto: lo pedirán los clientes']));
    const r = await tool.run(ctx(), { texto: PETICION });
    expect(r.ok).toBe(false);
    expect(r.content).toContain('«Investigar y formarse en datos estructurados» para Jesus M');
    expect(r.content).toContain('no sé en qué lista');
    expect(r.content).toContain('Kijutech / Interno / Formación');
    expect(r.content).not.toContain('RF Serveis');
    expect(r.content).toContain('Contexto: lo pedirán los clientes');
  });

  it('con «lista» (lo que contestó Enric) lo crea en esa lista aunque la IA no eligiera ninguna', async () => {
    h.replies.push(reply([item('Investigar y formarse en datos estructurados', '')]));
    const r = await tool.run(ctx(), { texto: PETICION, lista: 'formacion' });
    expect(r.ok).toBe(true);
    const rows = await db.select().from(opsAgentActions).where(eq(opsAgentActions.tenantId, tenant));
    const last = rows.sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())[0];
    expect((last.proposal as { data: { items: { listId: string }[] } }).data.items[0].listId).toBe('L2');
    // Con la lista elegida, la IA solo ve las de su espacio.
    expect(h.calls.at(-1)!.user).not.toContain('RF Serveis');
  });

  it('una lista ambigua o inexistente se pregunta, sin llamar a la IA', async () => {
    const before = h.calls.length;
    const amb = await tool.run(ctx(), { texto: PETICION, lista: 'interno' });
    expect(amb.ok).toBe(false);
    expect(amb.content).toContain('varias listas');
    const none = await tool.run(ctx(), { texto: PETICION, lista: 'marketing' });
    expect(none.content).toContain('No encuentro la lista «marketing»');
    expect(h.calls.length).toBe(before);
  });

  it('si la IA no ve ninguna tarea, lo dice con lo no convertido y cómo pedirlo', async () => {
    h.replies.push(reply([], ['Idea a futuro: datos estructurados en todas las webs']));
    const r = await tool.run(ctx(), { texto: 'Algún día habría que mirar lo de los datos estructurados' });
    expect(r.ok).toBe(false);
    expect(r.content).toContain('No he visto ninguna tarea concreta');
    expect(r.content).toContain('Idea a futuro');
  });
});

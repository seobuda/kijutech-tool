import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanupFixtures, createFixtures, loginAs, type Fixtures } from './fixtures';
import { and, eq, like } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsAgentActions } from '@/lib/db/schema';
import { countByKind, decisionKey, filterEntries, getParaTi, getParaTiDecisions, KIND_ORDER, KINDS, type ParaTiEntry } from '@/lib/inicio/para-ti';
import { recordAction } from '@/lib/operaciones/agent-actions';
import { decideAgentTool } from '@/lib/operaciones/agent-capabilities';
import { GET as getParaTiCount } from '@/app/api/para-ti/route';

// Para ti (fase 2 UX): la bandeja única. Lo puro (filtros y recuentos) y que el contador de la barra sea solo de admin.
const e = (key: string, kind: ParaTiEntry['kind'], since: string, urgent = KINDS[kind].urgent): ParaTiEntry => ({
  key,
  kind,
  title: key,
  detail: null,
  clientName: null,
  since: new Date(since),
  urgent,
  href: null
});

describe('Para ti: tipos, filtros y recuentos', () => {
  const list = [e('b1', 'bloqueos', '2026-11-01'), e('s1', 'estratega', '2026-11-03'), e('s2', 'estratega', '2026-11-02'), e('x1', 'errores', '2026-11-10')];

  it('cada tipo pertenece a un departamento conocido', () => {
    for (const k of KIND_ORDER) expect(['operaciones', 'cuentas', 'sistema']).toContain(KINDS[k].dept);
  });

  it('filtra por departamento y por tipo', () => {
    expect(filterEntries(list, { dept: 'cuentas' }).map((x) => x.key)).toEqual(['s1', 's2']);
    expect(filterEntries(list, { dept: 'sistema' }).map((x) => x.key)).toEqual(['x1']);
    expect(filterEntries(list, { kind: 'bloqueos' }).map((x) => x.key)).toEqual(['b1']);
    expect(filterEntries(list, {})).toHaveLength(4);
  });

  it('cuenta por tipo con lo más antiguo y si hay algo urgente', () => {
    const c = Object.fromEntries(countByKind(list).map((x) => [x.kind, x]));
    expect(c.estratega.count).toBe(2);
    expect(c.estratega.oldest?.toISOString().slice(0, 10)).toBe('2026-11-02');
    expect(c.estratega.urgent).toBe(false);
    expect(c.bloqueos.urgent).toBe(true);
    expect(c.correos.count).toBe(0);
    expect(c.correos.oldest).toBeNull();
  });

  it('las decisiones del dueño (revisiones, bloqueos, correos y agente) están marcadas como tales', () => {
    expect(KIND_ORDER.filter((k) => KINDS[k].ownerOnly).sort()).toEqual(['agente', 'bloqueos', 'correos', 'revisiones']);
  });
});

describe('Para ti: el contador de la barra es solo de administración', () => {
  let fx: Fixtures;
  beforeAll(async () => {
    fx = await createFixtures();
  });
  afterAll(async () => {
    await loginAs(null);
    await cleanupFixtures();
  });

  it('sin sesión, lector o editor: 403 y sin datos', async () => {
    for (const u of [null, fx.users.lector, fx.users.editor]) {
      await loginAs(u);
      const res = await getParaTiCount();
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ count: 0, urgent: 0 });
    }
  });

  it('admin: recibe solo el recuento', async () => {
    await loginAs(fx.users.admin);
    const res = await getParaTiCount();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(['count', 'urgent']);
    expect(typeof body.count).toBe('number');
  });
});

// 23 nov 2026: Para ti deja decidir aquí mismo las propuestas de los agentes (igual que ✅ / ✖️ en Telegram).
describe('Para ti: decidir aquí mismo una propuesta de un agente', () => {
  let fx: Fixtures;
  const DEDUPE = 'seg-test-para-ti:agent_tool';
  const clean = () => db.delete(opsAgentActions).where(and(eq(opsAgentActions.tenantId, fx.kijutechTenantId), like(opsAgentActions.dedupeKey, `${DEDUPE}%`)));
  beforeAll(async () => {
    fx = await createFixtures();
    await clean();
  });
  afterAll(async () => {
    await clean();
    await cleanupFixtures();
  });

  it('sale en la lista y como decisión, y al descartarla desde la web desaparece y queda anotada como «panel»', async () => {
    const action = await recordAction({
      tenantId: fx.kijutechTenantId,
      kind: 'agent_tool',
      status: 'propuesto',
      autonomy: 'aprobacion',
      summary: 'Prueba: apuntar algo en la ficha',
      proposal: { tool: 'seg_test_herramienta', data: {}, agent: 'operaciones', requestedBy: 'Prueba' },
      dedupeKey: `${DEDUPE}:1`
    });
    expect(action).toBeTruthy();
    const id = action!.id;

    const before = await getParaTi(fx.kijutechTenantId);
    expect(before.entries.some((e) => e.key === decisionKey.tool(id) && e.kind === 'agente')).toBe(true);
    const d = await getParaTiDecisions(fx.kijutechTenantId, before.emails);
    const card = d.tools.find((t) => t.id === id);
    expect(card).toMatchObject({ key: decisionKey.tool(id), agent: 'operaciones', requestedBy: 'Prueba', summary: 'Prueba: apuntar algo en la ficha' });

    const r = await decideAgentTool(fx.kijutechTenantId, id, false, 'Prueba', 'panel');
    expect(r.line).toContain('Descartada');
    const [row] = await db.select().from(opsAgentActions).where(eq(opsAgentActions.id, id));
    expect(row.status).toBe('rechazado');
    expect(row.decidedVia).toBe('panel');

    // Ya decidida: ni sale en Para ti ni se puede decidir otra vez (p. ej. desde el botón de Telegram).
    const after = await getParaTiDecisions(fx.kijutechTenantId, []);
    expect(after.tools.some((t) => t.id === id)).toBe(false);
    expect((await decideAgentTool(fx.kijutechTenantId, id, true, 'Prueba', 'panel')).line).toBe('');
  });
});

// SEO · Jefe SEO D4: estrategia trimestral desde el plan de servicio aprobado (por código, 0 $) y su aprobación.
// Reglas puras y flujo con la base de datos real (cuenta de prueba propia, se borra al terminar). El contexto de
// elegibilidad y la creación del ciclo se simulan (tienen su propia batería en las pruebas de ciclos).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';

const h = vi.hoisted(() => ({ created: [] as { input: Record<string, unknown> }[], eligible: ['refuerzo_al_alcance', 'paginas_servicio_zona', 'local_ficha_resenas', 'datos_estructurados'] }));
vi.mock('@/lib/seo/estrategia/ciclos', async (orig) => {
  const m = await orig<typeof import('@/lib/seo/estrategia/ciclos')>();
  return {
    ...m,
    eligibilityContext: async () => ({ hasWeb: true, hasSearchConsole: true, servicesConfirmed: 2, zoneConfirmed: true, hasGoogleProfile: true, competitorsConfirmed: 3, topicsWithDemand: 5, strikingDistance: 4, decliningPages: 0, linkGapDomains: 0, schemaMissing: true, zonesWithoutPage: 2, services: ['reparación'], monthlyHours: 10 }),
    createCycle: async (_t: string, _p: string, input: Record<string, unknown>) => {
      h.created.push({ input });
      return '00000000-0000-4000-8000-000000000001';
    }
  };
});
vi.mock('@/lib/seo/estrategia/playbooks', async (orig) => {
  const m = await orig<typeof import('@/lib/seo/estrategia/playbooks')>();
  return { ...m, eligibility: () => ({ eligible: h.eligible, blocked: [] }) };
});

import { db } from '@/lib/db/drizzle';
import { clients, projects, seoCycles, seoJefeProposals, seoMasterPlanItems, seoMasterPlans, tenants, users } from '@/lib/db/schema';
import { deriveCycle, nextCycleStart, quarterAt, shouldProposeNext, type PlanItemLite } from '@/lib/seo/jefe/ciclo-rules';
import { decideCycleProposal, jefeCyclePass, listCycleProposals, proposeCycleFromPlan } from '@/lib/seo/jefe/ciclos';
import { expireStaleChanges } from '@/lib/seo/jefe/cambios';
import { PlanError } from '@/lib/seo/jefe/errors';
import type { PlaybookKey } from '@/lib/seo/estrategia/playbooks';

const item = (o: Partial<PlanItemLite> & { id: string }): PlanItemLite => ({ frenteKey: o.id, kind: 'existente', playbook: null, params: {}, title: o.id, fromQuarter: 1, toQuarter: 1, priority: 2, sort: 0, ...o });

describe('Jefe SEO D4: reglas puras', () => {
  it('trimestre del plan y lunes de inicio', () => {
    expect(quarterAt('2026-12-01', new Date('2026-12-15T00:00:00Z'))).toBe(1);
    expect(quarterAt('2026-12-01', new Date('2027-03-01T00:00:00Z'))).toBe(2);
    expect(quarterAt('2026-12-01', new Date('2027-02-28T00:00:00Z'))).toBe(1);
    expect(quarterAt('2026-12-01', new Date('2026-11-20T00:00:00Z'))).toBe(1);
    // Sin ciclo: este lunes si hoy es lunes; si no, el próximo. Con ciclo: el lunes tras su final.
    expect(nextCycleStart(new Date('2026-11-30T10:00:00Z'), null).toISOString().slice(0, 10)).toBe('2026-11-30');
    expect(nextCycleStart(new Date('2026-11-27T10:00:00Z'), null).toISOString().slice(0, 10)).toBe('2026-11-30');
    expect(nextCycleStart(new Date('2026-11-27T10:00:00Z'), '2027-02-28').toISOString().slice(0, 10)).toBe('2027-03-01');
  });
  it('se propone el siguiente 21 días antes del final', () => {
    expect(shouldProposeNext(new Date('2027-02-01T00:00:00Z'), '2027-02-28')).toBe(false);
    expect(shouldProposeNext(new Date('2027-02-08T00:00:00Z'), '2027-02-28')).toBe(true);
    expect(shouldProposeNext(new Date(), null)).toBe(true);
  });
  it('del trimestre: por prioridad, sin repetir línea, solo elegibles, que quepan en las horas; lo demás con motivo', () => {
    const items = [
      item({ id: 'puntual', kind: 'local', playbook: null, priority: 1, title: 'Reclamar la ficha' }),
      item({ id: 'refuerzo', playbook: 'refuerzo_al_alcance', params: { porMes: 3, condicionado: 'x' }, priority: 1, sort: 1 }),
      item({ id: 'zona', kind: 'servicio_zona', playbook: 'paginas_servicio_zona', params: { porMes: 2 }, priority: 2 }),
      item({ id: 'refuerzo2', playbook: 'refuerzo_al_alcance', priority: 2, sort: 2 }),
      item({ id: 'contenido', kind: 'contenido', playbook: 'contenido_cadencia', priority: 3 }),
      item({ id: 'futuro', playbook: 'datos_estructurados', fromQuarter: 2, toQuarter: 3 })
    ];
    const d = deriveCycle(items, 1, { eligible: ['refuerzo_al_alcance', 'paginas_servicio_zona'] as PlaybookKey[], monthlyHours: 10, reservePct: 30, services: [] });
    expect(d.lines.map((l) => l.masterItemId)).toEqual(['refuerzo']);
    expect(d.lines[0].params).not.toHaveProperty('condicionado');
    const why = Object.fromEntries(d.skipped.map((s) => [s.frente, s.reason]));
    expect(why.puntual).toMatch(/puntual/);
    expect(why.zona).toMatch(/horas/);
    expect(why.refuerzo2).toMatch(/Misma línea/);
    expect(why.contenido).toMatch(/no se puede hacer/);
    expect(why.futuro).toBeUndefined();
    expect(d.hours).toBeLessThanOrEqual(d.available ?? 0);
    // Con más horas, entra también la de zona.
    expect(deriveCycle(items, 1, { eligible: ['refuerzo_al_alcance', 'paginas_servicio_zona'] as PlaybookKey[], monthlyHours: 30, reservePct: 30, services: [] }).lines).toHaveLength(2);
  });
});

const SLUG = 'prueba-seo-jefe-d4';
const EMAIL = 'prueba-seo-jefe-d4@kijutech.invalid';
let T = '';
let P = '';
let PLAN = '';

async function cleanup() {
  const [t] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.slug, SLUG));
  if (t) {
    await db.delete(seoJefeProposals).where(eq(seoJefeProposals.tenantId, t.id));
    await db.delete(seoCycles).where(eq(seoCycles.tenantId, t.id));
    await db.delete(seoMasterPlans).where(eq(seoMasterPlans.tenantId, t.id));
    await db.delete(projects).where(eq(projects.tenantId, t.id));
    await db.delete(clients).where(eq(clients.tenantId, t.id));
    await db.delete(users).where(eq(users.tenantId, t.id));
    await db.delete(tenants).where(eq(tenants.id, t.id));
  }
}

describe('Jefe SEO D4: propuesta, aprobación y pasada diaria', () => {
  beforeAll(async () => {
    await cleanup();
    const [t] = await db.insert(tenants).values({ name: 'Prueba Jefe SEO D4', slug: SLUG }).returning();
    T = t.id;
    const [u] = await db.insert(users).values({ tenantId: T, name: 'Prueba', email: EMAIL, passwordHash: 'x' }).returning();
    const [c] = await db.insert(clients).values({ tenantId: T, name: 'Taller D4' }).returning();
    const [p] = await db.insert(projects).values({ tenantId: T, name: 'SEO D4', clientId: c.id, createdBy: u.id, service: 'seo', monthlyHours: '10' }).returning();
    P = p.id;
  });
  afterAll(cleanup);

  it('sin plan aprobado no se propone nada', async () => {
    await expect(proposeCycleFromPlan(T, P)).rejects.toBeInstanceOf(PlanError);
    expect(await jefeCyclePass(T)).toEqual({ propuestas: 0, creadas: 0 });
  });

  it('con plan aprobado, la pasada propone el trimestre una sola vez; aprobar crea la estrategia enlazada al plan', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const [plan] = await db.insert(seoMasterPlans).values({ tenantId: T, projectId: P, version: 1, startsOn: today, thesis: 'Plan de prueba', status: 'aprobado', horizonMonths: 12 }).returning();
    PLAN = plan.id;
    await db.insert(seoMasterPlanItems).values([
      { tenantId: T, planId: plan.id, projectId: P, frenteKey: 'existente:empujar', kind: 'existente', playbook: 'refuerzo_al_alcance', params: { porMes: 3 }, title: 'Empujar lo que está cerca', rationale: 'x', fromQuarter: 1, toQuarter: 2, priority: 1 },
      { tenantId: T, planId: plan.id, projectId: P, frenteKey: 'local:ficha', kind: 'local', playbook: null, params: {}, title: 'Reclamar la ficha', rationale: 'x', fromQuarter: 1, toQuarter: 1, priority: 1 }
    ]);
    expect(await jefeCyclePass(T)).toEqual({ propuestas: 1, creadas: 0 });
    expect(await jefeCyclePass(T)).toEqual({ propuestas: 0, creadas: 0 });
    const [prop] = await listCycleProposals(T, P);
    expect(prop.status).toBe('pendiente');
    expect(prop.payload.lines.map((l) => l.frente)).toEqual(['existente:empujar']);
    expect(prop.payload.skipped.map((s) => s.frente)).toEqual(['local:ficha']);
    expect(prop.payload.auto).toBe(true);
    await expect(decideCycleProposal(T, P, prop.id, false, 'Prueba', 'no')).rejects.toBeInstanceOf(PlanError);
    const r = await decideCycleProposal(T, P, prop.id, true, 'Prueba', null);
    expect(r.cycleId).toBe('00000000-0000-4000-8000-000000000001');
    expect(h.created.at(-1)?.input).toMatchObject({ masterPlanId: PLAN, lines: [{ playbook: 'refuerzo_al_alcance' }] });
    expect((h.created.at(-1)?.input.masterItemIds as string[]).length).toBe(1);
    const [after] = await listCycleProposals(T, P);
    expect(after).toMatchObject({ status: 'aprobada', payload: { pendingCreate: false, cycleId: '00000000-0000-4000-8000-000000000001' } });
  });

  it('con una estrategia activa: queda aprobada y la pasada la crea cuando esa se cierra', async () => {
    const [cyc] = await db
      .insert(seoCycles)
      .values({ tenantId: T, projectId: P, seq: 1, name: 'Activa', startsOn: '2026-11-02', endsOn: new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10), status: 'activo' })
      .returning();
    const { id } = await proposeCycleFromPlan(T, P);
    await expect(proposeCycleFromPlan(T, P)).rejects.toThrow(/esperando/);
    const n = h.created.length;
    expect((await decideCycleProposal(T, P, id, true, 'Prueba', null)).cycleId).toBeNull();
    expect(h.created.length).toBe(n);
    expect(await jefeCyclePass(T)).toEqual({ propuestas: 0, creadas: 0 });
    await db.update(seoCycles).set({ status: 'cerrado' }).where(eq(seoCycles.id, cyc.id));
    expect(await jefeCyclePass(T)).toEqual({ propuestas: 0, creadas: 1 });
    expect(h.created.length).toBe(n + 1);
  });

  it('una propuesta pendiente caduca al aprobarse otra versión del plan, y no se aprueba con otro plan vigente', async () => {
    const { id } = await proposeCycleFromPlan(T, P);
    await expireStaleChanges(db, P, 2);
    const [row] = await db.select({ status: seoJefeProposals.status }).from(seoJefeProposals).where(and(eq(seoJefeProposals.id, id)));
    expect(row.status).toBe('caducada');
    const { id: id2 } = await proposeCycleFromPlan(T, P);
    await db.update(seoMasterPlans).set({ status: 'sustituido' }).where(eq(seoMasterPlans.id, PLAN));
    await expect(decideCycleProposal(T, P, id2, true, 'Prueba', null)).rejects.toThrow(/ha cambiado/);
  });

  it('revisor: una aprobada en espera no se crea si mientras tanto se aprobó otro plan (caduca)', async () => {
    const [v2] = await db.insert(seoMasterPlans).values({ tenantId: T, projectId: P, version: 2, startsOn: new Date().toISOString().slice(0, 10), thesis: 'v2', status: 'aprobado', horizonMonths: 12 }).returning();
    await db.insert(seoJefeProposals).values({ tenantId: T, projectId: P, kind: 'ciclo', basePlanId: PLAN, baseVersion: 1, status: 'aprobada', payload: { quarter: 1, lines: [{ playbook: 'refuerzo_al_alcance', params: {}, masterItemId: PLAN, frente: 'x', title: 'x' }], skipped: [], hours: 1, available: 1, startsOn: '2026-11-30', months: 3, name: 'vieja', thesis: 'x', planVersion: 1, pendingCreate: true } });
    const n = h.created.length;
    await jefeCyclePass(T);
    expect(h.created.length).toBe(n);
    const rows = await db.select({ status: seoJefeProposals.status, payload: seoJefeProposals.payload }).from(seoJefeProposals).where(eq(seoJefeProposals.projectId, P));
    expect(rows.find((r) => (r.payload as { name?: string }).name === 'vieja')?.status).toBe('caducada');
    await db.delete(seoMasterPlans).where(eq(seoMasterPlans.id, v2.id));
  });
});

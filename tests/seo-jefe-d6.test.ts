// SEO · Jefe SEO D6: revisión del plan propuesta sin coste, autonomía graduada de las estrategias y etiquetas honestas.
// Reglas puras y la pasada con la base de datos real (cuenta de prueba propia; generar la versión nueva se simula).
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

const h = vi.hoisted(() => ({ requested: [] as number[] }));
vi.mock('@/lib/seo/jefe/plan', async (orig) => {
  const m = await orig<typeof import('@/lib/seo/jefe/plan')>();
  return { ...m, requestMasterPlan: async (_t: string, _p: string, _by: string, horizon: number) => (h.requested.push(horizon), { planId: 'x', version: 2 }) };
});

import { db } from '@/lib/db/drizzle';
import { clients, kbFeedItems, projects, seoCycles, seoJefeProposals, seoMasterPlans, tenants, users } from '@/lib/db/schema';
import { cycleAutonomy, honestRate, nextRevisionTrigger } from '@/lib/seo/jefe/revision-rules';
import { decideRevision, jefeRevisionPass, pendingRevision } from '@/lib/seo/jefe/revision';
import { accountCycleAutonomy, jefeMetrics } from '@/lib/seo/jefe/metricas';
import { PlanError } from '@/lib/seo/jefe/errors';

const D = (s: string) => new Date(`${s}T12:00:00Z`);

describe('Jefe SEO D6: reglas puras', () => {
  it('motivos para revisar: core update terminada, estrategia cerrada y madurez; sin repetir los tratados', () => {
    const base = { approvedAt: D('2026-09-01'), now: D('2026-11-01'), coreUpdatesEnded: [], cyclesClosed: [], handled: new Set<string>() };
    expect(nextRevisionTrigger({ ...base, now: D('2026-09-20') })).toBeNull();
    expect(nextRevisionTrigger({ ...base, now: D('2026-10-01') })?.key).toBe('dias:28');
    expect(nextRevisionTrigger(base)?.key).toBe('dias:28');
    expect(nextRevisionTrigger({ ...base, now: D('2026-12-05') })?.key).toBe('dias:90');
    const all = { ...base, coreUpdatesEnded: [{ id: 'c1', title: 'Core update', endsAt: D('2026-10-20') }, { id: 'c0', title: 'Vieja', endsAt: D('2026-08-01') }], cyclesClosed: [{ id: 'k1', name: 'T1', closedAt: D('2026-10-25') }] };
    expect(nextRevisionTrigger(all)?.key).toBe('core:c1');
    expect(nextRevisionTrigger({ ...all, handled: new Set(['core:c1']) })?.key).toBe('ciclo:k1');
    expect(nextRevisionTrigger({ ...all, handled: new Set(['core:c1', 'ciclo:k1', 'dias:28']) })).toBeNull();
  });
  it('autonomía: más del 70 % de al menos 10 decididas', () => {
    const st = (a: number, r: number) => [...Array(a).fill({ status: 'aprobada' }), ...Array(r).fill({ status: 'rechazada' })];
    expect(cycleAutonomy(st(9, 0))).toMatchObject({ enabled: false, missing: 1 });
    expect(cycleAutonomy(st(7, 3)).enabled).toBe(false);
    expect(cycleAutonomy(st(8, 2)).enabled).toBe(true);
  });
  it('proporciones honestas: con pocos casos lo dice', () => {
    expect(honestRate(0, 0)).toBe('sin casos');
    expect(honestRate(3, 4)).toMatch(/pocos casos/);
    expect(honestRate(8, 10)).toBe('80 % (8 de 10)');
  });
});

const SLUG = 'prueba-seo-jefe-d6';
const EMAIL = 'prueba-seo-jefe-d6@kijutech.invalid';
let T = '';
let P = '';
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

describe('Jefe SEO D6: pasada de revisión, decisión y métricas', () => {
  beforeAll(async () => {
    await cleanup();
    const [t] = await db.insert(tenants).values({ name: 'Prueba Jefe SEO D6', slug: SLUG }).returning();
    T = t.id;
    const [u] = await db.insert(users).values({ tenantId: T, name: 'Prueba', email: EMAIL, passwordHash: 'x' }).returning();
    const [c] = await db.insert(clients).values({ tenantId: T, name: 'Cliente D6' }).returning();
    const [p] = await db.insert(projects).values({ tenantId: T, name: 'SEO D6', clientId: c.id, createdBy: u.id, service: 'seo' }).returning();
    P = p.id;
  });
  afterAll(cleanup);

  it('propone revisar una sola vez por motivo; sin plan aprobado, nada', async () => {
    expect(await jefeRevisionPass(T)).toEqual({ propuestas: 0 });
    await db.insert(seoMasterPlans).values({ tenantId: T, projectId: P, version: 1, startsOn: '2026-08-01', thesis: 'Plan', status: 'aprobado', horizonMonths: 24, decidedAt: new Date(Date.now() - 40 * 86_400_000) });
    await db.insert(kbFeedItems).values({ tenantId: T, domain: 'seo', sourceKey: 'search_status', hash: 'core1', title: 'November core update', kind: 'core_update', startsAt: new Date(Date.now() - 20 * 86_400_000), endsAt: new Date(Date.now() - 5 * 86_400_000), publishedAt: new Date(Date.now() - 20 * 86_400_000) });
    expect(await jefeRevisionPass(T)).toEqual({ propuestas: 1 });
    expect(await jefeRevisionPass(T)).toEqual({ propuestas: 0 });
    const r = await pendingRevision(T, P);
    expect(r?.payload.trigger).toMatch(/^core:/);
  });

  it('«No hace falta» exige motivo y la pasada sigue con el siguiente motivo; «Generar» pide la versión con el horizonte del plan', async () => {
    const r = (await pendingRevision(T, P))!;
    await expect(decideRevision(T, P, r.id, false, 'Prueba', 'no')).rejects.toBeInstanceOf(PlanError);
    await decideRevision(T, P, r.id, false, 'Prueba', 'La core update no tocó a este cliente.');
    expect(await jefeRevisionPass(T)).toEqual({ propuestas: 1 });
    const r2 = (await pendingRevision(T, P))!;
    expect(r2.payload.trigger).toBe('dias:28');
    expect(await decideRevision(T, P, r2.id, true, 'Prueba', null)).toEqual({ version: 2 });
    expect(h.requested).toEqual([24]);
    expect(await pendingRevision(T, P)).toBeNull();
  });

  it('métricas y autonomía con pocos casos', async () => {
    const m = await jefeMetrics(T);
    expect(m.plans.generated).toBe(1);
    expect(m.revisions).toEqual({ proposed: 2, generated: 1 });
    expect((await accountCycleAutonomy(T)).enabled).toBe(false);
  });
});

// SEO · Plan de mejora A+B (26 nov 2026): reparto por meses, el porqué de cada propuesta, el esfuerzo en la prioridad y,
// contra la base de datos (cuenta de pruebas propia, fuente de trabajo simulada): aprobar con lo elegido en la vista
// previa (sin IA), quitar páginas, aprobar lo de este mes y descartar con motivo (el cliente no lo quiere → memoria).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clientMemory, clients, findings, projects, seoPlanItems, tenants, users } from '@/lib/db/schema';
import { registerWorkSource, workSource, type NewTaskInput, type WorkSource } from '@/lib/core/capabilities';
import { buildPlan, scheduleMonths, whyLine } from '@/lib/seo/plan/rules';
import { approvePlanItem, approveThisMonth, discardPlanItem, planSchedule, regeneratePlan } from '@/lib/seo/plan/plan';
import { registerSaludAudit, SALUD_SOURCE } from '@/lib/seo/salud/audit';

describe('Plan: reparto por meses', () => {
  const it3 = (id: string, h: number, severity: string | null = null) => ({ id, estHours: h, priority: 2, severity });
  it('llena el mes con las horas que quedan y pasa el resto al siguiente, en orden', () => {
    const m = scheduleMonths([it3('a', 8), it3('b', 8), it3('c', 8), it3('d', 2)], 20, 4);
    expect(Object.fromEntries(m)).toEqual({ a: 0, b: 0, c: 1, d: 1 }); // 4 usadas + 8 + 8 = 20; c no cabe; d tampoco (0 h libres)
  });
  it('lo crítico va siempre este mes; lo que no cabe en un mes entero ocupa su propio mes', () => {
    const m = scheduleMonths([it3('grave', 30, 'critico'), it3('enorme', 40), it3('normal', 5)], 20, 0);
    expect(m.get('grave')).toBe(0);
    expect(m.get('enorme')).toBe(1);
    expect(m.get('normal')).toBe(2);
  });
  it('sin horas en el proyecto, todo es este mes', () => {
    expect([...scheduleMonths([it3('a', 50), it3('b', 50)], null, 0).values()]).toEqual([0, 0]);
  });
});

describe('Plan: prioridad con esfuerzo y porqué', () => {
  it('a igual impacto, antes lo que cuesta menos', () => {
    const plan = buildPlan(
      [
        { id: 'n', kind: 'seo.topic_new_page', severity: 'aviso', url: null, query: 'tema caro', impressions: 3000, gain: 40 },
        { id: 't', kind: 'seo.low_ctr', severity: 'aviso', url: 'https://w.es/t', query: 'tema barato', impressions: 3000, gain: 40 }
      ],
      new Map(),
      null
    );
    expect(plan[0].technique).toBe('titulo_reescrito');
    expect(plan[0].evidence.gainPerMonth).toBe(40);
  });
  it('el porqué dice impacto, clics posibles por hora, valor y horas', () => {
    expect(whyLine({ severity: 'importante', impressions: 4000, gainPerMonth: 120, valor: 3 }, 1.5)).toBe(
      'es importante · 4000 impresiones en 90 días · ≈ +120 clics/mes posibles (80 por hora de trabajo) · toca un servicio prioritario del cliente · 1,5 h'
    );
  });
});

// --- Base de datos ----------------------------------------------------------------------------------------------------

const SLUG = 'seg-test-plan-ab';
let T = '';
let PROJECT = '';
let CLIENT = '';
const calls: NewTaskInput[] = [];
let previous: WorkSource | null = null;

async function cleanup() {
  const [t] = await db.select().from(tenants).where(eq(tenants.slug, SLUG));
  if (!t) return;
  await db.delete(projects).where(eq(projects.tenantId, t.id));
  await db.delete(clients).where(eq(clients.tenantId, t.id));
  await db.delete(users).where(eq(users.tenantId, t.id));
  await db.delete(tenants).where(eq(tenants.id, t.id));
}

describe('Plan: aprobar con vista previa, este mes y descartar con motivo (base de datos)', () => {
  beforeAll(async () => {
    await cleanup();
    registerSaludAudit();
    const [t] = await db.insert(tenants).values({ name: 'Pruebas plan', slug: SLUG }).returning();
    T = t.id;
    const [u] = await db.insert(users).values({ tenantId: T, name: 'Prueba', email: `${SLUG}@kijutech.test`, passwordHash: 'x' }).returning();
    const [c] = await db.insert(clients).values({ tenantId: T, name: 'Cliente Plan' }).returning();
    CLIENT = c.id;
    const [p] = await db.insert(projects).values({ tenantId: T, name: 'Plan prueba', clientId: c.id, createdBy: u.id, monthlyHours: '1' }).returning();
    PROJECT = p.id;
    previous = workSource();
    registerWorkSource({
      ...(previous ?? ({} as WorkSource)),
      createTask: async (_t, input) => {
        calls.push(input);
        return { ok: true, ref: crypto.randomUUID(), url: 'https://tareas.test/x', message: 'Encargo creado.' };
      },
      taskOptions: async () => ({ lists: [{ id: 'L1', name: 'SEO' }], members: [{ id: 'M1', name: 'Mayi' }], defaults: { listId: 'L1', assigneeId: 'M1', dueDays: 5 } }),
      requestStatus: async (_t, refs) => refs.map((r) => ({ ref: r, doneAt: null, cancelled: false, status: 'en_curso', assigneeName: 'Mayi', dueDate: '2026-12-01' }))
    } as WorkSource);
    const f = (kind: string, url: string | null, severity = 'aviso') => ({ tenantId: T, projectId: PROJECT, kind, severity, url, source: SALUD_SOURCE, dedupeKey: `${kind}:${url}` });
    await db.insert(findings).values([
      f('seo.title_missing', 'https://w.es/a'),
      f('seo.title_missing', 'https://w.es/b'),
      f('seo.title_missing', 'https://w.es/c'),
      f('seo.meta_description_missing', 'https://w.es/a'),
      f('seo.schema_faq', 'https://w.es/faq')
    ]);
    await regeneratePlan(T, PROJECT);
  });
  afterAll(async () => {
    if (previous) registerWorkSource(previous);
    await cleanup();
  });

  it('reparto por meses con las horas del proyecto y las opciones del encargo, sin llamar a ClickUp', async () => {
    const s = await planSchedule(T, PROJECT);
    expect(s.monthlyHours).toBe(1);
    expect(s.items.length).toBe(3);
    expect(s.items.some((i) => i.month > 0)).toBe(true); // 3 h al mes no dan para todo
    expect(s.defaults).toEqual({ listId: 'L1', assigneeId: 'M1', dueDays: 5 });
  });

  it('aprobar con lo elegido: va a la fuente tal cual, y las páginas quitadas vuelven al plan', async () => {
    const titles = (await db.select().from(seoPlanItems).where(and(eq(seoPlanItems.projectId, PROJECT), eq(seoPlanItems.technique, 'titulo_reescrito'))))[0];
    expect(titles.urls).toHaveLength(3);
    const r = await approvePlanItem(T, PROJECT, titles.id, 'Prueba', { title: 'Títulos de la home y servicios', estHours: 1, urls: ['https://w.es/a', 'https://w.es/b'], listId: 'L1', assigneeId: 'M1', dueDate: '2026-12-05', note: 'ojo' });
    expect(r.ok).toBe(true);
    const call = calls.at(-1)!;
    expect(call).toMatchObject({ title: 'Títulos de la home y servicios', listId: 'L1', assigneeId: 'M1', dueDate: '2026-12-05', priority: 4 }); // propuesta de prioridad baja → encargo de prioridad baja
    expect(call.origin).toMatch(/Plan de mejora SEO/);
    expect(call.description).not.toContain('https://w.es/c');
    expect(call.description).toContain('**Nota de Prueba:** ojo');
    const [after] = await db.select().from(seoPlanItems).where(eq(seoPlanItems.id, titles.id));
    expect(after.urls).toEqual(['https://w.es/a', 'https://w.es/b']);
    expect(after.findingIds).toHaveLength(2);
    expect(Number(after.estHours)).toBe(1);
    // La página quitada (c) vuelve en una propuesta nueva.
    const again = await db.select().from(seoPlanItems).where(and(eq(seoPlanItems.projectId, PROJECT), eq(seoPlanItems.technique, 'titulo_reescrito'), eq(seoPlanItems.status, 'pendiente')));
    expect(again.map((i) => i.urls)).toEqual([['https://w.es/c']]);
    // Estado real del encargo.
    const s = await planSchedule(T, PROJECT);
    expect(s.status[after.requestRef!]).toMatchObject({ status: 'en_curso', assigneeName: 'Mayi' });
    expect(s.usedThisMonth).toBe(1);
  });

  it('descartar porque el cliente no lo quiere lo guarda en su memoria', async () => {
    const faq = (await db.select().from(seoPlanItems).where(and(eq(seoPlanItems.projectId, PROJECT), eq(seoPlanItems.technique, 'schema_limpieza'))))[0];
    expect(await discardPlanItem(T, PROJECT, faq.id, 'Prueba', 'quiere las FAQ', 'cliente_no')).toBe(true);
    const [d] = await db.select().from(seoPlanItems).where(eq(seoPlanItems.id, faq.id));
    expect(d.rejectNote).toBe('El cliente no lo quiere: quiere las FAQ');
    const mem = await db.select().from(clientMemory).where(eq(clientMemory.clientId, CLIENT));
    expect(mem.map((m) => [m.kind, m.status])).toEqual([['restriccion', 'aceptado']]);
    expect(mem[0].text).toMatch(/^No quiere: .*\(quiere las FAQ\)$/);
  });

  it('aprobar lo de este mes crea solo lo que cabe, con las opciones por defecto', async () => {
    const before = calls.length;
    const s = await planSchedule(T, PROJECT);
    const fits = s.items.filter((i) => i.month === 0).length;
    const r = await approveThisMonth(T, PROJECT, 'Prueba');
    expect(r.approved).toBe(fits);
    expect(calls.length - before).toBe(fits);
    for (const c of calls.slice(before)) expect(c).toMatchObject({ listId: 'L1', assigneeId: 'M1' });
  });
});

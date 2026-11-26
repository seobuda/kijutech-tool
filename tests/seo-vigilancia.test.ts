// SEO parte 0 · Vigilancia continua (26 nov 2026; docs/DISENO-SEO-PARTE0.md): reglas puras de la vigilancia, la velocidad
// y las páginas en caída; y, contra la base de datos, que el alta de procesos no pisa la frecuencia ni la pausa que
// alguien cambió (el fallo G1 de la auditoría), y el gasto de datos con su tope.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { jobSchedules, projects, seoDataSpend, tenants, users } from '@/lib/db/schema';
import { ensureSchedule, ensureScheduleIfMissing, pauseSchedule, setScheduleEvery, stableOffsetMinutes } from '@/lib/core/jobs';
import {
  everyLabel,
  pageDropFindings,
  robotsBlocksAll,
  shouldAlert,
  velocidadFindings,
  vigilanciaFindings,
  yoyAvailable
} from '@/lib/seo/vigilancia/rules';
import { VIGILANCIA_KINDS, SEO_KINDS } from '@/lib/seo/salud/kinds';
import { KIND_TECHNIQUE } from '@/lib/seo/plan/rules';
import { cwvCategory } from '@/lib/agentes/integrations';
import { canSpend, dataSpentThisMonth, recordDataSpend } from '@/lib/seo/gasto';

describe('vigilancia: reglas puras', () => {
  it('robots.txt que bloquea toda la web, y no lo confunde con un bloqueo parcial', () => {
    expect(robotsBlocksAll('User-agent: *\nDisallow: /')).toBe(true);
    expect(robotsBlocksAll('User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php')).toBe(false);
    expect(robotsBlocksAll('User-agent: Googlebot\nDisallow: /\nAllow: /blog/')).toBe(false);
    expect(robotsBlocksAll('User-agent: *\nDisallow:')).toBe(false);
  });

  it('portada caída, con error, con noindex; SSL caducado es crítico y a punto de caducar importante', () => {
    const home = 'https://web.com/';
    expect(vigilanciaFindings(home, { error: 'no responde' }, null, null).map((f) => f.kind)).toEqual(['seo.site_down']);
    expect(vigilanciaFindings(home, { status: 503, finalUrl: home, noindex: false }, null, null).map((f) => f.kind)).toEqual(['seo.site_down']);
    expect(vigilanciaFindings(home, { status: 404, finalUrl: home, noindex: false }, null, null).map((f) => f.kind)).toEqual(['seo.home_error']);
    expect(vigilanciaFindings(home, { status: 200, finalUrl: home, noindex: true }, 'User-agent: *\nDisallow: /', 5).map((f) => f.kind)).toEqual(['seo.home_noindex', 'seo.robots_block_all', 'seo.ssl_expiring']);
    expect(vigilanciaFindings(home, { status: 200, finalUrl: home, noindex: false }, null, -2)[0].severity).toBe('critico');
    expect(vigilanciaFindings(home, { status: 200, finalUrl: home, noindex: false }, null, 30)).toEqual([]);
  });

  it('solo avisa en la pasada de confirmación y si sigue habiendo algo crítico', () => {
    const f = [{ kind: 'seo.site_down', dedupeKey: 'x' }];
    const sev = () => 'critico';
    expect(shouldAlert(false, f, sev)).toBe(false);
    expect(shouldAlert(true, f, sev)).toBe(true);
    expect(shouldAlert(true, [], sev)).toBe(false);
  });

  it('Core Web Vitals: categoría con los umbrales de Google y un solo hallazgo por origen', () => {
    expect(cwvCategory(2000, 150, 0.05)).toBe('FAST');
    expect(cwvCategory(3000, 150, 0.05)).toBe('AVERAGE');
    expect(cwvCategory(2000, 600, 0.05)).toBe('SLOW');
    expect(cwvCategory(null, null, null)).toBeNull();
    const f = velocidadFindings([
      { url: 'https://web.com/', lcpMs: 5000, inpMs: 100, cls: 0, category: 'SLOW', scope: 'origin' },
      { url: 'https://web.com/a', lcpMs: 5000, inpMs: 100, cls: 0, category: 'SLOW', scope: 'origin' },
      { url: 'https://web.com/b', lcpMs: 3000, inpMs: 100, cls: 0, category: 'AVERAGE', scope: 'url' },
      { url: 'https://web.com/c', lcpMs: 1000, inpMs: 100, cls: 0, category: 'FAST', scope: 'url' }
    ]);
    expect(f.map((x) => `${x.kind}:${x.url}`)).toEqual(['seo.cwv_slow:https://web.com', 'seo.cwv_average:https://web.com/b']);
  });

  it('páginas en caída: umbral de clics, temporada solo si hay año anterior', () => {
    const prev = new Map([
      ['/a', 100],
      ['/b', 100],
      ['/c', 10],
      ['/d', 100]
    ]);
    const cur = new Map([
      ['/a', 40],
      ['/b', 90],
      ['/c', 0],
      ['/d', 60]
    ]);
    const sinAnual = pageDropFindings(cur, prev, null);
    expect(sinAnual.map((f) => f.url)).toEqual(['/a', '/d']);
    expect(sinAnual[0].severity).toBe('importante');
    expect(sinAnual[0].evidence?.yoyKnown).toBe(false);
    const conAnual = pageDropFindings(cur, prev, { cur: new Map([['/a', 50]]), prev: new Map([['/a', 100]]) });
    expect(conAnual.find((f) => f.url === '/a')?.severity).toBe('info');
    expect(yoyAvailable('2025-01-01', '2025-06-01')).toBe(true);
    expect(yoyAvailable(null, '2025-06-01')).toBe(false);
    expect(yoyAvailable('2025-09-01', '2025-06-01')).toBe(false);
  });

  it('cada tipo nuevo está registrado y lleva técnica para el plan', () => {
    const all = new Set(SEO_KINDS.map((k) => k.kind));
    for (const k of VIGILANCIA_KINDS) expect(all.has(k.kind)).toBe(true);
    for (const k of VIGILANCIA_KINDS) expect(KIND_TECHNIQUE[k.kind]).toBeTruthy();
  });

  it('frecuencias legibles y desfase estable dentro de la frecuencia', () => {
    expect(everyLabel(60)).toBe('cada 1 h');
    expect(everyLabel(1440)).toBe('cada día');
    expect(everyLabel(43200)).toBe('cada 30 días');
    const o = stableOffsetMinutes('seo.auditoria:abc', 1440);
    expect(o).toBe(stableOffsetMinutes('seo.auditoria:abc', 1440));
    expect(o).toBeGreaterThanOrEqual(0);
    expect(o).toBeLessThan(1440);
  });
});

describe('vigilancia: programación y gasto (base de datos)', () => {
  let tenantId = '';
  let projectId = '';
  beforeAll(async () => {
    const [t] = await db.insert(tenants).values({ name: `Pruebas vigilancia ${Date.now()}`, slug: `pruebas-vigilancia-${Date.now()}` }).returning({ id: tenants.id });
    tenantId = t.id;
    const [u] = await db.select({ id: users.id }).from(users).limit(1);
    const [p] = await db.insert(projects).values({ tenantId, name: 'Proyecto vigilancia', createdBy: u.id, legacy: true }).returning({ id: projects.id });
    projectId = p.id;
  });
  afterAll(async () => {
    await db.delete(jobSchedules).where(eq(jobSchedules.tenantId, tenantId));
    await db.delete(seoDataSpend).where(eq(seoDataSpend.tenantId, tenantId));
    await db.delete(projects).where(eq(projects.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  });

  const row = async (key: string) => (await db.select().from(jobSchedules).where(and(eq(jobSchedules.tenantId, tenantId), eq(jobSchedules.processKey, key), eq(jobSchedules.scopeId, projectId))))[0];

  it('el alta no pisa la frecuencia ni la pausa elegidas (G1), y ensureSchedule sí lo hacía', async () => {
    expect(await ensureScheduleIfMissing(tenantId, 'seo.vigilancia', projectId, 60)).toBe(true);
    expect(await setScheduleEvery(tenantId, 'seo.vigilancia', projectId, 360)).toBe(true);
    const until = new Date(Date.now() + 5 * 86_400_000);
    expect(await pauseSchedule(tenantId, 'seo.vigilancia', projectId, { pausedUntil: until })).toBe(true);
    expect(await ensureScheduleIfMissing(tenantId, 'seo.vigilancia', projectId, 60)).toBe(false);
    const r = await row('seo.vigilancia');
    expect(r.everyMinutes).toBe(360);
    expect(r.pausedUntil?.getTime()).toBe(until.getTime());
    await ensureSchedule(tenantId, 'seo.vigilancia', projectId, 60);
    expect((await row('seo.vigilancia')).everyMinutes).toBe(60);
  });

  it('gasto de datos: suma del mes y tope', async () => {
    expect(await dataSpentThisMonth(projectId)).toBe(0);
    await recordDataSpend(tenantId, projectId, 'serp', 'prueba', 1.25);
    await recordDataSpend(tenantId, projectId, 'serp', 'prueba', 0); // sin coste: no se apunta
    expect(await dataSpentThisMonth(projectId)).toBeCloseTo(1.25, 4);
    const ok = await canSpend(projectId, 1);
    expect(ok.ok).toBe(ok.budget >= 2.25);
    const no = await canSpend(projectId, 1000);
    expect(no.ok).toBe(false);
  });
});

// SEO · Palabras A+B contra la base de datos (26 nov 2026), en una cuenta de pruebas propia con Search Console simulado:
// mapa → temas con estado y valor de negocio → oportunidades como hallazgos → propuestas del plan. Sin embeddings (pocas
// búsquedas sin página: no se llama a ningún proveedor).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { createHash } from 'crypto';
import { db } from '@/lib/db/drizzle';
import { clientAssets, clientMemory, clients, findings, gscPages, gscProperties, gscQueries, projectAssets, projects, seoPlanItems, seoTopics, tenants, users } from '@/lib/db/schema';
import { ensureGscPartition } from '@/lib/core/gsc';
import { buildKeywordMap } from '@/lib/seo/mapa/mapa';
import { regeneratePlan } from '@/lib/seo/plan/plan';
import { registerSaludAudit } from '@/lib/seo/salud/audit';

const SLUG = 'seg-test-palabras';
const DAY = '2026-11-20';
const SITE = 'https://cm-prueba.es';
let T = '';
let PROJECT = '';
let PROP = 0;

const h = (s: string) => createHash('sha1').update(s).digest('hex').slice(0, 40);

async function cleanup() {
  const [t] = await db.select().from(tenants).where(eq(tenants.slug, SLUG));
  if (!t) return;
  const props = (await db.select({ id: gscProperties.id }).from(gscProperties).where(eq(gscProperties.tenantId, t.id))).map((p) => p.id);
  if (props.length) await db.execute(sql`DELETE FROM gsc_daily WHERE property_id IN ${props}`);
  await db.delete(projects).where(eq(projects.tenantId, t.id));
  await db.delete(clients).where(eq(clients.tenantId, t.id));
  await db.delete(users).where(eq(users.tenantId, t.id));
  await db.delete(tenants).where(eq(tenants.id, t.id));
}

// consulta, página, impresiones, posición, clics
const DATA: [string, string, number, number, number][] = [
  ['cm iberica', '/', 300, 1, 100],
  ['reforma nave industrial', '/naves', 2000, 9, 10],
  ['reforma nave industrial', '/', 2000, 18, 5],
  ['reformas de oficinas', '/oficinas', 900, 7, 20],
  ['rehabilitacion fachadas', '/fachadas', 1200, 4, 2],
  ['piscinas prefabricadas', '/fachadas', 400, 35, 0]
];

describe('Palabras: mapa → oportunidades → plan (base de datos)', () => {
  beforeAll(async () => {
    await cleanup();
    registerSaludAudit();
    const [t] = await db.insert(tenants).values({ name: 'Pruebas palabras', slug: SLUG }).returning();
    T = t.id;
    const [u] = await db.insert(users).values({ tenantId: T, name: 'Prueba', email: `${SLUG}@kijutech.test`, passwordHash: 'x' }).returning();
    const [c] = await db.insert(clients).values({ tenantId: T, name: 'CM Ibérica', offerings: 'Naves industriales, Oficinas' }).returning();
    // Lo que el cliente dijo que no quiere (respuesta a las Preguntas, guardada en su memoria).
    await db.insert(clientMemory).values({ tenantId: T, clientId: c.id, kind: 'restriccion', text: '¿Qué tipo de trabajo NO queréis atraer? → Piscinas, no las hacemos', status: 'aceptado' });
    const [asset] = await db.insert(clientAssets).values({ tenantId: T, clientId: c.id, kind: 'web', value: SITE }).returning();
    const [p] = await db.insert(projects).values({ tenantId: T, name: 'SEO prueba', clientId: c.id, createdBy: u.id }).returning();
    PROJECT = p.id;
    await db.insert(projectAssets).values({ projectId: PROJECT, clientAssetId: asset.id });
    const [prop] = await db.insert(gscProperties).values({ tenantId: T, siteUrl: 'sc-domain:cm-prueba.es', kind: 'dominio', clientAssetId: asset.id }).returning();
    PROP = prop.id;
    await ensureGscPartition(DAY);
    const qs = [...new Set(DATA.map((d) => d[0]))];
    const ps = [...new Set(DATA.map((d) => SITE + d[1]))];
    await db.insert(gscQueries).values(qs.map((q) => ({ propertyId: PROP, query: q, queryHash: h(q), firstSeen: DAY })));
    await db.insert(gscPages).values(ps.map((u2) => ({ propertyId: PROP, url: u2, urlHash: h(u2), firstSeen: DAY })));
    const qid = new Map((await db.select().from(gscQueries).where(eq(gscQueries.propertyId, PROP))).map((r) => [r.query, r.id]));
    const pid = new Map((await db.select().from(gscPages).where(eq(gscPages.propertyId, PROP))).map((r) => [r.url, r.id]));
    for (const [q, page, impr, pos, clicks] of DATA) {
      await db.execute(sql`INSERT INTO gsc_daily (property_id, date, search_type, device, query_id, page_id, clicks, impressions, pos_sum) VALUES (${PROP}, ${DAY}, 1, 1, ${qid.get(q)!}, ${pid.get(SITE + page)!}, ${clicks}, ${impr}, ${pos * impr})`);
    }
  });
  afterAll(cleanup);

  it('temas: la marca va a la portada, la nave es «sin página clara» con valor de servicio, la piscina avisa', async () => {
    const r = await buildKeywordMap(T, PROJECT);
    expect(r.grouping).toBe('palabras'); // pocas búsquedas sin página: se agrupan por palabras, sin llamar a ningún proveedor
    expect(r.hasValueData).toBe(true);
    expect(r.unclearTopics).toBe(1);
    const topics = await db.select().from(seoTopics).where(eq(seoTopics.projectId, PROJECT));
    const m = (name: string) => topics.find((t) => t.name === name)!.metrics as Record<string, unknown>;
    expect(topics.find((t) => t.name === 'cm iberica')!.url).toBe(`${SITE}/`);
    expect(m('cm iberica').esMarca).toBe(1);
    expect(m('reforma nave industrial')).toMatchObject({ candidata: `${SITE}/naves`, valor: 3, servicio: 'Naves industriales' });
    expect(m('reformas de oficinas')).toMatchObject({ valor: 2.5, servicio: 'Oficinas' });
    expect(m('piscinas prefabricadas')).toMatchObject({ valor: 0.5 });
    expect(String(m('piscinas prefabricadas').aviso)).toMatch(/Piscinas, no las hacemos/);
  });

  it('oportunidades como hallazgos: nunca de la marca ni de lo que no quiere', async () => {
    const f = await db.select().from(findings).where(and(eq(findings.projectId, PROJECT), eq(findings.status, 'abierto')));
    const kinds = f.map((x) => `${x.kind}|${x.query}`).sort();
    expect(kinds).toEqual(
      [
        'seo.low_ctr|rehabilitacion fachadas',
        'seo.striking_distance|reformas de oficinas',
        'seo.striking_distance|rehabilitacion fachadas',
        'seo.topic_unclear_page|reforma nave industrial'
      ].sort()
    );
    const nave = f.find((x) => x.kind === 'seo.topic_unclear_page')!;
    expect(nave.severity).toBe('importante'); // 4.000 impresiones
    expect(nave.url).toBe(`${SITE}/naves`);
    expect((nave.evidence as Record<string, unknown>).valor).toBe(3);
  });

  it('el plan las convierte en propuestas; la nave (servicio prioritario y muchas impresiones) va primero', async () => {
    await regeneratePlan(T, PROJECT);
    const items = await db.select().from(seoPlanItems).where(and(eq(seoPlanItems.projectId, PROJECT), eq(seoPlanItems.status, 'pendiente')));
    expect(items.map((i) => i.technique).sort()).toEqual(['optimizar_al_alcance', 'reforzar_pagina_tema', 'titulo_reescrito']);
    const sorted = [...items].sort((a, b) => a.priority - b.priority || Number(b.score) - Number(a.score));
    expect(sorted[0].technique).toBe('reforzar_pagina_tema');
    expect(sorted[0].description).toContain('reforma nave industrial (4000 impresiones en 90 días)');
  });

  it('descartar un tema por una persona quita su oportunidad al rehacer el mapa', async () => {
    await db.update(seoTopics).set({ status: 'descartado' }).where(and(eq(seoTopics.projectId, PROJECT), eq(seoTopics.name, 'reforma nave industrial')));
    await buildKeywordMap(T, PROJECT);
    const open = await db.select().from(findings).where(and(eq(findings.projectId, PROJECT), eq(findings.status, 'abierto'), inArray(findings.kind, ['seo.topic_unclear_page'])));
    expect(open).toEqual([]);
  });
});

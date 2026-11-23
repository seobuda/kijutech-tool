// Hito 1 SEO (23 nov 2026, migración 0061): taxonomía de técnicas, expediente (reglas puras), plan de mejora por reglas,
// lectura de las fuentes de I+D y, contra la base en una cuenta de pruebas propia, la cadena hallazgos → plan → encargo
// (fuente de trabajo simulada) → intervención registrada → «hecha» → propuesta hecha; y la bitácora sin repetir.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clients, findings, interventions, jobs, kbArticles, kbFeedItems, projects, seoDossierFacts, seoPlanItems, tenants, users } from '@/lib/db/schema';
import { normalizeTechnique, TECHNIQUES, TECHNIQUE_BY_KEY, techniqueFromCategory } from '@/lib/core/techniques';
import { BUSINESS_TYPES, isBusinessType } from '@/lib/core/business-types';
import { completeHypothesis, recordIntervention, syncInterventionStatus } from '@/lib/core/interventions';
import { registerWorkSource, workSource, type WorkSource } from '@/lib/core/capabilities';
import { saveFeedItems, weekStart } from '@/lib/core/knowledge-feed';
import { brandTokens, extractFromHome, identity, isBrandQuery, normPhone, sameName, scoreFacts, type FactDraft } from '@/lib/seo/expediente/rules';
import { BATCH, buildPlan, KIND_TECHNIQUE, type PlanFinding } from '@/lib/seo/plan/rules';
import { SEO_KINDS } from '@/lib/seo/salud/kinds';
import { auditLocal, parseServices, servicePage, type LocalFact, type LocalPage } from '@/lib/seo/local/rules';
import { parseRss, parseStatusIncidents } from '@/lib/seo/id/sources';
import { approvePlanItem, discardPlanItem, regeneratePlan, reopenPlanItem, PLAN_SOURCE } from '@/lib/seo/plan/plan';
import { SALUD_SOURCE } from '@/lib/seo/salud/audit';
import { getParaTi } from '@/lib/inicio/para-ti';

describe('Técnicas y tipos de negocio (núcleo)', () => {
  it('claves únicas, métricas conocidas y nada inventado', () => {
    expect(new Set(TECHNIQUES.map((t) => t.key)).size).toBe(TECHNIQUES.length);
    for (const t of TECHNIQUES) expect(['clics', 'impresiones', 'ctr', 'posicion']).toContain(t.metric);
    expect(normalizeTechnique('inventada')).toBe('otra');
    expect(normalizeTechnique('titulo_reescrito')).toBe('titulo_reescrito');
    expect(techniqueFromCategory('gbp')).toBe('ficha_google');
    expect(techniqueFromCategory(null)).toBe('otra');
  });

  it('cada tipo de hallazgo de SEO (Salud y local) tiene técnica, y esa técnica existe', () => {
    for (const k of SEO_KINDS) {
      expect(KIND_TECHNIQUE[k.kind], k.kind).toBeTruthy();
      expect(TECHNIQUE_BY_KEY.has(KIND_TECHNIQUE[k.kind]), k.kind).toBe(true);
    }
  });

  it('la hipótesis se completa con lo típico de la técnica', () => {
    expect(completeHypothesis('titulo_reescrito', {})).toEqual({ metric: 'ctr', direction: 'sube', windowDays: 28 });
    expect(completeHypothesis('otra', { metric: 'clics', direction: 'baja', magnitudePct: 12.4, windowDays: 3 })).toEqual({ metric: 'clics', direction: 'baja', magnitudePct: 12, windowDays: 7 });
  });

  it('tipos de negocio', () => {
    expect(BUSINESS_TYPES.length).toBeGreaterThan(20);
    expect(isBusinessType('Dentist')).toBe(true);
    expect(isBusinessType('Hackeo')).toBe(false);
    expect(isBusinessType(null)).toBe(false);
  });
});

describe('Expediente: reglas', () => {
  it('normaliza teléfonos y compara nombres', () => {
    expect(normPhone('961 23 45 67')).toBe('+34961234567');
    expect(normPhone('0034 961234567')).toBe('+34961234567');
    expect(normPhone('12')).toBeNull();
    expect(sameName('CM Ibérica S.L.', 'cm iberica')).toBe(true);
    expect(sameName('Reformas López', 'Pinturas García')).toBe(false);
  });

  it('extrae de la portada: JSON-LD, enlaces tel:, redes y título', () => {
    const html = `<html><head><title>Inicio | CM</title><meta property="og:site_name" content="CM Ibérica">
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"HomeAndConstructionBusiness","name":"CM Ibérica","telephone":"961 234 567","address":{"@type":"PostalAddress","streetAddress":"C/ Mayor 1","addressLocality":"Valencia","postalCode":"46001"},"sameAs":["https://www.instagram.com/cm"]}</script>
      </head><body><a href="tel:+34961234567">Llámanos</a><a href="https://www.facebook.com/sharer/sharer.php?u=x">compartir</a><a href="https://www.linkedin.com/company/cm/">in</a></body></html>`;
    const f = extractFromHome({ url: 'https://cm.es/', html, title: 'Inicio | CM' }, new Set(BUSINESS_TYPES.map((t) => t.value)));
    const by = (field: string) => f.find((x) => x.field === field)?.value;
    expect(by('nombre')).toBe('CM Ibérica');
    expect(by('telefono')).toBe('+34961234567');
    expect(by('tipo_negocio')).toBe('HomeAndConstructionBusiness');
    expect((by('direccion') as { city: string }).city).toBe('Valencia');
    expect(by('perfiles')).toEqual(['https://www.instagram.com/cm', 'https://www.linkedin.com/company/cm']);
    expect(by('titulo_inicio')).toBe('Inicio | CM');
  });

  it('sin JSON-LD: teléfono del enlace tel: más repetido y nombre de og:site_name', () => {
    const html = `<meta property="og:site_name" content="Fontanería Pepe &amp; Hijos"><a href="tel:600111222">a</a><a href="tel:600 111 222">b</a><a href="tel:900000000">c</a>`;
    const f = extractFromHome({ url: 'https://f.es/', html }, new Set());
    expect(f.find((x) => x.field === 'telefono')?.value).toBe('+34600111222');
    expect(f.find((x) => x.field === 'nombre')?.value).toBe('Fontanería Pepe & Hijos');
  });

  it('confianza: sube si otra fuente coincide y baja si dice otra cosa', () => {
    const facts: FactDraft[] = [
      { field: 'telefono', value: '+34961234567', source: 'ficha' },
      { field: 'telefono', value: '961234567', source: 'web' },
      { field: 'nombre', value: 'CM Ibérica', source: 'ficha' },
      { field: 'nombre', value: 'Otra Empresa', source: 'web' }
    ];
    const s = scoreFacts(facts);
    expect(s[0].confidence).toBe(90);
    expect(s[0].agrees).toEqual(['web']);
    expect(s[2].confidence).toBe(55);
    expect(s[2].conflicts).toEqual(['web']);
  });

  it('identidad: dos señales que coinciden la confirman; las diferencias se listan', () => {
    const base: FactDraft[] = [
      { field: 'web', value: 'https://www.cm.es/', source: 'ficha' },
      { field: 'web', value: 'cm.es', source: 'gsc' },
      { field: 'telefono', value: '+34961234567', source: 'ficha' },
      { field: 'telefono', value: '+34600000000', source: 'web' }
    ];
    const one = identity(base);
    expect(one.status).toBe('provisional');
    expect(one.matches).toHaveLength(1);
    expect(one.conflicts[0]).toContain('teléfono');
    const two = identity([...base, { field: 'nombre', value: 'CM Ibérica', source: 'ficha' }, { field: 'nombre', value: 'CM Iberica SL', source: 'web' }]);
    expect(two.status).toBe('identificado');
  });

  it('búsquedas de marca', () => {
    const t = brandTokens(['CM Ibérica', 'New CM-Iberica']);
    expect(isBrandQuery('cm iberica valencia', t)).toBe(true);
    expect(isBrandQuery('cmiberica', t)).toBe(true);
    expect(isBrandQuery('reformas baños valencia', t)).toBe(false);
  });
});

describe('Plan de mejora: reglas', () => {
  const f = (id: string, kind: string, severity: PlanFinding['severity'], url: string | null): PlanFinding => ({ id, kind, severity, url });

  it('agrupa por técnica, ordena por gravedad e impacto y estima horas', () => {
    const findingsIn = [
      f('1', 'seo.meta_description_missing', 'aviso', 'https://w.es/a'),
      f('2', 'seo.meta_description_duplicate', 'aviso', 'https://w.es/b'),
      f('3', 'seo.http_4xx', 'importante', 'https://w.es/rota'),
      f('4', 'seo.schema_org_missing', 'importante', null),
      f('5', 'seo.kind_desconocido', 'critico', 'https://w.es/x')
    ];
    const plan = buildPlan(findingsIn, new Map([['https://w.es/a', 900]]), null);
    expect(plan.map((p) => p.technique).sort()).toEqual(['error_servidor_corregido', 'meta_descripcion', 'schema_negocio']);
    const meta = plan.find((p) => p.technique === 'meta_descripcion')!;
    expect(meta.findingIds.sort()).toEqual(['1', '2']);
    expect(meta.urls[0]).toBe('https://w.es/a'); // la que más se ve, primero
    expect(meta.evidence.impressions).toBe(900);
    expect(meta.estHours).toBe(0.7);
    expect(plan.find((p) => p.technique === 'schema_negocio')!.findingIds).toEqual(['4']);
    for (let i = 1; i < plan.length; i++) expect(plan[i - 1].priority).toBeLessThanOrEqual(plan[i].priority);
  });

  it('una tanda lleva como mucho BATCH páginas y marca lo que no cabe en las horas', () => {
    const many = Array.from({ length: BATCH + 10 }, (_, i) => f(`t${i}`, 'seo.thin_content', 'aviso', `https://w.es/p${i}`));
    const plan = buildPlan([...many, f('e', 'seo.http_5xx', 'critico', 'https://w.es/e')], new Map(), 10);
    const thin = plan.find((p) => p.technique === 'contenido_ampliado')!;
    expect(thin.urls).toHaveLength(BATCH);
    expect(thin.evidence.pagesTotal).toBe(BATCH + 10);
    expect(thin.findingIds).toHaveLength(BATCH);
    expect(thin.estHours).toBe(30);
    expect(plan[0].technique).toBe('error_servidor_corregido');
    expect(plan[0].priority).toBe(1);
    expect(thin.evidence.overHours).toBe(true);
    expect(plan[0].evidence.overHours).toBeUndefined();
  });
});

describe('Local sin Places: NAP y páginas por servicio', () => {
  const fact = (field: string, value: unknown, source: string, status = 'provisional'): LocalFact => ({ field, value, source, status });
  const page = (url: string, title: string, indexable = true): LocalPage => ({ url, title, h1: [title], indexable });

  it('saca los servicios del texto libre de la ficha', () => {
    expect(parseServices('Reformas integrales, Reforma de baños; cocinas\n- Pintura\nTrabajamos en toda Valencia.')).toEqual(['Reformas integrales', 'Reforma de baños', 'cocinas', 'Pintura']);
    expect(parseServices(null)).toEqual([]);
  });

  it('una página trata un servicio si tiene todas sus palabras (singular o plural) en la URL, el título o el H1', () => {
    const pages = [page('https://w.es/reformas-de-banos/', 'Reformas de baños en Valencia'), page('https://w.es/cocina', 'Cocinas', false)];
    expect(servicePage('Reforma de baños', pages)?.url).toBe('https://w.es/reformas-de-banos/');
    expect(servicePage('Cocinas', pages)).toBeNull(); // la única que lo trata no es indexable
    expect(servicePage('Pintura', pages)).toBeNull();
  });

  it('nombre, teléfono y dirección: solo avisa si dos fuentes dicen cosas distintas', () => {
    const facts = [
      fact('nombre', 'CM Ibérica', 'ficha'),
      fact('nombre', 'New CM-Iberica', 'web'),
      fact('telefono', '+34911111111', 'ficha'),
      fact('telefono', '+34932296402', 'web'),
      fact('direccion', { city: 'Madrid', postalCode: '28001' }, 'ficha'),
      fact('direccion', { city: 'Barcelona', postalCode: '08001' }, 'web')
    ];
    const out = auditLocal({ facts, services: [], pages: [], isOrganization: false });
    expect(out.map((f) => f.kind).sort()).toEqual(['seo.nap_address_mismatch', 'seo.nap_phone_mismatch']);
    expect(out.find((f) => f.kind === 'seo.nap_phone_mismatch')?.evidence).toMatchObject({ ficha: '+34911111111', web: '+34932296402' });
  });

  it('lo que confirma una persona manda sobre la ficha, y lo descartado no cuenta', () => {
    const facts = [fact('telefono', '+34911111111', 'ficha'), fact('telefono', '+34932296402', 'persona', 'confirmado'), fact('telefono', '+34932296402', 'web')];
    expect(auditLocal({ facts, services: [], pages: [], isOrganization: false })).toEqual([]);
    const descartado = [fact('telefono', '+34911111111', 'ficha'), fact('telefono', '+34932296402', 'web', 'descartado')];
    expect(auditLocal({ facts: descartado, services: [], pages: [], isOrganization: false }).map((f) => f.kind)).toEqual(['seo.nap_phone_missing']);
  });

  it('servicios sin página, uno por servicio; sin rastreo no se comprueba', () => {
    const pages = [page('https://w.es/pintura', 'Pintura de interiores')];
    const out = auditLocal({ facts: [fact('telefono', '+34932296402', 'web')], services: ['Pintura', 'Reforma de baños', 'Cocinas'], pages, isOrganization: false });
    expect(out.map((f) => f.query)).toEqual(['Reforma de baños', 'Cocinas']);
    expect(new Set(out.map((f) => f.dedupeKey)).size).toBe(2);
    expect(auditLocal({ facts: [], services: ['Cocinas'], pages: null, isOrganization: false })).toEqual([]);
  });

  it('el plan agrupa los servicios sin página en una propuesta con 4 h por servicio', () => {
    const plan = buildPlan(
      [
        { id: 'a', kind: 'seo.service_page_missing', severity: 'aviso', url: null, query: 'Cocinas' },
        { id: 'b', kind: 'seo.service_page_missing', severity: 'aviso', url: null, query: 'Baños' },
        { id: 'c', kind: 'seo.nap_phone_mismatch', severity: 'importante', url: null }
      ],
      new Map(),
      null
    );
    const svc = plan.find((p) => p.technique === 'nueva_landing_servicio')!;
    expect(svc.title).toBe('Crear la página de 2 servicio(s)');
    expect(svc.estHours).toBe(8);
    expect(svc.description).toContain('- Cocinas');
    expect(plan.find((p) => p.technique === 'nap_coherente')!.priority).toBe(2);
  });
});

describe('I+D: lectura de fuentes', () => {
  it('panel de incidencias: ranking = actualización, lo demás = incidencia', () => {
    const body = JSON.stringify([
      { id: 'abc', begin: '2026-11-10T18:06:00+00:00', external_desc: 'November 2026 core update', service_name: 'Ranking', uri: 'incidents/abc', most_recent_update: { text: 'Released…' } },
      { id: 'def', begin: '2026-10-01T10:00:00+00:00', end: '2026-10-02T10:00:00+00:00', external_desc: 'Indexing issue', service_name: 'Indexing' },
      { nada: true }
    ]);
    const items = parseStatusIncidents(body);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ hash: 'abc', kind: 'core_update', title: 'November 2026 core update', url: 'https://status.search.google.com/incidents/abc' });
    expect(items[0].endsAt).toBeNull();
    expect(items[1].kind).toBe('incidencia');
    expect(items[1].endsAt?.toISOString()).toBe('2026-10-02T10:00:00.000Z');
    expect(parseStatusIncidents('no es json')).toEqual([]);
  });

  it('RSS del blog', () => {
    const xml = `<rss><channel><item><title>Updating our structured data documentation</title><link>https://developers.google.com/search/blog/2026/11/x</link>
      <description><![CDATA[<p>We &#39;ve updated</p>]]></description><pubDate>Mon, 16 Nov 2026 00:00:00 +0000</pubDate><guid isPermaLink="false">g1</guid></item>
      <item><title>Search Central Live Madrid</title><link>https://developers.google.com/search/blog/2026/11/y</link><pubDate>Tue, 17 Nov 2026 00:00:00 +0000</pubDate></item></channel></rss>`;
    const items = parseRss(xml);
    expect(items).toHaveLength(2);
    expect(items[0].kind).toBe('documentacion');
    expect(items[0].summary).toBe("We 've updated");
    expect(items[0].publishedAt?.toISOString()).toBe('2026-11-16T00:00:00.000Z');
    expect(items[1].kind).toBe('novedad');
    expect(items[0].hash).not.toBe(items[1].hash);
  });

  it('semana de un día', () => {
    expect(weekStart(new Date('2026-11-23T10:00:00Z'))).toBe('2026-11-23');
    expect(weekStart(new Date('2026-11-29T10:00:00Z'))).toBe('2026-11-23');
  });
});

// --- Contra la base de datos -----------------------------------------------------------------------------------------

const SLUG = 'pruebas-seo-hito1';
let T = '';
let PROJECT = '';
let CLIENT = '';
let previousWs: WorkSource | null = null;
const created: string[] = [];
const doneRefs = new Set<string>();

async function cleanup() {
  const [t] = await db.select().from(tenants).where(eq(tenants.slug, SLUG));
  if (!t) return;
  await db.delete(interventions).where(eq(interventions.tenantId, t.id));
  await db.delete(kbFeedItems).where(eq(kbFeedItems.tenantId, t.id));
  await db.delete(kbArticles).where(eq(kbArticles.tenantId, t.id));
  const ps = await db.select({ id: projects.id }).from(projects).where(eq(projects.tenantId, t.id));
  const pids = ps.map((p) => p.id);
  if (pids.length) {
    await db.delete(seoPlanItems).where(inArray(seoPlanItems.projectId, pids));
    await db.delete(seoDossierFacts).where(inArray(seoDossierFacts.projectId, pids));
    await db.delete(findings).where(inArray(findings.projectId, pids));
    await db.delete(projects).where(inArray(projects.id, pids));
  }
  await db.delete(jobs).where(eq(jobs.tenantId, t.id));
  await db.delete(clients).where(eq(clients.tenantId, t.id));
  await db.delete(users).where(eq(users.tenantId, t.id));
  await db.delete(tenants).where(eq(tenants.id, t.id));
}

beforeAll(async () => {
  await cleanup();
  const [t] = await db.insert(tenants).values({ name: 'Pruebas SEO hito 1', slug: SLUG }).returning();
  T = t.id;
  const [u] = await db.insert(users).values({ tenantId: T, name: 'Prueba', email: 'pruebas-seo-hito1@kijutech.test', passwordHash: 'x' }).returning();
  const [c] = await db.insert(clients).values({ tenantId: T, name: 'Cliente de prueba', businessType: 'Dentist' }).returning();
  CLIENT = c.id;
  const [p] = await db.insert(projects).values({ tenantId: T, name: 'SEO', clientId: c.id, createdBy: u.id, monthlyHours: '10.0' }).returning();
  PROJECT = p.id;
  // Fuente de trabajo simulada: crea «encargos» en memoria y dice cuáles están hechos.
  previousWs = workSource();
  registerWorkSource({
    ...(previousWs ?? ({} as WorkSource)),
    createTask: async () => {
      const ref = crypto.randomUUID();
      created.push(ref);
      return { ok: true, ref, url: `https://tareas.test/${ref}`, message: 'Encargo creado.' };
    },
    requestStatus: async (_t, refs) => refs.filter((r) => created.includes(r)).map((r) => ({ ref: r, doneAt: doneRefs.has(r) ? '2026-11-20T10:00:00.000Z' : null, cancelled: false }))
  } as WorkSource);
});
afterAll(async () => {
  if (previousWs) registerWorkSource(previousWs);
  await cleanup();
});

describe('Plan → encargo → intervención (base de datos, fuente de trabajo simulada)', () => {
  it('genera, aprueba, registra la intervención, la marca hecha y no repite lo decidido', async () => {
    const mk = (kind: string, severity: string, url: string | null) => ({ tenantId: T, projectId: PROJECT, kind, severity, url, source: SALUD_SOURCE, dedupeKey: `${kind}:${url}` });
    const rows = await db
      .insert(findings)
      .values([mk('seo.http_4xx', 'importante', 'https://p.es/rota'), mk('seo.title_duplicate', 'aviso', 'https://p.es/a'), mk('seo.title_duplicate', 'aviso', 'https://p.es/b'), mk('seo.schema_faq', 'aviso', 'https://p.es/faq')])
      .returning();

    const r1 = await regeneratePlan(T, PROJECT);
    expect(r1.created).toBe(3);
    const items = await db.select().from(seoPlanItems).where(eq(seoPlanItems.projectId, PROJECT));
    const titles = items.find((i) => i.technique === 'titulo_reescrito')!;
    expect(titles.findingIds).toHaveLength(2);
    expect(titles.planKey).toBe('titulo_reescrito#1');

    // Para ti: una entrada por proyecto con lo pendiente.
    const pt = await getParaTi(T);
    expect(pt.entries.filter((e) => e.kind === 'seo').map((e) => e.href)).toEqual([`/dashboard/projects/${PROJECT}/plan`]);

    // Volver a generar no duplica.
    expect((await regeneratePlan(T, PROJECT)).created).toBe(0);

    const ok = await approvePlanItem(T, PROJECT, titles.id, 'Prueba', 'con cuidado');
    expect(ok.ok).toBe(true);
    const [approved] = await db.select().from(seoPlanItems).where(eq(seoPlanItems.id, titles.id));
    expect(approved.status).toBe('aprobada');
    expect(approved.requestRef).toBeTruthy();
    const linked = await db.select().from(findings).where(inArray(findings.id, titles.findingIds));
    expect(linked.every((f) => f.requestId === approved.requestRef)).toBe(true);
    const [iv] = await db.select().from(interventions).where(and(eq(interventions.tenantId, T), eq(interventions.source, PLAN_SOURCE), eq(interventions.sourceRef, titles.id)));
    expect(iv).toMatchObject({ technique: 'titulo_reescrito', businessType: 'Dentist', status: 'prevista', requestRef: approved.requestRef, clientId: CLIENT });
    expect(iv.hypothesis).toEqual({ metric: 'ctr', direction: 'sube', windowDays: 28 });

    // Aprobar dos veces no crea dos encargos.
    await expect(approvePlanItem(T, PROJECT, titles.id, 'Prueba')).rejects.toThrow();
    expect(created).toHaveLength(1);

    // Descartar la de FAQ: no vuelve a salir aunque sus hallazgos sigan abiertos.
    const faq = items.find((i) => i.technique === 'schema_limpieza')!;
    expect(await discardPlanItem(T, PROJECT, faq.id, 'Prueba', 'lo hace el cliente')).toBe(true);
    await regeneratePlan(T, PROJECT);
    const after = await db.select().from(seoPlanItems).where(eq(seoPlanItems.projectId, PROJECT));
    expect(after.filter((i) => i.technique === 'schema_limpieza').map((i) => i.status)).toEqual(['descartada']);

    // El encargo se termina: el núcleo marca la intervención y el plan la propuesta.
    doneRefs.add(approved.requestRef!);
    expect((await syncInterventionStatus(T)).done).toBe(1);
    await regeneratePlan(T, PROJECT);
    const [done] = await db.select().from(seoPlanItems).where(eq(seoPlanItems.id, titles.id));
    expect(done.status).toBe('hecha');

    // Se arregla la página rota: su propuesta pendiente caduca.
    await db.update(findings).set({ status: 'resuelto' }).where(eq(findings.id, rows[0].id));
    const r3 = await regeneratePlan(T, PROJECT);
    expect(r3.expired).toBe(1);

    // Recuperar la descartada la vuelve a proponer (técnica#2).
    expect(await reopenPlanItem(T, PROJECT, faq.id)).toBe(true);
    const last = await db.select().from(seoPlanItems).where(and(eq(seoPlanItems.projectId, PROJECT), eq(seoPlanItems.technique, 'schema_limpieza')));
    expect(last.map((i) => `${i.planKey}:${i.status}`).sort()).toEqual(['schema_limpieza#1:caducada', 'schema_limpieza#2:pendiente']);
  });

  it('una intervención se actualiza por su origen, sin duplicar', async () => {
    const a = await recordIntervention({ tenantId: T, clientId: CLIENT, domain: 'seo', technique: 'inventada', source: 'estrategia', sourceRef: 'x1', requestRef: null });
    const b = await recordIntervention({ tenantId: T, clientId: CLIENT, domain: 'seo', technique: 'ficha_google', source: 'estrategia', sourceRef: 'x1', requestRef: 'r-1' });
    expect(a.id).toBe(b.id);
    expect(a.technique).toBe('otra');
    expect(b.technique).toBe('ficha_google');
    expect(b.requestRef).toBe('r-1');
  });
});

describe('Bitácora de I+D (base de datos)', () => {
  it('no repite y actualiza el final de una incidencia', async () => {
    const item = { hash: 'inc-1', url: null, title: 'Core update', summary: null, publishedAt: new Date(), kind: 'core_update' as const, startsAt: new Date(), endsAt: null };
    expect((await saveFeedItems(T, 'seo', 'search_status', [item])).created).toHaveLength(1);
    expect((await saveFeedItems(T, 'seo', 'search_status', [{ ...item, endsAt: new Date('2026-11-24T00:00:00Z') }])).created).toHaveLength(0);
    const rows = await db.select().from(kbFeedItems).where(eq(kbFeedItems.tenantId, T));
    expect(rows).toHaveLength(1);
    expect(rows[0].endsAt?.toISOString()).toBe('2026-11-24T00:00:00.000Z');
  });
});

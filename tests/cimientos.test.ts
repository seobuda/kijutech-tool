// Cimientos de la plataforma (23 nov 2026; docs/DISENO-TECNICO-CIMIENTOS.md): cola de trabajos, comunicaciones con
// clientes, hallazgos, Search Console en detalle, rastreador y alcance del proyecto. Reglas puras y, contra la base de
// datos, en una cuenta de pruebas propia (Google, el buzón y la red, simulados).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray, like, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  clientAssets,
  clientContacts,
  clientMessages,
  clients,
  crawlPages,
  crawlRuns,
  findings,
  gscDailyTotals,
  gscMonthly,
  gscProperties,
  gscQueries,
  jobs,
  jobSchedules,
  projectAssets,
  projects,
  tenants,
  users
} from '@/lib/db/schema';
import {
  claimNextJob,
  enqueueJob,
  ensureSchedule,
  executeJob,
  kindsWithRoom,
  nextScheduleRun,
  reapStaleJobs,
  registerJobKind,
  registerProcess,
  retryDelayMinutes,
  tickSchedules
} from '@/lib/core/jobs';
import { needsApproval, normalizeThreadKey, ourThreadKeys, recipientsFor, threadKeyFor } from '@/lib/core/comms-rules';
import { approveClientMessage, createClientMessage, receiveClientReply, rejectClientMessage, sendApprovedMessage, setContactSubscriptions } from '@/lib/core/comms';
import { registerClientReplyListener, registerCommsApprovalNotifier, registerMailSender, registerMetricSource, type SearchQuery } from '@/lib/core/capabilities';
import { planFindingSync } from '@/lib/core/findings-rules';
import { registerFindingKind, syncFindings } from '@/lib/core/findings';
import { anonymousClicks, backfillChunk, dailyWindow, detailRow, isRetryableGoogleError, partitionBounds, partitionName, propertyKind } from '@/lib/core/gsc-rules';
import { rollupGscMonth, syncGscDay } from '@/lib/core/gsc';
import { isAllowed, locsFromSitemap, parseRobots } from '@/lib/core/robots';
import { extractPage, hamming, normalizeUrl, simhash } from '@/lib/core/crawl-extract';
import { crawlSlice, inlinkCounts, type FetchResult, type Fetcher } from '@/lib/core/crawler';
import { setProjectScope } from '@/lib/projects/scope';
import { deleteCoreClient } from '@/lib/core/clients';

// ---------------------------------------------------------------------------------------------------------------------
// Reglas puras
// ---------------------------------------------------------------------------------------------------------------------

describe('cola de trabajos: reglas', () => {
  it('reintentos con espera creciente y tope', () => {
    expect([1, 2, 3, 10].map(retryDelayMinutes)).toEqual([1, 4, 9, 60]);
  });
  it('un proceso que falla se espacia (×2 por fallo, tope 24 h) y vuelve a su frecuencia al ir bien', () => {
    const now = new Date('2026-11-23T10:00:00Z');
    const min = (d: Date) => (d.getTime() - now.getTime()) / 60000;
    expect(min(nextScheduleRun(now, 60, 0))).toBe(60);
    expect(min(nextScheduleRun(now, 5, 1))).toBe(10);
    expect(min(nextScheduleRun(now, 5, 3))).toBe(40);
    expect(min(nextScheduleRun(now, 5, 20))).toBe(1440);
  });
  it('concurrencia por tipo', () => {
    const kinds = [{ kind: 'a', maxConcurrent: 1, run: async () => undefined }, { kind: 'b', run: async () => undefined }];
    expect(kindsWithRoom(kinds, { a: 1, b: 1 })).toEqual(['b']);
    expect(kindsWithRoom(kinds, { b: 2 })).toEqual(['a']);
  });
});

describe('comunicaciones: reglas', () => {
  const c = (id: string, kinds: [string, string | null][], extra: Partial<{ email: string | null; active: boolean }> = {}) => ({
    id,
    name: id,
    email: 'email' in extra ? extra.email! : `${id}@cliente.es`,
    active: extra.active ?? true,
    subscriptions: kinds.map(([kind, projectId]) => ({ kind, projectId }))
  });
  const contacts = [
    c('dueno', [['informes', null]]),
    c('marketing', [['preguntas', 'P1']]),
    c('gerente', [['todo', null]]),
    c('baja', [['preguntas', null]], { active: false }),
    c('sinmail', [['preguntas', null]], { email: null })
  ];
  it('destinatarios por tipo, por proyecto y «todo»; nunca inactivos ni sin correo', () => {
    expect(recipientsFor(contacts, 'informes', null).map((x) => x.id)).toEqual(['dueno', 'gerente']);
    expect(recipientsFor(contacts, 'preguntas', 'P1').map((x) => x.id)).toEqual(['marketing', 'gerente']);
    expect(recipientsFor(contacts, 'preguntas', 'P2').map((x) => x.id)).toEqual(['gerente']);
    expect(recipientsFor([contacts[0]], 'avisos', null)).toEqual([]);
  });
  it('aprobación: el cliente manda; si hereda, la cuenta (por defecto, siempre)', () => {
    expect(needsApproval('siempre', 'heredar')).toBe(true);
    expect(needsApproval('nunca', 'heredar')).toBe(false);
    expect(needsApproval('nunca', 'siempre')).toBe(true);
    expect(needsApproval('siempre', 'nunca')).toBe(false);
    expect(needsApproval(null, null)).toBe(true);
  });
  it('hilos: nuestras claves salen de In-Reply-To y References', () => {
    const k = threadKeyFor('abc', 'equipo.kijutech.com');
    expect(k).toBe('cm-abc@equipo.kijutech.com');
    expect(ourThreadKeys(`<otra@gmail.com> <${k}>`)).toEqual([k]);
    expect(normalizeThreadKey(' <CM-X@Y> ')).toBe('cm-x@y');
  });
});

describe('hallazgos: ciclo de vida', () => {
  it('crea lo nuevo, actualiza lo que sigue, reabre lo resuelto y resuelve lo abierto que desaparece; lo descartado no se toca', () => {
    const plan = planFindingSync(
      [
        { id: '1', dedupeKey: 'a', status: 'abierto' },
        { id: '2', dedupeKey: 'b', status: 'resuelto' },
        { id: '3', dedupeKey: 'c', status: 'descartado' },
        { id: '4', dedupeKey: 'd', status: 'abierto' }
      ],
      [
        { kind: 'k', dedupeKey: 'a' },
        { kind: 'k', dedupeKey: 'b' },
        { kind: 'k', dedupeKey: 'c' },
        { kind: 'k', dedupeKey: 'e' },
        { kind: 'k', dedupeKey: 'e' }
      ]
    );
    expect(plan.insert.map((f) => f.dedupeKey)).toEqual(['e']);
    expect(plan.update.map((u) => [u.id, u.reopen])).toEqual([
      ['1', false],
      ['2', true],
      ['3', false]
    ]);
    expect(plan.resolve).toEqual(['4']);
  });
});

describe('Search Console: reglas', () => {
  it('particiones mensuales', () => {
    expect(partitionName('2026-11-23')).toBe('gsc_daily_y2026m11');
    expect(partitionBounds('2026-12-05')).toEqual({ from: '2026-12-01', to: '2027-01-01' });
  });
  it('ventana diaria con retraso y tramos del histórico hacia atrás', () => {
    expect(dailyWindow(new Date('2026-11-23T08:00:00Z'))).toEqual(['2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21']);
    expect(backfillChunk('2026-11-18', '2026-11-15', 14)).toEqual(['2026-11-17', '2026-11-16', '2026-11-15']);
    expect(backfillChunk('2026-11-15', '2026-11-15')).toBeNull();
  });
  it('filas de detalle, clics anónimos, tipo de propiedad y errores que se reintentan', () => {
    expect(detailRow({ keys: ['dentista bilbao', 'https://x.es/', 'MOBILE'], clicks: 3, impressions: 40, position: 4.5 })).toEqual({ query: 'dentista bilbao', page: 'https://x.es/', device: 1, clicks: 3, impressions: 40, posSum: 180 });
    expect(detailRow({ keys: ['', 'https://x.es/', 'MOBILE'], clicks: 1, impressions: 1, position: 1 })).toBeNull();
    expect(anonymousClicks(100, 60)).toBe(40);
    expect(anonymousClicks(10, 12)).toBe(0);
    expect(propertyKind('sc-domain:x.es')).toBe('dominio');
    expect(propertyKind('https://x.es/')).toBe('prefijo');
    expect(isRetryableGoogleError('Google (429): Quota exceeded')).toBe(true);
    expect(isRetryableGoogleError('Google (403): sin permiso')).toBe(false);
  });
});

describe('robots.txt', () => {
  const txt = `User-agent: *\nDisallow: /privado/\nAllow: /privado/publico\nDisallow: /*.pdf$\n\nUser-agent: KijutechBot\nDisallow: /solo-nosotros\nCrawl-delay: 2\nSitemap: https://x.es/sitemap.xml`;
  it('grupo más específico, regla más larga y comodines', () => {
    const r = parseRobots(txt, 'KijutechBot');
    expect(r.sitemaps).toEqual(['https://x.es/sitemap.xml']);
    expect(r.crawlDelay).toBe(2);
    expect(isAllowed(r, '/solo-nosotros/x')).toBe(false);
    expect(isAllowed(r, '/privado/x')).toBe(true); // nuestro grupo no lo prohíbe
    const star = parseRobots(txt, 'OtroBot');
    expect(isAllowed(star, '/privado/x')).toBe(false);
    expect(isAllowed(star, '/privado/publico/y')).toBe(true);
    expect(isAllowed(star, '/doc.pdf')).toBe(false);
    expect(isAllowed(star, '/doc.pdf?x=1')).toBe(true);
  });
  it('sitemaps e índices', () => {
    expect(locsFromSitemap('<urlset><url><loc>https://x.es/a</loc></url></urlset>')).toEqual({ urls: ['https://x.es/a'], sitemaps: [] });
    expect(locsFromSitemap('<sitemapindex><sitemap><loc>https://x.es/s1.xml</loc></sitemap></sitemapindex>').sitemaps).toEqual(['https://x.es/s1.xml']);
  });
});

describe('extracción de una página', () => {
  const html = `<!doctype html><html lang=es><head><title> Dentista en Bilbao | Clínica X </title>
    <meta name="description" content="Implantes y ortodoncia">
    <meta name=robots content="index, follow">
    <link rel=canonical href="/servicios/">
    <link rel="alternate" hreflang="en" href="https://x.es/en/">
    <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Dentist","name":"Clínica X"},{"@type":"BreadcrumbList"}]}</script>
    <script type="application/ld+json">{ roto </script>
    </head><body><h1>Clínica dental en Bilbao</h1><h2>Implantes</h2>
    <p>Somos una clínica con <a href="/implantes#precio">implantes</a> y <a href="https://otra.com" rel="nofollow">otra</a>.</p>
    <img src="a.jpg"><img src="b.jpg" alt="b"><script>if (a < b) {}</script></body></html>`;
  const p = extractPage(html, 'https://www.x.es/servicios/?utm=1');
  it('lee lo importante para el SEO', () => {
    expect(p.title).toBe('Dentista en Bilbao | Clínica X');
    expect(p.metaDescription).toBe('Implantes y ortodoncia');
    expect(p.robotsMeta).toBe('index, follow');
    expect(p.canonical).toBe('https://www.x.es/servicios/');
    expect(p.lang).toBe('es');
    expect(p.hreflang).toEqual([{ lang: 'en', url: 'https://x.es/en/' }]);
    expect(p.h1).toEqual(['Clínica dental en Bilbao']);
    expect(p.headings.h2).toEqual(['Implantes']);
    expect(p.schemaTypes.sort()).toEqual(['BreadcrumbList', 'Dentist']);
    expect(p.jsonldErrors).toBe(1);
    expect(p.imagesWithoutAlt).toBe(1);
    expect(p.links).toEqual([
      { url: 'https://www.x.es/implantes', anchor: 'implantes', nofollow: false, internal: true },
      { url: 'https://otra.com/', anchor: 'otra', nofollow: true, internal: false }
    ]);
    expect(p.wordCount).toBeGreaterThan(8);
  });
  it('huella de casi duplicados', () => {
    const a = simhash('El mejor dentista de Bilbao con implantes dentales y ortodoncia invisible para toda la familia');
    const b = simhash('El mejor dentista de Bilbao con implantes dentales y ortodoncia invisible para toda tu familia');
    const c = simhash('Abogados laboralistas en Madrid especializados en despidos y reclamaciones de cantidad');
    expect(hamming(a, b)).toBeLessThan(hamming(a, c));
    expect(normalizeUrl('HTTPS://X.ES:443/a#b', 'https://x.es')).toBe('https://x.es/a');
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Contra la base de datos, en una cuenta de pruebas propia
// ---------------------------------------------------------------------------------------------------------------------

const SLUG = 'seg-test-cimientos';
const EMAIL = 'seg-test-cimientos@kijutech.test';
let T = '';
let USER = 0;
let CLIENT = '';
let OTHER_CLIENT = '';
let PROJECT = '';

async function cleanup() {
  const [t] = await db.select().from(tenants).where(eq(tenants.slug, SLUG));
  if (!t) return;
  const pids = (await db.select({ id: projects.id }).from(projects).where(eq(projects.tenantId, t.id))).map((p) => p.id);
  const props = (await db.select({ id: gscProperties.id }).from(gscProperties).where(eq(gscProperties.tenantId, t.id))).map((p) => p.id);
  if (props.length) await db.execute(sql`DELETE FROM gsc_daily WHERE property_id IN ${props}`);
  await db.delete(jobs).where(eq(jobs.tenantId, t.id));
  await db.delete(jobSchedules).where(eq(jobSchedules.tenantId, t.id));
  if (pids.length) await db.delete(projects).where(inArray(projects.id, pids));
  await db.delete(clients).where(eq(clients.tenantId, t.id));
  await db.delete(users).where(eq(users.tenantId, t.id));
  await db.delete(tenants).where(eq(tenants.id, t.id));
}

beforeAll(async () => {
  await cleanup();
  const [t] = await db.insert(tenants).values({ name: 'Pruebas cimientos', slug: SLUG }).returning();
  T = t.id;
  const [u] = await db.insert(users).values({ tenantId: T, name: 'Prueba', email: EMAIL, passwordHash: 'x' }).returning();
  USER = u.id;
  const [c1] = await db.insert(clients).values({ tenantId: T, name: 'Clínica Prueba' }).returning();
  const [c2] = await db.insert(clients).values({ tenantId: T, name: 'Otro Cliente' }).returning();
  CLIENT = c1.id;
  OTHER_CLIENT = c2.id;
  const [p] = await db.insert(projects).values({ tenantId: T, name: 'SEO web', clientId: CLIENT, createdBy: USER }).returning();
  PROJECT = p.id;
});
afterAll(cleanup);

describe('cola de trabajos (base de datos)', () => {
  let ran = 0;
  beforeAll(() => {
    registerJobKind({ kind: 'test.cim.ok', maxConcurrent: 5, run: async (_c, p) => ({ got: p.n ?? null, n: ++ran }) });
    registerJobKind({ kind: 'test.cim.falla', maxConcurrent: 5, maxAttempts: 2, run: async () => { throw new Error('boom'); } });
    registerProcess({ key: 'test.cim.proceso', scopeType: 'cuenta', label: 'prueba', defaultEveryMinutes: 60, enqueue: () => ({ kind: 'test.cim.ok', payload: { n: 7 } }) });
  });
  const only = ['test.cim.ok', 'test.cim.falla'];

  it('la misma clave no crea dos trabajos abiertos', async () => {
    const a = await enqueueJob({ tenantId: T, kind: 'test.cim.ok', dedupeKey: 'unico' });
    const b = await enqueueJob({ tenantId: T, kind: 'test.cim.ok', dedupeKey: 'unico' });
    expect(a.created).toBe(true);
    expect(b).toEqual({ id: a.id, created: false });
  });

  it('dos trabajadores nunca reclaman el mismo trabajo; al terminar queda hecho', async () => {
    const [x, y] = await Promise.all([claimNextJob('w1', only), claimNextJob('w2', only)]);
    expect(x?.id).toBeTruthy();
    expect(y).toBeNull(); // solo había uno
    expect(await executeJob(x!)).toBe('hecho');
    const [row] = await db.select().from(jobs).where(eq(jobs.id, x!.id));
    expect(row.status).toBe('hecho');
    expect(row.attempts).toBe(1);
  });

  it('un fallo vuelve a la cola con espera y, agotados los intentos, queda fallido', async () => {
    const { id } = await enqueueJob({ tenantId: T, kind: 'test.cim.falla' });
    const j1 = await claimNextJob('w1', only);
    expect(j1?.id).toBe(id);
    expect(await executeJob(j1!)).toBe('reintento');
    await db.update(jobs).set({ runAt: new Date(Date.now() - 1000) }).where(eq(jobs.id, id));
    const j2 = await claimNextJob('w1', only);
    expect(await executeJob(j2!)).toBe('fallido');
    const [row] = await db.select().from(jobs).where(eq(jobs.id, id));
    expect(row.status).toBe('fallido');
    expect(row.lastError).toContain('boom');
  });

  it('un trabajo cuyo trabajador dejó de dar latido vuelve a la cola', async () => {
    const { id } = await enqueueJob({ tenantId: T, kind: 'test.cim.ok' });
    const j = await claimNextJob('caido', only);
    expect(j?.id).toBe(id);
    await db.update(jobs).set({ heartbeatAt: new Date(Date.now() - 10 * 60_000) }).where(eq(jobs.id, id));
    expect(await reapStaleJobs(90)).toBeGreaterThanOrEqual(1);
    const [row] = await db.select().from(jobs).where(eq(jobs.id, id));
    expect(row.status).toBe('pendiente');
    await db.delete(jobs).where(eq(jobs.id, id));
  });

  it('un proceso vencido crea su trabajo (una sola vez aunque se mire dos veces)', async () => {
    await ensureSchedule(T, 'test.cim.proceso', '', 60, new Date(Date.now() - 1000));
    await tickSchedules();
    await tickSchedules();
    const created = await db.select().from(jobs).where(and(eq(jobs.tenantId, T), eq(jobs.dedupeKey, 'sched:test.cim.proceso:')));
    expect(created).toHaveLength(1);
    expect((created[0].payload as { n?: number }).n).toBe(7);
    const [s] = await db.select().from(jobSchedules).where(and(eq(jobSchedules.tenantId, T), eq(jobSchedules.processKey, 'test.cim.proceso')));
    expect(s.nextRunAt.getTime()).toBeGreaterThan(Date.now() + 50 * 60_000);
  });
});

describe('comunicaciones con clientes (base de datos)', () => {
  const sent: { to: string[]; subject: string; messageId: string }[] = [];
  const notified: string[] = [];
  const replies: string[] = [];
  let dueno = '';
  let marketing = '';
  beforeAll(async () => {
    registerMailSender({
      send: async (_t, m) => {
        sent.push({ to: m.to.map((x) => x.email), subject: m.subject, messageId: m.messageId });
        return { providerId: `prov-${sent.length}` };
      },
      domain: async () => 'equipo.kijutech.com'
    });
    registerCommsApprovalNotifier({ notify: async (n) => void notified.push(n.messageId), decided: async () => undefined });
    registerClientReplyListener('test', async (r) => void replies.push(r.messageId));
    const [a] = await db.insert(clientContacts).values({ tenantId: T, clientId: CLIENT, name: 'Dueña', email: 'duena@cliente-prueba.es' }).returning();
    const [b] = await db.insert(clientContacts).values({ tenantId: T, clientId: CLIENT, name: 'Marketing', email: 'mk@cliente-prueba.es' }).returning();
    dueno = a.id;
    marketing = b.id;
  });

  it('sin nadie que reciba ese tipo, no se crea y lo dice', async () => {
    const r = await createClientMessage({ tenantId: T, clientId: CLIENT, kind: 'preguntas', subject: 'Hola', body: 'Una duda', author: { kind: 'persona', name: 'Prueba' } });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe('sin_destinatario');
  });

  it('con aprobación queda pendiente y avisa; aprobado se envía una sola vez a quien toca', async () => {
    await setContactSubscriptions(T, dueno, ['informes']);
    await setContactSubscriptions(T, marketing, ['preguntas']);
    const r = await createClientMessage({ tenantId: T, clientId: CLIENT, kind: 'preguntas', subject: '¿Servicio estrella?', body: '¿Cuál es vuestro servicio más rentable?', author: { kind: 'agente', name: 'SEO', agentKey: 'seo' } });
    expect(r.ok && r.status).toBe('pendiente_aprobacion');
    const id = r.ok ? r.id : '';
    expect(notified).toContain(id);
    expect(await sendApprovedMessage(T, id)).toEqual({ sent: false, detail: 'estado pendiente_aprobacion' });
    expect((await approveClientMessage(T, id, 'Enric', { body: '¿Cuál es el servicio que más os interesa?' })).ok).toBe(true);
    expect((await approveClientMessage(T, id, 'Enric')).ok).toBe(false); // ya no está pendiente
    const job = await db.select().from(jobs).where(and(eq(jobs.tenantId, T), eq(jobs.dedupeKey, `comms.send:${id}`)));
    expect(job).toHaveLength(1);
    expect((await sendApprovedMessage(T, id)).sent).toBe(true);
    expect((await sendApprovedMessage(T, id)).sent).toBe(false); // idempotente
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual(['mk@cliente-prueba.es']);
    const [m] = await db.select().from(clientMessages).where(eq(clientMessages.id, id));
    expect(m.status).toBe('enviado');
    expect(m.bodyText).toBe('¿Cuál es el servicio que más os interesa?');
    // La respuesta del cliente se une a su hilo.
    const hit = await receiveClientReply({ tenantId: T, inboundId: '00000000-0000-0000-0000-000000000001', clientId: CLIENT, inReplyTo: m.threadKey, references: null, subject: 'Re', text: 'Implantes', from: 'mk@cliente-prueba.es' });
    expect(hit?.messageId).toBe(id);
    expect(replies).toContain(id);
    expect(await receiveClientReply({ tenantId: T, inboundId: 'x', clientId: CLIENT, inReplyTo: '<algo@gmail.com>', references: null, subject: '', text: '', from: '' })).toBeNull();
  });

  it('descartar; y con la política «nunca» sale sin aprobación', async () => {
    const r = await createClientMessage({ tenantId: T, clientId: CLIENT, kind: 'informes', subject: 'Informe', body: 'Texto', author: { kind: 'sistema', name: 'Sistema' } });
    expect((await rejectClientMessage(T, r.ok ? r.id : '', 'Enric', 'no toca')).ok).toBe(true);
    await db.update(clients).set({ commsApproval: 'nunca' }).where(eq(clients.id, CLIENT));
    const r2 = await createClientMessage({ tenantId: T, clientId: CLIENT, kind: 'informes', subject: 'Informe 2', body: 'Texto', author: { kind: 'sistema', name: 'Sistema' } });
    expect(r2.ok && r2.status).toBe('aprobado');
    // Aunque la política sea «nunca», un agente que ha leído webs no envía solo.
    const r3 = await createClientMessage({ tenantId: T, clientId: CLIENT, kind: 'informes', subject: 'Informe 3', body: 'Texto', author: { kind: 'agente', name: 'A' }, forceApproval: true });
    expect(r3.ok && r3.status).toBe('pendiente_aprobacion');
    await db.update(clients).set({ commsApproval: 'heredar' }).where(eq(clients.id, CLIENT));
  });
});

describe('alcance del proyecto y hallazgos (base de datos)', () => {
  it('el alcance solo admite cuentas del mismo cliente', async () => {
    const [mine] = await db.insert(clientAssets).values({ tenantId: T, clientId: CLIENT, kind: 'web', value: 'https://clinica-prueba.es' }).returning();
    const [foreign] = await db.insert(clientAssets).values({ tenantId: T, clientId: OTHER_CLIENT, kind: 'web', value: 'https://otro.es' }).returning();
    expect(await setProjectScope(T, PROJECT, [mine.id, foreign.id])).toEqual([mine.id]);
    expect((await db.select().from(projectAssets).where(eq(projectAssets.projectId, PROJECT))).map((r) => r.clientAssetId)).toEqual([mine.id]);
  });

  it('un proyecto nuevo sin cliente no se puede guardar; uno antiguo (legacy) sí se puede seguir editando', async () => {
    await expect(db.insert(projects).values({ tenantId: T, name: 'Sin cliente', createdBy: USER })).rejects.toThrow();
    const [old] = await db.insert(projects).values({ tenantId: T, name: 'Antiguo', createdBy: USER, legacy: true }).returning();
    await expect(db.update(projects).set({ status: 'archived' }).where(eq(projects.id, old.id))).resolves.toBeDefined();
  });

  it('no se borra la ficha de un cliente que tiene proyectos', async () => {
    await db.update(clients).set({ status: 'baja' }).where(eq(clients.id, CLIENT));
    await expect(deleteCoreClient(T, CLIENT, 'Clínica Prueba')).rejects.toThrow('Tiene proyectos');
    await db.update(clients).set({ status: 'activo' }).where(eq(clients.id, CLIENT));
  });

  it('hallazgos: se crean, se resuelven solos y lo descartado no vuelve', async () => {
    registerFindingKind({ kind: 'test.title_missing', title: 'Falta el título', explain: 'x', severityDefault: 'importante' });
    const r1 = await syncFindings(T, PROJECT, 'crawl:propio', [
      { kind: 'test.title_missing', dedupeKey: 'a', url: 'https://x/a' },
      { kind: 'test.title_missing', dedupeKey: 'b', url: 'https://x/b' }
    ]);
    expect(r1).toEqual({ created: 2, updated: 0, resolved: 0 });
    const [b] = await db.select().from(findings).where(and(eq(findings.projectId, PROJECT), eq(findings.dedupeKey, 'b')));
    await db.update(findings).set({ status: 'descartado' }).where(eq(findings.id, b.id));
    const r2 = await syncFindings(T, PROJECT, 'crawl:propio', [{ kind: 'test.title_missing', dedupeKey: 'b', url: 'https://x/b' }], ['test.title_missing']);
    expect(r2).toEqual({ created: 0, updated: 1, resolved: 1 });
    const rows = await db.select({ k: findings.dedupeKey, s: findings.status }).from(findings).where(eq(findings.projectId, PROJECT));
    expect(Object.fromEntries(rows.map((r) => [r.k, r.s]))).toEqual({ a: 'resuelto', b: 'descartado' });
    await expect(syncFindings(T, PROJECT, 'x', [{ kind: 'no.registrado', dedupeKey: 'z' }])).rejects.toThrow('no registrados');
  });
});

describe('Search Console en detalle (base de datos, Google simulado)', () => {
  const calls: SearchQuery[] = [];
  beforeAll(() => {
    // Fuente simulada: totales, países y 25.003 filas de detalle (dos páginas: comprueba la paginación).
    registerMetricSource({
      provider: 'aaa-prueba-cimientos',
      kinds: [{ assetKind: 'search_console', source: 'gsc', label: 'GSC', historyDays: 486, lagDays: 2, chunkDays: 120, monthlyTop: false }],
      isConnected: async () => true,
      normalize: (_s, v) => v,
      fetchDaily: async () => [],
      search: async (_t, _s, _p, q) => {
        calls.push(q);
        if (!q.dimensions.length) return [{ keys: [], clicks: 120, impressions: 5000, ctr: 0, position: 8 }];
        if (q.dimensions[0] === 'country') return [{ keys: ['esp'], clicks: 110, impressions: 4500, ctr: 0, position: 7 }];
        const start = q.startRow ?? 0;
        const total = 25_003;
        const n = Math.max(0, Math.min(25_000, total - start));
        return Array.from({ length: n }, (_, i) => ({ keys: [`consulta ${start + i}`, `https://clinica-prueba.es/p${(start + i) % 50}`, i % 2 ? 'DESKTOP' : 'MOBILE'], clicks: (start + i) < 100 ? 1 : 0, impressions: 2, ctr: 0, position: 5 }));
      }
    });
  });

  it('guarda el día completo (paginado), los diccionarios, los totales con clics anónimos y el resumen mensual', async () => {
    const [prop] = await db.insert(gscProperties).values({ tenantId: T, siteUrl: 'sc-domain:clinica-prueba.es', kind: 'dominio' }).returning();
    const res = await syncGscDay({ tenantId: T, heartbeat: async () => undefined, signal: new AbortController().signal }, prop, '2026-11-20');
    expect(res.rows).toBe(25_003);
    expect(calls.filter((q) => q.dimensions.length === 3).map((q) => q.startRow ?? 0)).toEqual([0, 25_000]);
    const [{ n }] = (await db.execute(sql`SELECT count(*)::int AS n FROM gsc_daily WHERE property_id = ${prop.id} AND date = '2026-11-20'`)) as unknown as { n: number }[];
    expect(Number(n)).toBe(25_003);
    expect((await db.select().from(gscQueries).where(eq(gscQueries.propertyId, prop.id))).length).toBe(25_003);
    const [t] = await db.select().from(gscDailyTotals).where(eq(gscDailyTotals.propertyId, prop.id));
    expect([t.clicks, t.queryClicks, t.truncated]).toEqual([120, 100, false]);
    // Repetir el día no duplica (se sustituye).
    await syncGscDay({ tenantId: T, heartbeat: async () => undefined, signal: new AbortController().signal }, prop, '2026-11-20');
    const [{ n: n2 }] = (await db.execute(sql`SELECT count(*)::int AS n FROM gsc_daily WHERE property_id = ${prop.id}`)) as unknown as { n: number }[];
    expect(Number(n2)).toBe(25_003);
    await rollupGscMonth(prop.id, '2026-11-01');
    const monthly = await db.select().from(gscMonthly).where(eq(gscMonthly.propertyId, prop.id));
    expect(monthly.reduce((a, r) => a + r.clicks, 0)).toBe(100);
  }, 60_000);
});

describe('rastreador (base de datos, red simulada)', () => {
  const site: Record<string, Partial<FetchResult>> = {
    'https://clinica-prueba.es/robots.txt': { status: 200, contentType: 'text/plain', body: 'User-agent: *\nDisallow: /admin\nSitemap: https://clinica-prueba.es/sitemap.xml' },
    'https://clinica-prueba.es/sitemap.xml': { status: 200, contentType: 'application/xml', body: '<urlset><url><loc>https://clinica-prueba.es/</loc></url><url><loc>https://clinica-prueba.es/huerfana</loc></url></urlset>' },
    'https://clinica-prueba.es/': { status: 200, contentType: 'text/html', body: '<html><head><title>Inicio</title></head><body><h1>Clínica</h1><a href="/implantes">Implantes</a><a href="/admin">Admin</a><a href="/vieja">Vieja</a></body></html>' },
    'https://clinica-prueba.es/implantes': { status: 200, contentType: 'text/html', body: '<html><head><title>Implantes</title><script type="application/ld+json">{"@type":"Dentist"}</script></head><body><h1>Implantes</h1><a href="/">Inicio</a></body></html>' },
    'https://clinica-prueba.es/vieja': { status: 301, location: '/implantes' },
    'https://clinica-prueba.es/huerfana': { status: 200, contentType: 'text/html', body: '<html><head><title>Huérfana</title></head><body><p>Sin enlaces</p></body></html>' }
  };
  const fetched: string[] = [];
  const fetcher: Fetcher = async (url) => {
    fetched.push(url);
    const r = site[url];
    return { status: r?.status ?? 404, location: r?.location ?? null, contentType: r?.contentType ?? 'text/html', xRobots: null, body: r?.body ?? (r ? null : 'no'), bytes: 100, ms: 1 };
  };

  it('respeta robots, lee el sitemap, registra redirecciones, JSON-LD y enlaces', async () => {
    const [run] = await db.insert(crawlRuns).values({ tenantId: T, projectId: PROJECT, rootUrl: 'https://clinica-prueba.es/' }).returning();
    const r = await crawlSlice({ heartbeat: async () => undefined, signal: new AbortController().signal }, run.id, fetcher, 60_000, 0);
    expect(r.done).toBe(true);
    expect(fetched).not.toContain('https://clinica-prueba.es/admin');
    const pages = await db.select().from(crawlPages).where(eq(crawlPages.runId, run.id));
    const byUrl = Object.fromEntries(pages.map((p) => [p.url, p]));
    expect(Object.keys(byUrl).sort()).toEqual(['https://clinica-prueba.es/', 'https://clinica-prueba.es/huerfana', 'https://clinica-prueba.es/implantes', 'https://clinica-prueba.es/vieja']);
    expect(byUrl['https://clinica-prueba.es/vieja'].redirectTo).toBe('https://clinica-prueba.es/implantes');
    expect(byUrl['https://clinica-prueba.es/implantes'].schemaTypes).toEqual(['Dentist']);
    expect(byUrl['https://clinica-prueba.es/huerfana'].inSitemap).toBe(true);
    const inl = await inlinkCounts(run.id);
    expect(inl.get(byUrl['https://clinica-prueba.es/huerfana'].urlHash) ?? 0).toBe(0);
    expect(inl.get(byUrl['https://clinica-prueba.es/implantes'].urlHash)).toBe(1);
    const [done] = await db.select().from(crawlRuns).where(eq(crawlRuns.id, run.id));
    expect(done.status).toBe('hecho');
  });
});

// Limpieza de lo que crean los tipos de prueba en otros sitios (por si quedara algo).
afterAll(async () => {
  await db.delete(jobs).where(like(jobs.kind, 'test.cim.%'));
});

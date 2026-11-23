// SEO · Salud técnica (Hito 1, 23 nov 2026): reglas de auditoría sobre el rastreo, generador de JSON-LD y, contra la
// base de datos en una cuenta de pruebas propia, la cadena rastreo → auditoría → hallazgos (red simulada).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clients, crawlRuns, findings, jobs, projects, tenants, users } from '@/lib/db/schema';
import { auditCrawl, isIndexable, jsonldNodes, sameUrl, type AuditPage } from '@/lib/seo/salud/audit-rules';
import { SALUD_KINDS } from '@/lib/seo/salud/kinds';
import { buildJsonLd, countryCode, normalizePhone } from '@/lib/seo/salud/jsonld';
import { crawlSlice, type FetchResult, type Fetcher } from '@/lib/core/crawler';
import { auditFinishedCrawl, registerSaludAudit, SALUD_SOURCE } from '@/lib/seo/salud/audit';
import { decideFinding } from '@/lib/core/findings';

const page = (url: string, extra: Partial<AuditPage> = {}): AuditPage => ({
  url,
  urlHash: url,
  statusCode: 200,
  redirectTo: null,
  contentType: 'text/html',
  title: `Título ${url}`,
  metaDescription: `Descripción ${url}`,
  h1: ['H1'],
  canonical: null,
  robotsMeta: null,
  xRobots: null,
  wordCount: 600,
  contentHash: `hash-${url}`,
  simhash: null,
  depth: 1,
  inSitemap: true,
  jsonld: null,
  schemaTypes: null,
  imagesWithoutAlt: 0,
  error: null,
  ...extra
});
const ROOT = 'https://web.es/';
const kinds = (fs: { kind: string }[]) => fs.map((f) => f.kind).sort();

describe('Salud: reglas de auditoría', () => {
  it('cada tipo es único, empieza por seo. y tiene explicación', () => {
    const keys = SALUD_KINDS.map((k) => k.kind);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of SALUD_KINDS) {
      expect(k.kind.startsWith('seo.')).toBe(true);
      expect(k.explain.length).toBeGreaterThan(20);
    }
  });

  it('una web sana con su negocio marcado no da hallazgos', () => {
    const org = { '@context': 'https://schema.org', '@type': 'Dentist', name: 'X', url: ROOT, address: { '@type': 'PostalAddress' }, telephone: '+34' };
    const pages = [page(ROOT, { depth: 0, jsonld: [org] }), page('https://web.es/a')];
    const out = auditCrawl({ rootUrl: ROOT, pages, inlinks: new Map([['https://web.es/a', 1]]), truncated: false });
    expect(out).toEqual([]);
  });

  it('errores, redirecciones, sitemap y canonical', () => {
    const pages = [
      page(ROOT, { depth: 0 }),
      page('https://web.es/rota', { statusCode: 404, contentType: 'text/html', inSitemap: false }),
      page('https://web.es/caida', { statusCode: 503 }),
      page('https://web.es/r1', { statusCode: 301, redirectTo: 'https://web.es/r2', inSitemap: false }),
      page('https://web.es/r2', { statusCode: 301, redirectTo: ROOT, inSitemap: true }),
      page('https://web.es/noidx', { robotsMeta: 'noindex, follow' }),
      page('https://web.es/variante', { canonical: 'https://web.es/r2' })
    ];
    const inlinks = new Map([
      ['https://web.es/rota', 3],
      ['https://web.es/r1', 2]
    ]);
    const out = auditCrawl({ rootUrl: ROOT, pages, inlinks, truncated: false });
    const k = kinds(out);
    expect(k).toContain('seo.http_4xx');
    expect(k).toContain('seo.http_5xx');
    expect(k).toContain('seo.redirect_chain');
    expect(k).toContain('seo.link_to_redirect');
    expect(k).toContain('seo.non200_in_sitemap');
    expect(k).toContain('seo.noindex_in_sitemap');
    expect(k).toContain('seo.canonical_broken');
    // Una página noindex o una variante no cuentan para títulos ni contenido.
    expect(out.filter((f) => f.url === 'https://web.es/noidx').map((f) => f.kind)).toEqual(['seo.noindex_in_sitemap']);
    expect(out.find((f) => f.kind === 'seo.http_4xx')?.value).toBe(3);
  });

  it('una 404 que nadie enlaza ni está en el sitemap no es un hallazgo', () => {
    const out = auditCrawl({ rootUrl: ROOT, pages: [page(ROOT, { depth: 0, jsonld: [{ '@type': 'Organization', name: 'X', url: ROOT }] }), page('https://web.es/x', { statusCode: 404, inSitemap: false })], inlinks: new Map(), truncated: false });
    expect(kinds(out)).toEqual([]);
  });

  it('títulos, descripciones, H1, contenido y duplicados', () => {
    const pages = [
      page(ROOT, { depth: 0 }),
      page('https://web.es/a', { title: 'Igual', metaDescription: null, h1: [] }),
      page('https://web.es/b', { title: 'Igual', h1: ['uno', 'dos'], wordCount: 80, contentHash: 'dup', imagesWithoutAlt: 4 }),
      page('https://web.es/c', { title: null, contentHash: 'dup', wordCount: 80 }),
      page('https://web.es/d', { title: 'x'.repeat(80), depth: 6 })
    ];
    const inlinks = new Map(pages.map((p) => [p.urlHash, 1]));
    const out = auditCrawl({ rootUrl: ROOT, pages, inlinks, truncated: false });
    const k = kinds(out);
    for (const kind of ['seo.title_duplicate', 'seo.meta_description_missing', 'seo.h1_missing', 'seo.h1_multiple', 'seo.thin_content', 'seo.duplicate_content', 'seo.images_without_alt', 'seo.title_missing', 'seo.title_long', 'seo.deep_page']) {
      expect(k).toContain(kind);
    }
    expect(out.filter((f) => f.kind === 'seo.title_duplicate')).toHaveLength(1);
    expect(out.find((f) => f.kind === 'seo.duplicate_content')?.value).toBe(2);
  });

  it('casi duplicados por simhash (≤ 3 bits) y sin repetir la pareja', () => {
    const pages = [
      page(ROOT, { depth: 0 }),
      page('https://web.es/madrid', { simhash: 'ffffffffffffffff', wordCount: 400 }),
      page('https://web.es/sevilla', { simhash: 'fffffffffffffffe', wordCount: 400 }),
      page('https://web.es/otra', { simhash: '0000000000000000', wordCount: 400 })
    ];
    const out = auditCrawl({ rootUrl: ROOT, pages, inlinks: new Map(pages.map((p) => [p.urlHash, 1])), truncated: false });
    const near = out.filter((f) => f.kind === 'seo.near_duplicate');
    expect(near).toHaveLength(1);
    expect(near[0].evidence?.other).toBe('https://web.es/sevilla');
  });

  it('huérfanas solo si el rastreo fue completo; la portada nunca es huérfana', () => {
    const pages = [page(ROOT, { depth: 0 }), page('https://web.es/sola')];
    expect(kinds(auditCrawl({ rootUrl: ROOT, pages, inlinks: new Map(), truncated: false }))).toContain('seo.orphan_in_sitemap');
    expect(auditCrawl({ rootUrl: ROOT, pages, inlinks: new Map(), truncated: false }).filter((f) => f.kind === 'seo.orphan_in_sitemap').map((f) => f.url)).toEqual(['https://web.es/sola']);
    expect(kinds(auditCrawl({ rootUrl: ROOT, pages, inlinks: new Map(), truncated: true }))).not.toContain('seo.orphan_in_sitemap');
  });

  it('sitemap ausente, negocio sin marcar, FAQ y reseñas propias', () => {
    const pages = [
      page(ROOT, { depth: 0, inSitemap: false, jsonld: [{ '@context': 'https://schema.org', '@graph': [{ '@type': 'FAQPage' }] }] }),
      page('https://web.es/b', { inSitemap: false, jsonld: { '@type': 'LocalBusiness', name: 'X', aggregateRating: { ratingValue: 5 } } })
    ];
    const out = auditCrawl({ rootUrl: ROOT, pages, inlinks: new Map([['https://web.es/b', 1]]), truncated: false });
    const k = kinds(out);
    expect(k).toContain('seo.sitemap_missing');
    expect(k).toContain('seo.schema_faq');
    expect(k).toContain('seo.schema_self_reviews');
    expect(k).toContain('seo.schema_fields_missing');
    expect(out.find((f) => f.kind === 'seo.schema_fields_missing')?.evidence?.missing).toEqual(['url', 'address', 'telephone']);
    const sinNegocio = auditCrawl({ rootUrl: ROOT, pages: [page(ROOT, { depth: 0 })], inlinks: new Map(), truncated: false });
    expect(kinds(sinNegocio)).toEqual(['seo.schema_org_missing']);
  });

  it('cruce con Search Console: con impresiones y sin rastrear; informativo si el rastreo se cortó', () => {
    const pages = [page(ROOT, { depth: 0, jsonld: [{ '@type': 'Organization', name: 'X', url: ROOT }] })];
    const gscPages = [
      { url: 'https://web.es/antigua', impressions: 300, clicks: 4 },
      { url: 'https://web.es', impressions: 900, clicks: 50 },
      { url: 'https://web.es/poca', impressions: 3, clicks: 0 }
    ];
    const out = auditCrawl({ rootUrl: ROOT, pages, inlinks: new Map(), truncated: false, gscPages });
    expect(out.map((f) => f.url)).toEqual(['https://web.es/antigua']);
    expect(out[0].severity).toBeUndefined();
    expect(auditCrawl({ rootUrl: ROOT, pages, inlinks: new Map(), truncated: true, gscPages })[0].severity).toBe('info');
  });

  it('las claves son estables entre ejecuciones', () => {
    const pages = [page(ROOT, { depth: 0 }), page('https://web.es/a', { title: null })];
    const a = auditCrawl({ rootUrl: ROOT, pages, inlinks: new Map([['https://web.es/a', 1]]), truncated: false });
    const b = auditCrawl({ rootUrl: ROOT, pages, inlinks: new Map([['https://web.es/a', 1]]), truncated: false });
    expect(a.map((f) => f.dedupeKey)).toEqual(b.map((f) => f.dedupeKey));
    for (const f of a) expect(f.dedupeKey.length).toBeLessThanOrEqual(300);
  });

  it('utilidades: sameUrl, isIndexable y nodos JSON-LD', () => {
    expect(sameUrl('https://Web.es/a/', 'https://web.es/a#x')).toBe(true);
    expect(sameUrl('https://web.es/a', 'https://web.es/b')).toBe(false);
    expect(isIndexable(page('https://web.es/a', { canonical: 'https://web.es/a/' }))).toBe(true);
    expect(isIndexable(page('https://web.es/a', { xRobots: 'noindex' }))).toBe(false);
    expect(jsonldNodes([{ '@graph': [{ '@type': 'A' }, { '@type': ['B', 'C'] }] }]).length).toBe(2);
  });
});

describe('Salud: generador de JSON-LD', () => {
  const base = {
    client: { name: 'CM Ibérica', legalName: 'CM Ibérica S.L.', summary: 'Empresa de pruebas', logoUrl: 'https://cm.es/logo.png' },
    webUrl: 'cm.es/inicio',
    businessType: 'HomeAndConstructionBusiness',
    locations: [
      { name: 'Valencia', address: 'Calle Mayor 1', city: 'Valencia', postalCode: '46001', region: 'Valencia', country: 'España', phone: '961 23 45 67', isPrimary: false },
      { name: 'Central', address: 'Av. Sol 2', city: 'Madrid', postalCode: '28001', region: 'Madrid', country: 'España', phone: '911234567', isPrimary: true }
    ],
    socials: ['https://instagram.com/cm']
  };
  const parse = (code: string) => JSON.parse(code.replace(/^<script[^>]*>\n/, '').replace(/\n<\/script>$/, ''));

  it('negocio y web en un @graph, con la sede principal y los perfiles', () => {
    const out = buildJsonLd(base);
    expect(out.missing).toEqual([]);
    expect(out.blocks).toHaveLength(2);
    const g = parse(out.blocks[0].code)['@graph'];
    expect(g[0]['@type']).toBe('HomeAndConstructionBusiness');
    expect(g[0].url).toBe('https://cm.es/');
    expect(g[0].address.addressLocality).toBe('Madrid');
    expect(g[0].address.addressCountry).toBe('ES');
    expect(g[0].telephone).toBe('+34911234567');
    expect(g[0].sameAs).toEqual(['https://instagram.com/cm']);
    expect(g[1]['@type']).toBe('WebSite');
    const local = parse(out.blocks[1].code);
    expect(local.address.addressLocality).toBe('Valencia');
    expect(local.parentOrganization['@id']).toBe('https://cm.es/#organizacion');
  });

  it('nunca genera FAQ ni reseñas, y un tipo desconocido cae en LocalBusiness', () => {
    const out = buildJsonLd({ ...base, businessType: 'FAQPage' });
    const all = out.blocks.map((b) => b.code).join('\n');
    expect(all).not.toMatch(/FAQPage|aggregateRating|"review"/);
    expect(parse(out.blocks[0].code)['@graph'][0]['@type']).toBe('LocalBusiness');
  });

  it('lo que falta en la ficha se avisa y no se inventa', () => {
    const out = buildJsonLd({ client: { name: 'Sin datos', legalName: null, summary: null, logoUrl: null }, webUrl: null, businessType: 'LocalBusiness', locations: [], socials: [] });
    expect(out.missing.length).toBe(4);
    const g = parse(out.blocks[0].code)['@graph'];
    expect(g[0]).toEqual({ '@type': 'LocalBusiness', name: 'Sin datos' });
  });

  it('una empresa sin atención al público no lleva dirección ni exige local', () => {
    const out = buildJsonLd({ ...base, businessType: 'Organization' });
    expect(out.blocks).toHaveLength(1);
    expect(parse(out.blocks[0].code)['@graph'][0].address).toBeUndefined();
  });

  it('país y teléfono', () => {
    expect(countryCode('España')).toBe('ES');
    expect(countryCode('pt')).toBe('PT');
    expect(countryCode(null)).toBeNull();
    expect(normalizePhone('600 11 22 33')).toBe('+34600112233');
    expect(normalizePhone('0034 911 234 567')).toBe('+34911234567');
    expect(normalizePhone('+44 20 1234 5678')).toBe('+442012345678');
  });
});

// --- Base de datos: rastreo simulado → auditoría → hallazgos ----------------------------------------------------------
const SLUG = 'pruebas-seo-salud';
let T = '';
let PROJECT = '';

async function cleanup() {
  const [t] = await db.select().from(tenants).where(eq(tenants.slug, SLUG));
  if (!t) return;
  const pids = (await db.select({ id: projects.id }).from(projects).where(eq(projects.tenantId, t.id))).map((p) => p.id);
  if (pids.length) {
    await db.delete(findings).where(inArray(findings.projectId, pids));
    await db.delete(crawlRuns).where(inArray(crawlRuns.projectId, pids));
    await db.delete(projects).where(inArray(projects.id, pids));
  }
  await db.delete(jobs).where(eq(jobs.tenantId, t.id));
  await db.delete(clients).where(eq(clients.tenantId, t.id));
  await db.delete(users).where(eq(users.tenantId, t.id));
  await db.delete(tenants).where(eq(tenants.id, t.id));
}

beforeAll(async () => {
  registerSaludAudit();
  await cleanup();
  const [t] = await db.insert(tenants).values({ name: 'Pruebas SEO salud', slug: SLUG }).returning();
  T = t.id;
  const [u] = await db.insert(users).values({ tenantId: T, name: 'Prueba', email: 'pruebas-seo-salud@kijutech.test', passwordHash: 'x' }).returning();
  const [c] = await db.insert(clients).values({ tenantId: T, name: 'Web de prueba' }).returning();
  const [p] = await db.insert(projects).values({ tenantId: T, name: 'SEO', clientId: c.id, createdBy: u.id }).returning();
  PROJECT = p.id;
});
afterAll(cleanup);

describe('Salud: rastreo → auditoría → hallazgos (base de datos, red simulada)', () => {
  const site: Record<string, Partial<FetchResult>> = {
    'https://web-prueba.es/robots.txt': { status: 200, contentType: 'text/plain', body: 'User-agent: *\nSitemap: https://web-prueba.es/sitemap.xml' },
    'https://web-prueba.es/sitemap.xml': { status: 200, contentType: 'application/xml', body: '<urlset><url><loc>https://web-prueba.es/</loc></url><url><loc>https://web-prueba.es/huerfana</loc></url></urlset>' },
    'https://web-prueba.es/': { status: 200, contentType: 'text/html', body: '<html><head><title>Inicio</title></head><body><h1>Inicio</h1><a href="/vieja">Servicios</a><a href="/rota">Rota</a></body></html>' },
    'https://web-prueba.es/vieja': { status: 301, location: '/servicios' },
    'https://web-prueba.es/servicios': { status: 200, contentType: 'text/html', body: '<html><head><title>Servicios</title><meta name="description" content="d"></head><body><h1>Servicios</h1><a href="/">Inicio</a></body></html>' },
    'https://web-prueba.es/huerfana': { status: 200, contentType: 'text/html', body: '<html><head><title>Huérfana</title></head><body><h1>H</h1></body></html>' }
  };
  const fetcher: Fetcher = async (url) => {
    const r = site[url];
    return { status: r?.status ?? 404, location: r?.location ?? null, contentType: r?.contentType ?? 'text/html', xRobots: null, body: r?.body ?? (r ? null : 'no'), bytes: 100, ms: 1 };
  };
  const ctx = { heartbeat: async () => undefined, signal: new AbortController().signal };

  it('crea los hallazgos, respeta lo descartado y resuelve lo arreglado', async () => {
    const [run] = await db.insert(crawlRuns).values({ tenantId: T, projectId: PROJECT, rootUrl: 'https://web-prueba.es/' }).returning();
    expect((await crawlSlice(ctx, run.id, fetcher, 60_000, 0)).done).toBe(true);
    const [done] = await db.select().from(crawlRuns).where(eq(crawlRuns.id, run.id));
    const r1 = await auditFinishedCrawl(T, PROJECT, done);
    expect(r1.created).toBeGreaterThan(0);
    const rows = await db.select().from(findings).where(and(eq(findings.projectId, PROJECT), eq(findings.source, SALUD_SOURCE)));
    const k = kinds(rows);
    expect(k).toContain('seo.http_4xx');
    expect(k).toContain('seo.link_to_redirect');
    expect(k).toContain('seo.orphan_in_sitemap');
    expect(k).toContain('seo.schema_org_missing');
    expect(rows.find((f) => f.kind === 'seo.orphan_in_sitemap')?.url).toBe('https://web-prueba.es/huerfana');

    // Se descarta la huérfana y se «arregla» la rota: la siguiente auditoría no reabre la primera y resuelve la segunda.
    const orphan = rows.find((f) => f.kind === 'seo.orphan_in_sitemap')!;
    await decideFinding(T, orphan.id, 'descartado', 'prueba', 'landing de campaña');
    site['https://web-prueba.es/'] = { ...site['https://web-prueba.es/'], body: '<html><head><title>Inicio</title></head><body><h1>Inicio</h1><a href="/vieja">Servicios</a></body></html>' };
    const [run2] = await db.insert(crawlRuns).values({ tenantId: T, projectId: PROJECT, rootUrl: 'https://web-prueba.es/' }).returning();
    await crawlSlice(ctx, run2.id, fetcher, 60_000, 0);
    const [done2] = await db.select().from(crawlRuns).where(eq(crawlRuns.id, run2.id));
    await auditFinishedCrawl(T, PROJECT, done2);
    const after = await db.select().from(findings).where(and(eq(findings.projectId, PROJECT), eq(findings.source, SALUD_SOURCE)));
    expect(after.find((f) => f.id === orphan.id)?.status).toBe('descartado');
    expect(after.find((f) => f.kind === 'seo.http_4xx')?.status).toBe('resuelto');
  });
});

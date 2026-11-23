import 'server-only';

// SEO · Expediente provisional: recogida de datos (Hito 1, 23 nov 2026). Sin IA y sin intervención:
//   - ficha del cliente (núcleo): nombre, web, teléfono y dirección del local principal, tipo de negocio, redes, logo;
//   - la web: página de inicio (JSON-LD, enlaces tel:, redes, título), con el lector seguro del núcleo (solo webs públicas);
//   - el archivo de Internet (Wayback): primera vez archivada;
//   - Search Console (núcleo): desde cuándo hay datos, búsquedas de la marca y páginas con impresiones.
// Cada dato queda con su origen y su confianza (rules.ts). Si un dato cambia, vuelve a «provisional» para revisarlo.
import { and, asc, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clientAssets, clientLocations, clients, crawlPages, projects, seoDossierFacts } from '@/lib/db/schema';
import { enqueueJob, registerJobKind } from '@/lib/core/jobs';
import { syncFindings } from '@/lib/core/findings';
import { fetchPublic } from '@/lib/core/net';
import { gscPropertiesForProject } from '@/lib/core/gsc';
import { BUSINESS_TYPE_SET } from '@/lib/core/business-types';
import { latestProjectCrawl, projectWebUrl } from '@/lib/seo/salud/audit';
import { isIndexable, type AuditPage } from '@/lib/seo/salud/audit-rules';
import { LOCAL_KINDS } from '@/lib/seo/salud/kinds';
import { auditLocal, LOCAL_SOURCE, parseServices } from '@/lib/seo/local/rules';
import { brandTokens, extractFromHome, host, isBrandQuery, normPhone, scoreFacts, type FactDraft } from '@/lib/seo/expediente/rules';

const SOCIAL_KINDS = ['instagram', 'meta', 'linkedin', 'youtube', 'tiktok'];
const UA = 'Mozilla/5.0 (compatible; KijutechBot/1.0; +https://kijutech.com)';

async function readText(url: string, maxBytes: number, timeoutMs: number): Promise<{ url: string; text: string } | null> {
  try {
    const r = await fetchPublic(url, { headers: { 'user-agent': UA, accept: 'text/html,application/json;q=0.9,*/*;q=0.5' }, signal: AbortSignal.timeout(timeoutMs) });
    if ('error' in r || !r.res.ok) return null;
    const buf = await r.res.arrayBuffer();
    return { url: r.url, text: new TextDecoder('utf-8').decode(buf.slice(0, maxBytes)) };
  } catch {
    return null;
  }
}

async function fichaFacts(tenantId: string, projectId: string, clientId: string): Promise<{ facts: FactDraft[]; names: string[] }> {
  const [c] = await db.select().from(clients).where(and(eq(clients.id, clientId), eq(clients.tenantId, tenantId))).limit(1);
  if (!c) return { facts: [], names: [] };
  const [locs, socials, web] = await Promise.all([
    db.select().from(clientLocations).where(and(eq(clientLocations.clientId, clientId), eq(clientLocations.tenantId, tenantId))).orderBy(asc(clientLocations.createdAt)),
    db.select({ value: clientAssets.value }).from(clientAssets).where(and(eq(clientAssets.clientId, clientId), eq(clientAssets.tenantId, tenantId), inArray(clientAssets.kind, SOCIAL_KINDS))),
    projectWebUrl(tenantId, projectId)
  ]);
  const primary = [...locs].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))[0];
  const facts: FactDraft[] = [{ field: 'nombre', value: c.name, source: 'ficha' }];
  if (web) facts.push({ field: 'web', value: web, source: 'ficha' });
  const tel = normPhone(primary?.phone ?? null);
  if (tel) facts.push({ field: 'telefono', value: tel, source: 'ficha' });
  if (primary && (primary.address || primary.city)) facts.push({ field: 'direccion', value: { street: primary.address, city: primary.city, postalCode: primary.postalCode, region: primary.region, country: primary.country }, source: 'ficha' });
  if (c.businessType) facts.push({ field: 'tipo_negocio', value: c.businessType, source: 'ficha' });
  const s = socials.map((x) => x.value?.trim() ?? '').filter((v) => /^https?:\/\//i.test(v));
  if (s.length) facts.push({ field: 'perfiles', value: s, source: 'ficha' });
  if (c.logoUrl) facts.push({ field: 'logo', value: c.logoUrl, source: 'ficha' });
  return { facts, names: [c.name, ...(c.aliases ?? [])] };
}

async function webFacts(web: string): Promise<FactDraft[]> {
  const home = await readText(web, 2_000_000, 25_000);
  if (!home) return [];
  const title = home.text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, ' ').trim() ?? null;
  const facts = extractFromHome({ url: home.url, html: home.text, title }, BUSINESS_TYPE_SET);
  facts.push({ field: 'web', value: home.url, source: 'web', sourceRef: web });
  return facts;
}

/** Primera captura en el archivo de Internet (CDX de Wayback). */
async function waybackFacts(web: string): Promise<FactDraft[]> {
  const h = host(web);
  if (!h) return [];
  const r = await readText(`https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(h)}&limit=1&output=json&fl=timestamp`, 50_000, 20_000);
  if (!r) return [];
  try {
    const rows = JSON.parse(r.text) as string[][];
    const ts = rows[1]?.[0];
    if (!ts || !/^\d{8}/.test(ts)) return [];
    const date = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
    return [{ field: 'primera_fecha_web', value: date, source: 'wayback', sourceRef: `https://web.archive.org/web/${ts}/${h}` }];
  } catch {
    return [];
  }
}

async function gscFacts(tenantId: string, projectId: string, names: string[]): Promise<FactDraft[]> {
  const props = await gscPropertiesForProject(tenantId, projectId);
  if (!props.length) return [];
  const facts: FactDraft[] = [];
  const first = props.map((p) => p.firstDate).filter(Boolean).sort()[0];
  if (first) facts.push({ field: 'datos_search_console', value: first, source: 'gsc', sourceRef: props.map((p) => p.siteUrl).join(', ') });
  const ids = props.map((p) => p.id);
  const idList = sql.join(ids.map((i) => sql`${i}`), sql`, `);
  const queries = (await db.execute(sql`
    SELECT q.query, sum(d.clicks)::int AS clicks, sum(d.impressions)::int AS impressions
    FROM gsc_daily d JOIN gsc_queries q ON q.id = d.query_id
    WHERE d.property_id IN (${idList}) AND d.search_type = 1 AND d.date >= current_date - 90
    GROUP BY q.query ORDER BY 3 DESC LIMIT 3000`)) as unknown as { query: string; clicks: number; impressions: number }[];
  const tokens = brandTokens(names);
  if (tokens.length && queries.length) {
    const brand = queries.filter((q) => isBrandQuery(q.query, tokens));
    const clicks = brand.reduce((s, q) => s + Number(q.clicks), 0);
    const impressions = brand.reduce((s, q) => s + Number(q.impressions), 0);
    facts.push({ field: 'marca_en_google', value: { busquedas: brand.length, clics: clicks, impresiones: impressions, ejemplos: brand.slice(0, 5).map((q) => q.query) }, source: 'gsc' });
  }
  const [pages] = (await db.execute(sql`
    SELECT count(DISTINCT d.page_id)::int AS n FROM gsc_daily d
    WHERE d.property_id IN (${idList}) AND d.search_type = 1 AND d.date >= current_date - 90 AND d.impressions > 0`)) as unknown as { n: number }[];
  if (pages) facts.push({ field: 'paginas_con_impresiones', value: Number(pages.n), source: 'gsc' });
  // El dominio de la propiedad cuenta como señal de identidad (Google verificó que es del cliente).
  const dom = props.map((p) => host(p.siteUrl)).find(Boolean);
  if (dom) facts.push({ field: 'web', value: dom, source: 'gsc', sourceRef: props[0].siteUrl });
  return facts;
}

/** Recoge todo y pone al día el expediente del proyecto. */
export async function collectDossier(tenantId: string, projectId: string): Promise<{ facts: number; sources: string[]; local?: { created: number; resolved: number } }> {
  const [p] = await db.select({ clientId: projects.clientId }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  if (!p?.clientId) return { facts: 0, sources: [] };
  const { facts: ficha, names } = await fichaFacts(tenantId, projectId, p.clientId);
  const web = await projectWebUrl(tenantId, projectId);
  const [w, wb, g] = await Promise.all([web ? webFacts(web) : [], web ? waybackFacts(web) : [], gscFacts(tenantId, projectId, names)]);
  // Lo que una persona ya escribió cuenta para la confianza de los demás.
  const persona = await db
    .select({ field: seoDossierFacts.field, value: seoDossierFacts.value })
    .from(seoDossierFacts)
    .where(and(eq(seoDossierFacts.projectId, projectId), eq(seoDossierFacts.source, 'persona')));
  const drafts: FactDraft[] = [...ficha, ...w, ...wb, ...g];
  const scored = scoreFacts<FactDraft>([...drafts, ...persona.map((x): FactDraft => ({ field: x.field, value: x.value, source: 'persona' }))]).filter((f) => f.source !== 'persona');
  for (const f of scored) {
    const value = JSON.stringify(f.value ?? null);
    await db
      .insert(seoDossierFacts)
      .values({ tenantId, projectId, field: f.field, value: f.value as object, source: f.source, sourceRef: f.sourceRef ?? null, confidence: f.confidence })
      .onConflictDoUpdate({
        target: [seoDossierFacts.projectId, seoDossierFacts.field, seoDossierFacts.source],
        set: {
          value: sql`${value}::jsonb`,
          sourceRef: f.sourceRef ?? null,
          confidence: f.confidence,
          // Si el dato cambió, vuelve a revisión; si no, se respeta lo decidido.
          status: sql`CASE WHEN ${seoDossierFacts.value} = ${value}::jsonb THEN ${seoDossierFacts.status} ELSE 'provisional' END`,
          decidedBy: sql`CASE WHEN ${seoDossierFacts.value} = ${value}::jsonb THEN ${seoDossierFacts.decidedBy} ELSE NULL END`,
          updatedAt: new Date()
        }
      });
  }
  // Lo automático que ya no aparece (p. ej. se quitó el teléfono de la web) se borra si nadie lo había decidido.
  const produced = scored.map((f) => `${f.field}:${f.source}`);
  await db.delete(seoDossierFacts).where(
    and(
      eq(seoDossierFacts.projectId, projectId),
      eq(seoDossierFacts.status, 'provisional'),
      notInArray(seoDossierFacts.source, ['persona']),
      produced.length ? sql`(${seoDossierFacts.field} || ':' || ${seoDossierFacts.source}) NOT IN (${sql.join(produced.map((x) => sql`${x}`), sql`, `)})` : sql`true`
    )
  );
  const local = await checkLocal(tenantId, projectId, p.clientId);
  return { facts: scored.length, sources: [...new Set(scored.map((f) => f.source))], local };
}

/**
 * Local sin Places: coherencia del nombre, dirección y teléfono entre la ficha y la web, y una página por servicio de la
 * ficha (con el último rastreo terminado). Hallazgos con su propia fuente; al cambiar algo, el plan se rehace.
 */
async function checkLocal(tenantId: string, projectId: string, clientId: string): Promise<{ created: number; resolved: number }> {
  const [[c], facts, crawl] = await Promise.all([
    db.select({ offerings: clients.offerings, businessType: clients.businessType }).from(clients).where(and(eq(clients.id, clientId), eq(clients.tenantId, tenantId))).limit(1),
    db.select({ field: seoDossierFacts.field, value: seoDossierFacts.value, source: seoDossierFacts.source, status: seoDossierFacts.status, sourceRef: seoDossierFacts.sourceRef }).from(seoDossierFacts).where(eq(seoDossierFacts.projectId, projectId)),
    latestProjectCrawl(projectId)
  ]);
  let pages = null;
  if (crawl?.status === 'hecho') {
    const rows = (await db.select().from(crawlPages).where(eq(crawlPages.runId, crawl.id))) as unknown as AuditPage[];
    pages = rows.map((r) => ({ url: r.url, title: r.title, h1: r.h1, indexable: isIndexable(r) }));
  }
  const found = auditLocal({ facts, services: parseServices(c?.offerings), pages, isOrganization: c?.businessType === 'Organization' });
  const r = await syncFindings(tenantId, projectId, LOCAL_SOURCE, found, LOCAL_KINDS.map((k) => k.kind));
  if (r.created || r.resolved) {
    await enqueueJob({ tenantId, kind: 'seo.plan.regenerate', payload: { projectId }, scopeType: 'proyecto', scopeId: projectId, priority: 5, dedupeKey: `seo.plan:${projectId}` });
  }
  return { created: r.created, resolved: r.resolved };
}

export async function enqueueDossier(tenantId: string, projectId: string, delayMinutes = 0): Promise<void> {
  await enqueueJob({
    tenantId,
    kind: 'seo.expediente.collect',
    payload: { projectId },
    scopeType: 'proyecto',
    scopeId: projectId,
    priority: 5,
    runAt: new Date(Date.now() + delayMinutes * 60_000),
    // Uno por proyecto mientras esté en cola o en marcha: pulsar dos veces no duplica.
    dedupeKey: `seo.expediente:${projectId}`
  });
}

let registered = false;
export function registerDossierJobs(): void {
  if (registered) return;
  registered = true;
  registerJobKind({
    kind: 'seo.expediente.collect',
    timeoutS: 120,
    maxConcurrent: 2,
    maxAttempts: 2,
    run: async (ctx, payload) => collectDossier(ctx.tenantId, String(payload.projectId ?? ''))
  });
}

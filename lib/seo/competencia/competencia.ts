import 'server-only';

// SEO · Competencia (Hito 2, 24 nov 2026; docs/DISENO-TECNICO-HITO2.md §1). Busca en Google (fuente de búsquedas del
// núcleo: DataForSEO, registrada por Agentes) las búsquedas semilla del proyecto y propone los dominios que más salen.
// Se guardan en la lista de competidores del cliente (núcleo, client_competitors) como «propuesto»: una persona confirma.
// Lo confirmado o descartado nunca lo cambia la búsqueda; solo se ponen al día sus datos.
import { and, asc, desc, eq, gte, inArray, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clientCompetitors, clientLocations, clients, crawlPages, crawlRuns, projects, seoTopics } from '@/lib/db/schema';
import { lastCrawl, startCrawl } from '@/lib/core/crawler';
import { serpSource } from '@/lib/core/capabilities';
import { enqueueJob, registerJobKind } from '@/lib/core/jobs';
import { projectWebUrl } from '@/lib/seo/salud/audit';
import { host } from '@/lib/seo/expediente/rules';
import { parseServices } from '@/lib/seo/local/rules';
import { rankCompetitors, rootDomain, seedQueries } from '@/lib/seo/competencia/rules';
import {
  COMPETITOR_PAGES,
  MAX_CRAWLED_COMPETITORS,
  RECRAWL_DAYS,
  compareSites,
  gapQueries,
  ownPositions,
  siteProfile,
  type CrawledPage,
  type SiteProfile
} from '@/lib/seo/competencia/compare';

const MAX_SEARCHES = 15;

export class CompetenciaError extends Error {
  constructor(public userMessage: string) {
    super(userMessage);
  }
}

export async function findCompetitors(tenantId: string, projectId: string): Promise<{ searches: number; candidates: number; created: number; costUsd: number; clienteSale: number }> {
  const src = serpSource();
  if (!src || !(await src.isConnected(tenantId))) throw new CompetenciaError('DataForSEO no está conectado (Agentes → Integraciones): hace falta para ver quién sale en Google.');
  const [p] = await db
    .select({ clientId: projects.clientId, offerings: clients.offerings })
    .from(projects)
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
    .limit(1);
  if (!p?.clientId) throw new CompetenciaError('El proyecto no tiene cliente.');
  const [topics, [loc], web] = await Promise.all([
    db
      .select({ name: seoTopics.name, metrics: seoTopics.metrics })
      .from(seoTopics)
      .where(and(eq(seoTopics.projectId, projectId), eq(seoTopics.status, 'activo')))
      .orderBy(desc(sql`(${seoTopics.metrics}->>'impresiones')::float`))
      .limit(40),
    db.select({ city: clientLocations.city }).from(clientLocations).where(eq(clientLocations.clientId, p.clientId)).orderBy(desc(clientLocations.isPrimary), asc(clientLocations.createdAt)).limit(1),
    projectWebUrl(tenantId, projectId)
  ]);
  const seeds = seedQueries(
    {
      topics: topics.map((t) => ({ name: t.name, isBrand: Number((t.metrics as Record<string, number | null>).marca ?? 0) > 0, impressions: Number((t.metrics as Record<string, number | null>).impresiones ?? 0) })),
      services: parseServices(p.offerings),
      city: loc?.city ?? null
    },
    MAX_SEARCHES
  );
  if (!seeds.length) throw new CompetenciaError('No hay búsquedas de partida: calcula antes el mapa de palabras o pon los servicios en la ficha («Qué vende u ofrece»).');
  const results = [];
  let cost = 0;
  for (const q of seeds) {
    const serp = await src.search(tenantId, { keyword: q, location: 'Spain', language: 'es', depth: 20 });
    cost += serp.costUsd ?? 0;
    results.push({ query: q, serp });
  }
  const own = [host(web)].filter((x): x is string => Boolean(x));
  const candidates = rankCompetitors(results, own);
  const ownPos = ownPositions(results, own);

  const existing = await db.select().from(clientCompetitors).where(and(eq(clientCompetitors.clientId, p.clientId), eq(clientCompetitors.tenantId, tenantId)));
  const byDomain = new Map(existing.filter((c) => c.domain).map((c) => [rootDomain(c.domain!.replace(/^https?:\/\//, '').split('/')[0]), c]));
  let created = 0;
  for (const c of candidates) {
    const evidence = { busquedas: c.queries, apariciones: c.appearances, de: results.length, posicionMedia: c.avgPosition, enPaqueteLocal: c.inLocalPack, valoracion: c.rating, resenas: c.reviews, huecos: gapQueries(c.queries, ownPos) };
    const ex = byDomain.get(c.domain);
    if (ex) {
      await db.update(clientCompetitors).set({ evidence, lastSeen: new Date(), projectId: ex.projectId ?? projectId }).where(eq(clientCompetitors.id, ex.id));
    } else {
      await db.insert(clientCompetitors).values({
        tenantId,
        clientId: p.clientId,
        projectId,
        name: (c.localName ?? c.domain).slice(0, 255),
        domain: c.domain,
        source: c.inLocalPack > 0 && c.appearances <= c.inLocalPack ? 'local' : 'serp',
        status: 'propuesto',
        kind: c.kind,
        evidence,
        lastSeen: new Date()
      });
      created++;
    }
  }
  const ownSeen = Object.values(ownPos).filter((x) => x != null).length;
  return { searches: results.length, candidates: candidates.length, created, costUsd: Math.round(cost * 1000) / 1000, clienteSale: ownSeen };
}

/** Competidores que se comparan: los confirmados y directos (no directorios), con dominio; los que más salen primero. */
async function comparedCompetitors(tenantId: string, projectId: string) {
  const [p] = await db.select({ clientId: projects.clientId }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  if (!p?.clientId) return [];
  const rows = await db
    .select({ id: clientCompetitors.id, domain: clientCompetitors.domain, evidence: clientCompetitors.evidence })
    .from(clientCompetitors)
    .where(and(eq(clientCompetitors.clientId, p.clientId), eq(clientCompetitors.tenantId, tenantId), eq(clientCompetitors.status, 'confirmado'), eq(clientCompetitors.kind, 'directo')));
  return rows
    .map((r) => ({ id: r.id, domain: r.domain ? rootDomain(r.domain.replace(/^https?:\/\//i, '').split('/')[0]) : '', apariciones: Number((r.evidence as { apariciones?: number }).apariciones ?? 0) }))
    .filter((r) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(r.domain))
    .sort((a, b) => b.apariciones - a.apariciones)
    .slice(0, MAX_CRAWLED_COMPETITORS);
}

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

/**
 * Rastreo ligero (50 páginas) de las webs de la competencia confirmada. Solo las que no tienen un rastreo de los últimos
 * 30 días (terminado o en marcha). «onlyId»: solo ese competidor (al confirmarlo). Devuelve cuántos rastreos empieza.
 */
export async function crawlCompetitors(tenantId: string, projectId: string, onlyId?: string): Promise<{ started: number; skipped: number }> {
  const comps = (await comparedCompetitors(tenantId, projectId)).filter((c) => !onlyId || c.id === onlyId);
  if (!comps.length) return { started: 0, skipped: 0 };
  const since = new Date(Date.now() - RECRAWL_DAYS * 86_400_000);
  const recent = await db
    .select({ rootUrl: crawlRuns.rootUrl })
    .from(crawlRuns)
    .where(and(eq(crawlRuns.projectId, projectId), eq(crawlRuns.tenantId, tenantId), eq(crawlRuns.target, 'competidor'), ne(crawlRuns.status, 'error'), gte(crawlRuns.createdAt, since)));
  const fresh = new Set(recent.map((r) => hostOf(r.rootUrl)));
  let started = 0;
  for (const c of comps) {
    if (fresh.has(c.domain)) continue;
    await startCrawl({ tenantId, projectId, rootUrl: `https://${c.domain}/`, target: 'competidor', maxPages: COMPETITOR_PAGES });
    started++;
  }
  return { started, skipped: comps.length - started };
}

export type CompetitorSiteView = SiteProfile & { crawledAt: string | null; status: 'hecho' | 'rastreando' | 'sin_rastrear' | 'error'; error: string | null };
export type CompetitorComparison = {
  services: string[];
  client: (SiteProfile & { crawledAt: string | null }) | null;
  competitors: CompetitorSiteView[];
  takeaways: string[];
  running: boolean;
};

const PAGE_COLS = {
  url: crawlPages.url,
  statusCode: crawlPages.statusCode,
  title: crawlPages.title,
  h1: crawlPages.h1,
  robotsMeta: crawlPages.robotsMeta,
  canonical: crawlPages.canonical,
  wordCount: crawlPages.wordCount,
  schemaTypes: crawlPages.schemaTypes,
  fetchMs: crawlPages.fetchMs
};

/** Comparación para la pantalla: la web del cliente (último rastreo completo) frente a cada competidor rastreado. */
export async function competitorComparison(tenantId: string, projectId: string): Promise<CompetitorComparison> {
  const [p] = await db
    .select({ offerings: clients.offerings })
    .from(projects)
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
    .limit(1);
  let services = parseServices(p?.offerings).slice(0, 8);
  if (!services.length) {
    const topics = await db
      .select({ name: seoTopics.name, metrics: seoTopics.metrics })
      .from(seoTopics)
      .where(and(eq(seoTopics.projectId, projectId), eq(seoTopics.status, 'activo')))
      .orderBy(desc(sql`(${seoTopics.metrics}->>'impresiones')::float`))
      .limit(12);
    services = topics.filter((t) => !Number((t.metrics as Record<string, number | null>).marca ?? 0)).slice(0, 6).map((t) => t.name);
  }
  const comps = await comparedCompetitors(tenantId, projectId);
  const [own, web] = await Promise.all([lastCrawl(projectId, 'propio'), projectWebUrl(tenantId, projectId)]);
  const runs = comps.length
    ? await db
        .select({ id: crawlRuns.id, rootUrl: crawlRuns.rootUrl, status: crawlRuns.status, finishedAt: crawlRuns.finishedAt, error: crawlRuns.error })
        .from(crawlRuns)
        .where(and(eq(crawlRuns.projectId, projectId), eq(crawlRuns.tenantId, tenantId), eq(crawlRuns.target, 'competidor')))
        .orderBy(desc(crawlRuns.createdAt))
        .limit(60)
    : [];
  const done = new Map<string, (typeof runs)[number]>();
  const latest = new Map<string, (typeof runs)[number]>();
  for (const r of runs) {
    const h = hostOf(r.rootUrl);
    if (!latest.has(h)) latest.set(h, r);
    if (r.status === 'hecho' && !done.has(h)) done.set(h, r);
  }
  const runIds = [...done.values()].map((r) => r.id);
  const pages = runIds.length ? await db.select({ runId: crawlPages.runId, ...PAGE_COLS }).from(crawlPages).where(inArray(crawlPages.runId, runIds)) : [];
  const byRun = new Map<string, CrawledPage[]>();
  for (const pg of pages) byRun.set(pg.runId, [...(byRun.get(pg.runId) ?? []), pg]);

  let client: CompetitorComparison['client'] = null;
  if (own) {
    const ownPages = await db.select(PAGE_COLS).from(crawlPages).where(eq(crawlPages.runId, own.id));
    client = { ...siteProfile(host(web) ?? hostOf(own.rootUrl), ownPages, services), crawledAt: own.finishedAt?.toISOString() ?? null };
  }
  const competitors: CompetitorSiteView[] = comps.map((c) => {
    const d = done.get(c.domain);
    const l = latest.get(c.domain);
    const running = Boolean(l && (l.status === 'pendiente' || l.status === 'en_curso'));
    const base = siteProfile(c.domain, d ? (byRun.get(d.id) ?? []) : [], services);
    return {
      ...base,
      crawledAt: d?.finishedAt?.toISOString() ?? null,
      status: running ? 'rastreando' : d ? 'hecho' : l?.status === 'error' ? 'error' : 'sin_rastrear',
      error: l?.status === 'error' ? (l.error ?? 'El rastreo falló').slice(0, 200) : null
    };
  });
  const crawled = competitors.filter((c) => c.crawledAt && c.pages > 0);
  return { services, client, competitors, takeaways: compareSites(client, crawled), running: competitors.some((c) => c.status === 'rastreando') };
}

export async function enqueueCompetitors(tenantId: string, projectId: string): Promise<void> {
  await enqueueJob({ tenantId, kind: 'seo.competencia.find', payload: { projectId }, scopeType: 'proyecto', scopeId: projectId, priority: 6, dedupeKey: `seo.competencia:${projectId}` });
}

let registered = false;
export function registerCompetenciaJobs(): void {
  if (registered) return;
  registered = true;
  registerJobKind({ kind: 'seo.competencia.find', timeoutS: 300, maxConcurrent: 1, maxAttempts: 1, run: async (ctx, payload) => findCompetitors(ctx.tenantId, String(payload.projectId ?? '')) });
}

import 'server-only';

// SEO · Registro de cambios desde el rastreo (parte 6, tanda 6b). Al terminar cada auditoría se compara con el rastreo
// propio anterior del proyecto (sin filtrar por la web raíz: sirve en una migración) y se apuntan los cambios en
// seo_change_log (clave única por rastreo: un reintento no duplica). No crea hallazgos: es una línea de tiempo.
import { and, desc, eq, gte, lt, ne, or } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { crawlPages, crawlRuns, interventions, seoChangeLog, seoMoneyPages, type CrawlRun } from '@/lib/db/schema';
import { diffCrawls, type DiffPage } from '@/lib/seo/cambios/rules';

const COLS = {
  url: crawlPages.url,
  statusCode: crawlPages.statusCode,
  contentType: crawlPages.contentType,
  title: crawlPages.title,
  metaDescription: crawlPages.metaDescription,
  h1: crawlPages.h1,
  canonical: crawlPages.canonical,
  robotsMeta: crawlPages.robotsMeta,
  xRobots: crawlPages.xRobots,
  wordCount: crawlPages.wordCount,
  simhash: crawlPages.simhash,
  jsonld: crawlPages.jsonld,
  schemaTypes: crawlPages.schemaTypes
};

/** URLs vigiladas (dinero activas) y de encargos en curso o recientes: sus filas por URL se conservan siempre. */
export async function importantUrls(projectId: string): Promise<Set<string>> {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [money, ints] = await Promise.all([
    db.select({ url: seoMoneyPages.url }).from(seoMoneyPages).where(and(eq(seoMoneyPages.projectId, projectId), eq(seoMoneyPages.active, true))),
    db
      .select({ urls: interventions.urls })
      .from(interventions)
      .where(and(eq(interventions.projectId, projectId), eq(interventions.domain, 'seo'), or(eq(interventions.status, 'prevista'), and(eq(interventions.status, 'hecha'), gte(interventions.doneAt, since)))))
  ]);
  return new Set([...money.map((m) => m.url), ...ints.flatMap((i) => i.urls)]);
}

export async function logCrawlChanges(tenantId: string, projectId: string, run: CrawlRun, clicks: Map<string, number>): Promise<number> {
  const [prev] = await db
    .select()
    .from(crawlRuns)
    .where(and(eq(crawlRuns.projectId, projectId), eq(crawlRuns.target, 'propio'), eq(crawlRuns.status, 'hecho'), ne(crawlRuns.id, run.id), lt(crawlRuns.createdAt, run.createdAt)))
    .orderBy(desc(crawlRuns.createdAt))
    .limit(1);
  if (!prev) return 0;
  const [a, b] = await Promise.all([db.select(COLS).from(crawlPages).where(eq(crawlPages.runId, prev.id)), db.select(COLS).from(crawlPages).where(eq(crawlPages.runId, run.id))]);
  const rows = diffCrawls(a as DiffPage[], b as DiffPage[], { prevTruncated: prev.pagesDone >= prev.maxPages, curTruncated: run.pagesDone >= run.maxPages, important: await importantUrls(projectId), clicks });
  if (!rows.length) return 0;
  const prevAt = prev.finishedAt ?? prev.createdAt;
  const detected = run.finishedAt ?? new Date();
  for (let i = 0; i < rows.length; i += 200) {
    await db
      .insert(seoChangeLog)
      .values(rows.slice(i, i + 200).map((r) => ({ tenantId, projectId, url: r.url, urlHash: r.urlHash, field: r.field, before: r.before, after: r.after, extra: r.extra ?? null, source: 'rastreo', batch: run.id, prevObservedAt: prevAt, detectedAt: detected })))
      .onConflictDoNothing();
  }
  return rows.length;
}

/** Purga del registro: más de 18 meses (tarea diaria). */
export async function purgeChangeLog(): Promise<number> {
  const r = await db.delete(seoChangeLog).where(lt(seoChangeLog.detectedAt, new Date(Date.now() - 548 * 86_400_000))).returning({ id: seoChangeLog.id });
  return r.length;
}

export type ChangeView = { id: number; url: string; field: string; before: string | null; after: string | null; extra: Record<string, unknown> | null; source: string; detectedAt: string; prevObservedAt: string | null };
/** Los últimos 90 días (como mucho 300 filas). */
export async function listChanges(tenantId: string, projectId: string): Promise<ChangeView[]> {
  const rows = await db
    .select()
    .from(seoChangeLog)
    .where(and(eq(seoChangeLog.tenantId, tenantId), eq(seoChangeLog.projectId, projectId), gte(seoChangeLog.detectedAt, new Date(Date.now() - 90 * 86_400_000))))
    .orderBy(desc(seoChangeLog.detectedAt), desc(seoChangeLog.id))
    .limit(300);
  return rows.map((r) => ({ id: r.id, url: r.url, field: r.field, before: r.before, after: r.after, extra: r.extra ?? null, source: r.source, detectedAt: r.detectedAt.toISOString(), prevObservedAt: r.prevObservedAt?.toISOString() ?? null }));
}


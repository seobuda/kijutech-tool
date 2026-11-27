import 'server-only';

// Núcleo: rastreador de webs (cimientos, 23 nov 2026; docs/DISENO-TECNICO-CIMIENTOS.md §5).
// Recorre una web (la del proyecto o la de un competidor) respetando robots.txt, despacio (1 petición por segundo por
// dominio, o lo que pida su Crawl-delay hasta 5 s), solo direcciones públicas y como mucho 2 MB por página. Guarda cada
// página con lo que importa para el SEO (estado, redirección, título, canonical, robots, encabezados, texto, huellas de
// duplicado, enlaces, JSON-LD) en crawl_pages / crawl_links. No ejecuta JavaScript. Las comprobaciones (qué es un
// problema) no están aquí: las hace cada departamento sobre lo guardado y las convierte en hallazgos.
// Corre en la cola de trabajos por tramos: si no le da tiempo, guarda la frontera y se vuelve a encolar.
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { crawlLinks, crawlPages, crawlRuns, type CrawlRun } from '@/lib/db/schema';
import { publicFetch, resolvesPublic } from '@/lib/core/net';
import { enqueueJob, registerJobKind, type JobContext } from '@/lib/core/jobs';
import { extractPage, normalizeUrl, sameSite, sha1 } from '@/lib/core/crawl-extract';
import { isAllowed, locsFromSitemap, parseRobots, type RobotsRules } from '@/lib/core/robots';

export const CRAWLER_UA = 'KijutechBot/1.0 (+https://brain.kijutech.com/bot)';
const MAX_BYTES = 2_000_000;
const SLICE_MS = 8 * 60_000;
const SKIP_EXT = /\.(?:pdf|jpe?g|png|gif|webp|svg|ico|css|js|mjs|json|xml|zip|rar|gz|mp3|mp4|webm|avi|mov|woff2?|ttf|eot|docx?|xlsx?|pptx?)$/i;

export type FetchResult = { status: number; location: string | null; contentType: string | null; xRobots: string | null; body: string | null; bytes: number; ms: number; error?: string };
export type Fetcher = (url: string) => Promise<FetchResult>;

/** Petición real y segura: solo direcciones públicas, sin seguir redirecciones (se registran), tope de tamaño. */
export const safeFetcher: Fetcher = async (url) => {
  const t0 = Date.now();
  if (!(await resolvesPublic(url))) return { status: 0, location: null, contentType: null, xRobots: null, body: null, bytes: 0, ms: 0, error: 'Dirección no permitida' };
  try {
    const res = await publicFetch(url, { headers: { 'User-Agent': CRAWLER_UA, Accept: 'text/html,application/xhtml+xml,text/plain,application/xml;q=0.9,*/*;q=0.5' }, signal: AbortSignal.timeout(20_000) });
    const contentType = res.headers.get('content-type');
    const isText = /text\/|xml|xhtml/i.test(contentType ?? '');
    let body: string | null = null;
    let bytes = 0;
    if (isText && res.body) {
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BYTES) {
          void reader.cancel().catch(() => undefined);
          break;
        }
        chunks.push(value);
      }
      body = Buffer.concat(chunks).toString('utf8');
    } else void res.body?.cancel().catch(() => undefined);
    return { status: res.status, location: res.headers.get('location'), contentType, xRobots: res.headers.get('x-robots-tag'), body, bytes, ms: Date.now() - t0 };
  } catch (e) {
    return { status: 0, location: null, contentType: null, xRobots: null, body: null, bytes: 0, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) };
  }
};

type Frontier = { u: string; d: number; s?: 1 }[];
type CrawlState = { frontier?: Frontier; seen?: string[]; robots?: RobotsRules; initialized?: boolean };

/** Crea un rastreo y lo encola. Devuelve su id. */
export async function startCrawl(input: { tenantId: string; projectId: string | null; rootUrl: string; target?: 'propio' | 'competidor'; maxPages?: number }): Promise<string> {
  const root = normalizeUrl(input.rootUrl, input.rootUrl);
  if (!root) throw new Error('URL no válida');
  const target = input.target ?? 'propio';
  const [run] = await db
    .insert(crawlRuns)
    .values({ tenantId: input.tenantId, projectId: input.projectId, target, rootUrl: root, maxPages: input.maxPages ?? (target === 'propio' ? 500 : 100) })
    .returning({ id: crawlRuns.id });
  await enqueueJob({ tenantId: input.tenantId, kind: 'crawl.run', payload: { runId: run.id }, scopeType: input.projectId ? 'proyecto' : 'cuenta', scopeId: input.projectId, priority: 5, dedupeKey: `crawl:${run.id}:0` });
  return run.id;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      resolve();
    });
  });

async function initRun(run: CrawlRun, fetcher: Fetcher): Promise<CrawlState> {
  const origin = new URL(run.rootUrl).origin;
  const robotsRes = await fetcher(`${origin}/robots.txt`);
  const robotsTxt = robotsRes.status === 200 && robotsRes.body ? robotsRes.body.slice(0, 500_000) : '';
  const robots = parseRobots(robotsTxt, 'KijutechBot');
  // Sitemaps: los de robots.txt y, si no hay, /sitemap.xml. Índices de sitemaps: un nivel.
  const sitemapUrls = robots.sitemaps.length ? robots.sitemaps.slice(0, 10) : [`${origin}/sitemap.xml`];
  const fromSitemap = new Set<string>();
  const queue = [...sitemapUrls];
  for (let i = 0; i < queue.length && i < 20 && fromSitemap.size < run.maxPages * 2; i++) {
    const r = await fetcher(queue[i]);
    if (r.status !== 200 || !r.body) continue;
    const { urls, sitemaps } = locsFromSitemap(r.body);
    for (const s of sitemaps) if (queue.length < 20) queue.push(s);
    for (const u of urls) {
      const n = normalizeUrl(u, run.rootUrl);
      if (n && sameSite(n, run.rootUrl)) fromSitemap.add(n);
    }
  }
  await db.update(crawlRuns).set({ robotsTxt: robotsTxt || null, sitemaps: sitemapUrls }).where(eq(crawlRuns.id, run.id));
  const frontier: Frontier = [{ u: run.rootUrl, d: 0, ...(fromSitemap.has(run.rootUrl) ? { s: 1 as const } : {}) }];
  // Las de ruta más corta primero (portada, servicios, secciones) antes que el blog: en un rastreo con tope (el ligero de la
  // competencia, 50 páginas) así se ven las páginas que importan aunque el sitemap liste antes las entradas.
  const segs = (u: string) => new URL(u).pathname.split('/').filter(Boolean).length;
  const ordered = [...fromSitemap].map((u, i) => ({ u, i, n: segs(u) })).sort((a, b) => a.n - b.n || a.i - b.i);
  for (const { u } of ordered) if (u !== run.rootUrl) frontier.push({ u, d: 1, s: 1 });
  return { frontier, seen: [], robots, initialized: true };
}

/**
 * Un tramo del rastreo. Devuelve si ha terminado. Recibe el fetcher para poder probarlo sin red; en producción, el seguro.
 */
export async function crawlSlice(ctx: Pick<JobContext, 'heartbeat' | 'signal'>, runId: string, fetcher: Fetcher = safeFetcher, sliceMs = SLICE_MS, delayMs = 1000): Promise<{ done: boolean; pages: number }> {
  const [run] = await db.select().from(crawlRuns).where(eq(crawlRuns.id, runId)).limit(1);
  if (!run || run.status === 'hecho' || run.status === 'error') return { done: true, pages: 0 };
  let state = (run.state ?? {}) as CrawlState;
  if (!state.initialized) {
    await db.update(crawlRuns).set({ status: 'en_curso', startedAt: new Date() }).where(eq(crawlRuns.id, run.id));
    state = await initRun(run, fetcher);
  }
  const robots = state.robots ?? parseRobots('', 'KijutechBot');
  const pause = Math.max(delayMs, Math.min(5, robots.crawlDelay ?? 0) * 1000);
  const frontier = state.frontier ?? [];
  const seen = new Set(state.seen ?? []);
  const inSitemap = new Set(frontier.filter((f) => f.s).map((f) => sha1(f.u)));
  let pagesDone = run.pagesDone;
  const started = Date.now();
  let lastSave = Date.now();

  const save = async (extra: Partial<typeof crawlRuns.$inferInsert> = {}) => {
    await db
      .update(crawlRuns)
      .set({ pagesDone, state: { frontier: frontier.slice(0, run.maxPages * 3), seen: [...seen], robots, initialized: true }, ...extra })
      .where(eq(crawlRuns.id, run.id));
  };

  while (frontier.length && pagesDone < run.maxPages) {
    if (ctx.signal.aborted || Date.now() - started > sliceMs) {
      await save();
      return { done: false, pages: pagesDone };
    }
    const { u, d } = frontier.shift()!;
    const h = sha1(u);
    if (seen.has(h)) continue;
    seen.add(h);
    const parsed = new URL(u);
    if (SKIP_EXT.test(parsed.pathname)) continue;
    if (!isAllowed(robots, parsed.pathname + parsed.search)) continue;

    const r = await fetcher(u);
    pagesDone++;
    const redirectTo = r.status >= 300 && r.status < 400 && r.location ? normalizeUrl(r.location, u) : null;
    const isHtml = /html/i.test(r.contentType ?? '') && r.status >= 200 && r.status < 300 && Boolean(r.body);
    const page = isHtml ? extractPage(r.body!, u) : null;
    await db
      .insert(crawlPages)
      .values({
        runId: run.id,
        url: u,
        urlHash: h,
        statusCode: r.status || null,
        redirectTo,
        contentType: r.contentType?.slice(0, 120) ?? null,
        title: page?.title ?? null,
        metaDescription: page?.metaDescription ?? null,
        h1: page?.h1 ?? null,
        headings: page ? page.headings : null,
        canonical: page?.canonical ?? null,
        robotsMeta: page?.robotsMeta?.slice(0, 200) ?? null,
        xRobots: r.xRobots?.slice(0, 200) ?? null,
        lang: page?.lang?.slice(0, 20) ?? null,
        hreflang: page?.hreflang.length ? page.hreflang : null,
        wordCount: page?.wordCount ?? null,
        contentHash: page?.contentHash ?? null,
        simhash: page?.simhash ?? null,
        linksInternal: page ? page.links.filter((l) => l.internal).length : null,
        linksExternal: page ? page.links.filter((l) => !l.internal).length : null,
        depth: d,
        inSitemap: inSitemap.has(h),
        // JSON-LD tal cual si cabe (200 KB); si es más grande, solo sus tipos (schema_types).
        jsonld: page?.jsonld.length && JSON.stringify(page.jsonld).length <= 200_000 ? page.jsonld : null,
        schemaTypes: page?.schemaTypes.length ? page.schemaTypes : null,
        imagesWithoutAlt: page?.imagesWithoutAlt ?? null,
        // Hechos acotados (parte 1 SEO): enlaces a otras webs y recursos CSS/JS (para robots y enlaces rotos).
        facts: page ? { ext: [...new Set(page.links.filter((l) => !l.internal && /^https?:/i.test(l.url)).map((l) => l.url.split('#')[0]))].slice(0, 100), res: page.resources, ...(page.generator ? { gen: page.generator } : {}), ...(page.signatures.length ? { sig: page.signatures } : {}) } : null,
        bytes: r.bytes,
        fetchMs: r.ms,
        error: r.error?.slice(0, 500) ?? (page?.maybeJsRendered ? 'posible web pintada con JavaScript' : null)
      })
      .onConflictDoNothing();

    const next: string[] = [];
    if (redirectTo && sameSite(redirectTo, run.rootUrl)) next.push(redirectTo);
    if (page) {
      const internal = page.links.filter((l) => l.internal);
      if (internal.length) {
        await db.insert(crawlLinks).values(internal.slice(0, 500).map((l) => ({ runId: run.id, fromHash: h, toHash: sha1(l.url), anchor: l.anchor.slice(0, 200) || null, nofollow: l.nofollow })));
      }
      // Una página con noindex/nofollow en robots meta: sus enlaces no se siguen (como Google con nofollow).
      if (!/nofollow/.test(page.robotsMeta ?? '')) for (const l of internal) if (!l.nofollow) next.push(l.url);
    }
    for (const n of next) {
      const nh = sha1(n);
      if (!seen.has(nh) && frontier.length < run.maxPages * 3 && !frontier.some((f) => f.u === n)) frontier.push({ u: n, d: d + 1 });
    }
    if (Date.now() - lastSave > 20_000) {
      await save();
      await ctx.heartbeat();
      lastSave = Date.now();
    }
    if (pause) await sleep(pause, ctx.signal);
  }
  await save({ status: 'hecho', finishedAt: new Date() });
  await pruneOldRuns(run);
  return { done: true, pages: pagesDone };
}

/** Se guardan las 3 últimas ejecuciones completas por proyecto y objetivo (los hallazgos se conservan aparte). */
async function pruneOldRuns(run: CrawlRun): Promise<void> {
  if (!run.projectId) return;
  const old = await db
    .select({ id: crawlRuns.id })
    .from(crawlRuns)
    .where(and(eq(crawlRuns.projectId, run.projectId), eq(crawlRuns.target, run.target), eq(crawlRuns.rootUrl, run.rootUrl), eq(crawlRuns.status, 'hecho')))
    .orderBy(desc(crawlRuns.createdAt))
    .offset(3);
  if (old.length) await db.delete(crawlRuns).where(inArray(crawlRuns.id, old.map((o) => o.id)));
}

/** Último rastreo terminado de un proyecto (o de un competidor por su URL raíz). */
export async function lastCrawl(projectId: string, target: 'propio' | 'competidor' = 'propio', rootUrl?: string): Promise<CrawlRun | null> {
  const conds = [eq(crawlRuns.projectId, projectId), eq(crawlRuns.target, target), eq(crawlRuns.status, 'hecho')];
  if (rootUrl) conds.push(eq(crawlRuns.rootUrl, rootUrl));
  const [r] = await db.select().from(crawlRuns).where(and(...conds)).orderBy(desc(crawlRuns.finishedAt)).limit(1);
  return r ?? null;
}

/** Páginas enlazadas desde dentro: recuento de enlaces internos que recibe cada URL del rastreo (para huérfanas). */
export async function inlinkCounts(runId: string): Promise<Map<string, number>> {
  const rows = (await db.execute(sql`SELECT to_hash, count(*)::int AS n FROM crawl_links WHERE run_id = ${runId} GROUP BY to_hash`)) as unknown as { to_hash: string; n: number }[];
  return new Map(rows.map((r) => [r.to_hash, Number(r.n)]));
}

/** Registra el trabajo de rastreo en la cola (lo llama wireApp). */
export function registerCrawlJobs(): void {
  registerJobKind({
    kind: 'crawl.run',
    timeoutS: 600,
    maxConcurrent: 2,
    maxAttempts: 3,
    run: async (ctx, payload) => {
      const runId = String(payload.runId ?? '');
      const part = Number(payload.part ?? 0);
      let r: { done: boolean; pages: number };
      try {
        r = await crawlSlice(ctx, runId);
      } catch (e) {
        const msg = (e instanceof Error ? e.message : String(e)).slice(0, 1000);
        const final = ctx.job.attempts >= ctx.job.maxAttempts;
        await db.update(crawlRuns).set({ error: msg, ...(final ? { status: 'error', finishedAt: new Date() } : {}) }).where(eq(crawlRuns.id, runId));
        throw e;
      }
      if (!r.done) {
        await enqueueJob({ tenantId: ctx.tenantId, kind: 'crawl.run', payload: { runId, part: part + 1 }, scopeType: ctx.job.scopeType as 'proyecto' | 'cliente' | 'cuenta', scopeId: ctx.job.scopeId, priority: 5, dedupeKey: `crawl:${runId}:${part + 1}` });
      }
      return { pages: r.pages, done: r.done };
    }
  });
}

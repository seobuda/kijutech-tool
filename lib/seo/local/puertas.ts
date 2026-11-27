import 'server-only';

// SEO · Páginas puerta (parte 5c, 27 nov 2026; docs/DISENO-SEO-CITAS-ZONAS.md con la auditoría Opus). El simhash del
// rastreo mira toda la página (menú y pie incluidos) y no ve dos páginas que solo cambian la población, así que este
// trabajo aparte vuelve a descargar las candidatas (como mucho 20, de la web del cliente), quita lo que comparten con la
// portada, tapa las poblaciones y compara el texto propio (Jaccard de trigramas ≥ 0,8, grupos de 3 o más).
import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { crawlPages, crawlRuns, seoDossierFacts } from '@/lib/db/schema';
import { registerJobKind, type JobContext } from '@/lib/core/jobs';
import { syncFindings } from '@/lib/core/findings';
import { fetchPublic } from '@/lib/core/net';
import { zoneTowns } from '@/lib/seo/posiciones/rules';
import { doorwayCandidates, doorwayGroups, ownText, PUERTAS_SOURCE, textBlocks } from '@/lib/seo/local/citas-zonas-rules';

const UA = 'Mozilla/5.0 (compatible; KijutechBot/1.0; +https://kijutech.com)';

async function readHtml(url: string): Promise<string | null> {
  try {
    const r = await fetchPublic(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(15_000) });
    if ('error' in r || !r.res.ok || !/html/i.test(r.res.headers.get('content-type') ?? '')) return null;
    const buf = await r.res.arrayBuffer();
    return new TextDecoder('utf-8', { fatal: false }).decode(buf.slice(0, 600_000));
  } catch {
    return null;
  }
}

export async function checkDoorways(ctx: Pick<JobContext, 'heartbeat'>, tenantId: string, projectId: string, runId: string): Promise<Record<string, unknown>> {
  const [run] = await db.select({ rootUrl: crawlRuns.rootUrl }).from(crawlRuns).where(eq(crawlRuns.id, runId)).limit(1);
  if (!run) return { skipped: 'rastreo borrado' };
  const pages = (await db.select({ url: crawlPages.url, title: crawlPages.title, statusCode: crawlPages.statusCode, contentType: crawlPages.contentType, robotsMeta: crawlPages.robotsMeta }).from(crawlPages).where(eq(crawlPages.runId, runId))).filter(
    (p) => p.statusCode === 200 && /html/i.test(p.contentType ?? '') && !/noindex/i.test(p.robotsMeta ?? '')
  );
  if (!pages.length) return { skipped: 'sin páginas' };
  const [z] = await db.select({ value: seoDossierFacts.value }).from(seoDossierFacts).where(and(eq(seoDossierFacts.projectId, projectId), eq(seoDossierFacts.field, 'zona'), eq(seoDossierFacts.status, 'confirmado'))).limit(1);
  const towns = zoneTowns(typeof z?.value === 'string' ? z.value : null);
  const cand = doorwayCandidates(pages, towns, 20);
  if (cand.urls.length < 3) {
    await syncFindings(tenantId, projectId, PUERTAS_SOURCE, [], ['seo.doorway_pages']);
    return { candidatas: cand.urls.length };
  }
  const home = await readHtml(run.rootUrl);
  const homeBlocks = new Set(home ? textBlocks(home) : []);
  const allTowns = [...towns, ...cand.slugTowns];
  const texts: { url: string; text: string }[] = [];
  for (const url of cand.urls) {
    const html = await readHtml(url);
    if (html) texts.push({ url, text: ownText(textBlocks(html), homeBlocks, allTowns) });
    await ctx.heartbeat();
  }
  const groups = doorwayGroups(texts);
  const found = groups.map((g) => {
    const urls = [...g].sort();
    return { kind: 'seo.doorway_pages', dedupeKey: `seo.doorway_pages:${createHash('sha1').update(urls.join('|')).digest('hex').slice(0, 16)}`, url: urls[0], metric: 'paginas', value: urls.length, evidence: { urls: urls.slice(0, 30) } };
  });
  // Solo se decide si se pudieron leer casi todas (si no, no se resuelve un aviso por un fallo de red).
  if (texts.length >= cand.urls.length * 0.8) await syncFindings(tenantId, projectId, PUERTAS_SOURCE, found, ['seo.doorway_pages']);
  return { candidatas: cand.urls.length, leidas: texts.length, grupos: groups.length };
}

let registered = false;
export function registerPuertasJob(): void {
  if (registered) return;
  registered = true;
  registerJobKind({ kind: 'seo.salud.puertas', timeoutS: 300, maxConcurrent: 1, maxAttempts: 1, run: async (ctx, payload) => checkDoorways(ctx, ctx.tenantId, String(payload.projectId ?? ''), String(payload.runId ?? '')) });
}

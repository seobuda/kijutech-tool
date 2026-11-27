import 'server-only';

// SEO · Señales de web hackeada (parte 6, tanda 6a). Va con los detectores semanales (proceso «seo.detectores»), con su
// propia fuente («seo.vigilancia:hackeo») y lista de tipos. Lee Search Console del núcleo (gsc_daily, gsc_queries,
// gsc_pages) y el último rastreo. Si falta el histórico de Search Console, no decide nada (no toca lo que había).
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { crawlPages, crawlRuns } from '@/lib/db/schema';
import { syncFindings } from '@/lib/core/findings';
import { HACKEO_KINDS, HACKEO_SOURCE, hackedPages, hackedQueries, isSpamText, siteLanguages, type NewQuery } from '@/lib/seo/vigilancia/hackeo-rules';

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Lista de ids numéricos para «IN (...)» (enteros validados: sin riesgo de inyección). */
const idList = (ids: number[]) => sql.raw(`(${ids.map((n) => Math.trunc(Number(n))).filter(Number.isFinite).join(',') || '0'})`);

type Prop = { id: number; firstDate: string | null; lastDate: string | null; syncState: unknown };

/** Devuelve un texto para el resumen de los detectores, o null si no se pudo mirar. */
export async function runHackeo(tenantId: string, projectId: string, prop: Prop | null): Promise<string | null> {
  if (!prop?.lastDate) return null;
  // Novedad real: hace falta tener al menos 120 días de histórico (si no, todo parece «nuevo»).
  const backfilled = Boolean((prop.syncState as { backfillDone?: boolean } | null)?.backfillDone);
  if (!backfilled && !(prop.firstDate && prop.firstDate <= addDays(prop.lastDate, -120))) return 'señales de hackeo: falta histórico de Search Console';
  const [run] = await db.select({ id: crawlRuns.id }).from(crawlRuns).where(and(eq(crawlRuns.projectId, projectId), eq(crawlRuns.target, 'propio'), eq(crawlRuns.status, 'hecho'))).orderBy(desc(crawlRuns.createdAt)).limit(1);
  const pages = run ? await db.select({ url: crawlPages.url, title: crawlPages.title, lang: crawlPages.lang, hreflang: crawlPages.hreflang, inSitemap: crawlPages.inSitemap }).from(crawlPages).where(eq(crawlPages.runId, run.id)) : [];
  const langs = siteLanguages(pages.map((p) => ({ lang: p.lang, hreflang: (p.hreflang as { lang: string }[] | null) ?? null })));
  const known = new Set(pages.map((p) => p.url.replace(/\/+$/, '')));

  const to = prop.lastDate;
  const from = addDays(to, -27);
  // Búsquedas con impresiones en los últimos 28 días (como mucho 20.000); el filtro de basura va en JS.
  const recent = (await db.execute(sql`
    SELECT q.id AS id, q.query AS query, sum(d.impressions)::int AS imp
    FROM gsc_daily d JOIN gsc_queries q ON q.id = d.query_id
    WHERE d.property_id = ${prop.id} AND d.date BETWEEN ${from}::date AND ${to}::date
    GROUP BY q.id, q.query
    LIMIT 20000`)) as unknown as { id: number; query: string; imp: number }[];
  const suspects = [...recent].filter((r) => isSpamText(r.query, langs)).slice(0, 300);
  const newQueries: NewQuery[] = [];
  if (suspects.length) {
    const ids = suspects.map((s) => Number(s.id));
    const old = (await db.execute(sql`
      SELECT DISTINCT query_id AS id FROM gsc_daily
      WHERE property_id = ${prop.id} AND date BETWEEN ${addDays(from, -92)}::date AND ${addDays(from, -1)}::date AND query_id IN ${idList(ids)}`)) as unknown as { id: number }[];
    const seenBefore = new Set([...old].map((o) => Number(o.id)));
    const fresh = suspects.filter((s) => !seenBefore.has(Number(s.id)));
    if (fresh.length) {
      const urlRows = (await db.execute(sql`
        SELECT d.query_id AS id, p.url AS url FROM gsc_daily d JOIN gsc_pages p ON p.id = d.page_id
        WHERE d.property_id = ${prop.id} AND d.date BETWEEN ${from}::date AND ${to}::date AND d.query_id IN ${idList(fresh.map((f) => Number(f.id)))}
        GROUP BY d.query_id, p.url`)) as unknown as { id: number; url: string }[];
      const urlsOf = new Map<number, string[]>();
      for (const r of urlRows) urlsOf.set(Number(r.id), [...(urlsOf.get(Number(r.id)) ?? []), r.url]);
      for (const f of fresh) newQueries.push({ query: f.query, impressions: Number(f.imp), urls: (urlsOf.get(Number(f.id)) ?? []).slice(0, 10) });
    }
  }
  // Páginas que Google ya muestra (impresiones en 28 días) y las rastreadas.
  const gscPages = (await db.execute(sql`
    SELECT p.url AS url FROM gsc_daily d JOIN gsc_pages p ON p.id = d.page_id
    WHERE d.property_id = ${prop.id} AND d.date BETWEEN ${from}::date AND ${to}::date
    GROUP BY p.url LIMIT 20000`)) as unknown as { url: string }[];
  const found = [...hackedQueries(newQueries, langs, known), ...hackedPages([...[...gscPages].map((g) => ({ url: g.url })), ...pages.map((p) => ({ url: p.url, title: p.title }))], langs)];
  await syncFindings(tenantId, projectId, HACKEO_SOURCE, found, HACKEO_KINDS);
  return found.length ? `señales de hackeo: ${found.length}` : 'sin señales de hackeo';
}

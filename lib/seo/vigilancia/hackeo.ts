import 'server-only';

// SEO · Señales de web hackeada (parte 6, tanda 6a). Va con los detectores semanales (proceso «seo.detectores»), con su
// propia fuente («seo.vigilancia:hackeo») y lista de tipos. Lee Search Console del núcleo (gsc_daily, gsc_queries,
// gsc_pages) y el último rastreo. Si falta el histórico de Search Console, no decide nada (no toca lo que había).
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { crawlPages, crawlRuns, findings } from '@/lib/db/schema';
import { syncFindings } from '@/lib/core/findings';
import { HACKEO_KINDS, HACKEO_SOURCE, hackedPages, hackedQueries, isSpamText, siteLanguages, type NewQuery } from '@/lib/seo/vigilancia/hackeo-rules';

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Lista de ids numéricos para «IN (...)» (enteros validados: sin riesgo de inyección). */
const idList = (ids: number[]) => sql.raw(`(${ids.map((n) => Math.trunc(Number(n))).filter(Number.isFinite).join(',') || '0'})`);

type Prop = { id: number; firstDate: string | null; lastDate: string | null; syncState: unknown };

/** Prefiltro en SQL (amplio; el fino va en JS con isSpamText): así no se pierde nada por el tope de filas. */
const SQL_SPAM = String.raw`\y(viagra|cialis|levitra|kamagra|tadalafil|sildenafil|replica|gacor|judi|togel|casino|payday)`;
const SQL_CJK = String.raw`[\u3040-\u30ff\u4e00-\u9fff]`;
/** Host + ruta comparables (sin esquema, «www.», barra final ni mayúsculas). */
const keyOf = (u: string) => {
  try {
    const x = new URL(u);
    return `${x.hostname.toLowerCase().replace(/^www\./, '')}${x.pathname.replace(/\/+$/, '').toLowerCase()}`;
  } catch {
    return u.toLowerCase();
  }
};

/** Resumen para los detectores y si encontró algo; null si no hay Search Console. */
export async function runHackeo(tenantId: string, projectId: string, prop: Prop | null): Promise<{ text: string; found: number } | null> {
  if (!prop?.lastDate) return null;
  // Novedad real: hace falta tener al menos 120 días de histórico (si no, todo parece «nuevo»).
  const backfilled = Boolean((prop.syncState as { backfillDone?: boolean } | null)?.backfillDone);
  if (!backfilled && !(prop.firstDate && prop.firstDate <= addDays(prop.lastDate, -120))) return { text: 'señales de hackeo: falta histórico de Search Console', found: 0 };
  const [run] = await db.select({ id: crawlRuns.id, pagesDone: crawlRuns.pagesDone, maxPages: crawlRuns.maxPages }).from(crawlRuns).where(and(eq(crawlRuns.projectId, projectId), eq(crawlRuns.target, 'propio'), eq(crawlRuns.status, 'hecho'))).orderBy(desc(crawlRuns.createdAt)).limit(1);
  const pages = run ? await db.select({ url: crawlPages.url, title: crawlPages.title, lang: crawlPages.lang, hreflang: crawlPages.hreflang }).from(crawlPages).where(eq(crawlPages.runId, run.id)) : [];
  const langs = siteLanguages(pages.map((p) => ({ lang: p.lang, hreflang: (p.hreflang as { lang: string }[] | null) ?? null })));
  // Web conocida = rastreo completo. Si el rastreo se cortó por el tope (o no hay), no se sabe qué es «ajeno»: nunca crítico.
  const complete = Boolean(run && run.pagesDone < run.maxPages);
  const known = complete ? new Set(pages.map((p) => keyOf(p.url))) : null;

  const to = prop.lastDate;
  const from = addDays(to, -27);
  // Búsquedas sospechosas con impresiones en los últimos 28 días (prefiltradas en SQL).
  const suspects = [
    ...((await db.execute(sql`
    SELECT q.id AS id, q.query AS query, sum(d.impressions)::int AS imp
    FROM gsc_daily d JOIN gsc_queries q ON q.id = d.query_id
    WHERE d.property_id = ${prop.id} AND d.date BETWEEN ${from}::date AND ${to}::date AND (q.query ~* ${SQL_SPAM} OR q.query ~ ${SQL_CJK})
    GROUP BY q.id, q.query
    ORDER BY imp DESC LIMIT 2000`)) as unknown as { id: number; query: string; imp: number }[])
  ]
    .filter((r) => isSpamText(r.query, langs))
    .slice(0, 300);
  // Si ya hay un aviso de hackeo abierto, cuenta toda la basura que sigue saliendo (nueva o no): un hackeo que dura más de
  // 28 días no se cierra solo. Si no lo hay, solo la basura NUEVA (sin impresiones en los 92 días anteriores).
  const [openHack] = await db.select({ id: findings.id }).from(findings).where(and(eq(findings.projectId, projectId), eq(findings.kind, 'seo.hacked_queries'), eq(findings.status, 'abierto'))).limit(1);
  let pick = suspects;
  if (suspects.length && !openHack) {
    const old = (await db.execute(sql`
      SELECT DISTINCT query_id AS id FROM gsc_daily
      WHERE property_id = ${prop.id} AND date BETWEEN ${addDays(from, -92)}::date AND ${addDays(from, -1)}::date AND query_id IN ${idList(suspects.map((s) => Number(s.id)))}`)) as unknown as { id: number }[];
    const seenBefore = new Set([...old].map((o) => Number(o.id)));
    pick = suspects.filter((s) => !seenBefore.has(Number(s.id)));
  }
  const queries: NewQuery[] = [];
  if (pick.length) {
    const urlRows = (await db.execute(sql`
      SELECT d.query_id AS id, p.url AS url FROM gsc_daily d JOIN gsc_pages p ON p.id = d.page_id
      WHERE d.property_id = ${prop.id} AND d.date BETWEEN ${from}::date AND ${to}::date AND d.query_id IN ${idList(pick.map((f) => Number(f.id)))}
      GROUP BY d.query_id, p.url`)) as unknown as { id: number; url: string }[];
    const urlsOf = new Map<number, string[]>();
    for (const r of urlRows) urlsOf.set(Number(r.id), [...(urlsOf.get(Number(r.id)) ?? []), r.url]);
    for (const f of pick) queries.push({ query: f.query, impressions: Number(f.imp), urls: (urlsOf.get(Number(f.id)) ?? []).slice(0, 10) });
  }
  // Páginas que Google ya muestra (28 días) con pinta de basura (prefiltro: términos o caracteres codificados) y las rastreadas.
  const gscPages = (await db.execute(sql`
    SELECT p.url AS url FROM gsc_daily d JOIN gsc_pages p ON p.id = d.page_id
    WHERE d.property_id = ${prop.id} AND d.date BETWEEN ${from}::date AND ${to}::date AND (p.url ~* ${SQL_SPAM} OR p.url ~* '%E[3-9]%')
    GROUP BY p.url LIMIT 2000`)) as unknown as { url: string }[];
  const found = [...hackedQueries(queries, langs, known ? new Set([...known]) : null, keyOf), ...hackedPages([...[...gscPages].map((g) => ({ url: g.url })), ...pages.map((p) => ({ url: p.url, title: p.title }))], langs)];
  await syncFindings(tenantId, projectId, HACKEO_SOURCE, found, HACKEO_KINDS);
  return { text: found.length ? `señales de hackeo: ${found.length}` : 'sin señales de hackeo', found: found.length };
}

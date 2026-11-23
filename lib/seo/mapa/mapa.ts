import 'server-only';

// SEO · Mapa de palabras (Hito 2, 24 nov 2026; docs/DISENO-TECNICO-HITO2.md §2). Sobre el detalle de Search Console que
// ya guarda el núcleo (gsc_daily): temas por página dominante y, para lo que no tiene página clara, por parecido
// (embeddings guardados y reutilizados; si no hay proveedor de embeddings con saldo, por palabras). Sin IA de texto:
// el nombre de cada tema es su consulta principal. La canibalización sale como hallazgo y entra en el plan de mejora.
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { HDBSCAN } from 'hdbscan-ts';
import { db } from '@/lib/db/drizzle';
import { clients, projects, seoTextEmbeddings, seoTopicQueries, seoTopics } from '@/lib/db/schema';
import { gscPropertiesForProject } from '@/lib/core/gsc';
import { syncFindings } from '@/lib/core/findings';
import { enqueueJob, registerJobKind } from '@/lib/core/jobs';
import { getEmbeddingConfig } from '@/lib/ai/gateway';
import { embedTexts } from '@/lib/ai/clustering/layers/1-embeddings';
import { brandTokens } from '@/lib/seo/expediente/rules';
import { MAPA_KINDS } from '@/lib/seo/salud/kinds';
import { anonymousShare, buildTopics, cannibalization, lexicalGroups, queryHash, queryStats, type QueryPageRow, type WeekRow } from '@/lib/seo/mapa/rules';

export const MAPA_SOURCE = 'seo.mapa:gsc';
const MAX_EMBED = 1500;

export class MapaError extends Error {
  constructor(public userMessage: string) {
    super(userMessage);
  }
}

/** Agrupa por parecido con embeddings (guardados por texto y modelo); null si no hay embeddings disponibles. */
async function semanticGroups(tenantId: string, queries: string[]): Promise<{ groups: string[][]; embedded: number } | null> {
  if (queries.length < 3) return { groups: queries.map((q) => [q]), embedded: 0 };
  let cfg: { provider: string; model: string; apiKey: string };
  try {
    cfg = await getEmbeddingConfig(tenantId, 'platform');
  } catch {
    return null;
  }
  const model = `${cfg.provider}/${cfg.model}`.slice(0, 80);
  const list = queries.slice(0, MAX_EMBED);
  const hashes = list.map(queryHash);
  const cached = await db
    .select({ h: seoTextEmbeddings.textHash, v: seoTextEmbeddings.embedding })
    .from(seoTextEmbeddings)
    .where(and(eq(seoTextEmbeddings.model, model), inArray(seoTextEmbeddings.textHash, hashes)));
  const have = new Map(cached.map((c) => [c.h, c.v as number[]]));
  const missing = list.filter((_, i) => !have.has(hashes[i]));
  let embedded = 0;
  if (missing.length) {
    try {
      const vecs = await embedTexts(missing, cfg.provider, cfg.apiKey, cfg.model);
      for (let i = 0; i < missing.length; i++) {
        const h = queryHash(missing[i]);
        have.set(h, vecs[i]);
        await db.insert(seoTextEmbeddings).values({ textHash: h, model, embedding: vecs[i] }).onConflictDoNothing();
      }
      embedded = missing.length;
    } catch (e) {
      console.error('[seo] mapa de palabras: embeddings no disponibles, se agrupa por palabras:', e instanceof Error ? e.message.slice(0, 200) : e);
      return null;
    }
  }
  const vectors = list.map((_, i) => have.get(hashes[i])!);
  const labels = new HDBSCAN({ minClusterSize: 3, minSamples: 2 }).fit(vectors);
  const by = new Map<number, string[]>();
  const noise: string[] = [];
  labels.forEach((l: number, i: number) => (l === -1 ? noise.push(list[i]) : by.set(l, [...(by.get(l) ?? []), list[i]])));
  // El ruido de HDBSCAN aún puede agruparse por palabras; lo que no cupo en el tope, también.
  return { groups: [...by.values(), ...lexicalGroups([...noise, ...queries.slice(MAX_EMBED)])], embedded };
}

export type MapaResult = { topics: number; pageTopics: number; newPageTopics: number; queries: number; cannibal: number; anonymousPct: number | null; grouping: 'embeddings' | 'palabras'; embedded: number };

export async function buildKeywordMap(tenantId: string, projectId: string): Promise<MapaResult> {
  const [p] = await db
    .select({ id: projects.id, clientName: clients.name, aliases: clients.aliases })
    .from(projects)
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
    .limit(1);
  if (!p) throw new MapaError('Proyecto no encontrado');
  const props = await gscPropertiesForProject(tenantId, projectId);
  if (!props.length) throw new MapaError('El proyecto no tiene Search Console en su alcance: edita el proyecto y marca la propiedad del cliente.');
  const ids = sql.join(props.map((x) => sql`${x.id}`), sql`, `);

  // Consulta × página de los últimos 90 días (con los clics de los últimos 28 días y de los 28 anteriores).
  const rows = (await db.execute(sql`
    WITH lim AS (SELECT max(date) AS d FROM gsc_daily WHERE property_id IN (${ids}) AND search_type = 1)
    SELECT q.query, pg.url AS page, sum(g.clicks)::int AS clicks, sum(g.impressions)::int AS impressions, sum(g.pos_sum)::float AS pos_sum,
      sum(g.clicks) FILTER (WHERE g.date > lim.d - 28)::int AS clicks_recent,
      sum(g.clicks) FILTER (WHERE g.date <= lim.d - 28 AND g.date > lim.d - 56)::int AS clicks_prev
    FROM gsc_daily g JOIN gsc_queries q ON q.id = g.query_id JOIN gsc_pages pg ON pg.id = g.page_id, lim
    WHERE g.property_id IN (${ids}) AND g.search_type = 1 AND g.date > lim.d - 90
    GROUP BY q.query, pg.url`)) as unknown as { query: string; page: string; clicks: number; impressions: number; pos_sum: number; clicks_recent: number | null; clicks_prev: number | null }[];
  const qp: QueryPageRow[] = rows.map((r) => ({ query: r.query, page: r.page, clicks: Number(r.clicks), impressions: Number(r.impressions), posSum: Number(r.pos_sum), clicksRecent: Number(r.clicks_recent ?? 0), clicksPrev: Number(r.clicks_prev ?? 0) }));
  const stats = queryStats(qp);
  const pool = stats.filter((s) => !s.dominant).map((s) => s.query);
  const sem = await semanticGroups(tenantId, pool);
  const topics = buildTopics(stats, { brandTokens: brandTokens([p.clientName ?? '', ...((p.aliases as string[] | null) ?? [])]), similar: sem ? () => sem.groups : undefined });

  // Guardar: los temas de esta ejecución sustituyen a los activos anteriores; un tema que una persona descartó sigue descartado.
  const now = new Date();
  const keep: string[] = [];
  for (const t of topics.slice(0, 500)) {
    const [row] = await db
      .insert(seoTopics)
      .values({ tenantId, projectId, topicKey: t.topicKey, name: t.name.slice(0, 200), url: t.url, origin: t.origin, metrics: t.metrics, runAt: now })
      .onConflictDoUpdate({ target: [seoTopics.projectId, seoTopics.topicKey], set: { url: t.url, origin: t.origin, metrics: t.metrics, runAt: now, updatedAt: now, name: sql`CASE WHEN ${seoTopics.namedBy} = 'persona' THEN ${seoTopics.name} ELSE ${t.name.slice(0, 200)} END` } })
      .returning({ id: seoTopics.id });
    keep.push(t.topicKey);
    await db.delete(seoTopicQueries).where(eq(seoTopicQueries.topicId, row.id));
    const qs = t.queries.slice(0, 300);
    if (qs.length) {
      await db
        .insert(seoTopicQueries)
        .values(qs.map((q) => ({ topicId: row.id, queryHash: queryHash(q.query), query: q.query.slice(0, 500), source: 'gsc' as const, clicks: q.clicks, impressions: q.impressions, position: q.position })))
        .onConflictDoNothing();
    }
  }
  await db.delete(seoTopics).where(and(eq(seoTopics.projectId, projectId), eq(seoTopics.status, 'activo'), keep.length ? notInArray(seoTopics.topicKey, keep) : sql`true`));

  // Canibalización: consultas con ≥ 2 páginas, por semana.
  const pagesPerQuery = new Map<string, number>();
  for (const r of qp) if (r.impressions > 0) pagesPerQuery.set(r.query, (pagesPerQuery.get(r.query) ?? 0) + 1);
  const multi = new Set([...pagesPerQuery].filter(([, n]) => n >= 2).map(([q]) => q));
  let cannibal: ReturnType<typeof cannibalization> = [];
  if (multi.size) {
    const list = [...multi].slice(0, 2000);
    const weeks = (await db.execute(sql`
      SELECT q.query, pg.url AS page, to_char(date_trunc('week', g.date), 'YYYY-MM-DD') AS week, sum(g.impressions)::int AS impressions, sum(g.pos_sum)::float AS pos_sum
      FROM gsc_daily g JOIN gsc_queries q ON q.id = g.query_id JOIN gsc_pages pg ON pg.id = g.page_id
      WHERE g.property_id IN (${ids}) AND g.search_type = 1 AND g.date > current_date - 90 AND q.query IN (${sql.join(list.map((x) => sql`${x}`), sql`, `)})
      GROUP BY 1, 2, 3`)) as unknown as { query: string; page: string; week: string; impressions: number; pos_sum: number }[];
    cannibal = cannibalization(weeks.map((w): WeekRow => ({ query: w.query, page: w.page, week: w.week, impressions: Number(w.impressions), posSum: Number(w.pos_sum) })));
  }
  await syncFindings(
    tenantId,
    projectId,
    MAPA_SOURCE,
    cannibal.slice(0, 100).map((c) => ({ kind: 'seo.cannibalization', dedupeKey: `seo.cannibalization:${queryHash(c.query).slice(0, 16)}`, query: c.query, url: c.pages[0], value: c.switches, metric: 'cambios_de_lider', evidence: { paginas: c.pages, cambios: c.switches, semanas: c.weeks } })),
    MAPA_KINDS.map((k) => k.kind)
  );

  const [tot] = (await db.execute(sql`
    SELECT coalesce(sum(clicks), 0)::int AS clicks, coalesce(sum(query_clicks), 0)::int AS query_clicks
    FROM gsc_daily_totals WHERE property_id IN (${ids}) AND search_type = 1 AND date > current_date - 90`)) as unknown as { clicks: number; query_clicks: number }[];
  const anon = anonymousShare(Number(tot?.clicks ?? 0), Number(tot?.query_clicks ?? 0));
  if (cannibal.length) await enqueueJob({ tenantId, kind: 'seo.plan.regenerate', payload: { projectId }, scopeType: 'proyecto', scopeId: projectId, priority: 5, dedupeKey: `seo.plan:${projectId}` });
  return {
    topics: Math.min(topics.length, 500),
    pageTopics: topics.filter((t) => t.origin === 'pagina').length,
    newPageTopics: topics.filter((t) => t.url === null).length,
    queries: stats.length,
    cannibal: cannibal.length,
    anonymousPct: anon !== null ? Math.round(anon * 100) : null,
    grouping: sem ? 'embeddings' : 'palabras',
    embedded: sem?.embedded ?? 0
  };
}

export async function enqueueKeywordMap(tenantId: string, projectId: string): Promise<void> {
  await enqueueJob({ tenantId, kind: 'seo.mapa.build', payload: { projectId }, scopeType: 'proyecto', scopeId: projectId, priority: 5, dedupeKey: `seo.mapa:${projectId}` });
}

let registered = false;
export function registerMapaJobs(): void {
  if (registered) return;
  registered = true;
  registerJobKind({ kind: 'seo.mapa.build', timeoutS: 300, maxConcurrent: 1, maxAttempts: 2, run: async (ctx, payload) => buildKeywordMap(ctx.tenantId, String(payload.projectId ?? '')) });
}

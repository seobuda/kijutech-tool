import 'server-only';

// SEO · Mapa de palabras (Hito 2, 24 nov 2026; docs/DISENO-TECNICO-HITO2.md §2). Sobre el detalle de Search Console que
// ya guarda el núcleo (gsc_daily): temas por página dominante y, para lo que no tiene página clara, por parecido
// (embeddings guardados y reutilizados; si no hay proveedor de embeddings con saldo, por palabras). Sin IA de texto:
// el nombre de cada tema es su consulta principal. La canibalización sale como hallazgo y entra en el plan de mejora.
// Desde el 26 nov 2026 también las oportunidades (página nueva, elegir página, al alcance y CTR bajo), con el valor de
// negocio de cada tema (servicios del cliente, lo que no quiere y lo que más le interesa) y su temporada.
import { and, eq, inArray, notInArray, sql } from 'drizzle-orm';
import { HDBSCAN } from 'hdbscan-ts';
import { db } from '@/lib/db/drizzle';
import { clientMemory, clients, projects, seoDossierFacts, seoTextEmbeddings, seoTopicQueries, seoTopics } from '@/lib/db/schema';
import { gscPropertiesForProject } from '@/lib/core/gsc';
import { syncFindings } from '@/lib/core/findings';
import { enqueueJob, registerJobKind } from '@/lib/core/jobs';
import { getEmbeddingConfig } from '@/lib/ai/gateway';
import { embedTexts } from '@/lib/ai/clustering/layers/1-embeddings';
import { brandTokens } from '@/lib/seo/expediente/rules';
import { MAPA_KINDS } from '@/lib/seo/salud/kinds';
import { anonymousShare, buildTopics, cannibalization, lexicalGroups, opportunities, queryHash, queryStats, seasonality, topicGain, topicValue, type MonthRow, type QueryPageRow, type ValueContext, type WeekRow } from '@/lib/seo/mapa/rules';

export const MAPA_SOURCE = 'seo.mapa:gsc';
const MAX_EMBED = 1500;

export class MapaError extends Error {
  constructor(public userMessage: string) {
    super(userMessage);
  }
}

/** Tanda de embeddings por llamada: la capa gratuita de Gemini cuenta cada texto como una petición (≈100/min). */
const EMBED_CHUNK = 90;
/** Tiempo máximo que una ejecución dedica a pedir embeddings (el trabajo tiene 300 s). */
const EMBED_BUDGET_MS = 170_000;
/** Ejecuciones de seguimiento si quedan consultas sin vector (el límite puede ser por minuto o por día). */
export const MAX_EMBED_ROUNDS = 6;

const isRateLimit = (e: unknown) => /\b429\b|quota|rate.?limit|RESOURCE_EXHAUSTED/i.test(e instanceof Error ? e.message : String(e));
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

type SemanticResult = { groups: string[][]; embedded: number; pending: number };

/**
 * Agrupa por parecido con embeddings (guardados por texto y modelo); null si no hay embeddings disponibles.
 * Pide los que faltan por tandas y guarda cada tanda al llegar: si el proveedor corta por límite (429), espera un minuto
 * y lo reintenta una vez; si sigue cortando, agrupa con lo que ya tiene (el resto, por palabras) y devuelve cuántos
 * quedan pendientes para que una ejecución posterior los complete desde la caché.
 */
async function semanticGroups(tenantId: string, queries: string[]): Promise<SemanticResult | null> {
  // Con menos de 3 búsquedas sin página no hay nada que agrupar por significado: se agrupan por palabras.
  if (queries.length < 3) return null;
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
  let lastError: unknown = null;
  const t0 = Date.now();
  for (let i = 0; i < missing.length; i += EMBED_CHUNK) {
    if (Date.now() - t0 > EMBED_BUDGET_MS) break;
    const chunk = missing.slice(i, i + EMBED_CHUNK);
    let vecs: number[][] | null = null;
    for (let attempt = 0; attempt < 2 && !vecs; attempt++) {
      try {
        vecs = await embedTexts(chunk, cfg.provider, cfg.apiKey, cfg.model);
      } catch (e) {
        lastError = e;
        if (attempt === 0 && isRateLimit(e) && Date.now() - t0 + 62_000 < EMBED_BUDGET_MS) await pause(62_000);
        else break;
      }
    }
    if (!vecs) break;
    const rowsToSave = chunk.map((q, j) => ({ textHash: queryHash(q), model, embedding: vecs![j] }));
    rowsToSave.forEach((r) => have.set(r.textHash, r.embedding));
    await db.insert(seoTextEmbeddings).values(rowsToSave).onConflictDoNothing();
    embedded += chunk.length;
  }
  const withVec = list.filter((_, i) => have.has(hashes[i]));
  const without = list.filter((_, i) => !have.has(hashes[i]));
  if (without.length) {
    console.error(
      `[seo] mapa de palabras: ${without.length} de ${list.length} consultas sin embeddings (se agrupan por palabras y se reintenta más tarde):`,
      lastError instanceof Error ? lastError.message.slice(0, 200) : lastError ?? 'tiempo agotado'
    );
  }
  if (withVec.length < 3) return null;
  const labels = new HDBSCAN({ minClusterSize: 3, minSamples: 2 }).fit(withVec.map((q) => have.get(queryHash(q))!));
  const by = new Map<number, string[]>();
  const noise: string[] = [];
  labels.forEach((l: number, i: number) => (l === -1 ? noise.push(withVec[i]) : by.set(l, [...(by.get(l) ?? []), withVec[i]])));
  // El ruido de HDBSCAN, lo que aún no tiene vector y lo que no cupo en el tope se agrupan por palabras.
  return { groups: [...by.values(), ...lexicalGroups([...noise, ...without, ...queries.slice(MAX_EMBED)])], embedded, pending: without.length };
}

export type MapaResult = {
  topics: number;
  pageTopics: number;
  newPageTopics: number;
  unclearTopics: number;
  queries: number;
  cannibal: number;
  opportunities: number;
  gainPerMonth: number;
  anonymousPct: number | null;
  grouping: 'embeddings' | 'palabras';
  embedded: number;
  pendingEmbeddings: number;
  /** Hay datos del cliente para el valor de negocio (servicios en orden). */
  hasValueData: boolean;
};

/** Lo que sabemos del cliente para el valor de cada tema: servicios en orden, lo que no quiere y lo que más le interesa. */
async function valueContext(tenantId: string, projectId: string, clientId: string | null, offerings: string | null): Promise<ValueContext> {
  // Servicios: el dato del expediente (confirmado primero; si no, el de más confianza); si no hay, la ficha.
  const facts = await db
    .select({ value: seoDossierFacts.value, status: seoDossierFacts.status, confidence: seoDossierFacts.confidence, source: seoDossierFacts.source })
    .from(seoDossierFacts)
    .where(and(eq(seoDossierFacts.projectId, projectId), eq(seoDossierFacts.field, 'servicios')));
  // La propuesta de la IA solo cuenta si una persona la confirmó.
  const best = facts.filter((f) => f.status !== 'descartado' && (f.source !== 'ia' || f.status === 'confirmado')).sort((a, b) => Number(b.status === 'confirmado') - Number(a.status === 'confirmado') || b.confidence - a.confidence)[0];
  let services = Array.isArray(best?.value) ? (best!.value as unknown[]).map(String) : [];
  if (!services.length && offerings) services = offerings.split(/[,;\n·]/).map((x) => x.trim()).filter((x) => x.length >= 3);
  services = services.slice(0, 20);
  let avoid: string[] = [];
  let prefer: string[] = [];
  if (clientId) {
    const mem = await db
      .select({ kind: clientMemory.kind, text: clientMemory.text })
      .from(clientMemory)
      .where(and(eq(clientMemory.clientId, clientId), eq(clientMemory.tenantId, tenantId), eq(clientMemory.status, 'aceptado'), inArray(clientMemory.kind, ['restriccion', 'preferencia'])));
    // Las respuestas a las Preguntas se guardan como «pregunta → respuesta»: solo cuenta la respuesta.
    const answer = (t: string) => (t.includes('→') ? t.slice(t.lastIndexOf('→') + 1) : t).trim();
    avoid = mem.filter((m) => m.kind === 'restriccion').map((m) => answer(m.text)).filter(Boolean);
    prefer = mem.filter((m) => m.kind === 'preferencia').map((m) => answer(m.text)).filter(Boolean);
  }
  return { services, avoid, prefer };
}

export async function buildKeywordMap(tenantId: string, projectId: string, round = 0): Promise<MapaResult> {
  const [p] = await db
    .select({ id: projects.id, clientId: projects.clientId, clientName: clients.name, aliases: clients.aliases, offerings: clients.offerings })
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
  const brand = brandTokens([p.clientName ?? '', ...((p.aliases as string[] | null) ?? [])]);
  const topics = buildTopics(stats, { brandTokens: brand, similar: sem ? () => sem.groups : undefined });

  // Valor de negocio, oportunidad y temporada de cada tema.
  const ctx = await valueContext(tenantId, projectId, p.clientId, p.offerings);
  for (const t of topics) {
    const v = topicValue(t, ctx);
    t.metrics.valor = v.valor;
    t.metrics.servicio = v.servicio;
    t.metrics.aviso = v.aviso;
    t.metrics.oportunidad = topicGain(t);
  }
  const [lim] = (await db.execute(sql`SELECT to_char(max(date), 'YYYY-MM-DD') AS d FROM gsc_daily WHERE property_id IN (${ids}) AND search_type = 1`)) as unknown as { d: string | null }[];
  if (lim?.d) {
    // Último mes completo: el anterior al de la última fecha, salvo que esa fecha sea el último día del mes.
    const last = new Date(`${lim.d}T00:00:00Z`);
    const next = new Date(last.getTime() + 86_400_000);
    const lastMonth = next.getUTCDate() === 1 ? `${lim.d.slice(0, 7)}-01` : new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
    const topQueries = [...new Set(topics.slice(0, 200).flatMap((t) => t.queries.slice(0, 50).map((q) => q.query)))].slice(0, 4000);
    if (topQueries.length) {
      const months = (await db.execute(sql`
        SELECT q.query, to_char(m.month, 'YYYY-MM-DD') AS month, sum(m.clicks)::int AS clicks, sum(m.impressions)::int AS impressions
        FROM gsc_monthly m JOIN gsc_queries q ON q.id = m.query_id
        WHERE m.property_id IN (${ids}) AND m.month > (${lastMonth}::date - interval '16 months') AND q.query IN (${sql.join(topQueries.map((x) => sql`${x}`), sql`, `)})
        GROUP BY 1, 2`)) as unknown as { query: string; month: string; clicks: number; impressions: number }[];
      const monthRows: MonthRow[] = months.map((r) => ({ query: r.query, month: r.month, clicks: Number(r.clicks), impressions: Number(r.impressions) }));
      if (monthRows.length) {
        for (const t of topics.slice(0, 200)) {
          const s2 = seasonality(t.queries.map((q) => q.query), monthRows, lastMonth);
          t.metrics.interanualPct = s2.interanualPct;
          t.metrics.mesesFuertes = s2.mesesFuertes;
        }
      }
    }
  }

  // Guardar: los temas de esta ejecución sustituyen a los activos anteriores; un tema que una persona descartó sigue descartado.
  const now = new Date();
  const keep: string[] = [];
  for (const t of topics.slice(0, 500)) {
    const [row] = await db
      .insert(seoTopics)
      .values({ tenantId, projectId, topicKey: t.topicKey, name: t.name.slice(0, 200), url: t.url, origin: t.origin, metrics: t.metrics as Record<string, number | null>, runAt: now })
      .onConflictDoUpdate({ target: [seoTopics.projectId, seoTopics.topicKey], set: { url: t.url, origin: t.origin, metrics: t.metrics as Record<string, number | null>, runAt: now, updatedAt: now, name: sql`CASE WHEN ${seoTopics.namedBy} = 'persona' THEN ${seoTopics.name} ELSE ${t.name.slice(0, 200)} END` } })
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
  // Hallazgos del mapa (canibalización y oportunidades): los temas descartados por una persona no proponen trabajo.
  const discarded = new Set(
    (await db.select({ k: seoTopics.topicKey }).from(seoTopics).where(and(eq(seoTopics.projectId, projectId), eq(seoTopics.status, 'descartado')))).map((r) => r.k)
  );
  const statByQuery = new Map(stats.map((x) => [x.query, x]));
  const opps = opportunities(topics.slice(0, 500).filter((t) => !discarded.has(t.topicKey)), stats, brand);
  await syncFindings(
    tenantId,
    projectId,
    MAPA_SOURCE,
    [
      ...cannibal.slice(0, 100).map((c) => ({ kind: 'seo.cannibalization', dedupeKey: `seo.cannibalization:${queryHash(c.query).slice(0, 16)}`, query: c.query, url: c.pages[0], value: c.switches, metric: 'cambios_de_lider', evidence: { paginas: c.pages, cambios: c.switches, semanas: c.weeks, impresiones: statByQuery.get(c.query)?.impressions ?? null } })),
      ...opps.map((o) => ({ kind: o.kind, dedupeKey: o.dedupeKey, severity: o.severity, url: o.url, query: o.query, value: o.gain, metric: 'clics_mes', evidence: o.evidence }))
    ],
    MAPA_KINDS.map((k) => k.kind)
  );

  const [tot] = (await db.execute(sql`
    SELECT coalesce(sum(clicks), 0)::int AS clicks, coalesce(sum(query_clicks), 0)::int AS query_clicks
    FROM gsc_daily_totals WHERE property_id IN (${ids}) AND search_type = 1 AND date > current_date - 90`)) as unknown as { clicks: number; query_clicks: number }[];
  const anon = anonymousShare(Number(tot?.clicks ?? 0), Number(tot?.query_clicks ?? 0));
  // El plan se rehace siempre: las oportunidades nuevas entran y las resueltas caducan.
  await enqueueJob({ tenantId, kind: 'seo.plan.regenerate', payload: { projectId }, scopeType: 'proyecto', scopeId: projectId, priority: 5, dedupeKey: `seo.plan:${projectId}` });
  // Quedan consultas sin vector (límite del proveedor): otra pasada en una hora, que parte de la caché. Clave propia,
  // porque la ejecución actual sigue «en curso» y ocupa la clave normal.
  if (sem?.pending && round < MAX_EMBED_ROUNDS) {
    await enqueueJob({ tenantId, kind: 'seo.mapa.build', payload: { projectId, round: round + 1 }, scopeType: 'proyecto', scopeId: projectId, priority: 7, runAt: new Date(Date.now() + 60 * 60_000), dedupeKey: `seo.mapa:${projectId}:seguimiento:${round + 1}` });
  }
  return {
    topics: Math.min(topics.length, 500),
    pageTopics: topics.filter((t) => t.origin === 'pagina').length,
    newPageTopics: topics.filter((t) => t.url === null && !t.metrics.candidata).length,
    unclearTopics: topics.filter((t) => t.url === null && Boolean(t.metrics.candidata)).length,
    queries: stats.length,
    cannibal: cannibal.length,
    opportunities: opps.length,
    gainPerMonth: opps.reduce((s3, o) => s3 + o.gain, 0),
    hasValueData: ctx.services.length > 0,
    anonymousPct: anon !== null ? Math.round(anon * 100) : null,
    grouping: sem ? 'embeddings' : 'palabras',
    embedded: sem?.embedded ?? 0,
    pendingEmbeddings: sem?.pending ?? 0
  };
}

export async function enqueueKeywordMap(tenantId: string, projectId: string): Promise<void> {
  await enqueueJob({ tenantId, kind: 'seo.mapa.build', payload: { projectId }, scopeType: 'proyecto', scopeId: projectId, priority: 5, dedupeKey: `seo.mapa:${projectId}` });
}

let registered = false;
export function registerMapaJobs(): void {
  if (registered) return;
  registered = true;
  registerJobKind({ kind: 'seo.mapa.build', timeoutS: 300, maxConcurrent: 1, maxAttempts: 2, run: async (ctx, payload) => buildKeywordMap(ctx.tenantId, String(payload.projectId ?? ''), Number(payload.round ?? 0) || 0) });
}

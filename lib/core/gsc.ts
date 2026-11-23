import 'server-only';

// Núcleo: Search Console en detalle (cimientos, 23 nov 2026; docs/DISENO-TECNICO-CIMIENTOS.md §4).
// Guarda cada día el detalle consulta × página × dispositivo (paginado hasta el final), los totales del día (para saber
// cuántos clics son de consultas anónimas), el reparto por país y un resumen mensual que se conserva para siempre. El
// detalle diario vive en una tabla particionada por mes y se guarda 24 meses. El núcleo no habla con Google: usa la
// fuente de métricas que registra Agentes (registerMetricSource → search), con reintento ante límites de Google.
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clientAssets, gscDaily, gscDailyCountry, gscDailyTotals, gscPages, gscProperties, gscQueries, projectAssets, type GscProperty } from '@/lib/db/schema';
import { metricSources, type MetricSource, type SearchQuery, type SearchRow } from '@/lib/core/capabilities';
import { ensureSchedule, enqueueJob, registerJobKind, registerProcess, type JobContext } from '@/lib/core/jobs';
import {
  backfillChunk,
  dailyWindow,
  detailRow,
  historyStart,
  isRetryableGoogleError,
  partitionBounds,
  partitionName,
  posSum,
  propertyKind,
  SEARCH_TYPES,
  textHash,
  type SearchTypeName
} from '@/lib/core/gsc-rules';

const PAGE_SIZE = 25_000;
/** Tope de filas de detalle por día y propiedad (Google da unas 50.000 al día; más allá conviene BigQuery). */
const MAX_ROWS_PER_DAY = 100_000;
const RETENTION_MONTHS = 24;

function gscSource(): MetricSource | null {
  return metricSources().find((s) => s.kinds.some((k) => k.source === 'gsc') && s.search) ?? null;
}

async function searchWithRetry(src: MetricSource, tenantId: string, property: string, q: SearchQuery, signal?: AbortSignal): Promise<SearchRow[]> {
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw new Error('Cancelado por tiempo');
    try {
      return await src.search!(tenantId, 'gsc', property, q);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt >= 3 || !isRetryableGoogleError(msg)) throw e;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
    }
  }
}

// --- Propiedades -----------------------------------------------------------------------------------------------------

/** Da de alta (si no estaba) la propiedad y programa su descarga. */
export async function ensureGscProperty(tenantId: string, siteUrl: string, clientAssetId: string | null): Promise<GscProperty> {
  const site = siteUrl.trim();
  await db
    .insert(gscProperties)
    .values({ tenantId, siteUrl: site, kind: propertyKind(site), clientAssetId })
    .onConflictDoUpdate({ target: [gscProperties.tenantId, gscProperties.siteUrl], set: { status: 'activa', ...(clientAssetId ? { clientAssetId } : {}) } });
  const [p] = await db.select().from(gscProperties).where(and(eq(gscProperties.tenantId, tenantId), eq(gscProperties.siteUrl, site))).limit(1);
  // Cada 6 horas: el trabajo decide si toca el día a día o un tramo del histórico.
  await ensureSchedule(tenantId, 'gsc.sync', String(p.id), 360);
  await ensureSchedule(tenantId, 'gsc.retention', '', 7 * 24 * 60);
  return p;
}

/** Las propiedades de Search Console del alcance de un proyecto, dadas de alta y programadas. */
export async function syncGscPropertiesForProject(tenantId: string, projectId: string): Promise<number> {
  const src = gscSource();
  const assets = await db
    .select({ id: clientAssets.id, value: clientAssets.value })
    .from(projectAssets)
    .innerJoin(clientAssets, eq(clientAssets.id, projectAssets.clientAssetId))
    .where(and(eq(projectAssets.projectId, projectId), eq(clientAssets.kind, 'search_console')));
  let n = 0;
  for (const a of assets) {
    if (!a.value) continue;
    const site = src?.normalize('gsc', a.value) ?? a.value;
    if (!site) continue;
    await ensureGscProperty(tenantId, site, a.id);
    n++;
  }
  return n;
}

// --- Particiones y retención ----------------------------------------------------------------------------------------

const createdPartitions = new Set<string>();

/** Crea (si falta) la partición mensual de gsc_daily que contiene la fecha. */
export async function ensureGscPartition(date: string): Promise<void> {
  const name = partitionName(date);
  if (createdPartitions.has(name)) return;
  const { from, to } = partitionBounds(date);
  if (!/^gsc_daily_y\d{4}m\d{2}$/.test(name)) throw new Error('Nombre de partición no válido');
  await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS "${name}" PARTITION OF "gsc_daily" FOR VALUES FROM ('${from}') TO ('${to}')`));
  createdPartitions.add(name);
}

/** Borra las particiones de más de 24 meses (borrar una partición entera es inmediato). */
export async function dropOldGscPartitions(today = new Date(), keepMonths = RETENTION_MONTHS): Promise<string[]> {
  const rows = (await db.execute(sql`SELECT c.relname AS name FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid JOIN pg_class p ON p.oid = i.inhparent WHERE p.relname = 'gsc_daily'`)) as unknown as { name: string }[];
  const limit = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - keepMonths, 1));
  const limitKey = limit.getUTCFullYear() * 100 + limit.getUTCMonth() + 1;
  const dropped: string[] = [];
  for (const { name } of rows) {
    const m = name.match(/^gsc_daily_y(\d{4})m(\d{2})$/);
    if (!m || Number(m[1]) * 100 + Number(m[2]) >= limitKey) continue;
    await db.execute(sql.raw(`DROP TABLE IF EXISTS "${name}"`));
    createdPartitions.delete(name);
    dropped.push(name);
  }
  return dropped;
}

// --- Diccionarios ----------------------------------------------------------------------------------------------------

async function dictionaryIds(table: 'queries' | 'pages', propertyId: number, texts: string[], date: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const unique = [...new Set(texts)];
  for (let i = 0; i < unique.length; i += 2000) {
    const chunk = unique.slice(i, i + 2000).map((t) => ({ t, h: textHash(t) }));
    if (table === 'queries') {
      await db.insert(gscQueries).values(chunk.map((c) => ({ propertyId, query: c.t, queryHash: c.h, firstSeen: date }))).onConflictDoNothing();
      const rows = await db.select({ id: gscQueries.id, h: gscQueries.queryHash }).from(gscQueries).where(and(eq(gscQueries.propertyId, propertyId), inArray(gscQueries.queryHash, chunk.map((c) => c.h))));
      const byHash = new Map(rows.map((r) => [r.h, r.id]));
      for (const c of chunk) out.set(c.t, byHash.get(c.h)!);
    } else {
      await db.insert(gscPages).values(chunk.map((c) => ({ propertyId, url: c.t, urlHash: c.h, firstSeen: date }))).onConflictDoNothing();
      const rows = await db.select({ id: gscPages.id, h: gscPages.urlHash }).from(gscPages).where(and(eq(gscPages.propertyId, propertyId), inArray(gscPages.urlHash, chunk.map((c) => c.h))));
      const byHash = new Map(rows.map((r) => [r.h, r.id]));
      for (const c of chunk) out.set(c.t, byHash.get(c.h)!);
    }
  }
  return out;
}

// --- Descarga de un día ---------------------------------------------------------------------------------------------

export type DaySyncResult = { date: string; rows: number; clicks: number; queryClicks: number; truncated: boolean };

/** Descarga y guarda (sustituyendo lo que hubiera) un día de una propiedad. */
export async function syncGscDay(ctx: Pick<JobContext, 'tenantId' | 'heartbeat' | 'signal'>, prop: Pick<GscProperty, 'id' | 'siteUrl'>, date: string, searchType: SearchTypeName = 'web'): Promise<DaySyncResult> {
  const src = gscSource();
  if (!src) throw new Error('No hay fuente de Search Console conectada (Agentes → Integraciones → Google)');
  const base = { from: date, to: date, searchType, dataState: 'all' as const };
  const [totalRows, countryRows] = await Promise.all([
    searchWithRetry(src, ctx.tenantId, prop.siteUrl, { ...base, dimensions: [], limit: 1 }, ctx.signal),
    searchType === 'web' ? searchWithRetry(src, ctx.tenantId, prop.siteUrl, { ...base, dimensions: ['country'], limit: 300 }, ctx.signal) : Promise.resolve([])
  ]);
  const detail: NonNullable<ReturnType<typeof detailRow>>[] = [];
  let truncated = false;
  for (let start = 0; ; start += PAGE_SIZE) {
    const page = await searchWithRetry(src, ctx.tenantId, prop.siteUrl, { ...base, dimensions: ['query', 'page', 'device'], limit: PAGE_SIZE, startRow: start }, ctx.signal);
    for (const r of page) {
      const d = detailRow(r);
      if (d) detail.push(d);
    }
    await ctx.heartbeat();
    if (page.length < PAGE_SIZE) break;
    if (detail.length >= MAX_ROWS_PER_DAY) {
      truncated = true;
      break;
    }
  }
  const t = totalRows[0];
  const totals = { clicks: Math.round(t?.clicks ?? 0), impressions: Math.round(t?.impressions ?? 0), posSum: posSum(t?.position ?? 0, t?.impressions ?? 0) };
  const queryClicks = detail.reduce((a, r) => a + r.clicks, 0);
  const st = SEARCH_TYPES[searchType];

  await ensureGscPartition(date);
  const [qIds, pIds] = await Promise.all([dictionaryIds('queries', prop.id, detail.map((r) => r.query), date), dictionaryIds('pages', prop.id, detail.map((r) => r.page), date)]);
  // Si la misma combinación llega dos veces (no debería), se suman.
  const merged = new Map<string, { queryId: number; pageId: number; device: number; clicks: number; impressions: number; posSum: number }>();
  for (const r of detail) {
    const queryId = qIds.get(r.query)!;
    const pageId = pIds.get(r.page)!;
    const k = `${queryId}:${pageId}:${r.device}`;
    const prev = merged.get(k);
    if (prev) {
      prev.clicks += r.clicks;
      prev.impressions += r.impressions;
      prev.posSum += r.posSum;
    } else merged.set(k, { queryId, pageId, device: r.device, clicks: r.clicks, impressions: r.impressions, posSum: r.posSum });
  }
  const rows = [...merged.values()];
  await db.transaction(async (tx) => {
    await tx.delete(gscDaily).where(and(eq(gscDaily.propertyId, prop.id), eq(gscDaily.date, date), eq(gscDaily.searchType, st)));
    for (let i = 0; i < rows.length; i += 2000) {
      await tx.insert(gscDaily).values(rows.slice(i, i + 2000).map((r) => ({ propertyId: prop.id, date, searchType: st, ...r })));
    }
    await tx
      .insert(gscDailyTotals)
      .values({ propertyId: prop.id, date, searchType: st, ...totals, queryClicks, truncated })
      .onConflictDoUpdate({ target: [gscDailyTotals.propertyId, gscDailyTotals.date, gscDailyTotals.searchType], set: { ...totals, queryClicks, truncated } });
    if (searchType === 'web') {
      await tx.delete(gscDailyCountry).where(and(eq(gscDailyCountry.propertyId, prop.id), eq(gscDailyCountry.date, date)));
      const countries = countryRows.filter((r) => r.keys?.[0]).map((r) => ({ propertyId: prop.id, date, country: String(r.keys[0]).slice(0, 3).toLowerCase(), clicks: Math.round(r.clicks), impressions: Math.round(r.impressions), posSum: posSum(r.position, r.impressions) }));
      if (countries.length) await tx.insert(gscDailyCountry).values(countries);
    }
  });
  return { date, rows: rows.length, clicks: totals.clicks, queryClicks, truncated };
}

/** Rehace el resumen mensual consulta × página de un mes a partir del detalle diario. */
export async function rollupGscMonth(propertyId: number, month: string): Promise<void> {
  const { from, to } = partitionBounds(month);
  await db.execute(sql`
    INSERT INTO gsc_monthly (property_id, month, query_id, page_id, clicks, impressions, pos_sum)
    SELECT property_id, ${from}::date, query_id, page_id, sum(clicks), sum(impressions), sum(pos_sum)
    FROM gsc_daily WHERE property_id = ${propertyId} AND date >= ${from}::date AND date < ${to}::date AND search_type = 1
    GROUP BY property_id, query_id, page_id
    ON CONFLICT (property_id, month, query_id, page_id) DO UPDATE SET clicks = EXCLUDED.clicks, impressions = EXCLUDED.impressions, pos_sum = EXCLUDED.pos_sum`);
}

// --- Trabajo de la cola ---------------------------------------------------------------------------------------------

type SyncState = { backfillCursor?: string; backfillDone?: boolean; rolledMonths?: string[] };

/**
 * Una vuelta de descarga de una propiedad: primero los últimos días (Google los corrige) y después, si queda, un tramo
 * del histórico hacia atrás (16 meses). Si queda histórico, se vuelve a encolar en seguida.
 */
export async function runGscSync(ctx: JobContext, propertyId: number, today = new Date()): Promise<Record<string, unknown>> {
  const [prop] = await db.select().from(gscProperties).where(and(eq(gscProperties.id, propertyId), eq(gscProperties.tenantId, ctx.tenantId))).limit(1);
  if (!prop || prop.status === 'inactiva') return { skipped: true };
  // Una sola descarga a la vez por propiedad (la programada y la del histórico podrían coincidir).
  const busy = (await db.execute(sql`SELECT 1 FROM jobs WHERE kind = 'gsc.sync' AND status = 'en_curso' AND payload->>'propertyId' = ${String(propertyId)} AND id <> ${ctx.job.id} LIMIT 1`)) as unknown as unknown[];
  if (busy.length) return { skipped: 'otra descarga en curso' };
  const state = (prop.syncState ?? {}) as SyncState;
  const days = dailyWindow(today);
  let rows = 0;
  try {
    for (const d of days) rows += (await syncGscDay(ctx, prop, d)).rows;
    let chunkDone = 0;
    if (!state.backfillDone) {
      const cursor = state.backfillCursor ?? days[0];
      const chunk = backfillChunk(cursor, historyStart(today), 14);
      if (chunk) {
        for (const d of chunk) {
          rows += (await syncGscDay(ctx, prop, d)).rows;
          chunkDone++;
        }
        state.backfillCursor = chunk[chunk.length - 1];
      } else state.backfillDone = true;
    }
    // Meses cerrados que tocan resumirse (el actual se rehace siempre).
    const months = new Set<string>([...days, ...(state.backfillCursor ? [state.backfillCursor] : [])].map((d) => `${d.slice(0, 7)}-01`));
    for (const m of months) await rollupGscMonth(prop.id, m);
    await db
      .update(gscProperties)
      .set({ syncState: state, lastSyncAt: new Date(), lastDate: days[days.length - 1], firstDate: state.backfillCursor ?? prop.firstDate ?? days[0], status: 'activa', lastError: null })
      .where(eq(gscProperties.id, prop.id));
    if (!state.backfillDone && chunkDone) {
      await enqueueJob({ tenantId: ctx.tenantId, kind: 'gsc.sync', payload: { propertyId }, priority: 8, dedupeKey: `gsc.backfill:${propertyId}`, runAt: new Date(Date.now() + 5_000) });
    }
    return { rows, backfill: state.backfillDone ? 'completo' : state.backfillCursor };
  } catch (e) {
    await db.update(gscProperties).set({ status: 'error', lastError: (e instanceof Error ? e.message : String(e)).slice(0, 1000) }).where(eq(gscProperties.id, prop.id));
    throw e;
  }
}

/** Registra en la cola la descarga y el mantenimiento de particiones (lo llama wireApp). */
export function registerGscJobs(): void {
  registerJobKind({ kind: 'gsc.sync', timeoutS: 900, maxConcurrent: 2, maxAttempts: 3, run: (ctx, p) => runGscSync(ctx, Number(p.propertyId)) });
  registerJobKind({
    kind: 'gsc.retention',
    timeoutS: 120,
    maxConcurrent: 1,
    run: async () => ({ dropped: await dropOldGscPartitions() })
  });
  registerProcess({ key: 'gsc.sync', scopeType: 'cuenta', label: 'Search Console: descarga del detalle', defaultEveryMinutes: 360, enqueue: (_t, scopeId) => ({ kind: 'gsc.sync', payload: { propertyId: Number(scopeId) }, priority: 6 }) });
  registerProcess({ key: 'gsc.retention', scopeType: 'cuenta', label: 'Search Console: retención (24 meses)', defaultEveryMinutes: 7 * 24 * 60, enqueue: () => ({ kind: 'gsc.retention', priority: 9 }) });
}

// --- Lecturas para los departamentos ---------------------------------------------------------------------------------

/** Clics, impresiones y porcentaje anónimo de un periodo (web). */
export async function gscPeriodTotals(propertyId: number, from: string, to: string): Promise<{ clicks: number; impressions: number; queryClicks: number; position: number | null }> {
  const [r] = (await db.execute(sql`
    SELECT coalesce(sum(clicks),0)::int AS clicks, coalesce(sum(impressions),0)::int AS impressions, coalesce(sum(query_clicks),0)::int AS query_clicks,
           CASE WHEN sum(impressions) > 0 THEN sum(pos_sum) / sum(impressions) END AS position
    FROM gsc_daily_totals WHERE property_id = ${propertyId} AND search_type = 1 AND date BETWEEN ${from}::date AND ${to}::date`)) as unknown as { clicks: number; impressions: number; query_clicks: number; position: number | null }[];
  return { clicks: Number(r?.clicks ?? 0), impressions: Number(r?.impressions ?? 0), queryClicks: Number(r?.query_clicks ?? 0), position: r?.position == null ? null : Number(r.position) };
}

export async function gscPropertiesForProject(tenantId: string, projectId: string): Promise<GscProperty[]> {
  return db
    .select({ p: gscProperties })
    .from(gscProperties)
    .innerJoin(projectAssets, eq(projectAssets.clientAssetId, gscProperties.clientAssetId))
    .where(and(eq(gscProperties.tenantId, tenantId), eq(projectAssets.projectId, projectId)))
    .then((rows) => rows.map((r) => r.p));
}

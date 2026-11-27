import 'server-only';

// SEO · Análisis inicial: orquestador (docs/PLAN-SEO-JEFE.md, D0, con la auditoría Opus).
// - «Empezar análisis» abre una ejecución (una por proyecto; índice único parcial). El estado de las etapas se calcula con
//   los datos de ahora (rules.ts): no hay relleno para los proyectos existentes ni «hechos» que se queden viejos.
// - Un solo proceso por cuenta, cada 10 min, avanza las ejecuciones abiertas; cada proyecto bajo candado de PostgreSQL
//   (pg_try_advisory_xact_lock): dos pasadas a la vez no empujan lo mismo (auditoría, grave 3).
// - Empuja los trabajos existentes con la MISMA clave que el planificador («sched:<proceso>:<proyecto>») o con la suya
//   propia: la cola descarta el duplicado. Cada acción, como mucho una vez cada 6 h (el rastreo, cada 12 h).
// - Se completa cuando el diagnóstico está resuelto; el plan de servicio (D2) llegará después.
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clientAssets, clientCompetitors, clientConnections, projects, seoDemand, seoDossierFacts, seoLocalPlaces, seoRankKeywords, seoSetupRuns, seoTopics } from '@/lib/db/schema';
import { serpSource } from '@/lib/core/capabilities';
import { enqueueJob } from '@/lib/core/jobs';
import { gscPropertiesForProject } from '@/lib/core/gsc';
import { latestProjectCrawl, projectWebUrl, startProjectAudit } from '@/lib/seo/salud/audit';
import { enqueueProposal } from '@/lib/seo/alta/alta';
import { enqueueKeywordMap } from '@/lib/seo/mapa/mapa';
import { enqueueCompetitors } from '@/lib/seo/competencia/competencia';
import { canSpend } from '@/lib/seo/gasto';
import { actionsFor, connections, evaluate, gscClass, MAX_ATTEMPTS, progress, SETTLED, SKIPPABLE, type Facts } from '@/lib/seo/arranque/rules';

export class SetupError extends Error {
  constructor(public userMessage: string) {
    super(userMessage);
  }
}

const FRESH_DAYS = 30;

/** Los hechos del proyecto ahora (solo tablas propias y la cola: ninguna llamada externa). */
export async function gatherFacts(tenantId: string, projectId: string, skipped: string[] = []): Promise<Facts> {
  const [p] = await db.select({ clientId: projects.clientId, monthlyHours: projects.monthlyHours }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  if (!p) throw new SetupError('Proyecto no encontrado.');
  const cid = p.clientId;
  const [web, props, crawl, facts, comps, demand, rank, topics, places, assets, conns, dfs, budget] = await Promise.all([
    projectWebUrl(tenantId, projectId),
    gscPropertiesForProject(tenantId, projectId).catch(() => []),
    latestProjectCrawl(projectId),
    db.select({ field: seoDossierFacts.field, status: seoDossierFacts.status, source: seoDossierFacts.source }).from(seoDossierFacts).where(eq(seoDossierFacts.projectId, projectId)),
    cid ? db.select({ status: clientCompetitors.status, n: sql<number>`count(*)::int` }).from(clientCompetitors).where(and(eq(clientCompetitors.clientId, cid), eq(clientCompetitors.kind, 'directo'))).groupBy(clientCompetitors.status) : Promise.resolve([]),
    db.select({ n: sql<number>`count(*)::int` }).from(seoDemand).where(and(eq(seoDemand.projectId, projectId), sql`coalesce(${seoDemand.volume}, 0) > 0`)),
    db.select({ n: sql<number>`count(*)::int` }).from(seoRankKeywords).where(and(eq(seoRankKeywords.projectId, projectId), sql`coalesce(${seoRankKeywords.volume}, 0) > 0`)),
    db.select({ n: sql<number>`count(*)::int` }).from(seoTopics).where(eq(seoTopics.projectId, projectId)),
    cid ? db.select({ n: sql<number>`count(*)::int` }).from(seoLocalPlaces).where(and(eq(seoLocalPlaces.clientId, cid), eq(seoLocalPlaces.role, 'cliente'), eq(seoLocalPlaces.status, 'confirmada'))) : Promise.resolve([{ n: 0 }]),
    cid ? db.select({ kind: clientAssets.kind, access: clientAssets.access }).from(clientAssets).where(eq(clientAssets.clientId, cid)) : Promise.resolve([]),
    cid ? db.select({ kind: clientConnections.kind, status: clientConnections.status }).from(clientConnections).where(eq(clientConnections.clientId, cid)) : Promise.resolve([]),
    serpSource()?.isConnected(tenantId).catch(() => false) ?? Promise.resolve(false),
    canSpend(projectId, 0.5).catch(() => ({ ok: true }))
  ]);
  // Search Console: una propiedad por web (la de dominio si hay), con la descarga del histórico terminada.
  const prop = [...props].sort((a, b) => Number(b.kind === 'dominio') - Number(a.kind === 'dominio'))[0] ?? null;
  let firstImpressionDate: string | null = null;
  let impressions90 = 0;
  if (prop?.lastDate) {
    const [r] = (await db.execute(sql`
      SELECT min(date) FILTER (WHERE impressions > 0)::text AS first, coalesce(sum(impressions) FILTER (WHERE date >= current_date - 90), 0)::int AS imp90
      FROM gsc_daily_totals WHERE property_id = ${prop.id} AND search_type = 1`)) as unknown as { first: string | null; imp90: number }[];
    firstImpressionDate = r?.first ?? null;
    impressions90 = Number(r?.imp90 ?? 0);
  }
  const gsc = gscClass({ assigned: Boolean(prop), status: prop?.status ?? null, lastDate: prop?.lastDate ?? null, backfillDone: Boolean((prop?.syncState as { backfillDone?: boolean } | null)?.backfillDone), firstImpressionDate, impressions90 });
  const confirmed = (field: string) => facts.some((f) => f.field === field && f.status !== 'descartado' && (f.status === 'confirmado' || f.source === 'ficha'));
  const proposed = (field: string) => facts.some((f) => f.field === field && f.status !== 'descartado');
  const isLocal = proposed('zona') || Number(places[0]?.n ?? 0) > 0;
  const cnt = (s: string) => Number((comps as { status: string; n: number }[]).find((c) => c.status === s)?.n ?? 0);
  const fresh = crawl?.status === 'hecho' && crawl.finishedAt && Date.now() - crawl.finishedAt.getTime() < FRESH_DAYS * 86_400_000;
  const conn = (k: string) => (conns as { kind: string; status: string }[]).find((c) => c.kind === k);
  return {
    web: { url: web },
    gsc,
    monthlyHours: p.monthlyHours != null ? Number(p.monthlyHours) : null,
    analytics: (assets as { kind: string; access: string }[]).some((a) => a.kind === 'analytics' && a.access !== 'no'),
    isLocal,
    ficha: Number(places[0]?.n ?? 0) > 0,
    accesoWeb: (assets as { kind: string; access: string }[]).some((a) => a.kind === 'web' && a.access === 'si'),
    dataforseo: Boolean(dfs),
    budgetOk: (budget as { ok: boolean }).ok,
    wordpress: conn('wordpress') ? (conn('wordpress')!.status === 'ok' ? 'ok' : 'error') : 'falta',
    gohighlevel: conn('gohighlevel') ? (conn('gohighlevel')!.status === 'ok' ? 'ok' : 'error') : 'falta',
    crawl: !crawl ? 'nunca' : crawl.status === 'pendiente' || crawl.status === 'en_curso' ? 'en_curso' : crawl.status === 'error' ? 'error' : fresh ? 'reciente' : 'antiguo',
    crawlError: crawl?.status === 'error' ? (crawl.error ?? null) : null,
    negocio: { propuesto: proposed('servicios'), confirmado: confirmed('servicios') && (!proposed('zona') || confirmed('zona')) },
    competidores: { confirmados: cnt('confirmado'), propuestos: cnt('propuesto') },
    volumenes: Number(demand[0]?.n ?? 0) + Number(rank[0]?.n ?? 0),
    temas: Number(topics[0]?.n ?? 0),
    planMaestro: 'ninguno',
    skipped
  };
}

/** «Empezar análisis»: abre la ejecución (si no hay una abierta) y da el primer empujón. */
export async function startAnalysis(tenantId: string, projectId: string, by: string): Promise<{ created: boolean }> {
  const r = await db.insert(seoSetupRuns).values({ tenantId, projectId, startedBy: by.slice(0, 120) }).onConflictDoNothing().returning({ id: seoSetupRuns.id });
  await advance(tenantId, projectId).catch((e) => console.error('[seo] arranque: primer empujón', e instanceof Error ? e.message : e));
  return { created: r.length > 0 };
}

/** Continuar sin una conexión o etapa (solo admin, lo comprueba la acción): queda apuntado con quién y por qué. */
export async function skipItem(tenantId: string, projectId: string, key: string, by: string, reason: string): Promise<void> {
  if (!SKIPPABLE.has(key)) throw new SetupError('Eso no se puede saltar.');
  await db.insert(seoSetupRuns).values({ tenantId, projectId, startedBy: by.slice(0, 120) }).onConflictDoNothing();
  const item = { key, by: by.slice(0, 120), at: new Date().toISOString(), reason: reason.slice(0, 300) };
  await db
    .update(seoSetupRuns)
    .set({ skipped: sql`${seoSetupRuns.skipped} || ${JSON.stringify([item])}::jsonb`, updatedAt: new Date() })
    .where(and(eq(seoSetupRuns.projectId, projectId), eq(seoSetupRuns.tenantId, tenantId), eq(seoSetupRuns.status, 'abierta')));
}

const COOLDOWN_H: Record<string, number> = { rastreo: 12, propuesta_negocio: 6, mapa: 6, competencia: 24, demanda: 24, posiciones: 24 };

/** Un empujón a un proyecto, bajo candado. Devuelve lo que se empujó. */
export async function advance(tenantId: string, projectId: string): Promise<string[]> {
  return db.transaction(async (tx) => {
    const [lock] = (await tx.execute(sql`SELECT pg_try_advisory_xact_lock(hashtext(${`seo.arranque:${projectId}`})) AS ok`)) as unknown as { ok: boolean }[];
    if (!lock?.ok) return [];
    const [run] = await tx.select().from(seoSetupRuns).where(and(eq(seoSetupRuns.projectId, projectId), eq(seoSetupRuns.tenantId, tenantId), eq(seoSetupRuns.status, 'abierta'))).limit(1);
    if (!run) return [];
    const last = { ...(run.lastActions ?? {}) };
    const tries = (a: string) => Number(last[`${a}#n`] ?? 0);
    const f = await gatherFacts(tenantId, projectId, run.skipped.map((s) => s.key));
    f.exhausted = Object.keys(COOLDOWN_H).filter((a) => tries(a) >= MAX_ATTEMPTS);
    const rows = evaluate(f);
    const now = Date.now();
    const pushed: string[] = [];
    let error: string | null = null;
    for (const a of actionsFor(rows, f)) {
      const prev = last[a] ? new Date(last[a]).getTime() : 0;
      if (now - prev < (COOLDOWN_H[a] ?? 6) * 3_600_000 || tries(a) >= MAX_ATTEMPTS) continue;
      try {
        if (a === 'rastreo') await startProjectAudit(tenantId, projectId);
        else if (a === 'propuesta_negocio') await enqueueProposal(tenantId, projectId);
        else if (a === 'mapa') await enqueueKeywordMap(tenantId, projectId);
        else if (a === 'competencia') await enqueueCompetitors(tenantId, projectId);
        else if (a === 'demanda' || a === 'posiciones') {
          const kind = a === 'demanda' ? 'seo.demanda' : 'seo.posiciones';
          await enqueueJob({ tenantId, kind, payload: { projectId }, scopeType: 'proyecto', scopeId: projectId, priority: 5, dedupeKey: `sched:${kind}:${projectId}` });
        }
        last[a] = new Date().toISOString();
        last[`${a}#n`] = String(tries(a) + 1);
        pushed.push(a);
      } catch (e) {
        error = `${a}: ${e instanceof Error ? e.message.slice(0, 200) : 'error'}`;
      }
    }
    const diag = rows.find((r) => r.key === 'diagnostico');
    const complete = Boolean(diag && SETTLED.includes(diag.status));
    await tx
      .update(seoSetupRuns)
      .set({ lastActions: last, lastError: error, updatedAt: new Date(), ...(complete ? { status: 'completada', finishedAt: new Date() } : {}) })
      .where(eq(seoSetupRuns.id, run.id));
    return pushed;
  });
}

/** Todas las ejecuciones abiertas de la cuenta (proceso cada 10 min). */
export async function advanceAll(tenantId: string): Promise<void> {
  const open = await db.select({ projectId: seoSetupRuns.projectId }).from(seoSetupRuns).where(and(eq(seoSetupRuns.tenantId, tenantId), eq(seoSetupRuns.status, 'abierta'))).limit(50);
  for (const o of open) await advance(tenantId, o.projectId).catch((e) => console.error('[seo] arranque:', o.projectId, e instanceof Error ? e.message : e));
}

export type SetupView = {
  run: { status: string; startedAt: string; startedBy: string | null; lastError: string | null; skipped: { key: string; by: string; at: string; reason: string }[] } | null;
  stages: ReturnType<typeof evaluate>;
  connections: ReturnType<typeof connections>;
  progress: ReturnType<typeof progress>;
};

export async function getSetupView(tenantId: string, projectId: string): Promise<SetupView> {
  const [run] = await db.select().from(seoSetupRuns).where(and(eq(seoSetupRuns.projectId, projectId), eq(seoSetupRuns.tenantId, tenantId))).orderBy(desc(seoSetupRuns.startedAt)).limit(1);
  // 4. Con el análisis completado, vista barata (el Resumen no recalcula todo en cada carga).
  if (run?.status === 'completada')
    return { run: { status: run.status, startedAt: run.startedAt.toISOString(), startedBy: run.startedBy, lastError: run.lastError, skipped: run.skipped }, stages: [], connections: [], progress: { done: 0, total: 0, current: null, needsPerson: [] } };
  const f = await gatherFacts(tenantId, projectId, run?.skipped.map((s) => s.key) ?? []);
  f.exhausted = Object.keys(COOLDOWN_H).filter((a) => Number((run?.lastActions ?? {})[`${a}#n`] ?? 0) >= MAX_ATTEMPTS);
  const stages = evaluate(f);
  return {
    run: run ? { status: run.status, startedAt: run.startedAt.toISOString(), startedBy: run.startedBy, lastError: run.lastError, skipped: run.skipped } : null,
    stages,
    connections: connections(f),
    progress: progress(stages)
  };
}


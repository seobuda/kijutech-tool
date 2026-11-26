import 'server-only';

// SEO · Vigilancia continua: lo que enseña la pestaña Salud del proyecto (procesos programados y gasto en datos).
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { jobs, projects, seoSpeedChecks, type SeoSpeedCheck } from '@/lib/db/schema';
import { listSchedulesForScope } from '@/lib/core/jobs';
import { dataSpendSummary } from '@/lib/seo/gasto';
import { ensureProjectSchedules } from '@/lib/seo/vigilancia/vigilancia';
import { SEO_PROCESSES, SEO_PROCESS_KEYS, type SeoProcessKey } from '@/lib/seo/vigilancia/rules';

export type VigilanciaProcessView = {
  key: SeoProcessKey;
  label: string;
  every: number;
  options: number[];
  enabled: boolean;
  pausedUntil: string | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  /** Último trabajo terminado de este proceso en el proyecto (programado o lanzado a mano). */
  last: { at: string; status: 'ok' | 'aviso' | 'omitido' | 'error'; summary: string } | null;
  /** Hay uno en cola o en marcha ahora mismo. */
  running: boolean;
};

export type SpeedRow = Pick<SeoSpeedCheck, 'url' | 'kind' | 'scope' | 'category' | 'score' | 'lcpMs' | 'inpMs' | 'cls' | 'fcpMs' | 'tbtMs' | 'siMs'> & { data: Record<string, unknown> };
export type SpeedView = {
  measuredAt: string;
  field: SpeedRow[];
  lab: SpeedRow[];
  /** Nota media de laboratorio de las últimas mediciones (más antigua primero), para ver la evolución. */
  history: { at: string; score: number | null; lcpMs: number | null }[];
} | null;

export type VigilanciaView = {
  processes: VigilanciaProcessView[];
  speed: SpeedView;
  spend: { spent: number; budget: number; byOperation: { operation: string; usd: number }[] };
};

export async function getVigilanciaView(tenantId: string, projectId: string): Promise<VigilanciaView | null> {
  const [p] = await db
    .select({ id: projects.id, status: projects.status, service: projects.service })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
    .limit(1);
  if (!p) return null;
  let rows = await listSchedulesForScope(tenantId, projectId);
  // Un proyecto recién creado: se da de alta ya, sin esperar a la pasada de cada hora.
  if (p.service === 'seo' && !rows.some((r) => r.processKey in SEO_PROCESSES)) {
    await ensureProjectSchedules(tenantId, p);
    rows = await listSchedulesForScope(tenantId, projectId);
  }
  const byKey = new Map(rows.map((r) => [r.processKey, r]));
  const [lastJobs, speed] = await Promise.all([lastJobsOf(tenantId, projectId), speedView(projectId)]);
  const processes = SEO_PROCESS_KEYS.flatMap((key): VigilanciaProcessView[] => {
    const r = byKey.get(key);
    if (!r) return [];
    const def = SEO_PROCESSES[key];
    const paused = r.pausedUntil && r.pausedUntil.getTime() > Date.now() ? r.pausedUntil.toISOString() : null;
    return [
      {
        key,
        label: def.label,
        every: r.everyMinutes,
        options: [...new Set([...def.options, r.everyMinutes])].sort((a, b) => a - b),
        enabled: r.enabled,
        pausedUntil: paused,
        lastRunAt: r.lastRunAt?.toISOString() ?? null,
        nextRunAt: r.nextRunAt?.toISOString() ?? null,
        lastStatus: r.lastStatus,
        lastError: r.lastError ? r.lastError.slice(0, 200) : null,
        last: lastJobs.done.get(key) ?? null,
        running: lastJobs.open.has(key)
      }
    ];
  });
  return { processes, speed, spend: await dataSpendSummary(projectId) };
}

/** Último trabajo terminado de cada proceso SEO del proyecto y los que están en cola o en marcha. */
async function lastJobsOf(tenantId: string, projectId: string) {
  const rows = await db
    .select({ kind: jobs.kind, status: jobs.status, result: jobs.result, lastError: jobs.lastError, finishedAt: jobs.finishedAt })
    .from(jobs)
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.scopeId, projectId), inArray(jobs.kind, [...SEO_PROCESS_KEYS, 'seo.vigilancia.confirm'])))
    .orderBy(desc(jobs.createdAt))
    .limit(60);
  const done = new Map<string, NonNullable<VigilanciaProcessView['last']>>();
  const open = new Set<string>();
  for (const r of rows) {
    const key = r.kind === 'seo.vigilancia.confirm' ? 'seo.vigilancia' : r.kind;
    if (r.status === 'pendiente' || r.status === 'en_curso') {
      open.add(key);
      continue;
    }
    if (done.has(key) || !r.finishedAt) continue;
    const res = (r.result ?? {}) as { status?: string; summary?: string };
    const status = r.status === 'fallido' ? 'error' : res.status === 'aviso' || res.status === 'omitido' ? res.status : 'ok';
    done.set(key, { at: r.finishedAt.toISOString(), status, summary: (r.status === 'fallido' ? 'Falló: ' + (r.lastError ?? 'sin detalle') : (res.summary ?? '')).slice(0, 400) });
  }
  return { done, open };
}

/** La última medición de velocidad (todas sus páginas) y la evolución de las anteriores. */
async function speedView(projectId: string): Promise<SpeedView> {
  const runs = (await db.execute(sql`
    SELECT run_id, max(measured_at) AS at,
           round(avg(score) FILTER (WHERE kind = 'laboratorio'))::int AS score,
           round(avg(lcp_ms) FILTER (WHERE kind = 'laboratorio'))::int AS lcp
    FROM seo_speed_checks WHERE project_id = ${projectId}
    GROUP BY run_id ORDER BY max(measured_at) DESC LIMIT 12`)) as unknown as { run_id: string; at: string | Date; score: number | null; lcp: number | null }[];
  const list = [...runs];
  if (!list.length) return null;
  const rows = await db.select().from(seoSpeedChecks).where(and(eq(seoSpeedChecks.projectId, projectId), eq(seoSpeedChecks.runId, list[0].run_id)));
  const toRow = (r: SeoSpeedCheck): SpeedRow => ({ url: r.url, kind: r.kind, scope: r.scope, category: r.category, score: r.score, lcpMs: r.lcpMs, inpMs: r.inpMs, cls: r.cls, fcpMs: r.fcpMs, tbtMs: r.tbtMs, siMs: r.siMs, data: (r.data ?? {}) as Record<string, unknown> });
  const iso = (x: string | Date) => new Date(x).toISOString();
  return {
    measuredAt: iso(list[0].at),
    field: rows.filter((r) => r.kind === 'campo').map(toRow),
    lab: rows.filter((r) => r.kind === 'laboratorio').map(toRow),
    history: list.reverse().map((r) => ({ at: iso(r.at), score: r.score == null ? null : Number(r.score), lcpMs: r.lcp == null ? null : Number(r.lcp) }))
  };
}

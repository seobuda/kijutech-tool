import 'server-only';

// SEO · Vigilancia continua: lo que enseña la pestaña Salud del proyecto (procesos programados y gasto en datos).
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { projects, seoSpeedChecks, type SeoSpeedCheck } from '@/lib/db/schema';
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
  const [lastJobs, speed] = await Promise.all([lastJobsOf(tenantId, projectId), speedView(tenantId, projectId)]);
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

/** Último trabajo terminado de cada proceso SEO del proyecto y los que se están ejecutando (o tocan ya). */
async function lastJobsOf(tenantId: string, projectId: string) {
  // Uno por tipo (DISTINCT ON): un tipo con muchos reintentos no deja a los demás sin su «última».
  const done = (await db.execute(sql`
    SELECT DISTINCT ON (kind) kind, status, result, finished_at
    FROM jobs
    WHERE tenant_id = ${tenantId} AND scope_id = ${projectId} AND status IN ('hecho', 'fallido') AND finished_at IS NOT NULL
      AND kind IN (${sql.join([...SEO_PROCESS_KEYS, 'seo.vigilancia.confirm'].map((k) => sql`${k}`), sql`, `)})
    ORDER BY kind, finished_at DESC`)) as unknown as { kind: string; status: string; result: unknown; finished_at: string | Date }[];
  // «En marcha»: en curso, o pendiente cuya hora ya ha llegado (no la confirmación programada a 30 min ni un reintento futuro).
  const open = (await db.execute(sql`
    SELECT DISTINCT kind FROM jobs
    WHERE tenant_id = ${tenantId} AND scope_id = ${projectId}
      AND (status = 'en_curso' OR (status = 'pendiente' AND run_at <= now()))
      AND kind IN (${sql.join([...SEO_PROCESS_KEYS, 'seo.vigilancia.confirm'].map((k) => sql`${k}`), sql`, `)})`)) as unknown as { kind: string }[];
  const keyOf = (k: string) => (k === 'seo.vigilancia.confirm' ? 'seo.vigilancia' : k);
  const out = new Map<string, NonNullable<VigilanciaProcessView['last']>>();
  for (const r of [...done].sort((x, y) => utc(y.finished_at).getTime() - utc(x.finished_at).getTime())) {
    const key = keyOf(r.kind);
    if (out.has(key)) continue;
    const res = (r.result ?? {}) as { status?: string; summary?: string };
    const status = r.status === 'fallido' ? 'error' : res.status === 'aviso' || res.status === 'omitido' ? res.status : 'ok';
    // El detalle técnico de un fallo no va al navegador: queda en el registro de errores.
    const summary = r.status === 'fallido' ? 'Falló; el detalle queda en Para ti → Errores.' : String(res.summary ?? '').slice(0, 400);
    out.set(key, { at: utc(r.finished_at).toISOString(), status, summary });
  }
  return { done: out, open: new Set([...open].map((r) => keyOf(r.kind))) };
}

/** Las columnas timestamp (sin zona) llegan como texto en SQL crudo: se leen como UTC. */
const utc = (x: string | Date) => (x instanceof Date ? x : new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(x) ? x : `${x.replace(' ', 'T')}Z`));

/** La última medición de velocidad (todas sus páginas) y la evolución de las anteriores. */
async function speedView(tenantId: string, projectId: string): Promise<SpeedView> {
  const runs = (await db.execute(sql`
    SELECT run_id, max(measured_at) AS at,
           round(avg(score) FILTER (WHERE kind = 'laboratorio'))::int AS score,
           round(avg(lcp_ms) FILTER (WHERE kind = 'laboratorio'))::int AS lcp
    FROM seo_speed_checks WHERE tenant_id = ${tenantId} AND project_id = ${projectId}
    GROUP BY run_id ORDER BY max(measured_at) DESC LIMIT 12`)) as unknown as { run_id: string; at: string | Date; score: number | null; lcp: number | null }[];
  const list = [...runs];
  if (!list.length) return null;
  const rows = await db.select().from(seoSpeedChecks).where(and(eq(seoSpeedChecks.tenantId, tenantId), eq(seoSpeedChecks.projectId, projectId), eq(seoSpeedChecks.runId, list[0].run_id)));
  const toRow = (r: SeoSpeedCheck): SpeedRow => ({ url: r.url, kind: r.kind, scope: r.scope, category: r.category, score: r.score, lcpMs: r.lcpMs, inpMs: r.inpMs, cls: r.cls, fcpMs: r.fcpMs, tbtMs: r.tbtMs, siMs: r.siMs, data: (r.data ?? {}) as Record<string, unknown> });
  const iso = (x: string | Date) => utc(x).toISOString();
  return {
    measuredAt: iso(list[0].at),
    field: rows.filter((r) => r.kind === 'campo').map(toRow),
    lab: rows.filter((r) => r.kind === 'laboratorio').map(toRow),
    history: list.reverse().map((r) => ({ at: iso(r.at), score: r.score == null ? null : Number(r.score), lcpMs: r.lcp == null ? null : Number(r.lcp) }))
  };
}

import 'server-only';

// SEO · Vigilancia continua: lo que enseña la pestaña Salud del proyecto (procesos programados y gasto en datos).
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { projects } from '@/lib/db/schema';
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
};

export type VigilanciaView = {
  processes: VigilanciaProcessView[];
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
        lastError: r.lastError ? r.lastError.slice(0, 200) : null
      }
    ];
  });
  return { processes, spend: await dataSpendSummary(projectId) };
}

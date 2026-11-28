import 'server-only';

// SEO · Jefe SEO, D6: rendimiento y aprendizaje (docs/PLAN-SEO-JEFE.md §6, métricas). Todo por código y sin IA:
// - Cómo decide la agencia sobre lo que propone el Jefe: planes aprobados o rechazados, nota en sombra, evidencias
//   descartadas, orden según el puntuador, cambios y estrategias aceptados, coste y días hasta el primer plan aprobado.
// - Qué se observa al medir el trabajo hecho, por línea del catálogo y por sector (tendencias entre clientes del núcleo,
//   con su etiqueta honesta). Se describe lo observado, nunca se afirma la causa.
// - Autonomía graduada de los ciclos (decisión 3 de Enric).
import { and, desc, eq, gte, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { aiJobs, interventions, projects, seoJefeProposals, seoMasterPlans } from '@/lib/db/schema';
import { techniqueTrends, type InterventionLite, type Trend } from '@/lib/core/technique-trends-rules';
import { accountTechniqueTrends } from '@/lib/core/technique-trends';
import { PLAYBOOKS } from '@/lib/seo/estrategia/playbooks';
import { cycleAutonomy } from '@/lib/seo/jefe/revision-rules';

export type JefeMetrics = {
  plans: { generated: number; approved: number; rejected: number; failed: number; shadowScored: number; shadowAvg: number | null; scoreAvg: number | null; rejectedEvidenceAvg: number | null };
  changes: { decided: number; accepted: number };
  cycles: { decided: number; approved: number };
  revisions: { proposed: number; generated: number };
  cost: { month: number; total90: number; byFunction: { fn: string; usd: number; calls: number }[] };
  daysToApprovedPlan: { n: number; median: number | null };
};

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export async function jefeMetrics(tenantId: string): Promise<JefeMetrics> {
  const since90 = new Date(Date.now() - 90 * 86_400_000);
  const monthStart = new Date(new Date().toISOString().slice(0, 8) + '01T00:00:00Z');
  const [plans, props, costs, firstApproved] = await Promise.all([
    db
      .select({ status: seoMasterPlans.status, shadowScore: seoMasterPlans.shadowScore, scorer: seoMasterPlans.scorer, rejected: seoMasterPlans.rejectedEvidence, thesis: seoMasterPlans.thesis })
      .from(seoMasterPlans)
      .where(eq(seoMasterPlans.tenantId, tenantId)),
    db.select({ kind: seoJefeProposals.kind, status: seoJefeProposals.status }).from(seoJefeProposals).where(eq(seoJefeProposals.tenantId, tenantId)),
    db
      .select({ fn: aiJobs.function, usd: sql<string>`coalesce(sum(${aiJobs.estimatedCost}), 0)`, calls: sql<number>`count(*)::int`, month: sql<string>`coalesce(sum(${aiJobs.estimatedCost}) FILTER (WHERE ${aiJobs.createdAt} >= ${monthStart.toISOString()}::timestamp), 0)` })
      .from(aiJobs)
      .where(and(eq(aiJobs.tenantId, tenantId), gte(aiJobs.createdAt, since90), sql`(${aiJobs.function} LIKE 'seo_jefe_%' OR ${aiJobs.function} IN ('agt_jefe_seo', 'agt_jefe_seo_resumen'))`))
      .groupBy(aiJobs.function),
    db
      .select({ days: sql<number>`extract(epoch from (min(${seoMasterPlans.decidedAt}) - ${projects.createdAt})) / 86400` })
      .from(seoMasterPlans)
      .innerJoin(projects, eq(projects.id, seoMasterPlans.projectId))
      .where(and(eq(seoMasterPlans.tenantId, tenantId), inArray(seoMasterPlans.status, ['aprobado', 'sustituido']), isNotNull(seoMasterPlans.decidedAt)))
      .groupBy(projects.id, projects.createdAt)
  ]);
  const real = plans.filter((p) => p.status !== 'borrador' && p.thesis !== '(no se pudo generar)');
  const scored = real.filter((p) => p.shadowScore != null);
  const scores = real.map((p) => (p.scorer as { score?: number })?.score).filter((x): x is number => typeof x === 'number');
  const rejTotal = real.reduce((a, p) => a + (Array.isArray(p.rejected) ? p.rejected.length : 0), 0);
  const by = (kind: string) => props.filter((p) => p.kind === kind);
  const decided = (kind: string) => by(kind).filter((p) => ['aprobada', 'rechazada'].includes(p.status));
  return {
    plans: {
      generated: real.length,
      approved: real.filter((p) => ['aprobado', 'sustituido'].includes(p.status)).length,
      rejected: real.filter((p) => p.status === 'rechazado').length,
      failed: plans.filter((p) => p.thesis === '(no se pudo generar)').length,
      shadowScored: scored.length,
      shadowAvg: scored.length ? Math.round((scored.reduce((a, p) => a + (p.shadowScore ?? 0), 0) / scored.length) * 10) / 10 : null,
      scoreAvg: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      rejectedEvidenceAvg: real.length ? Math.round((rejTotal / Math.max(1, real.length)) * 10) / 10 : null
    },
    changes: { decided: decided('cambio').length, accepted: decided('cambio').filter((p) => p.status === 'aprobada').length },
    cycles: { decided: decided('ciclo').length, approved: decided('ciclo').filter((p) => p.status === 'aprobada').length },
    revisions: { proposed: by('revision').length, generated: by('revision').filter((p) => p.status === 'aprobada').length },
    cost: {
      month: Math.round(costs.reduce((a, c) => a + Number(c.month), 0) * 100) / 100,
      total90: Math.round(costs.reduce((a, c) => a + Number(c.usd), 0) * 100) / 100,
      byFunction: costs.map((c) => ({ fn: c.fn, usd: Math.round(Number(c.usd) * 100) / 100, calls: c.calls })).sort((a, b) => b.usd - a.usd)
    },
    daysToApprovedPlan: (() => {
      const ds = firstApproved.map((r) => Math.round(Number(r.days))).filter((d) => Number.isFinite(d));
      return { n: ds.length, median: median(ds) };
    })()
  };
}

export type LineTrend = { line: string; label: string; technique: string; trends: Trend[] };

/** Lo observado al medir el trabajo hecho, por línea del catálogo (cada línea usa una técnica de la taxonomía). */
export async function trendsByLine(tenantId: string): Promise<LineTrend[]> {
  const all = await accountTechniqueTrends(tenantId, 'seo');
  return Object.values(PLAYBOOKS)
    .filter((p) => p.key !== 'cimientos')
    .map((p) => ({ line: p.key, label: p.label, technique: p.technique, trends: all.filter((t) => t.technique === p.technique) }));
}

/** Lo mismo por sector (tipo de negocio de la intervención). Solo sectores con algún caso medido. */
export async function trendsBySector(tenantId: string): Promise<{ sector: string; trends: Trend[] }[]> {
  const rows = await db
    .select({ id: interventions.id, clientId: interventions.clientId, technique: interventions.technique, taxonomyVersion: interventions.taxonomyVersion, source: interventions.source, hypothesis: interventions.hypothesis, outcome: interventions.outcome, businessType: interventions.businessType })
    .from(interventions)
    .where(and(eq(interventions.tenantId, tenantId), eq(interventions.domain, 'seo'), eq(interventions.status, 'hecha'), isNotNull(interventions.outcome)))
    .orderBy(desc(interventions.doneAt))
    .limit(20000);
  const groups = new Map<string, InterventionLite[]>();
  for (const r of rows) {
    const k = r.businessType?.trim() || 'Sin sector';
    const list = groups.get(k) ?? [];
    list.push({ id: r.id, clientId: r.clientId, technique: r.technique, taxonomyVersion: r.taxonomyVersion, source: r.source, windowDays: Number((r.hypothesis as { windowDays?: number })?.windowDays ?? 56), checkpoints: ((r.outcome as { checkpoints?: InterventionLite['checkpoints'] } | null)?.checkpoints ?? []) as InterventionLite['checkpoints'] });
    groups.set(k, list);
  }
  return [...groups]
    .map(([sector, list]) => ({ sector, trends: techniqueTrends(list) }))
    .filter((g) => g.trends.length)
    .sort((a, b) => b.trends.reduce((s, t) => s + t.n, 0) - a.trends.reduce((s, t) => s + t.n, 0));
}

/** Autonomía de los ciclos de la cuenta: las 20 propuestas de estrategia decididas más recientes. */
export async function accountCycleAutonomy(tenantId: string) {
  const rows = await db
    .select({ status: seoJefeProposals.status })
    .from(seoJefeProposals)
    .where(and(eq(seoJefeProposals.tenantId, tenantId), eq(seoJefeProposals.kind, 'ciclo'), inArray(seoJefeProposals.status, ['aprobada', 'rechazada'])))
    .orderBy(desc(seoJefeProposals.decidedAt))
    .limit(20);
  return cycleAutonomy(rows);
}

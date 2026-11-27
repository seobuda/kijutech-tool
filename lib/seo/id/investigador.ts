import 'server-only';

// SEO · Jefe SEO, D5: el investigador de novedades (docs/PLAN-SEO-JEFE.md §5). Cada 3 días, SOLO si hay novedades nuevas en
// las fuentes (oficiales, blogs y canales de Ajustes → Fuentes de novedades SEO): el código filtra lo pertinente (0 $), una
// llamada a Sonnet 5.5 dice qué cambia en nuestras líneas de trabajo y a quién afecta, el código valida (enlaces solo de lo
// leído, nivel nunca por encima de la fuente) y calcula qué clientes tienen esas líneas, y lo importante (como mucho 3) va a
// la base de conocimiento como PROPUESTA de entrada, con fecha, nivel y enlaces, que aprueba Enric. Sin novedades no gasta.
// Su gasto cuenta en el tope del Jefe SEO (función «seo_jefe_investigador»).
import { and, desc, eq, gt, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { jobs, kbFeedItems, projects, seoCycleLines, seoCycles, seoMasterPlanItems, seoMasterPlans } from '@/lib/db/schema';
import { callAI, getPrompt } from '@/lib/ai/gateway';
import { submitRequest } from '@/lib/core/knowledge';
import { PLAYBOOKS } from '@/lib/seo/estrategia/playbooks';
import { extractJson } from '@/lib/seo/jefe/plan-rules';
import { jefeBudget, jefeSpentThisMonth } from '@/lib/seo/jefe/plan';
import { listSeoSources } from '@/lib/seo/id/fuentes';
import { FIRST_WINDOW_DAYS, levelFromSource, prefilter, proposalText, toPropose, validateFindings, type NewsItem } from '@/lib/seo/id/investigador-rules';

export const INVESTIGATE_JOB = 'seo.id.investigate';
export const INVESTIGATOR_PROMPT = 'seo_investigador';
export const INVESTIGATOR_MODEL = 'claude-sonnet-5-5';
/** Reserva para una pasada (estimada, sin medir): si el tope del Jefe no la deja, no se llama a la IA. */
const RUN_ESTIMATE_USD = 0.3;

/** Desde cuándo leer: lo guardado después de la última pasada terminada (o los últimos 7 días la primera vez). */
async function windowStart(tenantId: string, now: Date): Promise<Date> {
  const [last] = await db
    .select({ result: jobs.result })
    .from(jobs)
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.kind, INVESTIGATE_JOB), eq(jobs.status, 'hecho')))
    .orderBy(desc(jobs.finishedAt))
    .limit(1);
  const until = (last?.result as { until?: string } | null)?.until;
  const d = until ? new Date(until) : null;
  return d && !Number.isNaN(d.getTime()) ? d : new Date(now.getTime() - FIRST_WINDOW_DAYS * 86_400_000);
}

/** Clientes cuyo plan aprobado o estrategia activa usa alguna de esas líneas (para decir a quién afecta). */
async function affectedClients(tenantId: string, lines: string[]): Promise<string[]> {
  if (!lines.length) return [];
  const [fromPlans, fromCycles] = await Promise.all([
    db
      .selectDistinct({ name: projects.name })
      .from(seoMasterPlanItems)
      .innerJoin(seoMasterPlans, eq(seoMasterPlans.id, seoMasterPlanItems.planId))
      .innerJoin(projects, eq(projects.id, seoMasterPlanItems.projectId))
      .where(and(eq(seoMasterPlans.tenantId, tenantId), eq(seoMasterPlans.status, 'aprobado'), inArray(seoMasterPlanItems.playbook, lines))),
    db
      .selectDistinct({ name: projects.name })
      .from(seoCycleLines)
      .innerJoin(seoCycles, eq(seoCycles.id, seoCycleLines.cycleId))
      .innerJoin(projects, eq(projects.id, seoCycleLines.projectId))
      .where(and(eq(seoCycles.tenantId, tenantId), eq(seoCycles.status, 'activo'), eq(seoCycleLines.status, 'activa'), inArray(seoCycleLines.playbook, lines)))
  ]);
  return [...new Set([...fromPlans, ...fromCycles].map((r) => r.name))].sort().slice(0, 20);
}

export async function investigate(tenantId: string, now = new Date()): Promise<Record<string, unknown>> {
  const since = await windowStart(tenantId, now);
  const until = now.toISOString();
  const sources = new Map((await listSeoSources(tenantId)).map((s) => [s.key, s]));
  const rows = await db
    .select({ id: kbFeedItems.id, title: kbFeedItems.title, summary: kbFeedItems.summary, url: kbFeedItems.url, publishedAt: kbFeedItems.publishedAt, sourceKey: kbFeedItems.sourceKey })
    .from(kbFeedItems)
    .where(and(eq(kbFeedItems.tenantId, tenantId), inArray(kbFeedItems.domain, ['seo', 'seo_ext']), gt(kbFeedItems.createdAt, since)))
    .orderBy(desc(kbFeedItems.publishedAt))
    .limit(400);
  const items: NewsItem[] = rows.map((r) => {
    const s = sources.get(r.sourceKey);
    return { id: r.id, title: r.title, summary: r.summary, url: r.url, publishedAt: r.publishedAt?.toISOString() ?? null, sourceLabel: s?.label ?? r.sourceKey, level: levelFromSource(s?.level ?? 'comunidad') };
  });
  const picked = prefilter(items);
  // Sin novedades (o nada pertinente): no se gasta nada.
  if (!picked.length) return { until, leidas: rows.length, pertinentes: 0, propuestas: 0, motivo: 'sin novedades pertinentes' };
  const [spent, budget] = await Promise.all([jefeSpentThisMonth(tenantId), jefeBudget()]);
  // Sin margen: no se avanza la ventana (la próxima pasada lo intentará con lo mismo).
  if (spent + RUN_ESTIMATE_USD > budget) throw new Error(`Tope del Jefe SEO alcanzado (${spent.toFixed(2)} $ de ${budget} $): el investigador espera.`);
  const prompt = await getPrompt(INVESTIGATOR_PROMPT);
  if (!prompt) throw new Error(`Falta el prompt ${INVESTIGATOR_PROMPT}`);
  const novedades = picked
    .map((i) => `- [${i.level.toUpperCase()} · ${i.sourceLabel.replace(/[<>]/g, '')}] ${i.publishedAt?.slice(0, 10) ?? 'sin fecha'} · ${i.url ?? 'sin enlace'}\n  <<<DATO NO FIABLE ${`${i.title}. ${(i.summary ?? '').slice(0, 500)}`.replace(/<<<|>>>/g, '')} FIN>>>`)
    .join('\n');
  const lineas = Object.values(PLAYBOOKS)
    .filter((p) => p.key !== 'cimientos')
    .map((p) => `- ${p.key}: ${p.label}`)
    .join('\n');
  const fill = (t: string) => t.replace(/\{(novedades|lineas|hoy)\}/g, (_m, k: string) => ({ novedades, lineas, hoy: until.slice(0, 10) })[k] ?? '');
  const res = await callAI({
    tenantId,
    function: 'seo_jefe_investigador',
    promptKey: INVESTIGATOR_PROMPT,
    model: INVESTIGATOR_MODEL,
    preferredProvider: 'anthropic',
    maxTokens: 12_000,
    timeoutMs: 180_000,
    messages: [
      { role: 'system', content: prompt.system_prompt },
      { role: 'user', content: fill(prompt.user_prompt_template) }
    ]
  });
  const v = validateFindings(extractJson(res.content), picked);
  const chosen = toPropose(v.ok);
  const ids: string[] = [];
  for (const f of chosen) {
    const affected = await affectedClients(tenantId, f.lineas);
    const r = await submitRequest(tenantId, { text: proposalText(f, affected), source: 'agente', byName: 'Investigador SEO', byUserId: null, links: f.fuentes.map((u) => ({ title: f.titulo.slice(0, 200), url: u })) });
    ids.push(r.id);
  }
  return { until, leidas: rows.length, pertinentes: picked.length, hallazgos: v.ok.length, descartados: v.rejected.length, propuestas: ids.length, articulos: ids, aiJobId: res.jobId };
}

/** Para la pantalla de fuentes: cuándo pasó el investigador por última vez y qué dejó. */
export async function lastInvestigation(tenantId: string): Promise<{ at: string | null; result: Record<string, unknown> | null; error: string | null }> {
  const [j] = await db
    .select({ status: jobs.status, result: jobs.result, finishedAt: jobs.finishedAt, error: jobs.lastError })
    .from(jobs)
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.kind, INVESTIGATE_JOB), inArray(jobs.status, ['hecho', 'fallido'])))
    .orderBy(desc(jobs.finishedAt))
    .limit(1);
  if (!j) return { at: null, result: null, error: null };
  return { at: j.finishedAt?.toISOString() ?? null, result: j.status === 'hecho' ? ((j.result as Record<string, unknown>) ?? null) : null, error: j.status === 'fallido' ? j.error : null };
}

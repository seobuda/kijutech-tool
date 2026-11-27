import 'server-only';

// SEO · Jefe SEO, D5: el investigador de novedades (docs/PLAN-SEO-JEFE.md §5). Cada 3 días, SOLO si hay novedades nuevas en
// las fuentes (oficiales, blogs y canales de Ajustes → Fuentes de novedades SEO): el código filtra lo pertinente (0 $), una
// llamada a Sonnet 5.5 dice qué cambia en nuestras líneas de trabajo y a quién afecta, el código valida (enlaces solo de lo
// leído, nivel nunca por encima de la fuente) y calcula qué clientes tienen esas líneas, y lo importante (como mucho 3) va a
// la base de conocimiento como PROPUESTA de entrada, con fecha, nivel y enlaces, que aprueba Enric. Sin novedades no gasta.
// Su gasto cuenta en el tope del Jefe SEO (función «seo_jefe_investigador»).
import { and, desc, eq, gt, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { jobs, kbArticles, kbFeedItems, projects, seoCycleLines, seoCycles, seoMasterPlanItems, seoMasterPlans } from '@/lib/db/schema';
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
const INVESTIGATOR_NAME = 'Investigador SEO';
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

/** Lo que el investigador ya propuso en los últimos 30 días: títulos (para que la IA no lo repita) y enlaces citados. */
async function recentProposals(tenantId: string, now: Date): Promise<{ titles: string[]; urls: Set<string> }> {
  const rows = await db
    .select({ title: kbArticles.title, links: kbArticles.links })
    .from(kbArticles)
    .where(and(eq(kbArticles.tenantId, tenantId), eq(kbArticles.requestedByName, INVESTIGATOR_NAME), gt(kbArticles.createdAt, new Date(now.getTime() - 30 * 86_400_000))))
    .orderBy(desc(kbArticles.createdAt))
    .limit(30);
  const urls = new Set<string>();
  for (const r of rows) for (const l of (Array.isArray(r.links) ? r.links : []) as { url?: string }[]) if (l?.url) urls.add(l.url);
  return { titles: rows.map((r) => r.title), urls };
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
  const prev = await recentProposals(tenantId, now);
  // Revisor: el enlace también va dentro del bloque delimitado (todo lo que viene del feed es dato).
  const novedades = [
    picked
      .map((i) => `- [${i.level.toUpperCase()} · ${i.sourceLabel.replace(/[<>]/g, '')}] ${i.publishedAt?.slice(0, 10) ?? 'sin fecha'}\n  <<<DATO NO FIABLE enlace: ${i.url ?? 'sin enlace'} · ${`${i.title}. ${(i.summary ?? '').slice(0, 500)}`.replace(/<<<|>>>/g, '')} FIN>>>`)
      .join('\n'),
    prev.titles.length ? `\nYA PROPUESTO EN LOS ÚLTIMOS 30 DÍAS (no lo repitas salvo que haya un dato nuevo importante):\n${prev.titles.map((t) => `- ${t.replace(/[<>]/g, '')}`).join('\n')}` : ''
  ].join('\n');
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
  // Sin repetir: fuera lo que solo cita enlaces ya propuestos en los últimos 30 días (0 $).
  const fresh = v.ok.filter((f) => f.fuentes.some((u) => !prev.urls.has(u)));
  const chosen = toPropose(fresh);
  const ids: string[] = [];
  const errores: string[] = [];
  for (const f of chosen) {
    // Revisor: una propuesta que falla no tumba la pasada (si no, se repetiría la llamada a la IA y lo ya creado).
    try {
      const affected = await affectedClients(tenantId, f.lineas);
      const r = await submitRequest(tenantId, { text: proposalText(f, affected), source: 'agente', byName: INVESTIGATOR_NAME, byUserId: null, links: f.fuentes.map((u) => ({ title: f.titulo.slice(0, 200), url: u })) });
      ids.push(r.id);
    } catch (e) {
      errores.push(`${f.titulo.slice(0, 80)}: ${e instanceof Error ? e.message.slice(0, 200) : 'error'}`);
    }
  }
  if (errores.length) console.error('[seo] investigador: propuestas que no se pudieron crear', errores.join(' | '));
  return { until, leidas: rows.length, pertinentes: picked.length, hallazgos: v.ok.length, repetidos: v.ok.length - fresh.length, descartados: v.rejected.length, propuestas: ids.length, articulos: ids, errores, aiJobId: res.jobId };
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

import 'server-only';

// SEO · Panel de IA mensual (parte 11, 27 nov 2026; docs/DISENO-SEO-CIERRE.md §A con la auditoría Opus).
// - Preguntas: plantilla servicio × población + temas de más valor, sin IA; el equipo las activa (sin activas no se gasta).
// - Proceso «seo.panel_ia» cada 10 días: tres muestras al mes (días 1-10, 11-20 y 21-fin). Crea las filas pendientes (clave
//   única: pregunta × mes × muestra × asistente) y encola UN TRABAJO POR PREGUNTA (4 peticiones como mucho).
// - Cada trabajo reclama sus filas de forma atómica (pendiente → enviando, RETURNING), comprueba el tope del panel antes de
//   cada petición, apunta el coste estimado ANTES de enviar y corrige al alza con el real. Una fila «enviando» de más de
//   1 h pasa a «fallida» y no se reenvía (un reintento nunca paga dos veces).
// - Detección sin IA (rules.ts). Hallazgo «seo.ai_competitor_only» con margen: dos meses con cuota 0 y competencia > 50 %.
import { and, asc, eq, inArray, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clientCompetitors, projects, seoAiChecks, seoAiQuestions, seoTopics } from '@/lib/db/schema';
import { serpSource, type AiAnswerAssistant } from '@/lib/core/capabilities';
import { enqueueJob, registerJobKind } from '@/lib/core/jobs';
import { syncFindings } from '@/lib/core/findings';
import { canSpendOn, numberSetting, recordDataSpend, refundDataSpend } from '@/lib/seo/gasto';
import { confirmedFacts, projectBasics, projectLocation } from '@/lib/seo/posiciones/posiciones';
import { AI_ASSISTANTS, AI_COST, DEFAULT_AI_PANEL_BUDGET_USD, excerpt, lostToCompetitionMonths, MAX_AI_QUESTIONS, proposeQuestions, questionKey, readAnswer, sampleOfDay } from '@/lib/seo/panel-ia/rules';

export const PANEL_IA_SOURCE = 'seo.panel_ia:respuestas';
export const PANEL_IA_OP = 'panel IA';
const QUESTION_KIND = 'seo.panel_ia.pregunta';

type Outcome = { status: 'ok' | 'aviso' | 'omitido'; summary: string };

function madridParts(now = new Date()): { month: string; day: number } {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now).split('-');
  return { month: `${y}-${m}-01`, day: Number(d) };
}

export async function aiPanelBudget(): Promise<number> {
  return numberSetting('ai_panel_budget_usd', DEFAULT_AI_PANEL_BUDGET_USD);
}

/** Propone preguntas (solo añade; lo quitado no vuelve). Devuelve cuántas añadió. */
export async function proposeAiQuestions(tenantId: string, projectId: string, by: string | null = null): Promise<number> {
  const [p] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  if (!p) return 0;
  const existing = await db.select({ question: seoAiQuestions.question, status: seoAiQuestions.status }).from(seoAiQuestions).where(eq(seoAiQuestions.projectId, projectId));
  const live = existing.filter((e) => e.status !== 'quitada').length;
  if (live >= MAX_AI_QUESTIONS) return 0;
  const facts = await confirmedFacts(projectId);
  const topics = await db.select({ name: seoTopics.name, metrics: seoTopics.metrics }).from(seoTopics).where(and(eq(seoTopics.projectId, projectId), eq(seoTopics.status, 'activo')));
  const score = (m: Record<string, unknown>) => (Number(m.valor) || 1) * (Number(m.impresiones) || 0);
  const best = topics.filter((t) => !(t.metrics as Record<string, unknown>).esMarca).sort((a, b) => score(b.metrics as Record<string, unknown>) - score(a.metrics as Record<string, unknown>)).map((t) => t.name);
  const list = proposeQuestions({ services: facts.services, zona: facts.zona, topics: best, existing: existing.map((e) => e.question) }, MAX_AI_QUESTIONS - live);
  if (!list.length) return 0;
  const rows = await db
    .insert(seoAiQuestions)
    .values(list.map((q) => ({ tenantId, projectId, question: q.slice(0, 300), questionKey: questionKey(q), origin: 'plantilla', status: 'propuesta', createdBy: by })))
    .onConflictDoNothing()
    .returning({ id: seoAiQuestions.id });
  return rows.length;
}

/** Proceso cada 10 días: filas pendientes de la muestra y un trabajo por pregunta. */
export async function runAiPanel(tenantId: string, projectId: string): Promise<Outcome> {
  const src = serpSource();
  if (!src?.aiAnswer || !(await src.isConnected(tenantId).catch(() => false))) return { status: 'omitido', summary: 'DataForSEO no está conectado (Agentes → Integraciones).' };
  // Filas huérfanas: «enviando» hace más de 1 h → fallida (no se reenvían: pudieron cobrarse).
  await db
    .update(seoAiChecks)
    .set({ status: 'fallida', error: 'se quedó a medio enviar', updatedAt: new Date() })
    .where(and(eq(seoAiChecks.projectId, projectId), eq(seoAiChecks.status, 'enviando'), lt(seoAiChecks.updatedAt, new Date(Date.now() - 3_600_000))));
  let qs = await db.select({ id: seoAiQuestions.id }).from(seoAiQuestions).where(and(eq(seoAiQuestions.projectId, projectId), eq(seoAiQuestions.status, 'activa')));
  if (!qs.length) {
    const added = await proposeAiQuestions(tenantId, projectId).catch(() => 0);
    return { status: 'omitido', summary: added ? `${added} pregunta(s) propuesta(s): actívalas en la pestaña IA para empezar.` : 'Sin preguntas activas (pestaña IA): no se gasta nada.' };
  }
  qs = qs.slice(0, MAX_AI_QUESTIONS);
  const { month, day } = madridParts();
  const sample = sampleOfDay(day);
  const est = qs.length * AI_ASSISTANTS.reduce((a, k) => a + AI_COST[k], 0);
  const budget = await canSpendOn(projectId, PANEL_IA_OP, est, await aiPanelBudget());
  if (!budget.ok) return { status: 'aviso', summary: `No se preguntó: el panel lleva ${budget.spentOp.toFixed(2)} $ este mes (o el proyecto ${budget.spent.toFixed(2)} $ de ${budget.budget} $).` };
  await db
    .insert(seoAiChecks)
    .values(qs.flatMap((q) => AI_ASSISTANTS.map((a) => ({ tenantId, projectId, questionId: q.id, runMonth: month, sample, assistant: a }))))
    .onConflictDoNothing();
  let jobs = 0;
  for (const q of qs) {
    const r = await enqueueJob({ tenantId, kind: QUESTION_KIND, payload: { projectId, questionId: q.id, month, sample }, scopeType: 'proyecto', scopeId: projectId, priority: 7, dedupeKey: `${QUESTION_KIND}:${q.id}:${month}:${sample}` });
    if (r.created) jobs++;
  }
  return { status: 'ok', summary: `Muestra ${sample} de ${month.slice(0, 7)}: ${qs.length} pregunta(s) × ${AI_ASSISTANTS.length} asistentes en cola (${jobs} trabajo(s) nuevo(s)); coste estimado ${est.toFixed(2)} $.` };
}

/** Un trabajo: las (hasta 4) respuestas de una pregunta en una muestra. */
export async function runAiQuestion(tenantId: string, payload: Record<string, unknown>, heartbeat: () => Promise<void>): Promise<Outcome> {
  const projectId = String(payload.projectId ?? '');
  const questionId = String(payload.questionId ?? '');
  const month = String(payload.month ?? '');
  const sample = Number(payload.sample ?? 1);
  const src = serpSource();
  if (!src?.aiAnswer) return { status: 'omitido', summary: 'Sin fuente de respuestas de IA.' };
  const [q] = await db.select().from(seoAiQuestions).where(and(eq(seoAiQuestions.id, questionId), eq(seoAiQuestions.projectId, projectId), eq(seoAiQuestions.tenantId, tenantId))).limit(1);
  if (!q) return { status: 'omitido', summary: 'Pregunta no encontrada.' };
  // Reclamo atómico: solo este trabajo envía estas filas.
  const claimed = await db
    .update(seoAiChecks)
    .set({ status: 'enviando', updatedAt: new Date() })
    .where(and(eq(seoAiChecks.questionId, questionId), eq(seoAiChecks.runMonth, month), eq(seoAiChecks.sample, sample), eq(seoAiChecks.status, 'pendiente')))
    .returning({ id: seoAiChecks.id, assistant: seoAiChecks.assistant });
  if (!claimed.length) return { status: 'omitido', summary: 'Nada pendiente en esta pregunta.' };
  const basics = await projectBasics(tenantId, projectId);
  const [p] = await db.select({ clientId: projects.clientId }).from(projects).where(eq(projects.id, projectId)).limit(1);
  const comps = p?.clientId ? await db.select({ name: clientCompetitors.name, domain: clientCompetitors.domain }).from(clientCompetitors).where(and(eq(clientCompetitors.clientId, p.clientId), eq(clientCompetitors.status, 'confirmado'))) : [];
  const facts = await confirmedFacts(projectId);
  const loc = await projectLocation(tenantId, facts.zona).catch(() => ({ name: 'Spain', approx: true }));
  const cap = await aiPanelBudget();
  let done = 0;
  let failed = 0;
  for (const row of claimed) {
    const a = row.assistant as AiAnswerAssistant;
    const estimate = AI_COST[a];
    const ok = await canSpendOn(projectId, PANEL_IA_OP, estimate, cap);
    if (!ok.ok) {
      await db.update(seoAiChecks).set({ status: 'fallida', error: 'tope de gasto del mes', updatedAt: new Date() }).where(eq(seoAiChecks.id, row.id));
      failed++;
      continue;
    }
    await recordDataSpend(tenantId, projectId, 'serp', `${PANEL_IA_OP}: ${a}`, estimate);
    try {
      const ans = await src.aiAnswer(tenantId, { assistant: a, question: q.question, language: facts.langs.includes('ca') && !facts.langs.includes('es') ? 'ca' : 'es', location: loc.approx ? null : loc.name });
      if (ans.costUsd > estimate) await recordDataSpend(tenantId, projectId, 'serp', `${PANEL_IA_OP}: ${a} (ajuste)`, ans.costUsd - estimate);
      const read = readAnswer(ans, { domain: basics?.domain ?? null, names: basics?.names ?? [] }, comps, q.question);
      await db
        .update(seoAiChecks)
        .set({ status: 'hecha', clientCited: read.clientCited, clientNamed: read.clientNamed, competitors: read.competitors, sources: read.sources, excerpt: excerpt(ans.text, basics?.names ?? [], 600) || null, costUsd: ans.costUsd.toFixed(4), error: null, updatedAt: new Date() })
        .where(eq(seoAiChecks.id, row.id));
      done++;
    } catch (e) {
      // Sin «costUsd» = error HTTP (no llegó a procesarse, no se cobra): se devuelve el estimado. Con él, se cobró.
      const charged = (e as { costUsd?: number }).costUsd;
      if (charged === undefined && e instanceof Error && /^DataForSEO( \(4\d\d\)|:)/.test(e.message)) await refundDataSpend(tenantId, projectId, 'serp', `${PANEL_IA_OP}: ${a}`, estimate);
      else if (charged !== undefined && charged > estimate) await recordDataSpend(tenantId, projectId, 'serp', `${PANEL_IA_OP}: ${a} (ajuste)`, charged - estimate);
      await db.update(seoAiChecks).set({ status: 'fallida', error: (e instanceof Error ? e.message : 'error').slice(0, 300), costUsd: (charged ?? 0).toFixed(4), updatedAt: new Date() }).where(eq(seoAiChecks.id, row.id));
      failed++;
    }
    await heartbeat();
  }
  await syncAiFindings(tenantId, projectId).catch((e) => console.error('[seo] panel IA: hallazgos', e instanceof Error ? e.message : e));
  return { status: failed ? 'aviso' : 'ok', summary: `«${q.question.slice(0, 60)}»: ${done} respuesta(s)${failed ? `, ${failed} fallida(s)` : ''}.` };
}

/** Hallazgos con margen por pregunta activa: dos meses con cuota 0 del cliente y competencia confirmada > 50 %. */
export async function syncAiFindings(tenantId: string, projectId: string): Promise<void> {
  const rows = await db
    .select({ questionId: seoAiChecks.questionId, question: seoAiQuestions.question, month: seoAiChecks.runMonth, status: seoAiChecks.status, cited: seoAiChecks.clientCited, named: seoAiChecks.clientNamed, competitors: seoAiChecks.competitors })
    .from(seoAiChecks)
    .innerJoin(seoAiQuestions, eq(seoAiQuestions.id, seoAiChecks.questionId))
    .where(and(eq(seoAiChecks.projectId, projectId), eq(seoAiQuestions.status, 'activa'), sql`${seoAiChecks.runMonth} >= (date_trunc('month', now()) - interval '2 months')::date`));
  const byQ = new Map<string, { question: string; months: Map<string, { n: number; client: number; comp: number; names: Set<string> }> }>();
  for (const r of rows) {
    if (r.status !== 'hecha') continue;
    const q = byQ.get(r.questionId) ?? { question: r.question, months: new Map() };
    const m = q.months.get(String(r.month)) ?? { n: 0, client: 0, comp: 0, names: new Set<string>() };
    m.n++;
    if (r.cited || r.named) m.client++;
    if (r.competitors.length) m.comp++;
    for (const c of r.competitors) m.names.add(c.name);
    q.months.set(String(r.month), m);
    byQ.set(r.questionId, q);
  }
  const out = [];
  for (const [id, q] of byQ) {
    const months = [...q.months.entries()].map(([month, m]) => ({ month, n: m.n, clientShare: m.client / m.n, competitorShare: m.comp / m.n }));
    if (lostToCompetitionMonths(months)) {
      const names = [...new Set([...q.months.values()].flatMap((m) => [...m.names]))].slice(0, 5);
      out.push({ kind: 'seo.ai_competitor_only', dedupeKey: `seo.ai_competitor_only:${id}`, query: q.question.slice(0, 200), evidence: { competidores: names, meses: months } });
    }
  }
  await syncFindings(tenantId, projectId, PANEL_IA_SOURCE, out, ['seo.ai_competitor_only']);
}

export type AiPanelView = {
  budget: number;
  spentOp: number;
  questions: { id: string; question: string; status: string; origin: string }[];
  months: string[];
  /** Por pregunta y mes: por asistente, cuántas respuestas y en cuántas sale el cliente; y quién sale. */
  grid: Record<string, Record<string, Record<string, { n: number; client: number; competitors: string[] }>>>;
  /** La última respuesta hecha por pregunta y asistente (recorte y fuentes). */
  last: Record<string, Record<string, { excerpt: string | null; sources: string[]; cited: boolean; named: boolean; at: string }>>;
  pending: number;
};

export async function getAiPanelView(tenantId: string, projectId: string): Promise<AiPanelView> {
  const [questions, checks, spent, budget] = await Promise.all([
    db.select({ id: seoAiQuestions.id, question: seoAiQuestions.question, status: seoAiQuestions.status, origin: seoAiQuestions.origin }).from(seoAiQuestions).where(and(eq(seoAiQuestions.projectId, projectId), eq(seoAiQuestions.tenantId, tenantId), inArray(seoAiQuestions.status, ['propuesta', 'activa']))).orderBy(asc(seoAiQuestions.createdAt)),
    db.select().from(seoAiChecks).where(and(eq(seoAiChecks.projectId, projectId), eq(seoAiChecks.tenantId, tenantId), sql`${seoAiChecks.runMonth} >= (date_trunc('month', now()) - interval '5 months')::date`)).orderBy(asc(seoAiChecks.updatedAt)),
    canSpendOn(projectId, PANEL_IA_OP, 0, Number.MAX_SAFE_INTEGER),
    aiPanelBudget()
  ]);
  const grid: AiPanelView['grid'] = {};
  const last: AiPanelView['last'] = {};
  const months = new Set<string>();
  let pending = 0;
  for (const c of checks) {
    if (c.status === 'pendiente' || c.status === 'enviando') pending++;
    if (c.status !== 'hecha') continue;
    const m = String(c.runMonth).slice(0, 7);
    months.add(m);
    const cell = (((grid[c.questionId] ??= {})[m] ??= {})[c.assistant] ??= { n: 0, client: 0, competitors: [] });
    cell.n++;
    if (c.clientCited || c.clientNamed) cell.client++;
    for (const x of c.competitors) if (!cell.competitors.includes(x.name)) cell.competitors.push(x.name);
    (last[c.questionId] ??= {})[c.assistant] = { excerpt: c.excerpt, sources: c.sources, cited: Boolean(c.clientCited), named: Boolean(c.clientNamed), at: c.updatedAt.toISOString() };
  }
  return { budget, spentOp: spent.spentOp, questions, months: [...months].sort().reverse(), grid, last, pending };
}

export function registerAiPanelJobs(): void {
  registerJobKind({ kind: QUESTION_KIND, timeoutS: 600, maxConcurrent: 2, maxAttempts: 2, run: async (ctx, payload) => runAiQuestion(ctx.tenantId, payload, ctx.heartbeat) });
}

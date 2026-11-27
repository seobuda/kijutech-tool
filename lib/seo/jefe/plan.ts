import 'server-only';

// SEO · Jefe SEO, D2: plan de servicio a 12-24 meses (docs/PLAN-SEO-JEFE.md §4, con la auditoría Opus).
// Flujo: alguien pide el plan → se reserva una versión «borrador» (candado: una generación a la vez, como mucho 2 al día por
// proyecto y dentro del presupuesto mensual del Jefe) → un trabajo construye el expediente, llama a Opus 5.5 (esfuerzo alto,
// SIN IA de reserva: el plan nunca lo hace otro modelo en silencio), el código valida y puntúa → la versión queda en
// «sombra» (solo la ven administradores) → un admin la aprueba (la anterior pasa a «sustituido») o la rechaza con motivo.
// Cada decisión queda en seo_jefe_proposals con su motivo: así se aprende el criterio de la agencia.
import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { aiJobs, seoJefeProposals, seoMasterPlanItems, seoMasterPlans, type SeoMasterPlan, type SeoMasterPlanItem } from '@/lib/db/schema';
import { callAI, getPrompt } from '@/lib/ai/gateway';
import { enqueueJob, registerJobKind } from '@/lib/core/jobs';
import { numberSetting } from '@/lib/seo/gasto';
import { eligibility, PLAYBOOKS } from '@/lib/seo/estrategia/playbooks';
import { eligibilityContext } from '@/lib/seo/estrategia/ciclos';
import { buildStrategicDossier } from '@/lib/seo/jefe/expediente';
import { extractJson, scorePlan, validatePlan } from '@/lib/seo/jefe/plan-rules';

export const JEFE_MODEL = 'claude-opus-5-5';
export const PLAN_PROMPT = 'seo_jefe_plan_maestro';
export const PLAN_PROMPT_VERSION = 'v1-2026-11-27';
const PLAN_JOB = 'seo.jefe.plan';
/** Coste estimado de una generación (expediente ~10-15 k tokens de entrada, plan ~4-8 k de salida con razonamiento). */
export const PLAN_COST_ESTIMATE_USD = 0.6;
export const DEFAULT_JEFE_BUDGET_USD = 35;
export const MAX_PLANS_PER_DAY = 2;

export class PlanError extends Error {
  constructor(public userMessage: string) {
    super(userMessage);
  }
}

const monthStart = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
};

/** Gasto del Jefe SEO este mes (todas sus llamadas: plan, ciclos, revisiones, chat). */
export async function jefeSpentThisMonth(tenantId: string): Promise<number> {
  const [r] = await db
    .select({ usd: sql<string>`coalesce(sum(${aiJobs.estimatedCost}), 0)` })
    .from(aiJobs)
    .where(and(eq(aiJobs.tenantId, tenantId), gte(aiJobs.createdAt, monthStart()), sql`(${aiJobs.function} LIKE 'seo_jefe_%' OR ${aiJobs.function} = 'agt_jefe_seo')`));
  return Number(r?.usd ?? 0);
}
export const jefeBudget = () => numberSetting('jefe_budget_usd', DEFAULT_JEFE_BUDGET_USD);

/** Pide una versión nueva del plan. Reserva la versión (candado) y encola la generación. */
export async function requestMasterPlan(tenantId: string, projectId: string, by: string, horizonMonths = 12): Promise<{ planId: string; version: number }> {
  const horizon = horizonMonths >= 18 ? 24 : 12;
  const [spent, budget] = await Promise.all([jefeSpentThisMonth(tenantId), jefeBudget()]);
  if (spent + PLAN_COST_ESTIMATE_USD > budget) throw new PlanError(`El Jefe SEO ya ha gastado ${spent.toFixed(2)} $ de ${budget} $ este mes: sube el tope en Ajustes o espera al mes que viene.`);
  const created = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`seo_jefe_plan:${projectId}`}))`);
    const [busy] = await tx
      .select({ id: seoMasterPlans.id })
      .from(seoMasterPlans)
      .where(and(eq(seoMasterPlans.projectId, projectId), eq(seoMasterPlans.status, 'borrador'), gte(seoMasterPlans.createdAt, new Date(Date.now() - 20 * 60_000))))
      .limit(1);
    if (busy) throw new PlanError('Ya se está preparando un plan (tarda unos minutos).');
    const [today] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(seoMasterPlans)
      .where(and(eq(seoMasterPlans.projectId, projectId), gte(seoMasterPlans.createdAt, new Date(Date.now() - 24 * 3600_000))));
    if ((today?.n ?? 0) >= MAX_PLANS_PER_DAY) throw new PlanError(`Como mucho ${MAX_PLANS_PER_DAY} planes al día por proyecto: rechaza o puntúa el que hay y vuelve mañana.`);
    const [last] = await tx.select({ v: sql<number>`coalesce(max(${seoMasterPlans.version}), 0)::int` }).from(seoMasterPlans).where(eq(seoMasterPlans.projectId, projectId));
    const version = (last?.v ?? 0) + 1;
    const [row] = await tx
      .insert(seoMasterPlans)
      .values({ tenantId, projectId, version, status: 'borrador', horizonMonths: horizon, startsOn: new Date().toISOString().slice(0, 10), thesis: '(preparando)', createdBy: by.slice(0, 120), promptVersion: PLAN_PROMPT_VERSION, model: JEFE_MODEL })
      .returning({ id: seoMasterPlans.id });
    return { planId: row.id, version };
  });
  await enqueueJob({ tenantId, kind: PLAN_JOB, payload: { planId: created.planId, projectId }, scopeType: 'proyecto', scopeId: projectId, priority: 3, dedupeKey: `${PLAN_JOB}:${created.planId}` });
  return created;
}

const failPlan = (planId: string, note: string, rejected: string[] = []) =>
  db
    .update(seoMasterPlans)
    .set({ status: 'rechazado', thesis: '(no se pudo generar)', reviewNote: note.slice(0, 2000), rejectedEvidence: rejected.slice(0, 40), decidedBy: 'sistema', decidedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(seoMasterPlans.id, planId), eq(seoMasterPlans.status, 'borrador')));

/** Genera la versión reservada: expediente → Opus → validación y puntuación del código → «sombra». */
export async function generateMasterPlan(tenantId: string, planId: string): Promise<Record<string, unknown>> {
  const [plan] = await db.select().from(seoMasterPlans).where(and(eq(seoMasterPlans.id, planId), eq(seoMasterPlans.tenantId, tenantId))).limit(1);
  if (!plan || plan.status !== 'borrador') return { skipped: 'no está en borrador' };
  const prompt = await getPrompt(PLAN_PROMPT);
  if (!prompt) {
    await failPlan(planId, `Falta el prompt ${PLAN_PROMPT}`);
    return { error: 'sin prompt' };
  }
  const [dossier, ectx] = await Promise.all([buildStrategicDossier(tenantId, plan.projectId), eligibilityContext(tenantId, plan.projectId)]);
  const el = eligibility(ectx);
  const [prev] = await db
    .select({ version: seoMasterPlans.version, thesis: seoMasterPlans.thesis, status: seoMasterPlans.status, reviewNote: seoMasterPlans.reviewNote })
    .from(seoMasterPlans)
    .where(and(eq(seoMasterPlans.projectId, plan.projectId), inArray(seoMasterPlans.status, ['aprobado', 'rechazado', 'sombra']), sql`${seoMasterPlans.version} < ${plan.version}`, sql`${seoMasterPlans.thesis} <> '(no se pudo generar)'`))
    .orderBy(desc(seoMasterPlans.version))
    .limit(1);
  const vals: Record<string, string> = {
    horizonte: String(plan.horizonMonths),
    trimestres: String(Math.round(plan.horizonMonths / 3)),
    expediente: dossier.text,
    lineas: Object.values(PLAYBOOKS)
      .filter((p) => p.key !== 'cimientos')
      .map((p) => `- ${p.key}: ${p.label} — ${p.description} (${p.unitLabel}, ~${p.hoursPerUnit} h cada una)`)
      .join('\n'),
    anterior: prev ? `Versión ${prev.version} (${prev.status}): ${prev.thesis}${prev.reviewNote ? `\nComentario de quien la revisó: ${prev.reviewNote}` : ''}` : 'Ninguno: es el primer plan del proyecto.'
  };
  const fill = (t: string) => t.replace(/\{(horizonte|trimestres|expediente|lineas|anterior)\}/g, (_m, k: string) => vals[k] ?? '');
  let res: Awaited<ReturnType<typeof callAI>>;
  try {
    res = await callAI({
      tenantId,
      projectId: plan.projectId,
      function: 'seo_jefe_plan',
      promptKey: PLAN_PROMPT,
      model: JEFE_MODEL,
      preferredProvider: 'anthropic',
      requireProvider: 'anthropic',
      noFallback: true,
      effort: 'high',
      maxTokens: 16000,
      timeoutMs: 300_000,
      messages: [
        { role: 'system', content: prompt.system_prompt },
        { role: 'user', content: fill(prompt.user_prompt_template) }
      ]
    });
  } catch (e) {
    await failPlan(planId, `La IA no respondió: ${e instanceof Error ? e.message.slice(0, 300) : 'error'}`);
    throw e;
  }
  const v = validatePlan(extractJson(res.content), { evidence: dossier.evidence, eligible: el.eligible, blocked: el.blocked, horizonMonths: plan.horizonMonths, monthlyHours: dossier.summary.monthlyHours, services: ectx.services });
  const [job] = await db.select({ cost: aiJobs.estimatedCost }).from(aiJobs).where(eq(aiJobs.id, res.jobId)).limit(1);
  if (!v.ok) {
    await failPlan(planId, `El plan no pasó la validación: ${v.errors.join(' ')}`, v.rejectedEvidence);
    await db.update(seoMasterPlans).set({ aiJobId: res.jobId, costUsd: job?.cost ?? null }).where(eq(seoMasterPlans.id, planId));
    return { ok: false, errors: v.errors };
  }
  const score = scorePlan(v.plan, dossier.evidence);
  await db.transaction(async (tx) => {
    const done = await tx
      .update(seoMasterPlans)
      .set({
        status: 'sombra',
        thesis: v.plan.thesis,
        diagnosis: v.plan.diagnosis,
        risks: v.plan.risks,
        unknowns: v.plan.unknowns,
        discarded: v.plan.discarded,
        confidence: v.plan.confidence,
        dataGaps: dossier.summary.dataGaps.slice(0, 20),
        rejectedEvidence: v.rejectedEvidence.slice(0, 40),
        scorer: { score: score.score, divergences: score.divergences, signals: score.signals, warnings: v.warnings, q1Hours: v.q1Hours, q1Available: v.q1Available },
        aiJobId: res.jobId,
        costUsd: job?.cost ?? null,
        model: res.model,
        updatedAt: new Date()
      })
      .where(and(eq(seoMasterPlans.id, planId), eq(seoMasterPlans.status, 'borrador')))
      .returning({ id: seoMasterPlans.id });
    if (!done.length) return;
    if (v.plan.frentes.length)
      await tx.insert(seoMasterPlanItems).values(
        v.plan.frentes.map((f, i) => ({
          tenantId,
          planId,
          projectId: plan.projectId,
          frenteKey: f.frenteKey,
          kind: f.kind,
          playbook: f.playbook,
          params: f.conditional ? { ...f.params, condicionado: f.conditional } : f.params,
          title: f.title,
          rationale: f.rationale,
          evidence: f.evidence,
          fromQuarter: f.fromQuarter,
          toQuarter: f.toQuarter,
          priority: f.priority,
          forecast: f.evidence.map((e) => (typeof e.data.pronostico === 'string' ? e.data.pronostico : typeof e.data.pronosticoContenidoNuevo === 'string' ? e.data.pronosticoContenidoNuevo : '')).find(Boolean) ?? null,
          sort: i
        }))
      );
  });
  return { ok: true, frentes: v.plan.frentes.length, score: score.score, descartadas: v.rejectedEvidence.length };
}

async function recordDecision(tenantId: string, plan: SeoMasterPlan, status: 'aprobada' | 'rechazada', by: string, reason: string | null) {
  await db.insert(seoJefeProposals).values({
    tenantId,
    projectId: plan.projectId,
    kind: 'plan',
    basePlanId: plan.id,
    baseVersion: plan.version,
    payload: { planId: plan.id, version: plan.version, thesis: plan.thesis.slice(0, 500) },
    scorer: plan.scorer ?? {},
    status,
    decidedBy: by.slice(0, 120),
    decisionReason: reason?.slice(0, 2000) ?? null,
    aiJobId: plan.aiJobId,
    promptVersion: plan.promptVersion,
    decidedAt: new Date()
  });
}

async function loadPlan(tenantId: string, projectId: string, planId: string): Promise<SeoMasterPlan> {
  const [p] = await db.select().from(seoMasterPlans).where(and(eq(seoMasterPlans.id, planId), eq(seoMasterPlans.projectId, projectId), eq(seoMasterPlans.tenantId, tenantId))).limit(1);
  if (!p) throw new PlanError('Plan no encontrado.');
  return p;
}

/** Aprueba una versión (en sombra o propuesta): la aprobada anterior pasa a «sustituido». */
export async function approvePlan(tenantId: string, projectId: string, planId: string, by: string, note: string | null): Promise<void> {
  const p = await loadPlan(tenantId, projectId, planId);
  if (!['sombra', 'propuesto'].includes(p.status)) throw new PlanError('Solo se puede aprobar un plan en sombra o propuesto.');
  await db.transaction(async (tx) => {
    await tx.update(seoMasterPlans).set({ status: 'sustituido', updatedAt: new Date() }).where(and(eq(seoMasterPlans.projectId, projectId), eq(seoMasterPlans.status, 'aprobado')));
    const r = await tx
      .update(seoMasterPlans)
      .set({ status: 'aprobado', decidedBy: by.slice(0, 120), decidedAt: new Date(), reviewNote: note?.slice(0, 2000) || p.reviewNote, updatedAt: new Date() })
      .where(and(eq(seoMasterPlans.id, planId), inArray(seoMasterPlans.status, ['sombra', 'propuesto'])))
      .returning({ id: seoMasterPlans.id });
    if (!r.length) throw new PlanError('El plan cambió mientras tanto: recarga la página.');
  });
  await recordDecision(tenantId, p, 'aprobada', by, note);
}

export async function rejectPlan(tenantId: string, projectId: string, planId: string, by: string, reason: string): Promise<void> {
  const p = await loadPlan(tenantId, projectId, planId);
  if (!['sombra', 'propuesto'].includes(p.status)) throw new PlanError('Solo se puede rechazar un plan en sombra o propuesto.');
  if (reason.trim().length < 5) throw new PlanError('Escribe por qué se rechaza: el Jefe lo usa en la siguiente versión.');
  await db
    .update(seoMasterPlans)
    .set({ status: 'rechazado', reviewNote: reason.slice(0, 2000), decidedBy: by.slice(0, 120), decidedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(seoMasterPlans.id, planId), inArray(seoMasterPlans.status, ['sombra', 'propuesto'])));
  await recordDecision(tenantId, p, 'rechazada', by, reason);
}

/** Modo sombra: nota de 1 a 5 de quien revisa («¿lo habría hecho yo así?») y comentario. */
export async function scorePlanShadow(tenantId: string, projectId: string, planId: string, score: number, note: string | null): Promise<void> {
  await loadPlan(tenantId, projectId, planId);
  const s = Math.round(score);
  if (!(s >= 1 && s <= 5)) throw new PlanError('La nota va de 1 a 5.');
  await db
    .update(seoMasterPlans)
    .set({ shadowScore: s, ...(note?.trim() ? { reviewNote: note.trim().slice(0, 2000) } : {}), updatedAt: new Date() })
    .where(eq(seoMasterPlans.id, planId));
}

export type PlanView = {
  versions: Pick<SeoMasterPlan, 'id' | 'version' | 'status' | 'createdAt' | 'shadowScore' | 'confidence'>[];
  current: (SeoMasterPlan & { items: SeoMasterPlanItem[] }) | null;
  generating: boolean;
  spent: number;
  budget: number;
};

/** Lo que enseña la pantalla. `includeShadow` = admin (los planes en sombra solo los ven administradores). */
export async function getPlanView(tenantId: string, projectId: string, includeShadow: boolean, planId?: string | null): Promise<PlanView> {
  const visible = includeShadow ? ['borrador', 'sombra', 'propuesto', 'aprobado', 'sustituido', 'rechazado'] : ['propuesto', 'aprobado', 'sustituido'];
  const [versions, spent, budget] = await Promise.all([
    db
      .select({ id: seoMasterPlans.id, version: seoMasterPlans.version, status: seoMasterPlans.status, createdAt: seoMasterPlans.createdAt, shadowScore: seoMasterPlans.shadowScore, confidence: seoMasterPlans.confidence })
      .from(seoMasterPlans)
      .where(and(eq(seoMasterPlans.tenantId, tenantId), eq(seoMasterPlans.projectId, projectId), inArray(seoMasterPlans.status, visible)))
      .orderBy(desc(seoMasterPlans.version))
      .limit(30),
    jefeSpentThisMonth(tenantId),
    jefeBudget()
  ]);
  const generating = versions.some((v) => v.status === 'borrador' && v.createdAt.getTime() > Date.now() - 20 * 60_000);
  const pick =
    (planId && versions.find((v) => v.id === planId)) ||
    versions.find((v) => v.status === 'aprobado') ||
    versions.find((v) => v.status !== 'borrador') ||
    null;
  let current: PlanView['current'] = null;
  if (pick) {
    const [row] = await db.select().from(seoMasterPlans).where(eq(seoMasterPlans.id, pick.id)).limit(1);
    const items = await db.select().from(seoMasterPlanItems).where(eq(seoMasterPlanItems.planId, pick.id)).orderBy(seoMasterPlanItems.fromQuarter, seoMasterPlanItems.priority, seoMasterPlanItems.sort);
    current = row ? { ...row, items } : null;
  }
  return { versions, current, generating, spent, budget };
}

/** Plan aprobado del proyecto (lo usan los ciclos y «un solo cerebro»). */
export async function approvedPlan(tenantId: string, projectId: string): Promise<SeoMasterPlan | null> {
  const [p] = await db.select().from(seoMasterPlans).where(and(eq(seoMasterPlans.tenantId, tenantId), eq(seoMasterPlans.projectId, projectId), eq(seoMasterPlans.status, 'aprobado'))).limit(1);
  return p ?? null;
}

let registered = false;
export function registerJefePlanJobs(): void {
  if (registered) return;
  registered = true;
  registerJobKind({
    kind: PLAN_JOB,
    timeoutS: 420,
    maxConcurrent: 1,
    maxAttempts: 1,
    run: async (ctx, payload) => {
      const planId = String(payload.planId ?? '');
      try {
        return await generateMasterPlan(ctx.tenantId, planId);
      } catch (e) {
        await failPlan(planId, `No se pudo generar: ${e instanceof Error ? e.message.slice(0, 300) : 'error'}`);
        throw e;
      }
    }
  });
}

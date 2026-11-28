'use server';

// SEO · acciones del plan de servicio del Jefe SEO (docs/PLAN-SEO-JEFE.md, D2). Todas son de administrador: generar cuesta
// dinero (Opus) y aprobar cambia la estrategia del proyecto (decisión de Enric: el plan lo aprueba un admin).
import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { projects } from '@/lib/db/schema';
import { checkPermission, requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { wireApp } from '@/lib/app-wiring';
import { agentChat, type AgentChatMessage } from '@/lib/core/capabilities';
import { approvePlan, approvedPlan, jefeBudget, jefeSpentThisMonth, PLAN_COST_ESTIMATE_USD, PlanError, rejectPlan, requestMasterPlan, scorePlanShadow } from '@/lib/seo/jefe/plan';
import { decidePlanChange } from '@/lib/seo/jefe/cambios';
import { decideCycleProposal, proposeCycleFromPlan } from '@/lib/seo/jefe/ciclos';
import { decideRevision } from '@/lib/seo/jefe/revision';
import { accountCycleAutonomy } from '@/lib/seo/jefe/metricas';
import { JEFE_AGENT_KEY, JEFE_CHAT_MAX_TOKENS, jefeThread } from '@/lib/seo/jefe/chat';

type Ok = { ok: true; message?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (e: unknown): Ok => ({ ok: false, error: e instanceof PlanError ? e.userMessage : publicError(e, 'No se pudo completar la acción') });
const paths = (id: string) => revalidatePath(`/dashboard/projects/${id}/servicio`);

async function ownProject(tenantId: string, projectId: string): Promise<boolean> {
  if (!UUID.test(projectId)) return false;
  const [p] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId), eq(projects.service, 'seo'))).limit(1);
  return Boolean(p);
}

export async function requestMasterPlanAction(projectId: string, horizonMonths: number): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    if (!(await ownProject(user.tenantId, projectId))) return { ok: false, error: 'Proyecto no encontrado' };
    const r = await requestMasterPlan(user.tenantId, projectId, user.name || user.email, Number(horizonMonths) || 12);
    paths(projectId);
    return { ok: true, message: `Preparando la versión ${r.version} (unos minutos). Quedará en sombra para que la revises.` };
  } catch (e) {
    return fail(e);
  }
}

export async function approvePlanAction(projectId: string, planId: string, note: string): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    if (!(await ownProject(user.tenantId, projectId)) || !UUID.test(planId)) return { ok: false, error: 'Plan no encontrado' };
    await approvePlan(user.tenantId, projectId, planId, user.name || user.email, String(note ?? '').trim() || null);
    paths(projectId);
    return { ok: true, message: 'Plan aprobado: es el plan de servicio vigente del proyecto.' };
  } catch (e) {
    return fail(e);
  }
}

export async function rejectPlanAction(projectId: string, planId: string, reason: string): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    if (!(await ownProject(user.tenantId, projectId)) || !UUID.test(planId)) return { ok: false, error: 'Plan no encontrado' };
    await rejectPlan(user.tenantId, projectId, planId, user.name || user.email, String(reason ?? ''));
    paths(projectId);
    return { ok: true, message: 'Rechazado. El motivo se tendrá en cuenta en la siguiente versión.' };
  } catch (e) {
    return fail(e);
  }
}

export async function scorePlanAction(projectId: string, planId: string, score: number, note: string): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    if (!(await ownProject(user.tenantId, projectId)) || !UUID.test(planId)) return { ok: false, error: 'Plan no encontrado' };
    await scorePlanShadow(user.tenantId, projectId, planId, Number(score), String(note ?? ''));
    paths(projectId);
    return { ok: true, message: 'Nota guardada.' };
  } catch (e) {
    return fail(e);
  }
}

// --- D3: conversación con el Jefe SEO y cambios propuestos (con la auditoría Opus) ------------------------------------
// El hilo lo construye el servidor a partir del proyecto validado («seo:<id>»): el navegador nunca elige el hilo.

export async function sendJefeMessageAction(projectId: string, text: string): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    if (!(await ownProject(user.tenantId, projectId))) return { ok: false, error: 'Proyecto no encontrado' };
    const msg = String(text ?? '').trim();
    if (msg.length < 2) return { ok: false, error: 'Escribe un mensaje.' };
    if (msg.length > 4000) return { ok: false, error: 'El mensaje es demasiado largo (máximo 4.000 caracteres).' };
    // Un solo presupuesto: el chat no puede dejar sin margen la generación del plan.
    const [spent, budget] = await Promise.all([jefeSpentThisMonth(user.tenantId), jefeBudget()]);
    if (spent + PLAN_COST_ESTIMATE_USD > budget) return { ok: false, error: `El Jefe SEO ya ha gastado ${spent.toFixed(2)} $ de ${budget} $ este mes: sube el tope en Ajustes o espera al mes que viene.` };
    wireApp();
    const chat = agentChat();
    if (!chat) return { ok: false, error: 'El chat con los agentes no está disponible.' };
    const [p] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, projectId)).limit(1);
    const plan = await approvedPlan(user.tenantId, projectId);
    const owner = (await checkPermission('users')).ok;
    const r = await chat.send({
      tenantId: user.tenantId,
      agentKey: JEFE_AGENT_KEY,
      thread: jefeThread(projectId),
      threadName: `Plan de servicio · ${p?.name ?? projectId}`.slice(0, 200),
      actor: { name: (user.name || user.email).slice(0, 80), isOwner: owner },
      text: msg,
      // Mínimo y estable: lo vivo (plan, cambios) lo lee con sus herramientas.
      context: `Hablas desde la pantalla Plan de servicio del proyecto SEO «${p?.name ?? ''}» (id ${projectId}). Tus herramientas ya trabajan sobre este proyecto: no hace falta que lo nombres.${plan ? '' : ' Aún no hay plan aprobado.'}`,
      maxTokens: JEFE_CHAT_MAX_TOKENS
    });
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, message: 'Enviado. El Jefe SEO está respondiendo (puede tardar un minuto).' };
  } catch (e) {
    return fail(e);
  }
}

export async function jefeThreadAction(projectId: string): Promise<{ ok: true; messages: AgentChatMessage[]; busy: boolean } | { ok: false; error: string }> {
  try {
    const user = await requirePermission('admin');
    if (!(await ownProject(user.tenantId, projectId))) return { ok: false, error: 'Proyecto no encontrado' };
    wireApp();
    const chat = agentChat();
    if (!chat) return { ok: true, messages: [], busy: false };
    const h = await chat.history(user.tenantId, JEFE_AGENT_KEY, jefeThread(projectId));
    return { ok: true, ...h };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo leer la conversación') };
  }
}

export async function decidePlanChangeAction(projectId: string, changeId: string, accept: boolean, reason: string): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    if (!(await ownProject(user.tenantId, projectId)) || !UUID.test(changeId)) return { ok: false, error: 'Cambio no encontrado' };
    await decidePlanChange(user.tenantId, projectId, changeId, accept ? 'aprobada' : 'rechazada', user.name || user.email, String(reason ?? '').slice(0, 2000) || null);
    paths(projectId);
    return { ok: true, message: accept ? 'Aceptado: el Jefe lo incorporará en la próxima versión del plan (genérala cuando quieras).' : 'Rechazado. El Jefe tendrá en cuenta el motivo.' };
  } catch (e) {
    return fail(e);
  }
}

// --- D4: estrategia trimestral desde el plan aprobado (la calcula el código; la aprueba un admin) -----------------------

export async function proposeCycleAction(projectId: string): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    if (!(await ownProject(user.tenantId, projectId))) return { ok: false, error: 'Proyecto no encontrado' };
    const r = await proposeCycleFromPlan(user.tenantId, projectId);
    paths(projectId);
    return { ok: true, message: `Estrategia propuesta con ${r.lines} línea(s). Revísala y apruébala.` };
  } catch (e) {
    return fail(e);
  }
}

export async function decideCycleAction(projectId: string, proposalId: string, accept: boolean, reason: string): Promise<Ok> {
  try {
    // D6, autonomía graduada (decisión 3 de Enric): con más del 70 % de 10 estrategias aprobadas sin editar, también las
    // decide un editor (responsable SEO). Antes, solo administradores.
    const user = await requirePermission('edit');
    if (!(await checkPermission('admin')).ok && !(await accountCycleAutonomy(user.tenantId)).enabled) return { ok: false, error: 'De momento las estrategias del Jefe las aprueba un administrador (cuando acierte en más del 70 % de 10, podrá hacerlo el responsable SEO).' };
    if (!(await ownProject(user.tenantId, projectId)) || !UUID.test(proposalId)) return { ok: false, error: 'Propuesta no encontrada' };
    const r = await decideCycleProposal(user.tenantId, projectId, proposalId, Boolean(accept), user.name || user.email, String(reason ?? '').slice(0, 2000) || null);
    paths(projectId);
    revalidatePath(`/dashboard/projects/${projectId}/estrategia`);
    if (!accept) return { ok: true, message: 'Descartada. El motivo queda apuntado.' };
    return { ok: true, message: r.cycleId ? 'Estrategia creada y activa: aprueba el lote del primer mes en Trabajo → Estrategia.' : 'Aprobada. Se creará sola en cuanto se cierre la estrategia activa.' };
  } catch (e) {
    return fail(e);
  }
}

// --- D6: revisión del plan propuesta por el Jefe ---------------------------------------------------------------------

export async function decideRevisionAction(projectId: string, proposalId: string, accept: boolean, reason: string): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    if (!(await ownProject(user.tenantId, projectId)) || !UUID.test(proposalId)) return { ok: false, error: 'Propuesta no encontrada' };
    const r = await decideRevision(user.tenantId, projectId, proposalId, Boolean(accept), user.name || user.email, String(reason ?? '').slice(0, 2000) || null);
    paths(projectId);
    return { ok: true, message: accept ? `Preparando la versión ${r.version} (unos minutos). Quedará en sombra para que la revises.` : 'Anotado: no se revisa por este motivo.' };
  } catch (e) {
    return fail(e);
  }
}

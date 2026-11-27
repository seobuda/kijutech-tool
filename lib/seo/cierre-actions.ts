'use server';

// SEO · acciones de las pestañas IA (parte 11) y Autoridad (parte 10), 27 nov 2026. Permisos en el servidor: «edit» para
// las preguntas y «Preguntar ahora»; «admin» para encender Autoridad (gasta cada mes) y para la prueba de cobertura.
import { revalidatePath } from 'next/cache';
import { and, count, eq, inArray, lt } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { projects, seoAiChecks, seoAiQuestions } from '@/lib/db/schema';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { enqueueJob } from '@/lib/core/jobs';
import { proposeAiQuestions } from '@/lib/seo/panel-ia/panel';
import { MAX_AI_QUESTIONS, questionKey } from '@/lib/seo/panel-ia/rules';
import { AUTORIDAD_KEY, coverageTest, setAutoridad } from '@/lib/seo/autoridad/autoridad';
import { coverageShare } from '@/lib/seo/autoridad/rules';
import { draftMonthlyReport } from '@/lib/seo/vivo/vivo';

type Ok = { ok: true; message?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function ownProject(tenantId: string, projectId: string): Promise<boolean> {
  if (!UUID.test(projectId)) return false;
  const [p] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  return Boolean(p);
}

export async function proposeAiQuestionsAction(projectId: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!(await ownProject(user.tenantId, projectId))) return { ok: false, error: 'Proyecto no encontrado' };
    const n = await proposeAiQuestions(user.tenantId, projectId, user.name ?? user.email);
    revalidatePath(`/dashboard/projects/${projectId}/ia`);
    return { ok: true, message: n ? `${n} pregunta(s) propuesta(s).` : 'No hay preguntas nuevas que proponer (faltan servicios y zona confirmados en el Expediente, o ya están todas).' };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo completar la acción') };
  }
}

export async function addAiQuestionAction(projectId: string, raw: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!(await ownProject(user.tenantId, projectId))) return { ok: false, error: 'Proyecto no encontrado' };
    const q = raw.replace(/\s+/g, ' ').trim().slice(0, 300);
    if (questionKey(q).length < 8) return { ok: false, error: 'Escribe la pregunta como la haría un cliente (8 letras o más).' };
    const [{ n }] = await db.select({ n: count() }).from(seoAiQuestions).where(and(eq(seoAiQuestions.projectId, projectId), eq(seoAiQuestions.status, 'activa')));
    if (Number(n) >= MAX_AI_QUESTIONS) return { ok: false, error: `Ya hay ${MAX_AI_QUESTIONS} preguntas activas: quita alguna antes.` };
    await db
      .insert(seoAiQuestions)
      .values({ tenantId: user.tenantId, projectId, question: q, questionKey: questionKey(q), origin: 'manual', status: 'activa', createdBy: user.name ?? user.email })
      .onConflictDoUpdate({ target: [seoAiQuestions.projectId, seoAiQuestions.questionKey], set: { status: 'activa', updatedAt: new Date() } });
    revalidatePath(`/dashboard/projects/${projectId}/ia`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo completar la acción') };
  }
}

export async function setAiQuestionStatusAction(projectId: string, id: string, status: 'activa' | 'quitada'): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!UUID.test(id) || !['activa', 'quitada'].includes(status) || !(await ownProject(user.tenantId, projectId))) return { ok: false, error: 'Pregunta no encontrada' };
    if (status === 'activa') {
      const [{ n }] = await db.select({ n: count() }).from(seoAiQuestions).where(and(eq(seoAiQuestions.projectId, projectId), eq(seoAiQuestions.status, 'activa')));
      if (Number(n) >= MAX_AI_QUESTIONS) return { ok: false, error: `Ya hay ${MAX_AI_QUESTIONS} preguntas activas: quita alguna antes.` };
    }
    await db.update(seoAiQuestions).set({ status, updatedAt: new Date() }).where(and(eq(seoAiQuestions.id, id), eq(seoAiQuestions.projectId, projectId), eq(seoAiQuestions.tenantId, user.tenantId)));
    revalidatePath(`/dashboard/projects/${projectId}/ia`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo completar la acción') };
  }
}

/** Preguntar ahora (la muestra de estos días). No si ya hay respuestas en curso. */
export async function runAiPanelNowAction(projectId: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!(await ownProject(user.tenantId, projectId))) return { ok: false, error: 'Proyecto no encontrado' };
    // Las filas «enviando» de más de 1 h se quedaron a medias: pasan a fallida (no se reenvían) y no bloquean.
    await db.update(seoAiChecks).set({ status: 'fallida', error: 'se quedó a medio enviar', updatedAt: new Date() }).where(and(eq(seoAiChecks.projectId, projectId), eq(seoAiChecks.status, 'enviando'), lt(seoAiChecks.updatedAt, new Date(Date.now() - 3_600_000))));
    const [{ n }] = await db.select({ n: count() }).from(seoAiChecks).where(and(eq(seoAiChecks.projectId, projectId), inArray(seoAiChecks.status, ['pendiente', 'enviando'])));
    if (Number(n) > 0) return { ok: false, error: 'Ya hay preguntas en curso: espera a que terminen.' };
    const r = await enqueueJob({ tenantId: user.tenantId, kind: 'seo.panel_ia', payload: { projectId }, scopeType: 'proyecto', scopeId: projectId, priority: 4, dedupeKey: `sched:seo.panel_ia:${projectId}` });
    return { ok: true, message: r.created ? 'En cola: las respuestas llegan en unos minutos. Cada muestra del mes solo se paga una vez.' : 'Ya estaba en cola.' };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo completar la acción') };
  }
}

export async function setAutoridadAction(projectId: string, on: boolean): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    if (!(await ownProject(user.tenantId, projectId))) return { ok: false, error: 'Proyecto no encontrado' };
    await setAutoridad(user.tenantId, projectId, Boolean(on));
    revalidatePath(`/dashboard/projects/${projectId}/autoridad`);
    return { ok: true, message: on ? 'Autoridad encendida: la primera consulta sale en un minuto y después cada mes.' : 'Autoridad apagada: no se consultará más.' };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo completar la acción') };
  }
}

export async function runAutoridadNowAction(projectId: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!(await ownProject(user.tenantId, projectId))) return { ok: false, error: 'Proyecto no encontrado' };
    const r = await enqueueJob({ tenantId: user.tenantId, kind: AUTORIDAD_KEY, payload: { projectId }, scopeType: 'proyecto', scopeId: projectId, priority: 4, dedupeKey: `sched:${AUTORIDAD_KEY}:${projectId}` });
    return { ok: true, message: r.created ? 'En cola. Lo ya consultado este mes no se repite (ni se paga).' : 'Ya estaba en cola.' };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo completar la acción') };
  }
}

/** Prueba de cobertura: compara los dominios que pega Enric (Search Console → Enlaces) con los de DataForSEO. */
export async function coverageTestAction(projectId: string, gscText: string): Promise<{ ok: true; share: number | null; found: number; total: number; dfsTotal: number | null; missing: string[] } | { ok: false; error: string }> {
  try {
    const user = await requirePermission('admin');
    if (!(await ownProject(user.tenantId, projectId))) return { ok: false, error: 'Proyecto no encontrado' };
    const gsc = String(gscText ?? '').split(/[\s,;]+/).map((s) => s.trim()).filter((s) => /\.[a-z]{2,}/i.test(s)).slice(0, 2000);
    if (gsc.length < 3) return { ok: false, error: 'Pega al menos 3 dominios de Search Console → Enlaces → «Sitios que más enlazan».' };
    const r = await coverageTest(user.tenantId, projectId);
    if (!r.ok) return { ok: false, error: r.error };
    const c = coverageShare(gsc, r.domains);
    const have = new Set(r.domains);
    const norm = (s: string) => s.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    return { ok: true, ...c, dfsTotal: r.total, missing: [...new Set(gsc.map(norm))].filter((d) => !have.has(d)).slice(0, 30) };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo completar la acción') };
  }
}

/** Parte 12: borrador del informe del mes pasado a la bandeja de mensajes al cliente (siempre con aprobación). */
export async function draftMonthlyReportAction(projectId: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!(await ownProject(user.tenantId, projectId))) return { ok: false, error: 'Proyecto no encontrado' };
    const r = await draftMonthlyReport(user.tenantId, projectId, { name: user.name || user.email, userId: user.id });
    if (!r.ok) return r;
    return { ok: true, message: r.created ? 'Borrador del informe preparado: revísalo y apruébalo en Para ti (o en Telegram). Nunca sale solo.' : 'El informe de ese mes ya estaba preparado (míralo en Para ti).' };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo preparar el informe') };
  }
}

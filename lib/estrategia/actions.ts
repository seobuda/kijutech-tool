'use server';

// Acciones web del módulo Estrategia. Todas comprueban permisos en el servidor:
//   - ver la estrategia de un cliente, objetivos, palabras clave, señales, trabajo y «Ejecutar ahora»: «edit»;
//   - asignar o quitar un plan, ajustar frecuencias de un cliente, pausar, editar planes, ajustes, calendario y borrar
//     objetivos: «admin» (cambian qué se hace y cuánto cuesta).
//   - estratega (fase 2): pedir un análisis y decidir propuestas (crear encargo, ajustar, más adelante, no): «edit»;
//     sus ajustes (máximo de propuestas, análisis por alerta al mes, caducidad): «admin».
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { wireApp } from '@/lib/app-wiring';
import { kpiProvider } from '@/lib/core/capabilities';
import {
  EstError,
  addKeywords,
  closeObjective,
  deleteEvent,
  deleteKeyword,
  deleteObjective,
  deletePlan,
  deleteTrackedUrl,
  getWorkFact,
  listRuns,
  pauseClient,
  saveClientOverride,
  saveEvent,
  saveObjective,
  savePlan,
  saveSettings,
  setClientPlan,
  setSignalStatus,
  updateKeyword,
  type EventInput,
  type ObjectiveInput,
  type PlanInput,
  type SettingsInput
} from '@/lib/estrategia/store';
import { clientStrategy, objectiveBaseline, suggestKeywords, type ClientStrategy } from '@/lib/estrategia/report';
import { answerUrl, backfillClientWork } from '@/lib/estrategia/processes';
import { runProcess } from '@/lib/estrategia/scheduler';
import { isProcessKey, isRunnable } from '@/lib/estrategia/rules';
import { StrategistError, decideSuggestion, queueAnalysis, runPendingAnalyses, saveStrategistSettings, type Decision } from '@/lib/estrategia/strategist';
import { REJECT_REASONS } from '@/lib/estrategia/strategist-rules';

type Ok<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown, fallback: string): { ok: false; error: string } => ({ ok: false, error: e instanceof EstError || e instanceof StrategistError ? e.userMessage : publicError(e, fallback) });
const id = (v: unknown) => String(v ?? '').slice(0, 60);

export async function getClientStrategyAction(clientId: string): Promise<Ok<{ data: ClientStrategy }>> {
  try {
    const user = await requirePermission('edit');
    wireApp();
    const data = await clientStrategy(user.tenantId, id(clientId));
    if (!data) return { ok: false, error: 'Ese cliente no existe.' };
    return { ok: true, data };
  } catch (e) {
    return fail(e, 'No se pudo cargar la estrategia');
  }
}

// --- Plan y frecuencias del cliente (admin) -------------------------------------------------------------------------

export async function setClientPlanAction(clientId: string, planId: string | null): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    await setClientPlan(user.tenantId, id(clientId), planId ? id(planId) : null);
    revalidatePath('/dashboard/estrategia');
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo cambiar el plan');
  }
}

export async function saveClientOverrideAction(clientId: string, process: string, value: { on: boolean; every: number } | null): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    if (!isProcessKey(String(process))) return { ok: false, error: 'Proceso desconocido.' };
    await saveClientOverride(user.tenantId, id(clientId), String(process), value ? { on: Boolean(value.on), every: Number(value.every) } : null);
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo guardar el ajuste');
  }
}

export async function pauseClientAction(clientId: string, until: string | null): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    await pauseClient(user.tenantId, id(clientId), until ? String(until).slice(0, 10) : null);
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo pausar');
  }
}

/** «Ejecutar ahora» un proceso del cliente (espera su resultado, como mucho lo que tarde ese proceso). */
export async function runProcessNowAction(clientId: string, process: string): Promise<Ok<{ status: string; summary: string }>> {
  try {
    const user = await requirePermission('edit');
    wireApp();
    if (!isProcessKey(String(process)) || !isRunnable(process as never)) return { ok: false, error: 'Ese proceso aún no está disponible.' };
    const run = (await listRuns(user.tenantId, id(clientId))).find((r) => r.process === process);
    if (!run) return { ok: false, error: 'Ese proceso no está activo para este cliente.' };
    const out = await runProcess(user.tenantId, run);
    return { ok: true, status: out.status, summary: out.summary };
  } catch (e) {
    return fail(e, 'No se pudo ejecutar');
  }
}

// --- Objetivos (edit; borrar: admin) --------------------------------------------------------------------------------

export async function saveObjectiveAction(clientId: string, input: ObjectiveInput): Promise<Ok<{ id: string }>> {
  try {
    const user = await requirePermission('edit');
    wireApp();
    const kpis = (kpiProvider()?.list() ?? []).map((k) => k.key);
    const saved = await saveObjective(user.tenantId, id(clientId), { ...input, source: 'manual', createdBy: user.id }, kpis);
    return { ok: true, id: saved };
  } catch (e) {
    return fail(e, 'No se pudo guardar el objetivo');
  }
}

export async function closeObjectiveAction(objectiveId: string, status: 'logrado' | 'no_logrado' | 'descartado' | 'activo'): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!['logrado', 'no_logrado', 'descartado', 'activo'].includes(status)) return { ok: false, error: 'Estado no válido.' };
    await closeObjective(user.tenantId, id(objectiveId), status);
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo cerrar el objetivo');
  }
}

export async function deleteObjectiveAction(objectiveId: string): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    await deleteObjective(user.tenantId, id(objectiveId));
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo eliminar el objetivo');
  }
}

export async function objectiveBaselineAction(clientId: string, kpiKey: string, months: number): Promise<Ok<{ baseline: number | null; yoy: number | null; proposals: { low: number; mid: number; high: number } | null; last: string | null }>> {
  try {
    const user = await requirePermission('edit');
    wireApp();
    const r = await objectiveBaseline(user.tenantId, id(clientId), String(kpiKey).slice(0, 40), Math.min(36, Math.max(1, Math.round(Number(months) || 6))));
    if (!r) return { ok: false, error: 'Esa cifra no existe.' };
    return { ok: true, baseline: r.baseline, yoy: r.yoy, proposals: r.proposals, last: r.last };
  } catch (e) {
    return fail(e, 'No se pudo calcular la partida');
  }
}

// --- Palabras clave (edit) ------------------------------------------------------------------------------------------

export async function addKeywordsAction(clientId: string, words: string[], critical = false, targetUrl: string | null = null): Promise<Ok<{ added: number }>> {
  try {
    const user = await requirePermission('edit');
    const added = await addKeywords(user.tenantId, id(clientId), Array.isArray(words) ? words.map(String).slice(0, 200) : [], { critical: Boolean(critical), targetUrl: targetUrl ? String(targetUrl) : null });
    return { ok: true, added };
  } catch (e) {
    return fail(e, 'No se pudieron añadir las palabras');
  }
}

export async function updateKeywordAction(keywordId: string, patch: { critical?: boolean; active?: boolean; targetUrl?: string | null }): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    await updateKeyword(user.tenantId, id(keywordId), { critical: patch?.critical, active: patch?.active, targetUrl: patch?.targetUrl === undefined ? undefined : patch.targetUrl ? String(patch.targetUrl) : null });
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo guardar');
  }
}

export async function deleteKeywordAction(keywordId: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    await deleteKeyword(user.tenantId, id(keywordId));
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo quitar la palabra');
  }
}

export async function suggestKeywordsAction(clientId: string): Promise<Ok<{ items: { keyword: string; impressions: number; clicks: number; position: number }[] }>> {
  try {
    const user = await requirePermission('edit');
    wireApp();
    return { ok: true, items: await suggestKeywords(user.tenantId, id(clientId)) };
  } catch (e) {
    return fail(e, 'No se pudieron sugerir palabras');
  }
}

// --- Señales y trabajo (edit) ---------------------------------------------------------------------------------------

export async function setSignalStatusAction(signalId: string, status: 'abierta' | 'atendida' | 'descartada'): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    if (!['abierta', 'atendida', 'descartada'].includes(status)) return { ok: false, error: 'Estado no válido.' };
    await setSignalStatus(user.tenantId, id(signalId), status);
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo cambiar la señal');
  }
}

export async function setWorkUrlAction(clientId: string, taskId: string, url: string): Promise<Ok<{ message: string }>> {
  try {
    const user = await requirePermission('edit');
    wireApp();
    const fact = await getWorkFact(user.tenantId, id(taskId));
    if (!fact || fact.clientId !== id(clientId)) return { ok: false, error: 'Ese encargo no está en la estrategia de este cliente.' };
    const r = await answerUrl(user.tenantId, fact.taskId, url ? String(url).slice(0, 2000) : null);
    return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.message };
  } catch (e) {
    return fail(e, 'No se pudo guardar la URL');
  }
}

export async function backfillWorkAction(clientId: string): Promise<Ok<{ processed: number }>> {
  try {
    const user = await requirePermission('edit');
    wireApp();
    return { ok: true, processed: await backfillClientWork(user.tenantId, id(clientId), 90) };
  } catch (e) {
    return fail(e, 'No se pudieron procesar los encargos');
  }
}

export async function deleteTrackedUrlAction(trackedId: string): Promise<Ok> {
  try {
    const user = await requirePermission('edit');
    await deleteTrackedUrl(user.tenantId, id(trackedId));
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo dejar de seguir la URL');
  }
}

// --- Planes, ajustes y calendario (admin) ---------------------------------------------------------------------------

export async function savePlanAction(input: PlanInput): Promise<Ok<{ id: string }>> {
  try {
    const user = await requirePermission('admin');
    const saved = await savePlan(user.tenantId, { id: input?.id ? id(input.id) : null, name: String(input?.name ?? ''), description: String(input?.description ?? ''), processes: input?.processes });
    revalidatePath('/dashboard/estrategia');
    return { ok: true, id: saved };
  } catch (e) {
    return fail(e, 'No se pudo guardar el plan');
  }
}

export async function deletePlanAction(planId: string): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    await deletePlan(user.tenantId, id(planId));
    revalidatePath('/dashboard/estrategia');
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo eliminar el plan');
  }
}

export async function saveEstSettingsAction(input: SettingsInput): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    await saveSettings(user.tenantId, input ?? {});
    revalidatePath('/dashboard/estrategia');
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudieron guardar los ajustes');
  }
}

export async function saveEventAction(input: EventInput): Promise<Ok<{ id: string }>> {
  try {
    const user = await requirePermission('admin');
    const saved = await saveEvent(user.tenantId, { id: input?.id ? id(input.id) : null, date: String(input?.date ?? ''), endDate: input?.endDate ? String(input.endDate) : null, kind: String(input?.kind ?? 'otro'), title: String(input?.title ?? ''), notes: String(input?.notes ?? ''), createdBy: user.id });
    revalidatePath('/dashboard/estrategia');
    return { ok: true, id: saved };
  } catch (e) {
    return fail(e, 'No se pudo guardar el evento');
  }
}

export async function deleteEventAction(eventId: string): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    await deleteEvent(user.tenantId, id(eventId));
    revalidatePath('/dashboard/estrategia');
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo eliminar el evento');
  }
}

// --- Estratega (fase 2) ---------------------------------------------------------------------------------------------

/** «Analizar ahora»: pide un análisis del estratega para el cliente y lo empieza en segundo plano. */
export async function requestAnalysisAction(clientId: string): Promise<Ok<{ message: string }>> {
  try {
    const user = await requirePermission('edit');
    wireApp();
    const r = await queueAnalysis(user.tenantId, id(clientId), 'manual', { by: user.name ?? user.email ?? 'Panel' });
    if (r.ok) void runPendingAnalyses(user.tenantId).catch((e) => console.error('[estrategia] análisis a mano:', e instanceof Error ? e.message : e));
    return r.ok ? { ok: true, message: r.message } : { ok: false, error: r.message };
  } catch (e) {
    return fail(e, 'No se pudo pedir el análisis');
  }
}

type DecisionInput = { kind: 'aprobar' | 'ajustar' | 'aplazar' | 'rechazar'; note?: string; reason?: string };

/** Decide una propuesta del estratega: crear encargo, crear con un ajuste, más adelante o no (con motivo). */
export async function decideSuggestionAction(suggestionId: string, input: DecisionInput): Promise<Ok<{ message: string; url: string | null }>> {
  try {
    const user = await requirePermission('edit');
    wireApp();
    const note = String(input?.note ?? '').trim().slice(0, 2000);
    let d: Decision;
    if (input?.kind === 'aprobar') d = { kind: 'aprobar' };
    else if (input?.kind === 'aplazar') d = { kind: 'aplazar' };
    else if (input?.kind === 'ajustar') {
      if (!note) return { ok: false, error: 'Escribe qué cambias.' };
      d = { kind: 'ajustar', note };
    } else if (input?.kind === 'rechazar') {
      const reason = String(input.reason ?? '');
      if (!(reason in REJECT_REASONS)) return { ok: false, error: 'Elige un motivo.' };
      d = { kind: 'rechazar', reason: reason as keyof typeof REJECT_REASONS, note: note || undefined };
    } else return { ok: false, error: 'Decisión no válida.' };
    const r = await decideSuggestion(user.tenantId, id(suggestionId), d, user.name ?? user.email ?? 'Panel');
    return r.ok ? { ok: true, message: r.message, url: r.url ?? null } : { ok: false, error: r.message };
  } catch (e) {
    return fail(e, 'No se pudo guardar la decisión');
  }
}

export async function saveStrategistSettingsAction(input: { maxSuggestions?: number; alertsPerMonth?: number; expireDays?: number; snoozeDays?: number }): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    await saveStrategistSettings(user.tenantId, input ?? {});
    revalidatePath('/dashboard/estrategia');
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudieron guardar los ajustes del estratega');
  }
}

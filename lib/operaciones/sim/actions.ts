'use server';

// Acciones de Sistema → Pruebas (solo administración): lanzar escenarios, ver la conversación simulada y usar el
// Telegram simulado a mano (pulsar botones, escribir, crear un encargo de prueba). Todo en la cuenta de pruebas.
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { ensureSimEnvironment, simChats } from '@/lib/operaciones/sim/env';
import { creatorFor, getRun, getScenarioOverview, getSimChat, runScenarios, type ChatMessageView, type RunSummary, type ScenarioView } from '@/lib/operaciones/sim/runner';
import { simPressAt, simSay } from '@/lib/operaciones/sim/actor';
import { createSimRequest } from '@/lib/operaciones/sim/scenarios';
import { processNotifications } from '@/lib/operaciones/notifications';
import { registerSimTransport } from '@/lib/operaciones/sim/transport';
import { addTestRequest, listTestRequests, TestRequestError, withdrawTestRequest, type TestRequest } from '@/lib/operaciones/sim/requests';

type Fail = { ok: false; error: string };
type ChatKey = 'employee' | 'owner';

async function envFor(tenantId: string) {
  registerSimTransport();
  const env = await ensureSimEnvironment(tenantId);
  return { env, chats: simChats(env.simTenantId) };
}

async function flush(simTenantId: string) {
  for (let i = 0; i < 3; i++) {
    await processNotifications(simTenantId);
    await new Promise((r) => setTimeout(r, 60));
  }
}

export async function runScenariosAction(keys: string[] | 'all'): Promise<{ ok: true; allOk: boolean; results: RunSummary[] } | Fail> {
  try {
    const user = await requirePermission('admin');
    const clean = keys === 'all' ? 'all' : keys.filter((k) => typeof k === 'string').slice(0, 50);
    const r = await runScenarios(user.tenantId, clean, 'manual', user.name ?? user.email);
    if (r.error) return { ok: false, error: r.error };
    return { ok: true, allOk: r.ok, results: r.results };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudieron ejecutar las pruebas') };
  }
}

export async function getPruebasAction(chat: ChatKey, runId: string | null): Promise<{ ok: true; scenarios: ScenarioView[]; messages: ChatMessageView[]; requests: TestRequest[] } | Fail> {
  try {
    const user = await requirePermission('admin');
    const { env, chats } = await envFor(user.tenantId);
    const c = chats.find((x) => x.key === chat) ?? chats[0];
    const [scenarios, messages, requests] = await Promise.all([
      getScenarioOverview(user.tenantId),
      getSimChat(env.simTenantId, c.chatId, { runId: runId && /^[0-9a-f-]{36}$/i.test(runId) ? runId : null }),
      listTestRequests(user.tenantId)
    ]);
    return { ok: true, scenarios, messages, requests };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudieron cargar las pruebas') };
  }
}

export async function getRunAction(runId: string) {
  try {
    const user = await requirePermission('admin');
    const r = await getRun(user.tenantId, String(runId).slice(0, 40));
    return r ? { ok: true as const, run: r } : { ok: false as const, error: 'Ejecución no encontrada' };
  } catch (e) {
    return { ok: false as const, error: publicError(e, 'No se pudo cargar la ejecución') };
  }
}

/** Pulsar a mano un botón del Telegram simulado (fila y columna del botón en ese mensaje). */
export async function pressSimButtonAction(messageId: number, row: number, col: number): Promise<{ ok: true } | Fail> {
  try {
    const user = await requirePermission('admin');
    const { env } = await envFor(user.tenantId);
    const pressed = await simPressAt(env.simTenantId, Number(messageId), Number(row), Number(col));
    if (!pressed) return { ok: false, error: 'Ese botón ya no está.' };
    await flush(env.simTenantId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo pulsar el botón') };
  }
}

export async function sendSimTextAction(chat: ChatKey, text: string): Promise<{ ok: true } | Fail> {
  try {
    const user = await requirePermission('admin');
    const clean = String(text ?? '').trim().slice(0, 2000);
    if (!clean) return { ok: false, error: 'Escribe algo.' };
    const { env, chats } = await envFor(user.tenantId);
    const c = chats.find((x) => x.key === chat);
    if (!c) return { ok: false, error: 'Chat no válido' };
    await simSay(env.simTenantId, c.chatId, clean);
    await flush(env.simTenantId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo enviar') };
  }
}

/** Crea a mano un encargo de prueba para «Kiju IA (pruebas)» (para probar un flujo pulsando tú los botones). */
export async function createSimRequestAction(title: string, urgent: boolean): Promise<{ ok: true } | Fail> {
  try {
    const user = await requirePermission('admin');
    const clean = String(title ?? '').trim().slice(0, 200);
    if (!clean) return { ok: false, error: 'Pon un título.' };
    const { env } = await envFor(user.tenantId);
    await createSimRequest(env.simTenantId, await creatorFor(user.tenantId), clean, urgent ? 1 : 3);
    await flush(env.simTenantId);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo crear el encargo de prueba') };
  }
}

/** «Pedir una prueba»: describe un caso para que Claude lo convierta en escenario. */
export async function addTestRequestAction(text: string): Promise<{ ok: true; requests: TestRequest[] } | Fail> {
  try {
    const user = await requirePermission('admin');
    await addTestRequest(user.tenantId, String(text ?? ''), user.name ?? user.email);
    return { ok: true, requests: await listTestRequests(user.tenantId) };
  } catch (e) {
    return { ok: false, error: e instanceof TestRequestError ? e.message : publicError(e, 'No se pudo guardar la petición') };
  }
}

export async function withdrawTestRequestAction(id: string): Promise<{ ok: true; requests: TestRequest[] } | Fail> {
  try {
    const user = await requirePermission('admin');
    await withdrawTestRequest(user.tenantId, String(id ?? '').slice(0, 20));
    return { ok: true, requests: await listTestRequests(user.tenantId) };
  } catch (e) {
    return { ok: false, error: e instanceof TestRequestError ? e.message : publicError(e, 'No se pudo retirar') };
  }
}

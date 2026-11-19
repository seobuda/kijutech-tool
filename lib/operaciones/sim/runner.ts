import 'server-only';
// Ejecutor de pruebas simuladas (19 nov 2026): lanza escenarios en el entorno de pruebas, guarda cada ejecución
// (pasos comprobados, error, quién la lanzó) y limpia lo antiguo. Lo usan Sistema → Pruebas, la ruta /api/pruebas/run
// (scripts/run-scenarios.sh) y el despliegue (deploy.sh las pasa tras verificar y vuelve atrás si fallan).
// Aislamiento: todo pasa en la cuenta de pruebas; si un escenario falla o se cuelga, queda como «fallo» y no toca nada
// de la cuenta real. Una sola tanda a la vez.
import { and, asc, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsRequests, opsSimMessages, opsSimRuns, users, type OpsSimRun } from '@/lib/db/schema';
import { ensureSimEnvironment, simChatIds } from '@/lib/operaciones/sim/env';
import { registerSimTransport, simRunContext } from '@/lib/operaciones/sim/transport';
import { simLastId } from '@/lib/operaciones/sim/actor';
import { SCENARIOS, StepFailed, type SimStep } from '@/lib/operaciones/sim/scenarios';
import { markTestRequestsDone } from '@/lib/operaciones/sim/requests';

const SCENARIO_TIMEOUT_MS = 60_000;
const KEEP_RUNS_PER_SCENARIO = 30;
const KEEP_DAYS = 30;
let running = false;

export type RunSummary = { key: string; title: string; status: 'ok' | 'fallo'; error: string | null; steps: number; runId: string };
export type Trigger = 'claude' | 'manual' | 'despliegue';

async function cleanup(ownerTenantId: string, simTenantId: string) {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000);
  // Datos de la cuenta de pruebas (nunca de la real): encargos simulados y conversación antigua.
  await db.delete(opsRequests).where(and(eq(opsRequests.tenantId, simTenantId), lt(opsRequests.createdAt, cutoff)));
  await db.delete(opsSimMessages).where(and(eq(opsSimMessages.tenantId, simTenantId), lt(opsSimMessages.createdAt, cutoff)));
  // Ejecuciones colgadas (el proceso se reinició a mitad): pasan a fallo.
  await db
    .update(opsSimRuns)
    .set({ status: 'fallo', error: 'La ejecución se interrumpió (reinicio o caída del proceso)', finishedAt: new Date() })
    .where(and(eq(opsSimRuns.tenantId, ownerTenantId), eq(opsSimRuns.status, 'en_curso'), lt(opsSimRuns.startedAt, new Date(Date.now() - 10 * 60_000))));
  // Historial: las últimas N por escenario.
  await db.execute(sql`
    DELETE FROM ops_sim_runs WHERE tenant_id = ${ownerTenantId} AND id IN (
      SELECT id FROM (SELECT id, row_number() OVER (PARTITION BY scenario_key ORDER BY started_at DESC) AS rn FROM ops_sim_runs WHERE tenant_id = ${ownerTenantId}) x
      WHERE x.rn > ${KEEP_RUNS_PER_SCENARIO})`);
}

export async function creatorFor(ownerTenantId: string): Promise<number> {
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.tenantId, ownerTenantId)).orderBy(asc(users.id)).limit(1);
  if (!u) throw new Error('La cuenta no tiene usuarios');
  return u.id;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`Tardó más de ${ms / 1000} s`)), ms);
    p.then((v) => (clearTimeout(t), resolve(v)), (e) => (clearTimeout(t), reject(e)));
  });
}

/** Ejecuta los escenarios pedidos (o todos) uno detrás de otro. Nunca lanza: cada fallo queda en su ejecución. */
export async function runScenarios(
  ownerTenantId: string,
  keys: string[] | 'all',
  trigger: Trigger,
  by: string,
  commit: string | null = null
): Promise<{ ok: boolean; results: RunSummary[]; error?: string }> {
  if (running) return { ok: false, results: [], error: 'Ya hay una tanda de pruebas en marcha. Espera a que termine.' };
  running = true;
  try {
    registerSimTransport();
    const env = await ensureSimEnvironment(ownerTenantId);
    await cleanup(ownerTenantId, env.simTenantId);
    const createdBy = await creatorFor(ownerTenantId);
    const ids = simChatIds(env.simTenantId);
    // «Todas» = las internas: el escenario que sale a ClickUp de verdad solo corre si se pide por su clave.
    const list = keys === 'all' ? SCENARIOS.filter((s) => !s.external) : SCENARIOS.filter((s) => keys.includes(s.key));
    const results: RunSummary[] = [];
    for (const sc of list) {
      const [run] = await db
        .insert(opsSimRuns)
        .values({ tenantId: ownerTenantId, scenarioKey: sc.key, trigger, triggeredBy: by.slice(0, 255), commit })
        .returning({ id: opsSimRuns.id });
      const steps: SimStep[] = [];
      let error: string | null = null;
      try {
        const startId = await simLastId(env.simTenantId);
        await simRunContext.run({ runId: run.id }, () =>
          withTimeout(sc.run({ ownerTenantId, simTenantId: env.simTenantId, emp: ids.employee, own: ids.owner, createdBy, startId, steps }), SCENARIO_TIMEOUT_MS)
        );
      } catch (e) {
        error = e instanceof StepFailed ? e.message : `Error inesperado: ${e instanceof Error ? e.message : String(e)}`;
        // Sin console.error: el fallo queda en la ejecución (Sistema → Pruebas). El registro de errores lo tomaría por un
        // fallo de la cuenta real y avisaría a Enric por algo que solo pasa en la cuenta de pruebas.
      }
      const status = error ? 'fallo' : 'ok';
      await db.update(opsSimRuns).set({ status, steps, error: error?.slice(0, 2000) ?? null, finishedAt: new Date() }).where(eq(opsSimRuns.id, run.id));
      results.push({ key: sc.key, title: sc.title, status, error, steps: steps.length, runId: run.id });
    }
    // «Pedir una prueba»: la petición cuyo escenario ya existe (y se ha ejecutado) pasa a hecha.
    await markTestRequestsDone(
      ownerTenantId,
      list.filter((s) => s.fromRequest).map((s) => ({ requestId: s.fromRequest!, scenarioKey: s.key }))
    ).catch((e) => console.error('[operaciones] pruebas pedidas:', e instanceof Error ? e.message : e));
    return { ok: results.every((r) => r.status === 'ok'), results };
  } catch (e) {
    console.error('[operaciones] pruebas simuladas:', e instanceof Error ? e.message : e);
    return { ok: false, results: [], error: e instanceof Error ? e.message : 'Error desconocido' };
  } finally {
    running = false;
  }
}

// --- Lectura para Sistema → Pruebas --------------------------------------------------------------------------------

export type ScenarioView = {
  key: string;
  title: string;
  area: string;
  description: string;
  external: boolean;
  fromRequest: string | null;
  last: { id: string; status: string; startedAt: string; finishedAt: string | null; trigger: string; triggeredBy: string | null; error: string | null; steps: SimStep[] } | null;
  history: { id: string; status: string; startedAt: string }[];
};

const runView = (r: OpsSimRun) => ({
  id: r.id,
  status: r.status,
  startedAt: r.startedAt.toISOString(),
  finishedAt: r.finishedAt?.toISOString() ?? null,
  trigger: r.trigger,
  triggeredBy: r.triggeredBy,
  error: r.error,
  steps: (r.steps as SimStep[]) ?? []
});

export async function getScenarioOverview(ownerTenantId: string): Promise<ScenarioView[]> {
  const runs = await db.select().from(opsSimRuns).where(eq(opsSimRuns.tenantId, ownerTenantId)).orderBy(desc(opsSimRuns.startedAt)).limit(400);
  return SCENARIOS.map((s) => {
    const mine = runs.filter((r) => r.scenarioKey === s.key);
    return {
      key: s.key,
      title: s.title,
      area: s.area,
      description: s.description,
      external: Boolean(s.external),
      fromRequest: s.fromRequest ?? null,
      last: mine[0] ? runView(mine[0]) : null,
      history: mine.slice(0, 10).map((r) => ({ id: r.id, status: r.status, startedAt: r.startedAt.toISOString() }))
    };
  });
}

export async function getRun(ownerTenantId: string, runId: string) {
  const [r] = await db.select().from(opsSimRuns).where(and(eq(opsSimRuns.tenantId, ownerTenantId), eq(opsSimRuns.id, runId))).limit(1);
  return r ? { ...runView(r), scenarioKey: r.scenarioKey } : null;
}

export type ChatMessageView = { id: number; chatId: number; direction: string; text: string; buttons: { text: string }[][]; runId: string | null; at: string; edited: boolean; deleted: boolean };

/** La conversación de un chat simulado (las últimas N), o solo la de una ejecución. */
export async function getSimChat(simTenantId: string, chatId: number, opts: { runId?: string | null; limit?: number } = {}): Promise<ChatMessageView[]> {
  const where = opts.runId
    ? and(eq(opsSimMessages.tenantId, simTenantId), eq(opsSimMessages.chatId, chatId), eq(opsSimMessages.runId, opts.runId))
    : and(eq(opsSimMessages.tenantId, simTenantId), eq(opsSimMessages.chatId, chatId));
  const rows = await db.select().from(opsSimMessages).where(where).orderBy(desc(opsSimMessages.id)).limit(opts.limit ?? 150);
  return rows.reverse().map((m) => ({
    id: m.id,
    chatId: m.chatId,
    direction: m.direction,
    text: m.text,
    buttons: ((m.buttons as { text: string }[][] | null) ?? []).map((row) => row.map((b) => ({ text: b.text }))),
    runId: m.runId,
    at: m.createdAt.toISOString(),
    edited: Boolean(m.editedAt),
    deleted: Boolean(m.deletedAt)
  }));
}

export const runsByIds = (ownerTenantId: string, ids: string[]) =>
  ids.length ? db.select().from(opsSimRuns).where(and(eq(opsSimRuns.tenantId, ownerTenantId), inArray(opsSimRuns.id, ids))) : Promise.resolve([]);

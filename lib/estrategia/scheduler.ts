import 'server-only';

// Módulo Estrategia: planificador. Cada vuelta (desde la tarea del núcleo, cada 30 s en el proceso líder) ejecuta los
// procesos que tocan según la agenda (est_process_runs.next_run_at), con un tope de tiempo, y cada 5 minutos la
// extracción de los encargos terminados. Un proceso que falla espera y reintenta (15 min, 30, 60… hasta 12 h).
import { publicError } from '@/lib/errors';
import { listKeywords, dueRuns, listClientSettings, syncRuns, updateRun } from '@/lib/estrategia/store';
import { madridNow, nextRunAfter, addDays, type ProcessKey } from '@/lib/estrategia/rules';
import { loadCtx, runCritico, runDetectores, runExtraction, runGbp, runGuardian, runKeywords, runObjetivos, runSalud, runUrls, runVelocidad, type Ctx, type ProcessOutcome } from '@/lib/estrategia/processes';

const RUNNERS: Partial<Record<ProcessKey, (ctx: Ctx) => Promise<ProcessOutcome>>> = {
  critico: runCritico,
  salud: runSalud,
  velocidad: runVelocidad,
  keywords: runKeywords,
  gbp: runGbp,
  urls: runUrls,
  detectores: runDetectores,
  objetivos: runObjetivos,
  guardian: runGuardian
};

const G = globalThis as unknown as { __kijuEstBusy?: Set<string>; __kijuEstTick?: Map<string, { sync: number; extract: number; urgentDay: string; urgentDone: Set<string> }> };
const busy = () => (G.__kijuEstBusy ??= new Set());
const ticks = () => (G.__kijuEstTick ??= new Map());

/** Solo para las pruebas. */
export function _resetSchedulerState(): void {
  G.__kijuEstBusy = new Set();
  G.__kijuEstTick = new Map();
}

/** Ejecuta un proceso de un cliente ahora y guarda el resultado en su agenda. */
export async function runProcess(tenantId: string, run: { id: string; clientId: string; process: string; errorCount: number }, now = new Date()): Promise<ProcessOutcome> {
  const lock = `${run.clientId}:${run.process}`;
  if (busy().has(lock)) return { status: 'omitido', summary: 'Ya se está ejecutando.' };
  busy().add(lock);
  const started = Date.now();
  try {
    const ctx = await loadCtx(tenantId, run.clientId, now);
    const eff = ctx?.processes.find((p) => p.key === run.process);
    const runner = RUNNERS[run.process as ProcessKey];
    if (!ctx || !eff || !eff.on || !runner) {
      await syncRuns(tenantId, run.clientId);
      return { status: 'omitido', summary: 'El proceso ya no está activo para este cliente.' };
    }
    const paused = (await import('@/lib/estrategia/store').then((m) => m.getClientSettings(tenantId, run.clientId)))?.pausedUntil;
    if (paused && paused >= ctx.today) {
      await updateRun(run.id, { status: 'omitido', summary: `En pausa hasta el ${paused}.`, nextRunAt: new Date(Date.parse(`${addDays(paused, 1)}T07:00:00Z`)) });
      return { status: 'omitido', summary: 'En pausa.' };
    }
    const out = await runner(ctx);
    await updateRun(run.id, {
      lastRunAt: now,
      nextRunAt: out.retryInMin ? new Date(now.getTime() + out.retryInMin * 60_000) : nextRunAfter(now, eff.every, `${run.clientId}:${run.process}`),
      status: out.status,
      summary: out.summary.slice(0, 1000),
      lastError: null,
      errorCount: 0,
      durationMs: Date.now() - started
    });
    return out;
  } catch (e) {
    const errorCount = run.errorCount + 1;
    console.error(`[estrategia] ${run.process}:`, e instanceof Error ? e.message : e);
    await updateRun(run.id, { lastRunAt: now, nextRunAt: nextRunAfter(now, 1, run.clientId, errorCount), status: 'error', lastError: publicError(e, 'Fallo al ejecutar el proceso').slice(0, 500), errorCount, durationMs: Date.now() - started });
    return { status: 'error', summary: 'Error' };
  } finally {
    busy().delete(lock);
  }
}

/**
 * Una vuelta del planificador para una cuenta: agenda al día (cada 10 min), extracción de encargos (cada 5 min), las
 * palabras clave urgentes una vez al día, y los procesos que tocan hasta agotar el tiempo.
 */
export async function runEstrategia(tenantId: string, opts: { budgetMs?: number; now?: Date } = {}): Promise<{ ran: number; errors: number }> {
  const now = opts.now ?? new Date();
  const deadline = Date.now() + (opts.budgetMs ?? 20_000);
  const t = ticks().get(tenantId) ?? { sync: 0, extract: 0, urgentDay: '', urgentDone: new Set<string>() };
  ticks().set(tenantId, t);
  const clients = await listClientSettings(tenantId);
  if (!clients.length) return { ran: 0, errors: 0 };
  if (Date.now() - t.sync > 10 * 60_000) {
    t.sync = Date.now();
    for (const c of clients) await syncRuns(tenantId, c.clientId);
  }
  if (Date.now() - t.extract > 5 * 60_000) {
    t.extract = Date.now();
    await runExtraction(tenantId, now).catch((e) => console.error('[estrategia] extracción:', e instanceof Error ? e.message : e));
  }
  const today = madridNow(now).date;
  // Palabras urgentes una vez al día por cliente (si se acaba el tiempo, los que faltan siguen en la próxima vuelta).
  if (t.urgentDay !== today) {
    t.urgentDay = today;
    t.urgentDone = new Set();
  }
  if (madridNow(now).hour >= 8) {
    for (const c of clients) {
      if (Date.now() > deadline) break;
      if (t.urgentDone.has(c.clientId)) continue;
      t.urgentDone.add(c.clientId);
      if ((await listKeywords(tenantId, c.clientId)).some((k) => k.active)) {
        const ctx = await loadCtx(tenantId, c.clientId, now);
        const kw = ctx?.processes.find((p) => p.key === 'keywords');
        if (ctx && kw?.on && kw.every > 1 && !(c.pausedUntil && c.pausedUntil >= today)) await runKeywords(ctx, { onlyUrgent: true }).catch((e) => console.error('[estrategia] palabras urgentes:', e instanceof Error ? e.message : e));
      }
    }
  }
  let ran = 0;
  let errors = 0;
  for (const run of await dueRuns(tenantId, now, 25)) {
    if (Date.now() > deadline) break;
    const out = await runProcess(tenantId, run, now);
    ran++;
    if (out.status === 'error') errors++;
  }
  return { ran, errors };
}

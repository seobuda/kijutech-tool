import 'server-only';

// Núcleo: cola de trabajos y procesos periódicos (cimientos, 23 nov 2026; docs/DISENO-TECNICO-CIMIENTOS.md §3).
//
// - Un trabajo se guarda en la tabla `jobs` y lo reclama UN trabajador (UPDATE … FOR UPDATE SKIP LOCKED), así se puede
//   tener uno o varios trabajadores sin que se pisen. El trabajador da un latido; si se cae, otro recupera el trabajo.
// - Cada tipo de trabajo lo registra su módulo (registerJobKind) con su tiempo máximo y cuántos a la vez como mucho.
// - Los procesos periódicos (job_schedules) generan un trabajo cuando vencen; tras un fallo esperan cada vez más.
// - El trabajador corre en su propio contenedor (APP_ROLE=worker): lo pesado no comparte proceso con la web ni el bot.
// Este archivo no importa ningún módulo: los módulos registran aquí lo suyo desde wireApp().
import { randomUUID } from 'crypto';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { jobs, jobSchedules, type Job } from '@/lib/db/schema';

export type JobContext = {
  tenantId: string;
  job: Job;
  /** Renueva el latido (llamarlo en trabajos largos, al menos cada minuto). */
  heartbeat: () => Promise<void>;
  /** Se aborta al pasar el tiempo máximo del tipo: un trabajo largo debe mirarlo y parar. */
  signal: AbortSignal;
};

export type JobKind = {
  kind: string;
  /** Tiempo máximo en segundos (por defecto 300). */
  timeoutS?: number;
  /** Cuántos de este tipo a la vez, entre todos los trabajadores (por defecto 2). */
  maxConcurrent?: number;
  maxAttempts?: number;
  /** Devuelve un resumen pequeño (se guarda en jobs.result); nunca datos grandes. */
  run: (ctx: JobContext, payload: Record<string, unknown>) => Promise<Record<string, unknown> | void>;
};

export type ProcessDef = {
  key: string;
  scopeType: 'proyecto' | 'cliente' | 'cuenta';
  label: string;
  defaultEveryMinutes: number;
  /** Qué trabajo crea al vencer (un tipo registrado y su carga). */
  enqueue: (tenantId: string, scopeId: string) => { kind: string; payload?: Record<string, unknown>; priority?: number };
};

const G = globalThis as unknown as { __kijuJobKinds?: Map<string, JobKind>; __kijuProcesses?: Map<string, ProcessDef>; __kijuWorker?: { running: boolean; id: string } };

export function registerJobKind(k: JobKind): void {
  (G.__kijuJobKinds ??= new Map()).set(k.kind, k);
}
export function jobKind(kind: string): JobKind | null {
  return G.__kijuJobKinds?.get(kind) ?? null;
}
export function jobKinds(): JobKind[] {
  return [...(G.__kijuJobKinds?.values() ?? [])];
}
export function registerProcess(p: ProcessDef): void {
  (G.__kijuProcesses ??= new Map()).set(p.key, p);
}
export function processDef(key: string): ProcessDef | null {
  return G.__kijuProcesses?.get(key) ?? null;
}
export function processes(): ProcessDef[] {
  return [...(G.__kijuProcesses?.values() ?? [])];
}

// --- Reglas puras (se prueban sin base de datos) ---------------------------------------------------------------------

/** Espera antes de reintentar un trabajo fallido: 1, 4, 9… minutos, con tope de 60. */
export function retryDelayMinutes(attempt: number): number {
  return Math.min(60, Math.max(1, attempt) ** 2);
}

/** Próxima ejecución de un proceso: su frecuencia, o más espaciado tras fallos seguidos (×2 por fallo, tope 24 h). */
export function nextScheduleRun(now: Date, everyMinutes: number, consecutiveFailures: number): Date {
  const base = Math.max(1, everyMinutes);
  const minutes = consecutiveFailures > 0 ? Math.min(24 * 60, Math.max(base, 10 * 2 ** (consecutiveFailures - 1))) : base;
  return new Date(now.getTime() + minutes * 60_000);
}

/** Tipos que todavía admiten otro trabajo a la vez, según los que ya están en curso. */
export function kindsWithRoom(kinds: JobKind[], running: Record<string, number>): string[] {
  return kinds.filter((k) => (running[k.kind] ?? 0) < (k.maxConcurrent ?? 2)).map((k) => k.kind);
}

// --- Encolar ---------------------------------------------------------------------------------------------------------

export type EnqueueInput = {
  tenantId: string;
  kind: string;
  payload?: Record<string, unknown>;
  scopeType?: 'proyecto' | 'cliente' | 'cuenta';
  scopeId?: string | null;
  priority?: number;
  runAt?: Date;
  /** Si ya hay un trabajo abierto (pendiente o en curso) con esta clave, no se crea otro. */
  dedupeKey?: string;
  maxAttempts?: number;
};

/** Crea un trabajo. Devuelve su id, o el del trabajo abierto con la misma clave si ya existía. */
export async function enqueueJob(input: EnqueueInput): Promise<{ id: string; created: boolean }> {
  const k = jobKind(input.kind);
  const values = {
    tenantId: input.tenantId,
    kind: input.kind,
    payload: input.payload ?? {},
    scopeType: input.scopeType ?? 'cuenta',
    scopeId: input.scopeId ?? null,
    priority: input.priority ?? 5,
    runAt: input.runAt ?? new Date(),
    dedupeKey: input.dedupeKey ?? null,
    maxAttempts: input.maxAttempts ?? k?.maxAttempts ?? 3,
    timeoutS: k?.timeoutS ?? 300
  };
  if (!input.dedupeKey) {
    const [row] = await db.insert(jobs).values(values).returning({ id: jobs.id });
    return { id: row.id, created: true };
  }
  // Índice único parcial (solo abiertos): ON CONFLICT con su predicado.
  const rows = await db.execute<{ id: string }>(sql`
    INSERT INTO jobs (tenant_id, kind, payload, scope_type, scope_id, priority, run_at, dedupe_key, max_attempts, timeout_s)
    VALUES (${values.tenantId}, ${values.kind}, ${JSON.stringify(values.payload)}::jsonb, ${values.scopeType}, ${values.scopeId},
            ${values.priority}, ${values.runAt.toISOString()}::timestamp, ${values.dedupeKey}, ${values.maxAttempts}, ${values.timeoutS})
    ON CONFLICT (tenant_id, dedupe_key) WHERE dedupe_key IS NOT NULL AND status IN ('pendiente', 'en_curso') DO NOTHING
    RETURNING id`);
  const created = [...rows][0];
  if (created) return { id: created.id, created: true };
  const [open] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(eq(jobs.tenantId, input.tenantId), eq(jobs.dedupeKey, input.dedupeKey), sql`${jobs.status} IN ('pendiente', 'en_curso')`))
    .limit(1);
  return { id: open?.id ?? '', created: false };
}

// --- Reclamar, terminar y fallar -------------------------------------------------------------------------------------

async function runningCounts(): Promise<Record<string, number>> {
  const rows = await db.execute<{ kind: string; n: number }>(sql`SELECT kind, count(*)::int AS n FROM jobs WHERE status = 'en_curso' GROUP BY kind`);
  return Object.fromEntries([...rows].map((r) => [r.kind, Number(r.n)]));
}

/** Reclama el siguiente trabajo listo de los tipos que tengan hueco. null si no hay. */
export async function claimNextJob(workerId: string, onlyKinds?: string[]): Promise<Job | null> {
  const registered = jobKinds().filter((k) => !onlyKinds || onlyKinds.includes(k.kind));
  const allowed = kindsWithRoom(registered, await runningCounts());
  if (!allowed.length) return null;
  const rows = await db.execute<Record<string, unknown>>(sql`
    UPDATE jobs SET status = 'en_curso', locked_by = ${workerId}, locked_at = now(), heartbeat_at = now(), attempts = attempts + 1
    WHERE id = (
      SELECT id FROM jobs
      WHERE status = 'pendiente' AND run_at <= now() AND kind IN ${sql.raw(`(${allowed.map((k) => `'${k.replace(/'/g, "''")}'`).join(',')})`)}
      ORDER BY priority, run_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id`);
  const id = ([...rows][0] as { id?: string } | undefined)?.id;
  if (!id) return null;
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id)).limit(1);
  return job ?? null;
}

export async function heartbeatJob(id: string): Promise<void> {
  await db.update(jobs).set({ heartbeatAt: new Date() }).where(and(eq(jobs.id, id), eq(jobs.status, 'en_curso')));
}

export async function completeJob(id: string, result: Record<string, unknown> | null): Promise<void> {
  await db.update(jobs).set({ status: 'hecho', result, finishedAt: new Date(), lastError: null }).where(and(eq(jobs.id, id), eq(jobs.status, 'en_curso')));
}

/** Falla un trabajo: vuelve a la cola con espera creciente o, agotados los intentos, queda «fallido». */
export async function failJob(job: Pick<Job, 'id' | 'attempts' | 'maxAttempts'>, error: string): Promise<'reintento' | 'fallido'> {
  const final = job.attempts >= job.maxAttempts;
  await db
    .update(jobs)
    .set(
      final
        ? { status: 'fallido', lastError: error.slice(0, 2000), finishedAt: new Date() }
        : { status: 'pendiente', lastError: error.slice(0, 2000), lockedBy: null, lockedAt: null, heartbeatAt: null, runAt: new Date(Date.now() + retryDelayMinutes(job.attempts) * 60_000) }
    )
    .where(and(eq(jobs.id, job.id), eq(jobs.status, 'en_curso')));
  return final ? 'fallido' : 'reintento';
}

/** Trabajos en curso cuyo trabajador dejó de dar latido (se cayó): vuelven a la cola o fallan. */
export async function reapStaleJobs(staleSeconds = 90): Promise<number> {
  const rows = await db.execute<{ id: string }>(sql`
    UPDATE jobs SET
      status = CASE WHEN attempts >= max_attempts THEN 'fallido' ELSE 'pendiente' END,
      last_error = 'El trabajador dejó de responder (latido vencido)',
      finished_at = CASE WHEN attempts >= max_attempts THEN now() ELSE NULL END,
      locked_by = NULL, locked_at = NULL, heartbeat_at = NULL,
      run_at = now() + interval '1 minute'
    WHERE status = 'en_curso' AND coalesce(heartbeat_at, locked_at) < now() - make_interval(secs => ${staleSeconds})
    RETURNING id`);
  return [...rows].length;
}

// --- Procesos periódicos ---------------------------------------------------------------------------------------------

/** Da de alta (o actualiza la frecuencia de) un proceso para un ámbito. */
export async function ensureSchedule(tenantId: string, processKey: string, scopeId: string, everyMinutes?: number, firstRunAt?: Date): Promise<void> {
  const p = processDef(processKey);
  const every = everyMinutes ?? p?.defaultEveryMinutes ?? 1440;
  await db
    .insert(jobSchedules)
    .values({ tenantId, processKey, scopeType: p?.scopeType ?? 'cuenta', scopeId, everyMinutes: every, nextRunAt: firstRunAt ?? new Date() })
    .onConflictDoUpdate({ target: [jobSchedules.tenantId, jobSchedules.processKey, jobSchedules.scopeId], set: { everyMinutes: every, enabled: true, updatedAt: new Date() } });
}

/**
 * Da de alta un proceso solo si no existe: nunca toca la frecuencia ni la pausa que alguien haya cambiado (26 nov 2026;
 * ensureSchedule las sobrescribía en cada alta). Devuelve true si lo creó.
 */
export async function ensureScheduleIfMissing(tenantId: string, processKey: string, scopeId: string, everyMinutes?: number, firstRunAt?: Date): Promise<boolean> {
  const p = processDef(processKey);
  const every = everyMinutes ?? p?.defaultEveryMinutes ?? 1440;
  const rows = await db
    .insert(jobSchedules)
    .values({ tenantId, processKey, scopeType: p?.scopeType ?? 'cuenta', scopeId, everyMinutes: every, nextRunAt: firstRunAt ?? new Date() })
    .onConflictDoNothing({ target: [jobSchedules.tenantId, jobSchedules.processKey, jobSchedules.scopeId] })
    .returning({ k: jobSchedules.processKey });
  return rows.length > 0;
}

/** Cambia la frecuencia de un proceso ya dado de alta. Si la nueva es más corta, la siguiente ejecución se adelanta
 *  (última + nueva frecuencia); si es más larga, la ya prevista se mantiene una vez y después rige la nueva. */
export async function setScheduleEvery(tenantId: string, processKey: string, scopeId: string, everyMinutes: number): Promise<boolean> {
  const every = Math.max(1, Math.round(everyMinutes));
  const rows = await db
    .update(jobSchedules)
    .set({ everyMinutes: every, nextRunAt: sql`LEAST(${jobSchedules.nextRunAt}, coalesce(${jobSchedules.lastRunAt}, now()) + make_interval(mins => ${every}))`, updatedAt: new Date() })
    .where(and(eq(jobSchedules.tenantId, tenantId), eq(jobSchedules.processKey, processKey), eq(jobSchedules.scopeId, scopeId)))
    .returning({ k: jobSchedules.processKey });
  return rows.length > 0;
}

/** Pausa hasta una fecha (null = reanudar) o enciende/apaga un proceso. */
export async function pauseSchedule(tenantId: string, processKey: string, scopeId: string, opts: { pausedUntil?: Date | null; enabled?: boolean }): Promise<boolean> {
  const rows = await db
    .update(jobSchedules)
    .set({ ...(opts.pausedUntil !== undefined ? { pausedUntil: opts.pausedUntil } : {}), ...(opts.enabled !== undefined ? { enabled: opts.enabled } : {}), updatedAt: new Date() })
    .where(and(eq(jobSchedules.tenantId, tenantId), eq(jobSchedules.processKey, processKey), eq(jobSchedules.scopeId, scopeId)))
    .returning({ k: jobSchedules.processKey });
  return rows.length > 0;
}

/** Procesos programados de un ámbito (p. ej. un proyecto), para enseñarlos en su pantalla. */
export async function listSchedulesForScope(tenantId: string, scopeId: string): Promise<(typeof jobSchedules.$inferSelect)[]> {
  return db.select().from(jobSchedules).where(and(eq(jobSchedules.tenantId, tenantId), eq(jobSchedules.scopeId, scopeId)));
}

/** Procesos (de `keys`) encendidos y sin pausa en alguno de estos ámbitos. */
export async function activeScheduleKeys(tenantId: string, keys: string[], scopeIds: string[]): Promise<Set<string>> {
  if (!scopeIds.length || !keys.length) return new Set();
  const rows = await db
    .select({ k: jobSchedules.processKey })
    .from(jobSchedules)
    .where(
      and(
        eq(jobSchedules.tenantId, tenantId),
        inArray(jobSchedules.processKey, keys),
        eq(jobSchedules.enabled, true),
        inArray(jobSchedules.scopeId, scopeIds),
        sql`(${jobSchedules.pausedUntil} IS NULL OR ${jobSchedules.pausedUntil} <= now())`
      )
    );
  return new Set(rows.map((r) => r.k));
}

/** Desfase estable (0..every-1 minutos) por ámbito: reparte las primeras ejecuciones para que no coincidan todas. */
export function stableOffsetMinutes(seed: string, everyMinutes: number): number {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return everyMinutes > 1 ? h % everyMinutes : 0;
}

/** Apaga un proceso. `bySystem` lo marca (last_status «apagado») para que el sistema pueda volver a encenderlo solo
 *  cuando desaparezca el motivo, sin reactivar lo que apagó una persona. */
export async function disableSchedule(tenantId: string, processKey: string, scopeId: string, bySystem = false): Promise<void> {
  await db
    .update(jobSchedules)
    .set({ enabled: false, ...(bySystem ? { lastStatus: 'apagado' } : {}), updatedAt: new Date() })
    .where(and(eq(jobSchedules.tenantId, tenantId), eq(jobSchedules.processKey, processKey), eq(jobSchedules.scopeId, scopeId)));
}

/** Convierte en trabajos los procesos vencidos (como mucho `limit` por vuelta). Devuelve cuántos encoló. */
export async function tickSchedules(limit = 50): Promise<number> {
  const due = await db.execute<{ tenant_id: string; process_key: string; scope_id: string; every_minutes: number }>(sql`
    SELECT tenant_id, process_key, scope_id, every_minutes FROM job_schedules
    WHERE enabled AND next_run_at <= now() AND (paused_until IS NULL OR paused_until <= now())
    ORDER BY next_run_at
    FOR UPDATE SKIP LOCKED
    LIMIT ${limit}`);
  let n = 0;
  for (const s of due) {
    const p = processDef(s.process_key);
    // Mientras no exista el proceso (otro módulo no cargado) se aplaza, sin perder la fila.
    const next = new Date(Date.now() + Math.max(1, Number(s.every_minutes)) * 60_000);
    if (p) {
      const spec = p.enqueue(s.tenant_id, s.scope_id);
      await enqueueJob({
        tenantId: s.tenant_id,
        kind: spec.kind,
        payload: { ...(spec.payload ?? {}), __schedule: { processKey: s.process_key, scopeId: s.scope_id } },
        scopeType: p.scopeType,
        scopeId: s.scope_id || null,
        priority: spec.priority ?? 6,
        dedupeKey: `sched:${s.process_key}:${s.scope_id}`
      });
      n++;
    }
    await db
      .update(jobSchedules)
      .set({ nextRunAt: next, lastRunAt: new Date(), updatedAt: new Date() })
      .where(and(eq(jobSchedules.tenantId, s.tenant_id), eq(jobSchedules.processKey, s.process_key), eq(jobSchedules.scopeId, s.scope_id)));
  }
  return n;
}

/** Al terminar un trabajo de un proceso, se anota en su programación (y tras fallos se espacia la siguiente). */
async function recordScheduleOutcome(tenantId: string, payload: Record<string, unknown>, ok: boolean, error: string | null): Promise<void> {
  const sc = payload.__schedule as { processKey?: string; scopeId?: string } | undefined;
  if (!sc?.processKey) return;
  const [row] = await db
    .select()
    .from(jobSchedules)
    .where(and(eq(jobSchedules.tenantId, tenantId), eq(jobSchedules.processKey, sc.processKey), eq(jobSchedules.scopeId, sc.scopeId ?? '')))
    .limit(1);
  if (!row) return;
  const failures = ok ? 0 : row.consecutiveFailures + 1;
  await db
    .update(jobSchedules)
    .set({
      lastStatus: ok ? 'ok' : 'error',
      lastError: ok ? null : (error ?? '').slice(0, 1000),
      consecutiveFailures: failures,
      nextRunAt: ok ? row.nextRunAt : nextScheduleRun(new Date(), row.everyMinutes, failures),
      updatedAt: new Date()
    })
    .where(and(eq(jobSchedules.tenantId, tenantId), eq(jobSchedules.processKey, row.processKey), eq(jobSchedules.scopeId, row.scopeId)));
}

// --- Ejecutar ---------------------------------------------------------------------------------------------------------

/** Ejecuta un trabajo ya reclamado, con latido y tiempo máximo. Nunca lanza. */
export async function executeJob(job: Job): Promise<'hecho' | 'reintento' | 'fallido'> {
  const k = jobKind(job.kind);
  const payload = (job.payload ?? {}) as Record<string, unknown>;
  if (!k) {
    await failJob({ ...job, attempts: job.maxAttempts }, `Tipo de trabajo no registrado: ${job.kind}`);
    return 'fallido';
  }
  const ctl = new AbortController();
  const timeoutMs = (k.timeoutS ?? job.timeoutS ?? 300) * 1000;
  const beat = setInterval(() => void heartbeatJob(job.id).catch(() => undefined), 15_000);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        ctl.abort();
        reject(new Error(`Superó el tiempo máximo (${Math.round(timeoutMs / 1000)} s)`));
      }, timeoutMs);
    });
    const result = await Promise.race([k.run({ tenantId: job.tenantId, job, heartbeat: () => heartbeatJob(job.id), signal: ctl.signal }, payload), timeout]);
    await completeJob(job.id, (result as Record<string, unknown> | undefined) ?? null);
    await recordScheduleOutcome(job.tenantId, payload, true, null).catch(() => undefined);
    return 'hecho';
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const outcome = await failJob(job, msg);
    await recordScheduleOutcome(job.tenantId, payload, false, msg).catch(() => undefined);
    if (outcome === 'fallido') console.error(`[trabajos] ${job.kind} falló definitivamente:`, msg);
    return outcome;
  } finally {
    clearInterval(beat);
    if (timer) clearTimeout(timer);
  }
}

/** Una vuelta del trabajador: recupera caídos, convierte procesos vencidos y ejecuta hasta `slots` trabajos a la vez. */
export async function runWorkerOnce(workerId: string, slots = 3): Promise<number> {
  await reapStaleJobs().catch((e) => console.error('[trabajos] recuperar caídos:', e instanceof Error ? e.message : e));
  await tickSchedules().catch((e) => console.error('[trabajos] procesos:', e instanceof Error ? e.message : e));
  const running: Promise<unknown>[] = [];
  for (let i = 0; i < slots; i++) {
    const job = await claimNextJob(workerId);
    if (!job) break;
    running.push(executeJob(job));
  }
  await Promise.all(running);
  return running.length;
}

/** Arranca el bucle del trabajador (contenedor `worker`). Idempotente. */
export function startWorker(): void {
  if (G.__kijuWorker?.running) return;
  const id = `w-${process.pid}-${randomUUID().slice(0, 6)}`;
  G.__kijuWorker = { running: true, id };
  const slots = Math.max(1, Number(process.env.WORKER_SLOTS ?? 3));
  console.log(`[trabajos] trabajador ${id} en marcha (${slots} a la vez)`);
  // Cola continua (27 nov 2026, Jefe SEO D3): antes cada vuelta esperaba a que acabara TODO el lote (Promise.all), así que un
  // trabajo largo (un plan de Opus, un rastreo) dejaba parados los demás huecos durante minutos, también la respuesta de un
  // chat. Ahora, en cuanto un hueco queda libre, se coge el siguiente trabajo.
  const active = new Set<Promise<unknown>>();
  let lastMaintenance = 0;
  const loop = async () => {
    while (G.__kijuWorker?.running) {
      let claimed = 0;
      try {
        if (Date.now() - lastMaintenance >= 2000) {
          lastMaintenance = Date.now();
          await reapStaleJobs().catch((e) => console.error('[trabajos] recuperar caídos:', e instanceof Error ? e.message : e));
          await tickSchedules().catch((e) => console.error('[trabajos] procesos:', e instanceof Error ? e.message : e));
        }
        while (active.size < slots) {
          const job = await claimNextJob(id);
          if (!job) break;
          claimed++;
          const p: Promise<unknown> = executeJob(job)
            .catch((e) => console.error('[trabajos] ejecutar:', e instanceof Error ? e.message : e))
            .finally(() => active.delete(p));
          active.add(p);
        }
      } catch (e) {
        console.error('[trabajos] vuelta del trabajador:', e instanceof Error ? e.message : e);
      }
      await new Promise((r) => setTimeout(r, claimed ? 200 : active.size >= slots ? 1000 : 2000));
    }
  };
  void loop();
}

/** Limpieza: trabajos terminados (hechos o cancelados) anteriores al corte; los fallidos se guardan el doble. */
export async function purgeOldJobs(tenantId: string, cutoff: Date): Promise<number> {
  const failedCutoff = new Date(cutoff.getTime() - (Date.now() - cutoff.getTime()));
  const a = await db.delete(jobs).where(and(eq(jobs.tenantId, tenantId), sql`${jobs.status} IN ('hecho', 'cancelado')`, lt(jobs.createdAt, cutoff))).returning({ id: jobs.id });
  const b = await db.delete(jobs).where(and(eq(jobs.tenantId, tenantId), eq(jobs.status, 'fallido'), lt(jobs.createdAt, failedCutoff))).returning({ id: jobs.id });
  return a.length + b.length;
}

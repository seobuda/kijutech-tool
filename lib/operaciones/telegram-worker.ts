// Proceso de fondo de Telegram. Lo arranca instrumentation.ts una vez al iniciar el
// servidor de Next, dentro del propio contenedor (sin servicios nuevos):
//   - Escucha: consulta periódica larga (getUpdates) para recibir mensajes en local.
//   - Planificador (cada 30 s): envía avisos pendientes, reintenta fallidos y comprueba qué
//     personas han llegado a su hora de entrada para su resumen diario.
// Solo UN proceso escucha el bot: un candado de PostgreSQL (advisory lock) elige al líder.
// Si Telegram responde 409 (otro oyente con el mismo bot, p. ej. otro entorno), se anota en
// la configuración y Ajustes lo muestra.
import postgres from 'postgres';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsTelegramConfig, type OpsTelegramConfig } from '@/lib/db/schema';
import { tg, TelegramError, type TgUpdate } from '@/lib/operaciones/telegram';
import { decodeBotToken } from '@/lib/operaciones/telegram-config';
import { handleUpdate } from '@/lib/operaciones/telegram-handler';
import { processNotifications, runDailySummaries } from '@/lib/operaciones/notifications';
import { processOutbox } from '@/lib/operaciones/outbox';
import { runDigests } from '@/lib/operaciones/digest';

const LOCK_KEY = 74200126; // identifica "oyente de Telegram de Kijutech"
const POLL_TIMEOUT_S = 50;
const SCHEDULER_EVERY_MS = 30_000;

export type WorkerState = {
  started: boolean;
  role: 'starting' | 'leader' | 'standby';
  since: number;
  lockConn?: ReturnType<typeof postgres>;
  webhookCleared: Set<string>;
};

const g = globalThis as unknown as { __opsTgWorker?: WorkerState };

export function getWorkerState(): WorkerState | undefined {
  return g.__opsTgWorker;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function startTelegramWorkers() {
  if (g.__opsTgWorker?.started) return; // por si Next ejecutara register() más de una vez
  const state: WorkerState = {
    started: true,
    role: 'starting',
    since: Date.now(),
    webhookCleared: new Set()
  };
  g.__opsTgWorker = state;
  void leaderLoop(state);
  void pollLoop(state);
  void schedulerLoop(state);
  console.log('[telegram] procesos de fondo arrancados');
}

// --- Candado de líder -------------------------------------------------------

async function ensureLeader(state: WorkerState): Promise<boolean> {
  const url = process.env.POSTGRES_URL;
  if (!url) return false;
  try {
    // Conexión propia y permanente: el candado vive mientras viva esta sesión.
    state.lockConn ??= postgres(url, { max: 1, idle_timeout: 0, max_lifetime: null, onnotice: () => undefined });
    const conn = state.lockConn;
    // ¿Sigo teniendo el candado? (si la conexión se renovó, se pierde sin avisar)
    const [held] = await conn`
      select exists(
        select 1 from pg_locks where locktype = 'advisory' and pid = pg_backend_pid() and objid = ${LOCK_KEY}
      ) as held`;
    if (held.held) {
      setRole(state, 'leader');
      return true;
    }
    const [got] = await conn`select pg_try_advisory_lock(${LOCK_KEY}) as ok`;
    setRole(state, got.ok ? 'leader' : 'standby');
    return Boolean(got.ok);
  } catch (e) {
    console.error('[telegram] candado de líder:', e instanceof Error ? e.message : e);
    state.lockConn = undefined;
    setRole(state, 'standby');
    return false;
  }
}

function setRole(state: WorkerState, role: WorkerState['role']) {
  if (state.role !== role) {
    console.log(`[telegram] este proceso pasa a: ${role}`);
    state.role = role;
    state.since = Date.now();
  }
}

async function leaderLoop(state: WorkerState) {
  for (;;) {
    await ensureLeader(state);
    await sleep(15_000);
  }
}

// --- Escucha (long polling) -------------------------------------------------

async function recordError(tenantId: string, message: string | null) {
  await db
    .update(opsTelegramConfig)
    .set(
      message === null
        ? { lastError: null, lastErrorAt: null, lastPollAt: new Date() }
        : { lastError: message, lastErrorAt: new Date() }
    )
    .where(eq(opsTelegramConfig.tenantId, tenantId))
    .catch(() => undefined);
}

async function pollOnce(state: WorkerState, cfg: OpsTelegramConfig, longPoll: boolean): Promise<'ok' | 'wait'> {
  const token = decodeBotToken(cfg);

  // Al empezar a escuchar, se asegura de que no quede un webhook activo (impide getUpdates).
  if (!state.webhookCleared.has(cfg.tenantId)) {
    await tg(token, 'deleteWebhook', { drop_pending_updates: false });
    state.webhookCleared.add(cfg.tenantId);
  }

  const timeout = longPoll ? POLL_TIMEOUT_S : 0;
  const updates = await tg<TgUpdate[]>(
    token,
    'getUpdates',
    {
      offset: cfg.lastUpdateId + 1,
      timeout,
      allowed_updates: ['message', 'callback_query']
    },
    (timeout + 15) * 1000
  );

  let last = cfg.lastUpdateId;
  for (const u of updates) {
    try {
      await handleUpdate(cfg.tenantId, token, u);
    } catch (e) {
      console.error('[telegram] error procesando una actualización:', e instanceof Error ? e.message : e);
    }
    last = Math.max(last, u.update_id);
  }
  await db
    .update(opsTelegramConfig)
    .set({ lastUpdateId: last, lastPollAt: new Date(), lastError: null, lastErrorAt: null })
    .where(eq(opsTelegramConfig.tenantId, cfg.tenantId));
  return 'ok';
}

async function pollLoop(state: WorkerState) {
  for (;;) {
    try {
      if (state.role !== 'leader') {
        await sleep(5_000);
        continue;
      }
      const configs = await db.select().from(opsTelegramConfig).where(eq(opsTelegramConfig.receiveMode, 'polling'));
      if (configs.length === 0) {
        await sleep(10_000);
        continue;
      }
      for (const cfg of configs) {
        try {
          await pollOnce(state, cfg, configs.length === 1);
        } catch (e) {
          const err = e instanceof TelegramError ? e : null;
          if (err?.code === 409) {
            // Otro oyente con el mismo token (u otro proceso) está leyendo las actualizaciones.
            await recordError(
              cfg.tenantId,
              `CONFLICTO: Telegram indica que otro proceso está escuchando este bot (${err.message}). Solo puede haber uno.`
            );
            state.webhookCleared.delete(cfg.tenantId);
            await sleep(30_000);
          } else if (err?.code === 401) {
            await recordError(cfg.tenantId, 'El token del bot no es válido (Telegram respondió 401).');
            await sleep(60_000);
          } else {
            await recordError(cfg.tenantId, e instanceof Error ? e.message : 'Error desconocido al escuchar');
            await sleep(15_000);
          }
        }
      }
    } catch (e) {
      console.error('[telegram] bucle de escucha:', e instanceof Error ? e.message : e);
      await sleep(15_000);
    }
  }
}

// --- Planificador -----------------------------------------------------------

async function schedulerLoop(state: WorkerState) {
  for (;;) {
    await sleep(SCHEDULER_EVERY_MS);
    if (state.role !== 'leader') continue;
    try {
      const configs = await db.select().from(opsTelegramConfig);
      for (const cfg of configs) {
        await processNotifications(cfg.tenantId);
        await runDailySummaries(cfg.tenantId);
        await runDigests(cfg.tenantId);
        await processOutbox(cfg.tenantId);
      }
    } catch (e) {
      console.error('[telegram] planificador:', e instanceof Error ? e.message : e);
    }
  }
}

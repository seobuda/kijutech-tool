import 'server-only';
// Kit para escribir escenarios de pruebas simuladas (19 nov 2026): tipos, comprobaciones y acciones de la persona
// simulada. Lo usan scenarios.ts (avisos y flujo), scenarios-jornada.ts (jornada y tiempos, con reloj simulado) y
// scenarios-clickup.ts (ClickUp de verdad en la lista «Pruebas Kiju»).
import { randomUUID } from 'node:crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsClickupOutbox, opsNotifications, opsRequests, type OpsRequest, type OpsSimMessage } from '@/lib/db/schema';
import { enqueueNewRequestNotification, processNotifications } from '@/lib/operaciones/notifications';
import { SIM_EMPLOYEE_ID, SIM_LIST_ID, SIM_LIST_NAME } from '@/lib/operaciones/sim/env';
import { simMessagesSince, simPress, simSay } from '@/lib/operaciones/sim/actor';

export type SimStep = { label: string; ok: boolean; detail?: string };

export class StepFailed extends Error {}

export type ScenarioCtx = {
  ownerTenantId: string; // la cuenta real (solo la usa el escenario de ClickUp de verdad, para su token)
  simTenantId: string;
  emp: number; // chat del empleado simulado
  own: number; // chat de quien lleva las operaciones (simulado)
  createdBy: number;
  startId: number;
  steps: SimStep[];
};

export type Scenario = {
  key: string;
  title: string;
  area: string;
  description: string;
  /** Sale a un servicio de verdad (ClickUp): no entra en «todas» ni en las pruebas del despliegue; se lanza aparte. */
  external?: boolean;
  /** Id de la petición de Sistema → Pruebas («Pedir una prueba») que dio origen al escenario. */
  fromRequest?: string;
  run: (ctx: ScenarioCtx) => Promise<void>;
};

// --- Ayudas para escribir escenarios -------------------------------------------------------------------------------

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function check(ctx: ScenarioCtx, label: string, ok: boolean, detail?: string) {
  ctx.steps.push({ label, ok, ...(detail ? { detail: detail.slice(0, 400) } : {}) });
  if (!ok) throw new StepFailed(`${label}${detail ? `: ${detail}` : ''}`);
}

/** Envía lo que haya en la cola de avisos de la cuenta de pruebas (como haría el planificador). */
/**
 * Envía lo que haya en la cola de avisos de la cuenta de pruebas y ESPERA a que salga (hasta 15 s).
 * 20 nov 2026: antes eran 4 intentos en ~250 ms. El envío tiene un candado por proceso (processNotifications sale sin
 * hacer nada si otro envío está en marcha) y, en producción, justo tras reiniciar la app, el planificador real está
 * mandando sus avisos de arranque por Telegram (segundos): los 4 intentos se agotaban con el candado ocupado, el aviso del
 * encargo no salía y la prueba «encargo-borrado» falló sin que hubiera ningún fallo real (vuelta atrás de 8be6ea3b).
 * Cuenta como pendiente lo que ya toca enviar y lo que alguien está enviando (reservado: attempts > 0); lo programado
 * para más tarde a propósito (attempts = 0 y fecha futura) no se espera.
 */
export async function flush(ctx: ScenarioCtx) {
  const deadline = Date.now() + 15_000;
  for (let i = 0; ; i++) {
    await processNotifications(ctx.simTenantId);
    await sleep(60);
    if (i < 3) continue; // como mínimo, las 4 pasadas de siempre
    const [row] = await db
      .select({ id: opsNotifications.id })
      .from(opsNotifications)
      .where(and(eq(opsNotifications.tenantId, ctx.simTenantId), eq(opsNotifications.status, 'pendiente'), sql`(${opsNotifications.nextAttemptAt} <= now() OR ${opsNotifications.attempts} > 0)`))
      .limit(1);
    if (!row || Date.now() > deadline) return;
    await sleep(200);
  }
}

/** Crea un encargo simulado para «Kiju IA (pruebas)» y encola su aviso (también lo usa el botón manual del panel). */
export async function createSimRequest(simTenantId: string, createdBy: number, title: string, priority: number | null = 3): Promise<OpsRequest> {
  const id = randomUUID();
  const taskId = `sim-${id.slice(0, 8)}`;
  const [req] = await db
    .insert(opsRequests)
    .values({
      id,
      tenantId: simTenantId,
      createdBy,
      clickupListId: SIM_LIST_ID,
      clickupListName: SIM_LIST_NAME,
      title,
      originalRequest: `[prueba simulada] ${title}`,
      preparedDescription: `Encargo de prueba simulada: ${title}`,
      assigneeClickupId: SIM_EMPLOYEE_ID,
      assigneeName: 'Kiju IA (pruebas)',
      priority,
      status: 'creado',
      clickupTaskId: taskId,
      clickupTaskUrl: `https://app.clickup.com/t/${taskId}`,
      origin: 'herramienta'
    })
    .returning();
  await enqueueNewRequestNotification(req.id);
  return req;
}

export async function newRequest(ctx: ScenarioCtx, title: string, priority: number | null = 3): Promise<OpsRequest> {
  const req = await createSimRequest(ctx.simTenantId, ctx.createdBy, title, priority);
  await flush(ctx);
  return req;
}

export async function reload(ctx: ScenarioCtx, id: string): Promise<OpsRequest | null> {
  const [r] = await db.select().from(opsRequests).where(and(eq(opsRequests.tenantId, ctx.simTenantId), eq(opsRequests.id, id))).limit(1);
  return r ?? null;
}

export const inbox = (ctx: ScenarioCtx, chatId: number) => simMessagesSince(ctx.simTenantId, chatId, ctx.startId);
export const botMsgs = async (ctx: ScenarioCtx, chatId: number) => (await inbox(ctx, chatId)).filter((m) => m.direction === 'bot');
export const labels = (m: OpsSimMessage | undefined) => ((m?.buttons as { text: string }[][] | null) ?? []).flat().map((b) => b.text);

/** El último mensaje del bot en ese chat que contiene el texto. */
export async function lastBot(ctx: ScenarioCtx, chatId: number, contains: string): Promise<OpsSimMessage | undefined> {
  return (await botMsgs(ctx, chatId)).reverse().find((m) => m.text.includes(contains));
}

/** Pulsa el botón cuyo texto contiene `label` en el mensaje dado y envía lo que se encole. */
export async function press(ctx: ScenarioCtx, msg: OpsSimMessage | undefined, label: string) {
  check(ctx, `Hay un botón «${label}»`, Boolean(msg) && labels(msg).some((t) => t.includes(label)), msg ? `botones: ${labels(msg).join(' · ') || 'ninguno'}` : 'no hay mensaje');
  await simPress(ctx.simTenantId, msg!.id, (b) => b.text.includes(label));
  await flush(ctx);
}

export async function say(ctx: ScenarioCtx, chatId: number, text: string) {
  await simSay(ctx.simTenantId, chatId, text);
  await flush(ctx);
}

/** La última ventanita (respuesta a un botón) de ese chat. */
export async function lastToast(ctx: ScenarioCtx, chatId: number): Promise<string> {
  return (await inbox(ctx, chatId)).filter((m) => m.direction === 'aviso').at(-1)?.text ?? '';
}

export async function outbox(ctx: ScenarioCtx, requestId: string) {
  return db
    .select()
    .from(opsClickupOutbox)
    .where(and(eq(opsClickupOutbox.tenantId, ctx.simTenantId), eq(opsClickupOutbox.requestId, requestId)))
    .orderBy(asc(opsClickupOutbox.createdAt));
}
export const statusesSent = async (ctx: ScenarioCtx, requestId: string) =>
  (await outbox(ctx, requestId)).filter((o) => o.action === 'set_status').map((o) => (o.payload as { status: string }).status);


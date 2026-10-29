// Bandeja de salida hacia ClickUp (ops_clickup_outbox): cambios de estado y comentarios del flujo.
// Igual que el envío fiable de encargos y los avisos de Telegram:
//  - se guarda primero (dedupe_key único) y se envía después, así una caída no pierde el cambio;
//  - "reclamar" suma un intento y mueve next_attempt_at +90 s (hace de candado);
//  - fallidos: reintento con espera creciente, máximo 6 intentos;
//  - todo pasa por el cliente de clickup.ts (contador por minuto, espera ante el límite, reintento ante 429).
import { sql } from 'drizzle-orm';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsClickupOutbox } from '@/lib/db/schema';
import { addTaskComment, updateTaskStatus } from '@/lib/operaciones/clickup';
import { getClickUpToken } from '@/lib/operaciones/queries';

const MAX_ATTEMPTS = 6;
const LEASE_SECONDS = 90;

export type OutboxPayload =
  | { taskId: string; status: string } // set_status
  | { taskId: string; text: string }; // comment

export async function enqueueOutbox(input: {
  tenantId: string;
  requestId: string;
  action: 'set_status' | 'comment';
  payload: OutboxPayload;
  dedupeKey: string;
}): Promise<void> {
  await db
    .insert(opsClickupOutbox)
    .values({
      tenantId: input.tenantId,
      requestId: input.requestId,
      action: input.action,
      payload: input.payload,
      dedupeKey: input.dedupeKey
    })
    .onConflictDoNothing();
  void processOutbox(input.tenantId);
}

type Claimed = {
  id: string;
  tenant_id: string;
  action: 'set_status' | 'comment';
  payload: OutboxPayload;
  attempts: number;
};

let processing = false;

export async function processOutbox(tenantId?: string): Promise<number> {
  if (processing) return 0;
  processing = true;
  let done = 0;
  try {
    for (let round = 0; round < 5; round++) {
      const rows = (await db.execute(sql`
        UPDATE ops_clickup_outbox
        SET attempts = attempts + 1,
            next_attempt_at = now() + make_interval(secs => ${LEASE_SECONDS})
        WHERE id IN (
          SELECT id FROM ops_clickup_outbox
          WHERE (status = 'pendiente' OR (status = 'fallido' AND attempts < ${MAX_ATTEMPTS}))
            AND next_attempt_at <= now()
            ${tenantId ? sql`AND tenant_id = ${tenantId}` : sql``}
          ORDER BY created_at
          LIMIT 10
          FOR UPDATE SKIP LOCKED)
        RETURNING id, tenant_id, action, payload, attempts
      `)) as unknown as Claimed[];
      if (rows.length === 0) break;
      for (const c of rows) {
        await sendOne(c);
        done++;
      }
    }
  } finally {
    processing = false;
  }
  return done;
}

async function sendOne(c: Claimed) {
  try {
    const conn = await getClickUpToken(c.tenant_id);
    if (!conn) throw new Error('ClickUp no está conectado');
    if (c.action === 'set_status') {
      const p = c.payload as { taskId: string; status: string };
      await updateTaskStatus(conn.token, p.taskId, p.status);
    } else {
      const p = c.payload as { taskId: string; text: string };
      await addTaskComment(conn.token, p.taskId, p.text);
    }
    await db
      .update(opsClickupOutbox)
      .set({ status: 'hecho', doneAt: new Date(), lastError: null })
      .where(eq(opsClickupOutbox.id, c.id));
  } catch (e) {
    const backoff = Math.min(30 * 2 ** Math.min(c.attempts, 6), 3600);
    await db
      .update(opsClickupOutbox)
      .set({
        status: 'fallido',
        lastError: (e instanceof Error ? e.message : 'Error desconocido').slice(0, 500),
        nextAttemptAt: new Date(Date.now() + backoff * 1000)
      })
      .where(and(eq(opsClickupOutbox.id, c.id)));
  }
}

import 'server-only';
// Limpieza semanal de registros antiguos (D4 + D5 de la revisión del 17 nov; aprobada por Enric el 19 nov 2026).
// Domingo desde las 05:00 de Madrid (después de la copia diaria de las 03:00 UTC), una vez por semana:
//   - ai_jobs: pasados N días (90) se vacían input/output (prompts y respuestas completos, también datos de clientes).
//     La fila queda con coste, tokens, modelo y error: el vigía de IA y los paneles de gasto siguen cuadrando.
//     output queda como {"purgado": true} para que el Técnico de mantenimiento no lo confunda con una respuesta vacía.
//   - Registros de más de N meses (6): avisos enviados o fallidos, bandeja de ClickUp terminada, historial de eventos,
//     correos recibidos ya resueltos, y lo que registren otros módulos en el núcleo (Agentes: mensajes).
// Nunca toca lo pendiente (avisos por enviar, cambios por hacer, correos sin decidir) ni datos de trabajo.
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsSettings } from '@/lib/db/schema';
import { runRetention } from '@/lib/core/capabilities';
import { getAuto, num } from '@/lib/operaciones/automations';
import { localParts } from '@/lib/operaciones/notifications';

const TZ = 'Europe/Madrid';
const LAST_KEY = 'retention_last';
const START_MIN = 5 * 60;
const DAY_MS = 86_400_000;
// Estados de un correo recibido que todavía esperan algo (no se borran aunque sean antiguos).
const OPEN_EMAIL = ['nuevo', 'interpretando', 'propuesto'];

export type RetentionResult = {
  at: string;
  ok: boolean;
  aiJobs: number;
  notifications: number;
  outbox: number;
  events: number;
  emails: number;
  modules: Record<string, number>;
  error?: string;
};

export async function getLastRetention(tenantId: string): Promise<RetentionResult | null> {
  const [r] = await db.select({ value: opsSettings.value }).from(opsSettings).where(and(eq(opsSettings.tenantId, tenantId), eq(opsSettings.key, LAST_KEY))).limit(1);
  if (!r?.value) return null;
  try {
    return JSON.parse(r.value) as RetentionResult;
  } catch {
    return null;
  }
}

async function saveResult(tenantId: string, res: RetentionResult) {
  const value = JSON.stringify(res);
  await db
    .insert(opsSettings)
    .values({ tenantId, key: LAST_KEY, value })
    .onConflictDoUpdate({ target: [opsSettings.tenantId, opsSettings.key], set: { value, updatedAt: new Date() } });
}

const count = (r: unknown) => (r as unknown[]).length;

/** Hace la limpieza ya (sin mirar día ni hora). Exportada para las pruebas. */
export async function purgeOldRecords(tenantId: string, logMonths: number, aiTextDays: number, now = new Date()): Promise<RetentionResult> {
  const logCutoff = new Date(now);
  logCutoff.setUTCMonth(logCutoff.getUTCMonth() - logMonths);
  const aiCutoff = new Date(now.getTime() - aiTextDays * DAY_MS);
  const lc = logCutoff.toISOString();
  const ac = aiCutoff.toISOString();

  const aiJobs = count(
    await db.execute(sql`
      UPDATE ai_jobs SET input = '{}'::jsonb, output = '{"purgado": true}'::jsonb
      WHERE tenant_id = ${tenantId} AND created_at < ${ac}::timestamp AND status <> 'processing'
        AND (input <> '{}'::jsonb OR output IS NULL OR output->>'purgado' IS NULL)
      RETURNING id`)
  );
  const notifications = count(
    await db.execute(sql`DELETE FROM ops_notifications WHERE tenant_id = ${tenantId} AND status IN ('enviado', 'fallido') AND created_at < ${lc}::timestamp RETURNING id`)
  );
  const outbox = count(
    await db.execute(sql`DELETE FROM ops_clickup_outbox WHERE tenant_id = ${tenantId} AND status IN ('hecho', 'fallido') AND created_at < ${lc}::timestamp RETURNING id`)
  );
  const events = count(await db.execute(sql`DELETE FROM ops_request_events WHERE tenant_id = ${tenantId} AND created_at < ${lc}::timestamp RETURNING id`));
  const emails = count(
    await db.execute(sql`
      DELETE FROM ops_inbound_emails WHERE tenant_id = ${tenantId} AND created_at < ${lc}::timestamp
        AND status NOT IN (${sql.join(OPEN_EMAIL.map((s) => sql`${s}`), sql`, `)})
      RETURNING id`)
  );
  const modules = await runRetention(tenantId, logCutoff);
  return { at: now.toISOString(), ok: true, aiJobs, notifications, outbox, events, emails, modules };
}

/** Lo llama el planificador (cada 30 s): solo actúa el domingo desde las 05:00 de Madrid, una vez por semana. */
export async function runRetentionCleanup(tenantId: string, now = new Date()): Promise<RetentionResult | null> {
  const a = await getAuto(tenantId, 'retention');
  if (!a.enabled) return null;
  const lp = localParts(TZ, now);
  if (lp.weekday !== 'Sun' || lp.minutes < START_MIN) return null;
  const last = await getLastRetention(tenantId);
  if (last && now.getTime() - new Date(last.at).getTime() < 6 * DAY_MS) return null;
  let res: RetentionResult;
  try {
    res = await purgeOldRecords(tenantId, num(a, 'logMonths'), num(a, 'aiTextDays'), now);
  } catch (e) {
    // Se anota igual (con el error) para no reintentar cada 30 s; el registro de errores lo recoge por el log.
    console.error('[operaciones] limpieza de registros:', e instanceof Error ? e.message : e);
    res = { at: now.toISOString(), ok: false, aiJobs: 0, notifications: 0, outbox: 0, events: 0, emails: 0, modules: {}, error: e instanceof Error ? e.message.slice(0, 300) : 'Error desconocido' };
  }
  await saveResult(tenantId, res);
  return res;
}

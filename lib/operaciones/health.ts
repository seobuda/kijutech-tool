import 'server-only';

// Salud del sistema (paso 4, 12 nov 2026). Comprueba cada 5 min, desde el planificador, que nada se ha
// quedado atascado (avisos, cambios hacia ClickUp, encargos, correos), que ClickUp, Telegram y la IA no
// están fallando y que no nos acercamos al límite de ClickUp. Cada problema abre UNA incidencia (índice único
// parcial) y avisa a Enric una vez; al resolverse se cierra y se avisa otra vez. Las recomendaciones son
// reglas fijas del código (no IA). Lo que esta comprobación no puede ver (que la app entera se caiga) lo
// vigila scripts/watchdog.sh desde fuera, con /api/health.
import { and, count, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  aiJobs,
  opsClickupOutbox,
  opsClickupRequests,
  opsClickupWatch,
  opsHealthIncidents,
  opsInboundEmails,
  opsNotifications,
  opsRequests,
  opsSettings,
  opsTelegramConfig,
  type OpsHealthIncident
} from '@/lib/db/schema';
import { getAuto, num } from '@/lib/operaciones/automations';
import { enqueueNotification } from '@/lib/operaciones/notifications';
import { getOwnerMember } from '@/lib/operaciones/telegram-config';
import { escapeHtml } from '@/lib/operaciones/telegram';
import { syncToClickUp } from '@/lib/operaciones/sync';

export const HEALTH_EVERY_MS = 5 * 60_000;
export const STUCK_MS = 15 * 60_000;
export const HEARTBEAT_STALE_S = 180;
export const CLICKUP_LIMIT_PER_MIN = 100;

export type CheckStatus = 'ok' | 'aviso' | 'critico';
export type Check = {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
  recommendation: string;
};

export type Snapshot = {
  heartbeatAgeS: number | null;
  notificationsFailed: number;
  notificationsStuck: number;
  outboxFailed: number;
  outboxStuck: number;
  requestsError: number;
  requestsStuck: number;
  emailsError: number;
  emailsStuck: number;
  watchError: string | null;
  telegramError: string | null;
  aiFailedHour: number;
  aiTotalHour: number;
  clickupPeakPerMin: number;
  // Revisión de autonomía (12 nov): gasto de IA frente al tope, disco y copia diaria. Opcionales: sin dato, sin comprobación.
  aiSpendDay?: number;
  aiSpendMonth?: number;
  aiBudget?: { enabled: boolean; daily: number; monthly: number };
  diskUsedPct?: number | null;
  backupAgeH?: number | null;
  restoreTest?: { ageD: number; ok: boolean; detail: string } | null;
  emailsToday?: number | null; // correos del buzón del agente hoy (entrada + salida, aproximado); plan gratuito: 100/día
};

export const EMAIL_DAILY_LIMIT = 100;

const usd = (n: number) => `${n.toFixed(2)} $`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Reglas: del estado actual a comprobaciones con su recomendación. Función pura (se prueba sin base de datos). */
export function evaluate(s: Snapshot): Check[] {
  const checks: Check[] = [];
  const add = (key: string, label: string, status: CheckStatus, detail: string, recommendation = '') =>
    checks.push({ key, label, status, detail, recommendation });

  if (s.heartbeatAgeS === null) add('planificador', 'Planificador', 'aviso', 'Todavía no hay latido registrado.', 'Espera un minuto tras arrancar.');
  else if (s.heartbeatAgeS > HEARTBEAT_STALE_S)
    add(
      'planificador',
      'Planificador',
      'critico',
      `Último latido hace ${Math.round(s.heartbeatAgeS / 60)} min: los procesos de fondo están parados.`,
      'Reinicia la app (docker compose up -d en el servidor). Si se repite, revisa los logs: puede que el proceso no consiga el candado de líder.'
    );
  else add('planificador', 'Planificador', 'ok', `Último latido hace ${s.heartbeatAgeS} s.`);

  const notif = s.notificationsFailed + s.notificationsStuck;
  if (s.notificationsFailed > 0)
    add(
      'avisos',
      'Avisos de Telegram',
      'critico',
      `${plural(s.notificationsFailed, 'aviso agotó', 'avisos agotaron')} sus reintentos${s.notificationsStuck ? ` y ${s.notificationsStuck} llevan más de 15 min en cola` : ''}.`,
      'Mira el error en la pestaña Telegram (token caducado, bot bloqueado por la persona o chat sin vincular). Arréglalo y pulsa «Reintentar lo atascado».'
    );
  else if (s.notificationsStuck > 0)
    add('avisos', 'Avisos de Telegram', 'aviso', `${plural(s.notificationsStuck, 'aviso lleva', 'avisos llevan')} más de 15 min en cola.`, 'Suele ser un límite de Telegram o un corte puntual; si sigue, revisa la pestaña Telegram.');
  else add('avisos', 'Avisos de Telegram', 'ok', notif ? '' : 'Sin avisos atascados.');

  if (s.outboxFailed > 0)
    add(
      'clickup_cambios',
      'Cambios hacia ClickUp',
      'critico',
      `${plural(s.outboxFailed, 'cambio agotó', 'cambios agotaron')} sus reintentos (estado o comentario sin aplicar en ClickUp).`,
      'Suele ser un estado de lista que ya no existe: revisa Ajustes ClickUp → estados. Después, «Reintentar lo atascado».'
    );
  else if (s.outboxStuck > 0)
    add('clickup_cambios', 'Cambios hacia ClickUp', 'aviso', `${plural(s.outboxStuck, 'cambio lleva', 'cambios llevan')} más de 15 min en cola.`, 'Puede ser el límite de peticiones de ClickUp; se reintentan solos.');
  else add('clickup_cambios', 'Cambios hacia ClickUp', 'ok', 'Sin cambios atascados.');

  if (s.requestsError + s.requestsStuck > 0)
    add(
      'encargos',
      'Encargos hacia ClickUp',
      s.requestsError > 0 ? 'critico' : 'aviso',
      [s.requestsError ? plural(s.requestsError, 'encargo con error', 'encargos con error') : '', s.requestsStuck ? `${s.requestsStuck} pendiente(s) de ClickUp hace más de 15 min` : '']
        .filter(Boolean)
        .join(' · '),
      'Abre Encargos y pulsa «Reintentar» (no se duplican: se busca antes la marca [kiju:]).'
    );
  else add('encargos', 'Encargos hacia ClickUp', 'ok', 'Todos los encargos llegaron a ClickUp.');

  if (s.emailsError + s.emailsStuck > 0)
    add(
      'correos',
      'Correos del agente',
      'aviso',
      [s.emailsError ? plural(s.emailsError, 'correo que la IA no pudo interpretar', 'correos que la IA no pudo interpretar') : '', s.emailsStuck ? `${s.emailsStuck} interpretándose hace más de 15 min` : '']
        .filter(Boolean)
        .join(' · '),
      'Pulsa «Reintentar lo atascado» para que la IA vuelva a interpretarlos; si fallan otra vez, revisa la configuración de IA.'
    );
  else add('correos', 'Correos del agente', 'ok', 'Sin correos atascados.');

  if (s.watchError) add('vigilancia', 'Vigilancia de ClickUp', 'aviso', s.watchError, 'Comprueba en Ajustes ClickUp que el token sigue siendo válido y que hay espacios seleccionados.');
  else add('vigilancia', 'Vigilancia de ClickUp', 'ok', 'Sin errores.');

  if (s.telegramError) add('telegram', 'Bot de Telegram', 'critico', s.telegramError, 'Abre la pestaña Telegram: un 409 es otro proceso escuchando el mismo bot; un 401, un token no válido.');
  else add('telegram', 'Bot de Telegram', 'ok', 'Recibiendo sin errores.');

  if (s.aiFailedHour >= 3)
    add(
      'ia',
      'IA',
      s.aiFailedHour >= 10 ? 'critico' : 'aviso',
      `${s.aiFailedHour} de ${s.aiTotalHour} llamadas a la IA fallaron en la última hora.`,
      'Revisa en IA y modelos que la clave tiene saldo y que el modelo sigue disponible.'
    );
  else add('ia', 'IA', 'ok', s.aiTotalHour ? `${s.aiTotalHour} llamada(s) en la última hora.` : 'Sin llamadas en la última hora.');

  const pct = Math.round((s.clickupPeakPerMin / CLICKUP_LIMIT_PER_MIN) * 100);
  if (pct >= 80)
    add(
      'clickup_limite',
      'Límite de ClickUp',
      'aviso',
      `Pico de ${s.clickupPeakPerMin} peticiones en un minuto (${pct} % del límite de ${CLICKUP_LIMIT_PER_MIN}).`,
      'El cliente ya espera solo al 80 %, pero si se repite conviene revisar qué pantalla o proceso consulta tanto.'
    );
  else add('clickup_limite', 'Límite de ClickUp', 'ok', `Pico de ${s.clickupPeakPerMin}/min en la última hora (${pct} %).`);

  if (s.aiBudget?.enabled && s.aiSpendDay !== undefined && s.aiSpendMonth !== undefined) {
    const dPct = Math.round((s.aiSpendDay / s.aiBudget.daily) * 100);
    const mPct = Math.round((s.aiSpendMonth / s.aiBudget.monthly) * 100);
    const worst = Math.max(dPct, mPct);
    const detail = `Hoy ${usd(s.aiSpendDay)} de ${usd(s.aiBudget.daily)} (${dPct} %) · este mes ${usd(s.aiSpendMonth)} de ${usd(s.aiBudget.monthly)} (${mPct} %).`;
    if (worst >= 100) add('ia_gasto', 'Gasto de IA', 'critico', detail, 'Se ha pasado el tope. Mira en IA y modelos → Cerebro qué función gasta más; si es un pico puntual, sube el tope en Automatizaciones → Tope de gasto de IA.');
    else if (worst >= 80) add('ia_gasto', 'Gasto de IA', 'aviso', detail, 'Cerca del tope. Si es lo normal de este mes, súbelo en Automatizaciones → Tope de gasto de IA.');
    else add('ia_gasto', 'Gasto de IA', 'ok', detail);
  }

  if (s.diskUsedPct != null) {
    if (s.diskUsedPct >= 90) add('disco', 'Disco del servidor', 'critico', `Disco al ${s.diskUsedPct} %.`, 'Si se llena, la base de datos se para. Borra copias antiguas o imágenes de Docker sin usar (docker system prune) o amplía el disco.');
    else if (s.diskUsedPct >= 80) add('disco', 'Disco del servidor', 'aviso', `Disco al ${s.diskUsedPct} %.`, 'Conviene liberar espacio pronto (copias antiguas, imágenes de Docker sin usar).');
    else add('disco', 'Disco del servidor', 'ok', `Disco al ${s.diskUsedPct} %.`);
  }

  if (s.backupAgeH != null) {
    if (s.backupAgeH > 50) add('copia', 'Copia de seguridad', 'critico', `La última copia diaria es de hace ${Math.round(s.backupAgeH)} h.`, 'La copia de las 03:00 lleva más de dos días sin hacerse: revisa el cron del servidor y /opt/kijutech/backups.');
    else if (s.backupAgeH > 27) add('copia', 'Copia de seguridad', 'aviso', `La última copia diaria es de hace ${Math.round(s.backupAgeH)} h.`, 'La copia de esta madrugada no se ha registrado: revisa el cron del servidor.');
    else add('copia', 'Copia de seguridad', 'ok', `Última copia hace ${Math.round(s.backupAgeH)} h.`);
  }

  if (s.emailsToday != null) {
    const p = Math.round((s.emailsToday / EMAIL_DAILY_LIMIT) * 100);
    const detail = `Unos ${s.emailsToday} correos hoy (recibidos y enviados) de ${EMAIL_DAILY_LIMIT} del plan gratuito de Resend.`;
    if (p >= 95) add('correo_cuota', 'Cuota de correo', 'critico', detail, 'Al llegar a 100 Resend deja de enviar y recibir hasta mañana. Si se repite, conviene el plan de pago de Resend.');
    else if (p >= 80) add('correo_cuota', 'Cuota de correo', 'aviso', detail, 'Cerca del límite diario. Si se repite, conviene el plan de pago de Resend.');
    else add('correo_cuota', 'Cuota de correo', 'ok', detail);
  }

  if (s.restoreTest) {
    const r = s.restoreTest;
    if (!r.ok) add('restauracion', 'Prueba de restauración', 'critico', `La última prueba falló: ${r.detail}`, 'La copia podría no servir. Revisa /opt/kijutech/backups/restore-test.log y vuelve a lanzar scripts/restore-test.sh.');
    else if (r.ageD > 40) add('restauracion', 'Prueba de restauración', 'aviso', `La última prueba buena es de hace ${Math.round(r.ageD)} días.`, 'Revisa el cron mensual de scripts/restore-test.sh en el servidor.');
    else add('restauracion', 'Prueba de restauración', 'ok', `Hace ${Math.round(r.ageD)} días: ${r.detail}`);
  }

  return checks;
}

/** Fecha ISO de la última copia diaria: la escribe scripts/backup.sh en el servidor al terminar bien. */
export const BACKUP_SETTING = 'backup_last_at';

/** % de disco usado donde vive la app (el mismo disco que la base de datos en el servidor). */
async function diskUsedPct(): Promise<number | null> {
  try {
    const { statfs } = await import('node:fs/promises');
    const s = await statfs('/');
    if (!s.blocks) return null;
    return Math.round(((s.blocks - s.bavail) / s.blocks) * 100);
  } catch {
    return null;
  }
}

async function heartbeatAgeS(tenantId: string): Promise<number | null> {
  const [row] = await db
    .select({ value: opsSettings.value })
    .from(opsSettings)
    .where(and(eq(opsSettings.tenantId, tenantId), eq(opsSettings.key, 'worker_heartbeat')))
    .limit(1);
  const ms = Number(row?.value);
  return Number.isFinite(ms) && ms > 0 ? Math.max(0, Math.round((Date.now() - ms) / 1000)) : null;
}

export async function collectSnapshot(tenantId: string): Promise<Snapshot> {
  const stuckBefore = new Date(Date.now() - STUCK_MS);
  const hourAgo = new Date(Date.now() - 3_600_000);
  const maxAttempts = num(await getAuto(tenantId, 'delivery'), 'maxAttempts');
  const n = async (q: Promise<{ n: number }[]>) => (await q)[0]?.n ?? 0;

  const [
    notificationsFailed,
    notificationsStuck,
    outboxFailed,
    outboxStuck,
    requestsError,
    requestsStuck,
    emailsError,
    emailsStuck,
    aiFailedHour,
    aiTotalHour
  ] = await Promise.all([
    n(db.select({ n: count() }).from(opsNotifications).where(and(eq(opsNotifications.tenantId, tenantId), eq(opsNotifications.status, 'fallido'), gte(opsNotifications.attempts, maxAttempts)))),
    n(db.select({ n: count() }).from(opsNotifications).where(and(eq(opsNotifications.tenantId, tenantId), eq(opsNotifications.status, 'pendiente'), lt(opsNotifications.createdAt, stuckBefore)))),
    n(db.select({ n: count() }).from(opsClickupOutbox).where(and(eq(opsClickupOutbox.tenantId, tenantId), eq(opsClickupOutbox.status, 'fallido'), gte(opsClickupOutbox.attempts, 6)))),
    n(db.select({ n: count() }).from(opsClickupOutbox).where(and(eq(opsClickupOutbox.tenantId, tenantId), eq(opsClickupOutbox.status, 'pendiente'), lt(opsClickupOutbox.createdAt, stuckBefore)))),
    n(db.select({ n: count() }).from(opsRequests).where(and(eq(opsRequests.tenantId, tenantId), eq(opsRequests.status, 'error_sync')))),
    n(db.select({ n: count() }).from(opsRequests).where(and(eq(opsRequests.tenantId, tenantId), eq(opsRequests.status, 'pendiente_clickup'), lt(opsRequests.createdAt, stuckBefore)))),
    n(db.select({ n: count() }).from(opsInboundEmails).where(and(eq(opsInboundEmails.tenantId, tenantId), eq(opsInboundEmails.status, 'error')))),
    n(db.select({ n: count() }).from(opsInboundEmails).where(and(eq(opsInboundEmails.tenantId, tenantId), eq(opsInboundEmails.status, 'interpretando'), lt(opsInboundEmails.updatedAt, stuckBefore)))),
    n(db.select({ n: count() }).from(aiJobs).where(and(eq(aiJobs.tenantId, tenantId), eq(aiJobs.status, 'failed'), gte(aiJobs.createdAt, hourAgo)))),
    n(db.select({ n: count() }).from(aiJobs).where(and(eq(aiJobs.tenantId, tenantId), gte(aiJobs.createdAt, hourAgo))))
  ]);

  const [watch] = await db.select().from(opsClickupWatch).where(eq(opsClickupWatch.tenantId, tenantId)).limit(1);
  const [tg] = await db.select().from(opsTelegramConfig).where(eq(opsTelegramConfig.tenantId, tenantId)).limit(1);
  const tgRecent = tg?.lastError && tg.lastErrorAt && Date.now() - tg.lastErrorAt.getTime() < 3_600_000;
  const peak = (await db.execute(sql`
    SELECT coalesce(max(c), 0)::int AS peak FROM (
      SELECT count(*) AS c FROM ops_clickup_requests
      WHERE tenant_id = ${tenantId} AND requested_at >= now() - interval '1 hour'
      GROUP BY date_trunc('minute', requested_at)) t`)) as unknown as { peak: number }[];

  const budget = await getAuto(tenantId, 'ai_budget');
  const spend = (await db.execute(sql`
    SELECT coalesce(sum(estimated_cost) FILTER (WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid'), 0)::float AS day,
           coalesce(sum(estimated_cost), 0)::float AS month
    FROM ai_jobs
    WHERE tenant_id = ${tenantId} AND created_at >= date_trunc('month', now() AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid'`)) as unknown as { day: number; month: number }[];
  const [backupRow] = await db
    .select({ value: opsSettings.value })
    .from(opsSettings)
    .where(and(eq(opsSettings.tenantId, tenantId), eq(opsSettings.key, BACKUP_SETTING)))
    .limit(1);
  const backupMs = Date.parse(backupRow?.value ?? '');
  const [mail] = (await db.execute(sql`
    SELECT (SELECT count(*)::int FROM ops_inbound_emails WHERE tenant_id = ${tenantId} AND source = 'resend' AND created_at >= date_trunc('day', now())) +
           (SELECT count(*)::int FROM ops_agent_actions WHERE tenant_id = ${tenantId} AND kind = 'email_reply' AND executed_at >= date_trunc('day', now())) +
           (SELECT count(*)::int FROM ops_notifications WHERE tenant_id = ${tenantId} AND dedupe_key LIKE 'jw:ping:%' AND created_at >= date_trunc('day', now())) AS n`)) as unknown as { n: number }[];
  const restoreRows = await db
    .select({ key: opsSettings.key, value: opsSettings.value })
    .from(opsSettings)
    .where(and(eq(opsSettings.tenantId, tenantId), inArray(opsSettings.key, ['restore_test_at', 'restore_test_result'])));
  const restoreAt = Date.parse(restoreRows.find((r) => r.key === 'restore_test_at')?.value ?? '');
  const [restoreStatus, ...restoreDetail] = (restoreRows.find((r) => r.key === 'restore_test_result')?.value ?? '').split('|');

  return {
    aiSpendDay: Number(spend[0]?.day ?? 0),
    aiSpendMonth: Number(spend[0]?.month ?? 0),
    aiBudget: { enabled: budget.enabled, daily: num(budget, 'dailyUsd'), monthly: num(budget, 'monthlyUsd') },
    diskUsedPct: await diskUsedPct(),
    backupAgeH: Number.isFinite(backupMs) ? (Date.now() - backupMs) / 3_600_000 : null,
    emailsToday: Number(mail?.n ?? 0),
    restoreTest: Number.isFinite(restoreAt) ? { ageD: (Date.now() - restoreAt) / 86_400_000, ok: restoreStatus === 'ok', detail: restoreDetail.join('|') } : null,
    heartbeatAgeS: await heartbeatAgeS(tenantId),
    notificationsFailed,
    notificationsStuck,
    outboxFailed,
    outboxStuck,
    requestsError,
    requestsStuck,
    emailsError,
    emailsStuck,
    watchError: watch?.enabled && watch.lastError ? watch.lastError : null,
    telegramError: tgRecent ? tg!.lastError : null,
    aiFailedHour,
    aiTotalHour,
    clickupPeakPerMin: peak[0]?.peak ?? 0
  };
}

// --- Incidencias y avisos ----------------------------------------------------------------------

const lastRun = new Map<string, number>();

async function notify(tenantId: string, dedupeKey: string, text: string) {
  const owner = await getOwnerMember(tenantId);
  if (!owner) return;
  await enqueueNotification({
    tenantId,
    kind: 'health',
    dedupeKey,
    forClickupUserId: owner.clickupUserId,
    forName: owner.username,
    payload: { text, toOwner: true }
  });
}

/** Planificador: cada 5 min abre/cierra incidencias según las comprobaciones y avisa a Enric. */
export async function runHealthChecks(tenantId: string, now = Date.now()): Promise<void> {
  if (now - (lastRun.get(tenantId) ?? 0) < HEALTH_EVERY_MS) return;
  lastRun.set(tenantId, now);
  // El latido lo vigila desde fuera scripts/watchdog.sh: si este código se ejecuta, el planificador vive.
  const checks = evaluate(await collectSnapshot(tenantId)).filter((c) => c.key !== 'planificador');
  const open = await db
    .select()
    .from(opsHealthIncidents)
    .where(and(eq(opsHealthIncidents.tenantId, tenantId), isNull(opsHealthIncidents.resolvedAt)));

  for (const c of checks) {
    const current = open.find((o) => o.checkKey === c.key);
    if (c.status !== 'ok' && !current) {
      const [created] = await db
        .insert(opsHealthIncidents)
        .values({ tenantId, checkKey: c.key, severity: c.status, title: c.label, detail: `${c.detail}\n${c.recommendation}`.trim() })
        .onConflictDoNothing()
        .returning();
      if (created) {
        await notify(
          tenantId,
          `health:open:${created.id}`,
          `${c.status === 'critico' ? '🔴' : '🟠'} <b>Salud: ${escapeHtml(c.label)}</b>\n${escapeHtml(c.detail)}\n\n💡 ${escapeHtml(c.recommendation)}\n\nDetalle en Operaciones → Salud.`
        );
        await db.update(opsHealthIncidents).set({ notifiedAt: new Date() }).where(eq(opsHealthIncidents.id, created.id));
      }
    } else if (c.status === 'ok' && current) {
      const [closed] = await db
        .update(opsHealthIncidents)
        .set({ resolvedAt: new Date() })
        .where(and(eq(opsHealthIncidents.id, current.id), isNull(opsHealthIncidents.resolvedAt)))
        .returning();
      if (closed) {
        const mins = Math.max(1, Math.round((Date.now() - current.openedAt.getTime()) / 60_000));
        await notify(tenantId, `health:resolved:${current.id}`, `🟢 <b>Resuelto: ${escapeHtml(c.label)}</b> (duró ${mins} min).`);
        await db.update(opsHealthIncidents).set({ resolvedNotifiedAt: new Date() }).where(eq(opsHealthIncidents.id, current.id));
      }
    } else if (c.status !== 'ok' && current && current.detail !== `${c.detail}\n${c.recommendation}`.trim()) {
      await db.update(opsHealthIncidents).set({ detail: `${c.detail}\n${c.recommendation}`.trim(), severity: c.status }).where(eq(opsHealthIncidents.id, current.id));
    }
  }
}

/** Al arrancar: si el sistema estuvo parado, queda como incidencia ya resuelta (para el historial). */
export async function recordDowntime(tenantId: string, from: Date, to: Date, detail: string): Promise<void> {
  await db
    .insert(opsHealthIncidents)
    .values({
      tenantId,
      checkKey: 'parada',
      severity: 'critico',
      title: 'Sistema parado',
      detail,
      openedAt: from,
      resolvedAt: to,
      notifiedAt: to,
      resolvedNotifiedAt: to
    })
    .onConflictDoNothing();
}

// --- Panel «Salud» ---------------------------------------------------------------------------------

export type HealthOverview = {
  checks: Check[];
  incidents: Pick<OpsHealthIncident, 'id' | 'checkKey' | 'severity' | 'title' | 'detail' | 'openedAt' | 'resolvedAt'>[];
  clickupPerHour: { label: string; value: number }[];
  aiCostPerDay: { label: string; value: number }[];
  notificationsPerDay: { label: string; sent: number; failed: number }[];
  uptime7d: number | null;
};

const TZ = 'Europe/Madrid';

export async function getHealthOverview(tenantId: string): Promise<HealthOverview> {
  const checks = evaluate(await collectSnapshot(tenantId));
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const incidents = await db
    .select({
      id: opsHealthIncidents.id,
      checkKey: opsHealthIncidents.checkKey,
      severity: opsHealthIncidents.severity,
      title: opsHealthIncidents.title,
      detail: opsHealthIncidents.detail,
      openedAt: opsHealthIncidents.openedAt,
      resolvedAt: opsHealthIncidents.resolvedAt
    })
    .from(opsHealthIncidents)
    .where(and(eq(opsHealthIncidents.tenantId, tenantId), gte(opsHealthIncidents.openedAt, since30)))
    .orderBy(desc(opsHealthIncidents.openedAt))
    .limit(50);

  const hourRows = (await db.execute(sql`
    SELECT to_char(date_trunc('hour', requested_at AT TIME ZONE 'UTC' AT TIME ZONE ${TZ}), 'YYYY-MM-DD HH24') AS h, count(*)::int AS n
    FROM ops_clickup_requests WHERE tenant_id = ${tenantId} AND requested_at >= now() - interval '24 hours'
    GROUP BY 1`)) as unknown as { h: string; n: number }[];
  const clickupPerHour: { label: string; value: number }[] = [];
  const hourFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false });
  for (let i = 23; i >= 0; i--) {
    const d = new Date(Date.now() - i * 3_600_000);
    const key = hourFmt.format(d).replace(',', '').slice(0, 13);
    clickupPerHour.push({ label: `${key.slice(11, 13)}h`, value: hourRows.find((r) => r.h === key)?.n ?? 0 });
  }

  const dayFmt = new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const shortDay = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
  const days = (n: number) => Array.from({ length: n }, (_, i) => dayFmt.format(new Date(Date.now() - (n - 1 - i) * 86_400_000)));

  const costRows = (await db.execute(sql`
    SELECT to_char(created_at AT TIME ZONE 'UTC' AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS d, coalesce(sum(estimated_cost), 0)::float AS c
    FROM ai_jobs WHERE tenant_id = ${tenantId} AND created_at >= now() - interval '14 days' GROUP BY 1`)) as unknown as { d: string; c: number }[];
  const aiCostPerDay = days(14).map((d) => ({ label: shortDay(d), value: Number(costRows.find((r) => r.d === d)?.c ?? 0) }));

  const notifRows = (await db.execute(sql`
    SELECT to_char(created_at AT TIME ZONE 'UTC' AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS d,
      count(*) FILTER (WHERE status = 'enviado')::int AS sent, count(*) FILTER (WHERE status = 'fallido')::int AS failed
    FROM ops_notifications WHERE tenant_id = ${tenantId} AND created_at >= now() - interval '7 days' GROUP BY 1`)) as unknown as { d: string; sent: number; failed: number }[];
  const notificationsPerDay = days(7).map((d) => {
    const r = notifRows.find((x) => x.d === d);
    return { label: shortDay(d), sent: r?.sent ?? 0, failed: r?.failed ?? 0 };
  });

  // Disponibilidad de 7 días a partir de las paradas registradas al arrancar.
  const since7 = Date.now() - 7 * 86_400_000;
  const downMs = incidents
    .filter((i) => i.checkKey === 'parada' && i.resolvedAt && i.resolvedAt.getTime() > since7)
    .reduce((a, i) => a + (i.resolvedAt!.getTime() - Math.max(i.openedAt.getTime(), since7)), 0);
  const uptime7d = Math.max(0, 1 - downMs / (7 * 86_400_000));

  return { checks, incidents, clickupPerHour, aiCostPerDay, notificationsPerDay, uptime7d };
}

/** «Reintentar lo atascado»: vuelve a poner en cola avisos y cambios agotados, reinterpreta correos y reenvía encargos. */
export async function retryStuck(tenantId: string): Promise<{ notifications: number; outbox: number; emails: number; requests: number }> {
  const notif = await db
    .update(opsNotifications)
    .set({ status: 'pendiente', attempts: 0, nextAttemptAt: new Date(), lastError: null })
    .where(and(eq(opsNotifications.tenantId, tenantId), eq(opsNotifications.status, 'fallido')))
    .returning({ id: opsNotifications.id });
  const outbox = await db
    .update(opsClickupOutbox)
    .set({ status: 'pendiente', attempts: 0, nextAttemptAt: new Date(), lastError: null })
    .where(and(eq(opsClickupOutbox.tenantId, tenantId), eq(opsClickupOutbox.status, 'fallido')))
    .returning({ id: opsClickupOutbox.id });
  const emails = await db
    .update(opsInboundEmails)
    .set({ status: 'nuevo', statusNote: null, updatedAt: new Date() })
    .where(and(eq(opsInboundEmails.tenantId, tenantId), inArray(opsInboundEmails.status, ['error'])))
    .returning({ id: opsInboundEmails.id });
  const reqs = await db
    .select({ id: opsRequests.id })
    .from(opsRequests)
    .where(and(eq(opsRequests.tenantId, tenantId), eq(opsRequests.status, 'error_sync')))
    .limit(10);
  for (const r of reqs) await syncToClickUp(r.id, tenantId, true);
  // Que la próxima vuelta compruebe enseguida (para cerrar las incidencias resueltas).
  lastRun.delete(tenantId);
  return { notifications: notif.length, outbox: outbox.length, emails: emails.length, requests: reqs.length };
}

/** Para /api/health: el latido más reciente de cualquier cuenta (sin datos de cuentas). */
export async function newestHeartbeatAgeS(): Promise<number | null> {
  const rows = await db.select({ value: opsSettings.value }).from(opsSettings).where(eq(opsSettings.key, 'worker_heartbeat'));
  const newest = Math.max(0, ...rows.map((r) => Number(r.value)).filter((v) => Number.isFinite(v)));
  return newest > 0 ? Math.round((Date.now() - newest) / 1000) : null;
}

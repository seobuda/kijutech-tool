// Datos en vivo del Mapa Visual de Operaciones: los valores ACTUALES del panel de Automatizaciones y la última
// ejecución de cada proceso periódico (y si dio error). Todo se lee de lo que ya existe, sin tablas nuevas.
// Cada clave de `runs` es un «proveedor» que los pasos de process-map.ts nombran en `live`.
import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { aiPrompts, opsClickupConnections, opsClickupRequests, opsClickupWatch, opsSettings, opsTelegramConfig } from '@/lib/db/schema';
import { AUTOMATIONS, getAutoAll } from '@/lib/operaciones/automations';
import { getWorkerState } from '@/lib/operaciones/telegram-worker';

export type LiveRun = { label: string; at: number | null; error: string | null; note: string | null };
export type LiveSetting = {
  title: string;
  enabled: boolean;
  canDisable: boolean;
  customTemplate: boolean;
  fields: { key: string; label: string; value: string; unit: string | null }[];
};
export type LiveData = {
  generatedAt: number;
  testMode: boolean;
  automations: Record<string, LiveSetting>;
  runs: Record<string, LiveRun>;
  prompts: Record<string, { name: string; active: boolean }>;
};

type Agg = { kind?: string; last_ok: Date | null; failed: number; err: string | null };

const ms = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : null);

export async function getMapLive(tenantId: string): Promise<LiveData> {
  const autos = await getAutoAll(tenantId);
  const automations: LiveData['automations'] = {};
  for (const def of AUTOMATIONS) {
    const a = autos[def.key];
    automations[def.key] = {
      title: def.title,
      enabled: a.enabled,
      canDisable: def.canDisable,
      customTemplate: a.customTemplate,
      fields: def.fields.map((f) => ({
        key: f.key,
        label: f.label,
        value: f.type === 'bool' ? (a.cfg[f.key] ? 'sí' : 'no') : String(a.cfg[f.key]),
        unit: f.unit ?? null
      }))
    };
  }

  const [watch] = await db.select().from(opsClickupWatch).where(eq(opsClickupWatch.tenantId, tenantId)).limit(1);
  const [tg] = await db.select().from(opsTelegramConfig).where(eq(opsTelegramConfig.tenantId, tenantId)).limit(1);
  const [conn] = await db.select().from(opsClickupConnections).where(eq(opsClickupConnections.tenantId, tenantId)).limit(1);
  const settings = await db
    .select()
    .from(opsSettings)
    .where(and(eq(opsSettings.tenantId, tenantId), inArray(opsSettings.key, ['client_activity_last_run', 'client_activity_last_error', 'worker_heartbeat'])));
  const setting = (k: string) => settings.find((s) => s.key === k)?.value ?? '';

  const notif = (await db.execute(sql`
    SELECT kind,
           max(CASE WHEN status = 'enviado' THEN coalesce(sent_at, created_at) END) AS last_ok,
           count(*) FILTER (WHERE status = 'fallido')::int AS failed,
           (array_agg(last_error ORDER BY created_at DESC) FILTER (WHERE status = 'fallido'))[1] AS err
    FROM ops_notifications
    WHERE tenant_id = ${tenantId} AND created_at > now() - interval '7 days'
    GROUP BY kind`)) as unknown as Agg[];
  const [outbox] = (await db.execute(sql`
    SELECT max(done_at) AS last_ok,
           count(*) FILTER (WHERE status = 'fallido')::int AS failed,
           (array_agg(last_error ORDER BY created_at DESC) FILTER (WHERE status = 'fallido'))[1] AS err
    FROM ops_clickup_outbox
    WHERE tenant_id = ${tenantId} AND created_at > now() - interval '7 days'`)) as unknown as Agg[];
  const [cleanup] = (await db.execute(sql`
    SELECT max(started_at) AS last_start,
           count(*) FILTER (WHERE status = 'en_curso')::int AS running,
           count(*) FILTER (WHERE status <> 'en_curso')::int AS finished
    FROM ops_cleanup_runs WHERE tenant_id = ${tenantId}`)) as unknown as { last_start: Date | null; running: number; finished: number }[];
  const [startupRow] = (await db.execute(sql`
    SELECT max(CASE WHEN status = 'enviado' THEN coalesce(sent_at, created_at) END) AS last_ok,
           count(*) FILTER (WHERE status = 'fallido')::int AS failed,
           (array_agg(last_error ORDER BY created_at DESC) FILTER (WHERE status = 'fallido'))[1] AS err
    FROM ops_notifications WHERE tenant_id = ${tenantId} AND kind = 'startup' AND created_at > now() - interval '7 days'`)) as unknown as Agg[];
  const [sugg] = (await db.execute(sql`
    SELECT max(created_at) AS last_at, count(*)::int AS total, count(*) FILTER (WHERE digest_shown_at IS NULL)::int AS pending
    FROM ops_suggestions WHERE tenant_id = ${tenantId}`)) as unknown as { last_at: Date | null; total: number; pending: number }[];
  const beat = settings.find((s) => s.key === 'worker_heartbeat')?.value ?? '';
  const [reqCount] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(opsClickupRequests)
    .where(and(eq(opsClickupRequests.tenantId, tenantId), gte(opsClickupRequests.requestedAt, new Date(Date.now() - 3600_000))));

  const byKind = (kinds: string[]): LiveRun => {
    const rows = notif.filter((r) => r.kind && kinds.includes(r.kind));
    const failed = rows.reduce((n, r) => n + r.failed, 0);
    const lastOk = rows.map((r) => ms(r.last_ok)).filter((x): x is number => x !== null);
    return {
      label: 'Último envío',
      at: lastOk.length ? Math.max(...lastOk) : null,
      error: failed ? `${failed} fallido${failed === 1 ? '' : 's'} en 7 días: ${rows.find((r) => r.err)?.err ?? 'sin detalle'}` : null,
      note: null
    };
  };

  const worker = getWorkerState();
  const activityErr = setting('client_activity_last_error');
  const runs: Record<string, LiveRun> = {
    watch: {
      label: 'Última pasada',
      at: ms(watch?.lastRunAt),
      error: watch?.lastError ?? null,
      note: watch?.enabled ? null : 'La vigilancia está apagada'
    },
    activity: {
      label: 'Última pasada correcta',
      at: ms(setting('client_activity_last_run')),
      error: activityErr || null,
      note: null
    },
    digest: byKind(['digest']),
    daily: byKind(['daily_summary']),
    reminders: byKind(['reminder']),
    queue: byKind(['new_request', 'daily_summary', 'digest', 'reminder', 'review_request', 'block_alert', 'reply', 'returned']),
    outbox: {
      label: 'Último cambio enviado a ClickUp',
      at: ms(outbox?.last_ok),
      error: outbox?.failed ? `${outbox.failed} fallido${outbox.failed === 1 ? '' : 's'} en 7 días: ${outbox.err ?? 'sin detalle'}` : null,
      note: null
    },
    telegram: {
      label: 'Último sondeo',
      at: ms(tg?.lastPollAt),
      error: tg?.lastError ?? null,
      note: tg ? (tg.testMode ? 'Modo pruebas ACTIVO: todo llega al dueño' : 'Modo pruebas apagado: los avisos van a cada persona') : 'Sin bot configurado'
    },
    scheduler: {
      label: 'En marcha desde',
      at: worker?.since ?? null,
      error: null,
      note: worker ? (worker.role === 'leader' ? 'Este proceso es el líder' : worker.role === 'standby' ? 'En espera: otro proceso es el líder' : 'Arrancando') : 'Proceso de fondo no arrancado'
    },
    cleanup: {
      label: 'Última limpieza lanzada',
      at: ms(cleanup?.last_start),
      error: null,
      note: cleanup ? `${cleanup.running} en curso · ${cleanup.finished} terminadas en total` : null
    },
    startup: {
      label: 'Último aviso «Sistema en marcha»',
      at: ms(startupRow?.last_ok),
      error: startupRow?.failed ? `${startupRow.failed} fallido${startupRow.failed === 1 ? '' : 's'}: ${startupRow.err ?? 'sin detalle'}` : null,
      note: beat ? `Latido del planificador: hace ${Math.max(0, Math.round((Date.now() - Number(beat)) / 1000))} s` : 'Aún sin latido registrado'
    },
    suggestions: {
      label: 'Última sugerencia recibida',
      at: ms(sugg?.last_at),
      error: null,
      note: sugg ? `${sugg.total} en total, ${sugg.pending} aún sin salir en un resumen` : null
    },
    clickup_cache: {
      label: 'Estructura sincronizada',
      at: ms(conn?.structureSyncedAt),
      error: null,
      note: `${reqCount?.n ?? 0} peticiones a ClickUp en la última hora (límite 100 por minuto)`
    }
  };

  const promptRows = await db
    .select({ key: aiPrompts.key, name: aiPrompts.name, active: aiPrompts.isActive })
    .from(aiPrompts)
    .where(inArray(aiPrompts.key, ['ops_transcribe_audio', 'ops_note_to_requests', 'ops_prepare_request', 'ops_blocker_triage', 'ops_client_fill', 'ops_profile_fill']));

  return {
    generatedAt: Date.now(),
    testMode: tg?.testMode ?? true,
    automations,
    runs,
    prompts: Object.fromEntries(promptRows.map((p) => [p.key, { name: p.name, active: p.active }]))
  };
}

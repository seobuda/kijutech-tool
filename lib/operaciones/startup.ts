// Fiabilidad del piloto en local (paso 7): «Sistema en marcha» y latido del planificador.
//  - El planificador anota un latido (ops_settings «worker_heartbeat») en cada vuelta de 30 s.
//  - Al arrancar, el proceso líder avisa al dueño: «Sistema en marcha», cuánto estuvo apagado (por el latido),
//    cuánto de eso cayó en horario laboral del equipo y qué quedó pendiente (avisos y cambios de ClickUp en cola).
import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsSettings } from '@/lib/db/schema';
import { getAuto, num } from '@/lib/operaciones/automations';
import { enqueueNotification } from '@/lib/operaciones/notifications';
import { getOwnerMember, getTelegramConfig } from '@/lib/operaciones/telegram-config';
import { getScheduleMap } from '@/lib/operaciones/team-profiles';
import { workingMinutesBetween } from '@/lib/operaciones/reminders';
import { escapeHtml } from '@/lib/operaciones/telegram';

const KEY_HEARTBEAT = 'worker_heartbeat';

async function getSetting(tenantId: string, key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: opsSettings.value })
    .from(opsSettings)
    .where(and(eq(opsSettings.tenantId, tenantId), eq(opsSettings.key, key)))
    .limit(1);
  return row?.value ?? null;
}

export async function writeHeartbeat(tenantId: string, now = Date.now()): Promise<void> {
  await db
    .insert(opsSettings)
    .values({ tenantId, key: KEY_HEARTBEAT, value: String(now) })
    .onConflictDoUpdate({ target: [opsSettings.tenantId, opsSettings.key], set: { value: String(now), updatedAt: new Date() } });
}

export async function getLastHeartbeat(tenantId: string): Promise<number | null> {
  const beat = await getSetting(tenantId, KEY_HEARTBEAT);
  return beat && /^\d+$/.test(beat) ? Number(beat) : null;
}

export const fmtDuration = (ms: number): string => {
  const min = Math.round(ms / 60000);
  if (min < 1) return `${Math.max(1, Math.round(ms / 1000))} s`;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 48) return m ? `${h} h ${m} min` : `${h} h`;
  return `${Math.round(h / 24)} días`;
};

const fmtWhen = (ms: number) =>
  new Date(ms).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });

// Texto del aviso. `lastBeat` = último latido anterior a este arranque (null = primer arranque).
export async function buildStartupText(tenantId: string, lastBeat: number | null, now = Date.now()): Promise<string> {
  const auto = await getAuto(tenantId, 'startup');
  const cfg = await getTelegramConfig(tenantId);
  const lines: string[] = ['🟢 <b>Sistema en marcha</b>'];
  const downMs = lastBeat ? Math.max(0, now - lastBeat) : null;
  const interrupted = downMs !== null && downMs >= num(auto, 'minDownMin') * 60_000;

  if (downMs === null) {
    lines.push('Primer arranque registrado: a partir de ahora mediré las paradas.');
  } else if (!interrupted) {
    lines.push(`Reinicio rápido (${fmtDuration(downMs)}).`);
  } else {
    lines.push(`Estuvo apagado <b>${fmtDuration(downMs)}</b> (desde el ${escapeHtml(fmtWhen(lastBeat!))} hasta el ${escapeHtml(fmtWhen(now))}).`);
    // ¿Cuánto cayó en horario laboral del equipo? Se cuenta por persona con ficha activa.
    const sched = await getScheduleMap(tenantId);
    const affected: { id: string; min: number }[] = [];
    for (const [id, s] of sched) {
      if (!s.active) continue;
      const min = workingMinutesBetween(s, lastBeat!, now);
      if (min > 0) affected.push({ id, min });
    }
    if (affected.length) {
      const rows = (await db.execute(
        sql`SELECT clickup_user_id AS id, name FROM ops_team_profiles WHERE tenant_id = ${tenantId} AND clickup_user_id IS NOT NULL`
      )) as unknown as { id: string; name: string }[];
      const nameOf = new Map(rows.map((r) => [r.id, r.name]));
      const worst = Math.max(...affected.map((a) => a.min));
      lines.push(
        `⚠️ <b>${fmtDuration(worst * 60_000)}</b> dentro del horario laboral del equipo (${affected
          .map((a) => `${escapeHtml(nameOf.get(a.id) ?? a.id)}: ${fmtDuration(a.min * 60_000)}`)
          .join(', ')}).`
      );
    } else {
      lines.push('Fuera del horario laboral del equipo: no se perdió nada de su jornada.');
    }
  }

  // Qué quedó pendiente: lo que estaba en cola y lo que la vigilancia recogerá.
  const [q] = (await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM ops_notifications WHERE tenant_id = ${tenantId} AND status IN ('pendiente', 'fallido')) AS notifications,
      (SELECT count(*)::int FROM ops_clickup_outbox WHERE tenant_id = ${tenantId} AND status IN ('pendiente', 'fallido')) AS outbox`)) as unknown as {
    notifications: number;
    outbox: number;
  }[];
  const pending: string[] = [];
  if (q?.notifications) pending.push(`${q.notifications} aviso${q.notifications === 1 ? '' : 's'} por enviar`);
  if (q?.outbox) pending.push(`${q.outbox} cambio${q.outbox === 1 ? '' : 's'} por enviar a ClickUp`);
  if (interrupted) pending.push('la vigilancia de ClickUp recogerá en unos minutos lo creado o asignado mientras estuvo parado');
  lines.push(pending.length ? `📬 Pendiente: ${pending.join(' · ')}.` : '📬 No quedó nada pendiente.');
  if (cfg?.testMode) lines.push('🧪 <i>Modo pruebas activo: todos los avisos te llegan a ti.</i>');
  return lines.join('\n');
}

// Se llama una vez por arranque, cuando este proceso es el líder.
export async function sendStartupNotice(tenantId: string): Promise<void> {
  const lastBeat = await getLastHeartbeat(tenantId);
  const now = Date.now();
  const auto = await getAuto(tenantId, 'startup');
  if (auto.enabled) {
    const owner = await getOwnerMember(tenantId);
    await enqueueNotification({
      tenantId,
      kind: 'startup',
      dedupeKey: `startup:${now}`,
      forClickupUserId: owner?.clickupUserId ?? null,
      forName: owner?.username ?? 'Dueño',
      payload: { text: await buildStartupText(tenantId, lastBeat, now), toOwner: true }
    });
  }
  // El latido se escribe DESPUÉS: si el aviso falla, el siguiente intento aún ve el latido anterior.
  await writeHeartbeat(tenantId, now);
}

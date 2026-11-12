import { HEARTBEAT_STALE_S, newestHeartbeatAgeS } from '@/lib/operaciones/health';

export const dynamic = 'force-dynamic';

// Comprobación de vida para el vigilante externo (scripts/watchdog.sh, cron en el servidor) y monitores.
// Pública a propósito y sin datos: solo dice si la app responde, si la base de datos contesta y cuánto
// hace del último latido del planificador. 503 si el planificador está parado.
export async function GET() {
  try {
    const age = await newestHeartbeatAgeS();
    const ok = age !== null && age <= HEARTBEAT_STALE_S;
    return Response.json({ ok, heartbeatAgeS: age }, { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ ok: false, heartbeatAgeS: null }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

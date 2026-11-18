import { HEARTBEAT_STALE_S, newestHeartbeatAgeS } from '@/lib/operaciones/health';

export const dynamic = 'force-dynamic';

// Comprobación de vida para el vigilante externo (scripts/watchdog.sh, cron en el servidor) y monitores.
// Pública a propósito y sin datos: solo dice si la app responde, si la base de datos contesta y cuánto
// hace del último latido del planificador. 503 si el planificador está parado.
export async function GET() {
  try {
    const age = await newestHeartbeatAgeS();
    const ok = age !== null && age <= HEARTBEAT_STALE_S;
    return Response.json({ ok, db: true, heartbeatAgeS: age }, { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    // db: false → el vigilante dice «la base de datos no responde» en vez de «planificador parado» (D12).
    return Response.json({ ok: false, db: false, heartbeatAgeS: null }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

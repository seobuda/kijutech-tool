import 'server-only';

// Módulo Google Ads · comprobación de las páginas de destino con gasto (regla 3; diseño §6 y §6.5). Usa el `safeFetcher`
// del rastreador del núcleo (solo direcciones públicas, sin seguir redirecciones, con tope de tamaño). Una página cuenta
// como caída cuando falla en DOS comprobaciones seguidas con al menos 10 minutos entre ellas (un fallo suelto no avisa).
// 403/429 → «no comprobable» (cortafuegos ante un bot). Las cuentas simuladas NUNCA salen a internet: responden «200».
// Solo lectura: una petición GET a la web del cliente, como haría un visitante.
import { safeFetcher, type Fetcher } from '@/lib/core/crawler';
import { classifyLanding } from '@/lib/ads/finding-rules';
import { SERVICE_HOURS, zonedParts } from '@/lib/ads/rules';
import { landingToCheck, updateLanding } from '@/lib/ads/findings-store';
import { getAccount, markSyncFail, markSyncOk } from '@/lib/ads/store';

export const LANDING_MIN_GAP_MS = 10 * 60_000;
const simFetcher: Fetcher = async () => ({ status: 200, location: null, contentType: 'text/html', xRobots: null, body: null, bytes: 0, ms: 1 });

export async function checkLandings(tenantId: string, accountId: string, opts: { fetcher?: Fetcher; now?: Date; force?: boolean } = {}): Promise<{ checked: number; down: number; skipped?: string }> {
  const acc = await getAccount(tenantId, accountId);
  if (!acc) return { checked: 0, down: 0, skipped: 'esa cuenta ya no existe' };
  const now = opts.now ?? new Date();
  const local = zonedParts(now, acc.timeZone || 'Europe/Madrid');
  if (!opts.force && (local.hour < SERVICE_HOURS.from || local.hour >= SERVICE_HOURS.to)) return { checked: 0, down: 0, skipped: 'fuera del horario de servicio de la cuenta' };
  const fetcher = acc.simulated ? simFetcher : (opts.fetcher ?? safeFetcher);
  let checked = 0;
  let down = 0;
  try {
    for (const u of await landingToCheck(accountId)) {
      const r = await fetcher(u.url);
      const verdict = classifyLanding({ status: r.status, error: r.error ?? null });
      const label = r.status ? String(r.status) : (r.error ?? 'error de red').slice(0, 30);
      checked++;
      if (verdict === 'ok') {
        await updateLanding(u.id, { lastCheckAt: now, lastCheckStatus: label, lastCheckOk: true, consecutiveFailures: 0 });
      } else if (verdict === 'no_comprobable') {
        await updateLanding(u.id, { lastCheckAt: now, lastCheckStatus: `${label} (no comprobable)`.slice(0, 40), lastCheckOk: null, consecutiveFailures: 0 });
      } else {
        // Dos fallos seguidos con ≥ 10 min entre ellos: un fallo a menos de 10 min del anterior no suma.
        const tooSoon = u.lastCheckOk === false && u.lastCheckAt && now.getTime() - u.lastCheckAt.getTime() < LANDING_MIN_GAP_MS;
        if (tooSoon) continue;
        const failures = u.lastCheckOk === false ? u.consecutiveFailures + 1 : 1;
        await updateLanding(u.id, { lastCheckAt: now, lastCheckStatus: label.slice(0, 40), lastCheckOk: false, consecutiveFailures: failures });
        if (failures >= 2) down++;
      }
    }
    await markSyncOk(tenantId, accountId, 'landing', { lastDataDate: local.date });
  } catch (e) {
    await markSyncFail(tenantId, accountId, 'landing', 'Error interno al comprobar las páginas de destino.');
    throw e;
  }
  return { checked, down };
}

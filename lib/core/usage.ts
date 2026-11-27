import 'server-only';

// Núcleo · uso de las pantallas (plan de UX del SEO v2, fase 0, 27 nov 2026): línea base para saber si el rediseño
// funciona (qué pestañas se abren, cuánto, por quién). Solo área, vista y proyecto: nada del contenido. Nunca rompe una
// pantalla (fallo = silencio). Retención 180 días.
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { appUsageEvents } from '@/lib/db/schema';
import { registerRetention } from '@/lib/core/capabilities';

const G = globalThis as unknown as { __kijuUsageSeen?: Map<string, number> };
const DEDUPE_MS = 10 * 60_000;

/** Una visita por persona, vista y proyecto cada 10 min (un refresco o una revalidación tras una acción no cuentan). */
export function logPageView(tenantId: string, userId: number | null, area: string, view: string, scopeId: string | null = null): void {
  const seen = (G.__kijuUsageSeen ??= new Map());
  const key = `${tenantId}:${userId ?? '-'}:${area}:${view}:${scopeId ?? '-'}`;
  const now = Date.now();
  if ((seen.get(key) ?? 0) > now - DEDUPE_MS) return;
  seen.set(key, now);
  if (seen.size > 5000) for (const [k, t] of seen) if (t < now - DEDUPE_MS) seen.delete(k);
  void db
    .insert(appUsageEvents)
    .values({ tenantId, userId, area: area.slice(0, 30), view: view.slice(0, 40), scopeId })
    .catch(() => undefined);
}

/** Visitas por vista de un área en los últimos `days` días (para la línea base y para podar pestañas sin uso). */
export async function usageByView(tenantId: string, area: string, days = 30): Promise<{ view: string; views: number; users: number }[]> {
  const rows = await db
    .select({ view: appUsageEvents.view, views: sql<number>`count(*)::int`, users: sql<number>`count(distinct ${appUsageEvents.userId})::int` })
    .from(appUsageEvents)
    .where(and(eq(appUsageEvents.tenantId, tenantId), eq(appUsageEvents.area, area), gte(appUsageEvents.createdAt, new Date(Date.now() - days * 86_400_000))))
    .groupBy(appUsageEvents.view)
    .orderBy(sql`2 desc`);
  return rows.map((r) => ({ view: r.view, views: Number(r.views), users: Number(r.users) }));
}

let registered = false;
export function registerUsageRetention(): void {
  if (registered) return;
  registered = true;
  registerRetention('núcleo: uso de las pantallas (180 días)', async (tenantId) => {
    const r = await db.delete(appUsageEvents).where(and(eq(appUsageEvents.tenantId, tenantId), lt(appUsageEvents.createdAt, new Date(Date.now() - 180 * 86_400_000)))).returning({ id: appUsageEvents.id });
    return r.length;
  });
}

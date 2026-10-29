import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsClickupConnections, opsClickupRequests } from '@/lib/db/schema';
import { decrypt } from '@/lib/ai/encryption';
import { registerTokenTenant } from '@/lib/operaciones/clickup';

export async function getClickUpConnection(tenantId: string) {
  const [row] = await db
    .select()
    .from(opsClickupConnections)
    .where(eq(opsClickupConnections.tenantId, tenantId))
    .limit(1);
  return row ?? null;
}

// Devuelve el token descifrado SOLO para uso en servidor; nunca se envía al cliente.
export async function getClickUpToken(tenantId: string) {
  const row = await getClickUpConnection(tenantId);
  if (!row) return null;
  const token = decrypt(row.apiKeyEncrypted, row.apiKeyIv);
  // Para que cuFetch sepa de qué cuenta es cada petición (contador y registro).
  registerTokenTenant(token, tenantId);
  return { token, workspaceId: row.workspaceId };
}

export type ClickUpRequestStats = {
  lastHour: number;
  lastMinute: number;
  peakPerMinute: number;
  throttled: number; // respuestas 429 de la última hora
  byEndpoint: { method: string; endpoint: string; count: number; avgMs: number; throttled: number }[];
};

// Peticiones a ClickUp de la última hora (para la tabla de Ajustes).
export async function getClickUpRequestStats(tenantId: string): Promise<ClickUpRequestStats> {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const minuteAgo = new Date(Date.now() - 60 * 1000);
  const mine = and(eq(opsClickupRequests.tenantId, tenantId), gte(opsClickupRequests.requestedAt, hourAgo));

  const [[hour], [minute], peak, byEndpoint] = await Promise.all([
    db
      .select({
        n: sql<number>`count(*)::int`,
        throttled: sql<number>`(count(*) filter (where ${opsClickupRequests.status} = 429))::int`
      })
      .from(opsClickupRequests)
      .where(mine),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(opsClickupRequests)
      .where(and(eq(opsClickupRequests.tenantId, tenantId), gte(opsClickupRequests.requestedAt, minuteAgo))),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(opsClickupRequests)
      .where(mine)
      .groupBy(sql`date_trunc('minute', ${opsClickupRequests.requestedAt})`)
      .orderBy(desc(sql`count(*)`))
      .limit(1),
    db
      .select({
        method: opsClickupRequests.method,
        endpoint: opsClickupRequests.endpoint,
        n: sql<number>`count(*)::int`,
        avgMs: sql<number>`round(avg(${opsClickupRequests.durationMs}))::int`,
        throttled: sql<number>`(count(*) filter (where ${opsClickupRequests.status} = 429))::int`
      })
      .from(opsClickupRequests)
      .where(mine)
      .groupBy(opsClickupRequests.method, opsClickupRequests.endpoint)
      .orderBy(desc(sql`count(*)`))
      .limit(12)
  ]);

  return {
    lastHour: hour?.n ?? 0,
    lastMinute: minute?.n ?? 0,
    peakPerMinute: peak[0]?.n ?? 0,
    throttled: hour?.throttled ?? 0,
    byEndpoint: byEndpoint.map((r) => ({
      method: r.method,
      endpoint: r.endpoint,
      count: r.n,
      avgMs: r.avgMs,
      throttled: r.throttled
    }))
  };
}

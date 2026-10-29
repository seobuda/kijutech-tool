import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsClickupConnections } from '@/lib/db/schema';
import { decrypt } from '@/lib/ai/encryption';

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
  return { token: decrypt(row.apiKeyEncrypted, row.apiKeyIv), workspaceId: row.workspaceId };
}

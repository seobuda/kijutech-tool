import { createHmac, randomBytes } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  opsClickupConnections,
  opsTelegramConfig,
  opsTelegramMembers,
  type OpsTelegramConfig,
  type OpsTelegramMember
} from '@/lib/db/schema';
import { decrypt } from '@/lib/ai/encryption';
import { getStructure } from '@/lib/operaciones/structure';

export const DEFAULT_TEAM_TIMEZONE = 'America/Santo_Domingo';
export const OWNER_TIMEZONE = 'Europe/Madrid';

export async function getTelegramConfig(tenantId: string): Promise<OpsTelegramConfig | null> {
  const [row] = await db
    .select()
    .from(opsTelegramConfig)
    .where(eq(opsTelegramConfig.tenantId, tenantId))
    .limit(1);
  return row ?? null;
}

// Token descifrado: solo para uso en servidor.
export function decodeBotToken(cfg: OpsTelegramConfig): string {
  return decrypt(cfg.botTokenEncrypted, cfg.botTokenIv);
}

// Código de vinculación: aleatorio, no adivinable (22 caracteres url-safe).
export function newLinkCode(): string {
  return randomBytes(16).toString('base64url');
}

export function linkUrl(botUsername: string | null, code: string | null): string | null {
  return botUsername && code ? `https://t.me/${botUsername}?start=${code}` : null;
}

// Garantiza una fila por miembro de ClickUp (de la caché de estructura) y devuelve todas.
// Zona horaria por defecto: Europe/Madrid para el dueño del token, America/Santo_Domingo para el resto.
export async function ensureTelegramMembers(tenantId: string): Promise<OpsTelegramMember[]> {
  const structure = await getStructure(tenantId);
  const existing = await db
    .select()
    .from(opsTelegramMembers)
    .where(eq(opsTelegramMembers.tenantId, tenantId));
  const byUser = new Map(existing.map((m) => [m.clickupUserId, m]));

  const missing = structure.members.filter((m) => !byUser.has(m.id));
  if (missing.length > 0) {
    await db
      .insert(opsTelegramMembers)
      .values(
        missing.map((m) => ({
          tenantId,
          clickupUserId: m.id,
          username: m.username,
          linkCode: newLinkCode(),
          timezone: m.id === structure.meId ? OWNER_TIMEZONE : DEFAULT_TEAM_TIMEZONE
        }))
      )
      .onConflictDoNothing();
  }
  for (const m of structure.members) {
    const cur = byUser.get(m.id);
    if (cur && cur.username !== m.username) {
      await db
        .update(opsTelegramMembers)
        .set({ username: m.username })
        .where(and(eq(opsTelegramMembers.tenantId, tenantId), eq(opsTelegramMembers.clickupUserId, m.id)));
    }
  }

  const rows = await db
    .select()
    .from(opsTelegramMembers)
    .where(eq(opsTelegramMembers.tenantId, tenantId));
  return rows.sort((a, b) => a.username.localeCompare(b.username, 'es'));
}

// El miembro "dueño": el del token de ClickUp (el que recibe todo en modo pruebas).
export async function getOwnerMember(tenantId: string): Promise<OpsTelegramMember | null> {
  const [conn] = await db
    .select({ me: opsClickupConnections.meClickupId })
    .from(opsClickupConnections)
    .where(eq(opsClickupConnections.tenantId, tenantId))
    .limit(1);
  if (!conn?.me) return null;
  const [m] = await db
    .select()
    .from(opsTelegramMembers)
    .where(and(eq(opsTelegramMembers.tenantId, tenantId), eq(opsTelegramMembers.clickupUserId, conn.me)))
    .limit(1);
  return m ?? null;
}

export async function getMemberByUser(
  tenantId: string,
  clickupUserId: string
): Promise<OpsTelegramMember | null> {
  const [m] = await db
    .select()
    .from(opsTelegramMembers)
    .where(and(eq(opsTelegramMembers.tenantId, tenantId), eq(opsTelegramMembers.clickupUserId, clickupUserId)))
    .limit(1);
  return m ?? null;
}

export async function getMemberByChat(
  tenantId: string,
  chatId: number
): Promise<OpsTelegramMember | null> {
  const [m] = await db
    .select()
    .from(opsTelegramMembers)
    .where(and(eq(opsTelegramMembers.tenantId, tenantId), eq(opsTelegramMembers.telegramChatId, chatId)))
    .limit(1);
  return m ?? null;
}

// Secreto del webhook: se deriva de AUTH_SECRET y de la cuenta, así no hay que guardarlo.
// Telegram lo envía en la cabecera X-Telegram-Bot-Api-Secret-Token y la ruta lo comprueba.
export function webhookSecret(tenantId: string): string {
  return createHmac('sha256', process.env.AUTH_SECRET ?? '')
    .update(`telegram-webhook:${tenantId}`)
    .digest('hex')
    .slice(0, 48);
}

'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db/drizzle';
import { opsTelegramConfig, opsTelegramMembers } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { encrypt } from '@/lib/ai/encryption';
import { tg, TelegramError } from '@/lib/operaciones/telegram';
import {
  decodeBotToken,
  ensureTelegramMembers,
  getTelegramConfig,
  newLinkCode,
  webhookSecret
} from '@/lib/operaciones/telegram-config';
import {
  enqueueTestNotification,
  isValidTimezone,
  retryNotification,
  sendDailySummariesNow
} from '@/lib/operaciones/notifications';

type Ok<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (e: unknown, fallback: string): { ok: false; error: string } => ({
  ok: false,
  error: e instanceof Error ? e.message : fallback
});

async function requireUser() {
  const user = await getUser();
  if (!user) throw new Error('No autenticado');
  return user;
}

const refresh = () => revalidatePath('/dashboard/operaciones/ajustes');

// Guarda el token del bot (cifrado, como el de ClickUp) tras comprobarlo con Telegram.
export async function saveTelegramToken(
  token: string
): Promise<Ok<{ botName: string; botUsername: string }>> {
  try {
    const user = await requireUser();
    const clean = token.trim();
    if (!clean) return { ok: false, error: 'Pega el token del bot' };

    const me = await tg<{ id: number; first_name: string; username: string }>(clean, 'getMe');

    const previous = await getTelegramConfig(user.tenantId);
    const { encrypted, iv } = encrypt(clean);
    await db
      .insert(opsTelegramConfig)
      .values({
        tenantId: user.tenantId,
        botTokenEncrypted: encrypted,
        botTokenIv: iv,
        botUsername: me.username,
        botName: me.first_name
      })
      .onConflictDoUpdate({
        target: opsTelegramConfig.tenantId,
        set: {
          botTokenEncrypted: encrypted,
          botTokenIv: iv,
          botUsername: me.username,
          botName: me.first_name,
          lastError: null,
          lastErrorAt: null,
          updatedAt: new Date()
        }
      });

    // Un bot distinto no conoce los chats del anterior: se desvincula a todos con códigos nuevos.
    if (previous && previous.botUsername !== me.username) {
      const members = await db.select().from(opsTelegramMembers).where(eq(opsTelegramMembers.tenantId, user.tenantId));
      for (const m of members) {
        await db
          .update(opsTelegramMembers)
          .set({ telegramChatId: null, telegramUsername: null, linkedAt: null, linkCode: newLinkCode() })
          .where(eq(opsTelegramMembers.id, m.id));
      }
    }
    await ensureTelegramMembers(user.tenantId);
    refresh();
    return { ok: true, botName: me.first_name, botUsername: me.username };
  } catch (e) {
    return fail(e, 'No se pudo guardar el token');
  }
}

// Botón "Probar": pregunta a Telegram quién es el bot.
export async function testTelegram(): Promise<Ok<{ botName: string; botUsername: string }>> {
  try {
    const user = await requireUser();
    const cfg = await getTelegramConfig(user.tenantId);
    if (!cfg) return { ok: false, error: 'Todavía no hay token del bot guardado' };
    const me = await tg<{ first_name: string; username: string }>(decodeBotToken(cfg), 'getMe');
    await db
      .update(opsTelegramConfig)
      .set({ botName: me.first_name, botUsername: me.username })
      .where(eq(opsTelegramConfig.tenantId, user.tenantId));
    refresh();
    return { ok: true, botName: me.first_name, botUsername: me.username };
  } catch (e) {
    return fail(e, 'No se pudo contactar con Telegram');
  }
}

export async function removeTelegramToken(): Promise<Ok> {
  try {
    const user = await requireUser();
    const cfg = await getTelegramConfig(user.tenantId);
    if (cfg && cfg.receiveMode === 'webhook') {
      await tg(decodeBotToken(cfg), 'deleteWebhook', {}).catch(() => undefined);
    }
    await db.delete(opsTelegramConfig).where(eq(opsTelegramConfig.tenantId, user.tenantId));
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo eliminar');
  }
}

export async function setTestMode(enabled: boolean): Promise<Ok> {
  try {
    const user = await requireUser();
    await db
      .update(opsTelegramConfig)
      .set({ testMode: enabled, updatedAt: new Date() })
      .where(eq(opsTelegramConfig.tenantId, user.tenantId));
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo cambiar el modo pruebas');
  }
}

export async function saveMemberSettings(input: {
  clickupUserId: string;
  timezone: string;
  workStart: string;
  dailyEnabled: boolean;
}): Promise<Ok> {
  try {
    const user = await requireUser();
    if (!isValidTimezone(input.timezone)) {
      return { ok: false, error: 'Zona horaria no válida (ej.: America/Santo_Domingo, Europe/Madrid)' };
    }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.workStart)) {
      return { ok: false, error: 'La hora de entrada debe tener formato HH:MM (ej.: 09:00)' };
    }
    await db
      .update(opsTelegramMembers)
      .set({
        timezone: input.timezone,
        workStart: input.workStart,
        dailyEnabled: input.dailyEnabled,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(opsTelegramMembers.tenantId, user.tenantId),
          eq(opsTelegramMembers.clickupUserId, input.clickupUserId)
        )
      );
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo guardar');
  }
}

// Genera un código nuevo (el anterior deja de valer). No desvincula a quien ya esté vinculado.
export async function regenerateLinkCode(clickupUserId: string): Promise<Ok> {
  try {
    const user = await requireUser();
    await db
      .update(opsTelegramMembers)
      .set({ linkCode: newLinkCode(), updatedAt: new Date() })
      .where(
        and(
          eq(opsTelegramMembers.tenantId, user.tenantId),
          eq(opsTelegramMembers.clickupUserId, clickupUserId)
        )
      );
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo generar el enlace');
  }
}

export async function unlinkMember(clickupUserId: string): Promise<Ok> {
  try {
    const user = await requireUser();
    await db
      .update(opsTelegramMembers)
      .set({ telegramChatId: null, telegramUsername: null, linkedAt: null, updatedAt: new Date() })
      .where(
        and(
          eq(opsTelegramMembers.tenantId, user.tenantId),
          eq(opsTelegramMembers.clickupUserId, clickupUserId)
        )
      );
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo desvincular');
  }
}

// Botón "Enviar resumen ahora".
export async function sendDailyNow(): Promise<Ok<{ queued: number; withoutTasks: number }>> {
  try {
    const user = await requireUser();
    const res = await sendDailySummariesNow(user.tenantId);
    refresh();
    return { ok: true, ...res };
  } catch (e) {
    return fail(e, 'No se pudo enviar el resumen');
  }
}

export async function sendTestMessage(): Promise<Ok> {
  try {
    const user = await requireUser();
    await enqueueTestNotification(user.tenantId);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo enviar la prueba');
  }
}

export async function retryFailedNotification(id: string): Promise<Ok> {
  try {
    const user = await requireUser();
    await retryNotification(user.tenantId, id);
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo reintentar');
  }
}

// --- Webhook (para cuando la aplicación esté en un servidor con URL pública) -----------

export async function activateWebhook(publicBaseUrl: string): Promise<Ok> {
  try {
    const user = await requireUser();
    const cfg = await getTelegramConfig(user.tenantId);
    if (!cfg) return { ok: false, error: 'Primero guarda el token del bot' };

    const base = publicBaseUrl.trim().replace(/\/+$/, '');
    if (!/^https:\/\/[^\s/]+/.test(base)) {
      return { ok: false, error: 'Telegram solo admite URLs https públicas (en local no se puede usar webhook)' };
    }
    const url = `${base}/api/telegram/webhook?t=${user.tenantId}`;
    await tg(decodeBotToken(cfg), 'setWebhook', {
      url,
      secret_token: webhookSecret(user.tenantId),
      allowed_updates: ['message', 'callback_query']
    });
    await db
      .update(opsTelegramConfig)
      .set({ receiveMode: 'webhook', webhookUrl: url, lastError: null, lastErrorAt: null, updatedAt: new Date() })
      .where(eq(opsTelegramConfig.tenantId, user.tenantId));
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e instanceof TelegramError ? new Error(`Telegram: ${e.message}`) : e, 'No se pudo activar el webhook');
  }
}

export async function backToPolling(): Promise<Ok> {
  try {
    const user = await requireUser();
    const cfg = await getTelegramConfig(user.tenantId);
    if (!cfg) return { ok: false, error: 'No hay bot configurado' };
    await tg(decodeBotToken(cfg), 'deleteWebhook', { drop_pending_updates: false });
    await db
      .update(opsTelegramConfig)
      .set({ receiveMode: 'polling', webhookUrl: null, updatedAt: new Date() })
      .where(eq(opsTelegramConfig.tenantId, user.tenantId));
    refresh();
    return { ok: true };
  } catch (e) {
    return fail(e, 'No se pudo volver a la consulta periódica');
  }
}

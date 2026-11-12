'use server';

// Acciones web del buzón del agente (paso 3).
//  - Conectar Resend: administración (guarda la clave cifrada y crea el webhook).
//  - Aprobar, corregir o descartar una respuesta propuesta: solo el dueño de «Mi bandeja».
import { revalidatePath } from 'next/cache';
import { requirePermission } from '@/lib/auth/permissions';
import { publicError } from '@/lib/errors';
import { requireInboxOwner } from '@/lib/operaciones/inbox-owner';
import { getClickUpConnection } from '@/lib/operaciones/queries';
import { approveEmailReply, rejectEmailReply } from '@/lib/operaciones/email-agent';
import { connectResend, getEmailConfig, saveWebhookSecret } from '@/lib/operaciones/resend';
import type { Actor } from '@/lib/operaciones/events';

type Ok<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const refresh = () => {
  revalidatePath('/dashboard/operaciones/correos');
  revalidatePath('/dashboard/operaciones/agente');
};

async function ownerActor(tenantId: string): Promise<Actor> {
  const conn = await getClickUpConnection(tenantId);
  return { clickupUserId: conn?.meClickupId ?? null, name: conn?.meUsername ?? 'Operaciones' };
}

export async function getEmailConnectionStatus(): Promise<
  Ok<{ connected: boolean; webhook: boolean; address: string; bcc: string | null }>
> {
  try {
    const user = await requirePermission('admin');
    const cfg = await getEmailConfig(user.tenantId);
    return { ok: true, connected: Boolean(cfg.apiKey), webhook: Boolean(cfg.webhookSecret), address: cfg.address, bcc: cfg.bcc };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo leer la conexión del correo') };
  }
}

export async function connectEmailAction(apiKey: string): Promise<Ok<{ webhook: string }>> {
  try {
    const user = await requirePermission('admin');
    const res = await connectResend(user.tenantId, apiKey, process.env.BASE_URL);
    refresh();
    return { ok: true, webhook: res.webhook };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo conectar el buzón') };
  }
}

export async function saveEmailWebhookSecretAction(secret: string): Promise<Ok> {
  try {
    const user = await requirePermission('admin');
    await saveWebhookSecret(user.tenantId, secret);
    refresh();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo guardar el secreto') };
  }
}

export async function approveEmailReplyAction(
  actionId: string,
  corrected?: string,
  createRequests = true
): Promise<Ok<{ created: number }>> {
  try {
    const user = await requireInboxOwner();
    const text = corrected?.trim() ? corrected.trim().slice(0, 6000) : undefined;
    const res = await approveEmailReply(user.tenantId, actionId, await ownerActor(user.tenantId), 'panel', text, {
      createRequests: Boolean(createRequests)
    });
    refresh();
    revalidatePath('/dashboard/operaciones/encargos');
    return res.ok ? { ok: true, created: res.created ?? 0 } : { ok: false, error: res.reason };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo enviar la respuesta') };
  }
}

export async function rejectEmailReplyAction(actionId: string): Promise<Ok> {
  try {
    const user = await requireInboxOwner();
    const res = await rejectEmailReply(user.tenantId, actionId, await ownerActor(user.tenantId), 'panel');
    refresh();
    return res.ok ? { ok: true } : { ok: false, error: res.reason };
  } catch (e) {
    return { ok: false, error: publicError(e, 'No se pudo descartar la respuesta') };
  }
}

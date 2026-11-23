import 'server-only';

// Puente de Operaciones con las comunicaciones del núcleo (cimientos, 23 nov 2026):
//   - Envío: el núcleo decide qué sale y a quién; aquí se envía por el buzón de la agencia (Resend).
//   - Aprobación: un mensaje pendiente llega al dueño por Telegram con ✅ Enviar / ✖️ Descartar (botones x:cm:…). Si se
//     decide en la web (Para ti), el aviso pierde sus botones y dice qué se hizo.
// El dueño es quien lleva las operaciones (como en Mi bandeja); nadie más puede decidir desde Telegram.
import { registerCommsApprovalNotifier, registerMailSender, registerModuleButtons } from '@/lib/core/capabilities';
import { approveClientMessage, rejectClientMessage } from '@/lib/core/comms';
import { COMMS_KIND_LABELS, type SubscriptionKind } from '@/lib/core/comms-rules';
import { getEmailConfig, sendClientEmail } from '@/lib/operaciones/resend';
import { closeDecidedNotice, enqueueNotification } from '@/lib/operaciones/notifications';
import { getOwnerMember } from '@/lib/operaciones/telegram-config';
import { clampMessage, escapeHtml } from '@/lib/operaciones/telegram';

const noticeKey = (messageId: string) => `cm:prop:${messageId}`;

/** Texto del aviso al dueño (puro, se prueba). */
export function approvalNoticeText(n: { clientName: string; kind: string; subject: string; body: string; author: string }): string {
  const kind = COMMS_KIND_LABELS[n.kind as SubscriptionKind] ?? n.kind;
  const body = n.body.length > 1500 ? `${n.body.slice(0, 1499)}…` : n.body;
  return clampMessage(
    `✉️ <b>Correo a ${escapeHtml(n.clientName)}</b> · ${escapeHtml(kind)}\n<i>Lo ha preparado ${escapeHtml(n.author)}. No sale sin tu aprobación.</i>\n\n<b>${escapeHtml(n.subject)}</b>\n${escapeHtml(body)}`
  );
}

export function registerCommsBridge(): void {
  registerMailSender({
    async send(tenantId, m) {
      const cfg = await getEmailConfig(tenantId);
      const r = await sendClientEmail(cfg, m);
      return { providerId: r.id };
    },
    async domain(tenantId) {
      const cfg = await getEmailConfig(tenantId);
      return cfg.address.split('@')[1] ?? 'kijutech.local';
    }
  });

  registerCommsApprovalNotifier({
    async notify(n) {
      const owner = await getOwnerMember(n.tenantId);
      if (!owner) return;
      await enqueueNotification({
        tenantId: n.tenantId,
        kind: 'digest',
        dedupeKey: noticeKey(n.messageId),
        forClickupUserId: owner.clickupUserId,
        forName: owner.username,
        payload: {
          text: approvalNoticeText(n),
          toOwner: true,
          buttons: [[{ text: '✅ Enviar', data: `x:cm:ok:${n.messageId}` }, { text: '✖️ Descartar', data: `x:cm:no:${n.messageId}` }]]
        }
      });
    },
    decided: (tenantId, messageId, line) => closeDecidedNotice(tenantId, noticeKey(messageId), line)
  });

  registerModuleButtons('cm', {
    async callback(i) {
      if (!i.isOwner) return { answer: 'Este botón es solo de quien lleva las operaciones.', alert: true };
      const m = i.data.match(/^(ok|no):([0-9a-f-]{36})$/);
      if (!m) return { answer: 'Botón no válido.', alert: true };
      const r = m[1] === 'ok' ? await approveClientMessage(i.tenantId, m[2], i.by) : await rejectClientMessage(i.tenantId, m[2], i.by);
      if (!r.ok) return { answer: r.error, alert: true, keyboard: null };
      return { answer: m[1] === 'ok' ? 'Aprobado: sale en un momento.' : 'Descartado.', keyboard: null, reply: m[1] === 'ok' ? '✅ Correo aprobado: sale en un momento.' : '✖️ Correo descartado.' };
    }
  });
}

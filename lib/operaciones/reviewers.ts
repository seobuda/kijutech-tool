// Revisores intercambiables. Cuando una persona entrega un encargo que requiere revisión, el flujo
// llama a requestReview() del revisor del encargo (ops_requests.reviewer_key). Hoy solo existe
// "owner" (quien lleva las operaciones); más adelante se añaden revisores automáticos (por tipo de
// trabajo o por cliente) registrándolos aquí: tendrán que llamar a acceptWork() o returnWork() del
// flujo (workflow.ts) cuando decidan, sin tocar nada más.
import { DEF, getAuto, renderTemplate } from '@/lib/operaciones/automations';
import { escapeHtml } from '@/lib/operaciones/telegram';
import { enqueueNotification } from '@/lib/operaciones/notifications';
import { getOwnerMember } from '@/lib/operaciones/telegram-config';
import { logEvent, type Actor } from '@/lib/operaciones/events';
import type { OpsRequest } from '@/lib/db/schema';

export type ReviewContext = { req: OpsRequest; submittedBy: Actor; note: string | null };

export interface Reviewer {
  key: string;
  label: string;
  requestReview(ctx: ReviewContext): Promise<void>;
}

// Texto de la petición de revisión (lo usan el aviso urgente y la bandeja).
export function reviewText(req: OpsRequest, by: string, note: string | null): string {
  return [
    '👀 <b>Revisión pendiente</b>',
    `<b>${escapeHtml(req.title)}</b>`,
    `Entregado por: ${escapeHtml(by)}`,
    note ? `Enlace o comentario: ${escapeHtml(note)}` : 'Sin enlace ni comentario.',
    req.clickupTaskUrl ? `🔗 <a href="${req.clickupTaskUrl.replace(/"/g, '%22')}">Abrir la tarea</a>` : ''
  ]
    .filter(Boolean)
    .join('\n');
}

const OwnerReviewer: Reviewer = {
  key: 'owner',
  label: 'Yo (quien lleva las operaciones)',
  async requestReview({ req, submittedBy, note }) {
    await logEvent(req.tenantId, {
      requestId: req.id,
      actor: submittedBy,
      type: 'review_requested',
      payload: { reviewer: 'owner', note }
    });
    // Cortafuegos: solo las revisiones urgentes (prioridad 1) llegan al instante. El resto va al
    // resumen de las 13:00 / 18:00 y a «Mi bandeja».
    const urgentAuto = await getAuto(req.tenantId, 'urgent_review');
    if (req.priority !== 1 || !urgentAuto.enabled) return;
    const owner = await getOwnerMember(req.tenantId);
    if (!owner) return;
    await enqueueNotification({
      tenantId: req.tenantId,
      kind: 'review_request',
      dedupeKey: `review:${req.id}:${Date.now()}`,
      forClickupUserId: owner.clickupUserId,
      forName: owner.username,
      requestId: req.id,
      payload: {
        text: renderTemplate(DEF.get('urgent_review')!, urgentAuto.template, { detalle: reviewText(req, submittedBy.name, note) }),
        toOwner: true,
        buttons: [
          [
            { text: '✅ Aceptar', data: `ok:${req.id}` },
            { text: '↩️ Devolver', data: `rt:${req.id}` }
          ]
        ]
      }
    });
  }
};

const REGISTRY: Record<string, Reviewer> = { [OwnerReviewer.key]: OwnerReviewer };

export const REVIEWER_OPTIONS = Object.values(REGISTRY).map((r) => ({ key: r.key, label: r.label }));

export function getReviewer(key: string | null | undefined): Reviewer | null {
  return key ? (REGISTRY[key] ?? null) : null;
}

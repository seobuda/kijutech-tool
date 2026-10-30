// Registro de eventos del flujo (ops_request_events): cada pulsación de botón y cada acción del
// bot, con la persona, el encargo, el tipo de evento y la hora exacta. Solo se guardan; más
// adelante servirán para medir rendimiento y jornada. Nunca lanza: un fallo aquí no debe romper la acción.
import { db } from '@/lib/db/drizzle';
import { opsRequestEvents } from '@/lib/db/schema';

export type Actor = { clickupUserId: string | null; name: string };

export type EventType =
  | 'seen'
  | 'later'
  | 'clickup_closed'
  | 'reassigned'
  | 'mirror_created'
  | 'reminder_sent'
  | 'start'
  | 'blocked'
  | 'done'
  | 'done_review'
  | 'review_requested'
  | 'accepted'
  | 'returned'
  | 'agent_answered'
  | 'escalated'
  | 'owner_replied'
  | 'button_rejected';

export async function logEvent(
  tenantId: string,
  e: { requestId?: string | null; actor?: Actor | null; type: EventType; payload?: Record<string, unknown> }
): Promise<void> {
  try {
    await db.insert(opsRequestEvents).values({
      tenantId,
      requestId: e.requestId ?? null,
      personClickupUserId: e.actor?.clickupUserId ?? null,
      personName: e.actor?.name ?? null,
      eventType: e.type,
      payload: e.payload ?? null
    });
  } catch (err) {
    console.error('[operaciones] no se pudo registrar el evento:', err instanceof Error ? err.message : err);
  }
}

'use client';

// Propuesta de respuesta del agente a un correo de cliente (con el encargo que crearía o la tarea a la que se añadiría).
// La usan la pestaña Correos y Para ti. Lo que se pinta del correo va como TEXTO (React lo escapa), nunca como HTML.
import { useState } from 'react';
import { Bot, ClipboardList, PencilLine, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { InboundEmailDetail } from '@/lib/operaciones/inbound-email-actions';

// Respuesta que propone el agente: se envía tal cual, se corrige antes de enviar o se descarta.
// Nunca sale nada sin pulsar aquí o en Telegram.
export function ReplyProposal({
  proposal,
  disabled,
  onApprove,
  onReject
}: {
  proposal: NonNullable<InboundEmailDetail['pendingReply']>;
  disabled: boolean;
  onApprove: (corrected: string | undefined, createRequests: boolean) => void;
  onReject: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(proposal.answer);
  const areaId = `reply-${proposal.actionId}`;
  const hasAnswer = proposal.answer.trim().length > 0;
  const hasRequests = proposal.requests.length > 0;
  const hasAddTo = Boolean(proposal.addTo);
  const hasWork = hasRequests || hasAddTo;
  const corrected = editing && text.trim() !== proposal.answer.trim() ? text : undefined;
  const mainLabel = hasRequests
    ? hasAnswer
      ? 'Enviar y crear encargo'
      : 'Crear encargo'
    : hasAddTo
      ? hasAnswer
        ? 'Enviar y añadir a la tarea'
        : 'Añadir a la tarea'
      : editing
        ? 'Enviar mi versión'
        : 'Enviar respuesta';
  return (
    <section className="mt-5 rounded-xl border border-brand/30 bg-brand-soft/50 p-4" aria-labelledby={`${areaId}-t`}>
      <h3 id={`${areaId}-t`} className="flex items-center gap-1.5 text-sm font-semibold text-brand">
        <Bot className="size-4" aria-hidden />
        Propuesta del agente
      </h3>
      {hasAnswer ? (
        <>
          <p className="mt-0.5 text-xs text-muted-foreground">
            La respuesta sale desde el buzón del agente al remitente, en el mismo hilo y con copia oculta para ti.
          </p>
          {editing ? (
            <>
              <label htmlFor={areaId} className="sr-only">
                Respuesta corregida
              </label>
              <textarea
                id={areaId}
                rows={8}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="mt-3 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              />
            </>
          ) : (
            <p className="mt-3 whitespace-pre-wrap rounded-lg bg-card px-3 py-2.5 text-sm">{proposal.answer}</p>
          )}
        </>
      ) : (
        <p className="mt-0.5 text-xs text-muted-foreground">No hace falta responder a este correo; solo hay trabajo que hacer.</p>
      )}
      {hasAddTo && proposal.addTo && (
        <div className="mt-3 rounded-lg border bg-card p-3 text-sm">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ClipboardList className="size-3.5" aria-hidden />
            Se añadiría como comentario a la tarea ya creada
          </p>
          <p className="mt-1 font-medium">{proposal.addTo.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{proposal.addTo.note}</p>
        </div>
      )}
      {hasRequests && (
        <div className="mt-3 rounded-lg border bg-card p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ClipboardList className="size-3.5" aria-hidden />
            Encargo que se crearía en ClickUp (y se avisa al responsable)
          </p>
          <ul className="mt-2 space-y-2">
            {proposal.requests.map((r, i) => (
              <li key={i} className="text-sm">
                <p className="font-medium">{r.title}</p>
                <p className="text-xs text-muted-foreground">
                  {r.listName || '—'} · prioridad {r.priority}
                  {r.dueDate ? ` · fecha ${r.dueDate.split('-').reverse().join('/')}` : ''} · responsable{' '}
                  <span className="font-medium text-foreground">{r.assigneeName || 'sin asignar'}</span>
                </p>
                {r.assigneeReason && <p className="text-xs italic text-muted-foreground">{r.assigneeReason}</p>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted-foreground">Para cambiar de responsable, usa «👤 Cambiar responsable» en Telegram.</p>
        </div>
      )}
      {hasWork && hasAnswer && (
        <p className="mt-2 text-xs text-muted-foreground">
          Al aprobar, se añade a la respuesta una línea con lo que se ha hecho de verdad (nunca antes).
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          className="bg-brand text-white hover:bg-brand/90"
          disabled={disabled || (editing && !text.trim())}
          onClick={() => onApprove(corrected, true)}
        >
          <Send aria-hidden />
          {mainLabel}
        </Button>
        {hasWork && hasAnswer && (
          <Button size="sm" variant="outline" disabled={disabled || (editing && !text.trim())} onClick={() => onApprove(corrected, false)}>
            Solo responder
          </Button>
        )}
        {hasAnswer &&
          (!editing ? (
            <Button size="sm" variant="outline" disabled={disabled} onClick={() => setEditing(true)}>
              <PencilLine aria-hidden />
              Corregir
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled}
              onClick={() => {
                setEditing(false);
                setText(proposal.answer);
              }}
            >
              Cancelar corrección
            </Button>
          ))}
        <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={disabled} onClick={onReject}>
          Descartar
        </Button>
      </div>
    </section>
  );
}

'use client';

import { useId, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Clock, CornerDownLeft, ExternalLink, Eye, Inbox, MessageSquare, ShieldAlert, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import { inboxAccept, inboxAnswer, inboxReturn } from '@/lib/operaciones/flow-actions';

export type BandejaItem =
  | {
      kind: 'review';
      id: string;
      title: string;
      person: string;
      note: string | null;
      taskUrl: string | null;
      urgent: boolean;
      wait: string;
    }
  | {
      kind: 'blocker';
      id: string;
      title: string;
      person: string;
      question: string;
      summary: string | null;
      options: string[];
      recommendation: string | null;
      taskUrl: string | null;
      urgent: boolean;
      wait: string;
    };

const areaClass =
  'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand';

export function BandejaList({ items }: { items: BandejaItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="Todo al día"
        description="No tienes nada pendiente. Las revisiones y los bloqueos que necesiten tu decisión aparecerán aquí."
      />
    );
  }
  const reviews = items.filter((i) => i.kind === 'review').length;
  const blockers = items.length - reviews;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{items.length} pendientes</span>
        {reviews > 0 && (
          <Badge tone="info">
            <Eye aria-hidden />
            {reviews} revisión{reviews === 1 ? '' : 'es'}
          </Badge>
        )}
        {blockers > 0 && (
          <Badge tone="warning">
            <ShieldAlert aria-hidden />
            {blockers} bloqueo{blockers === 1 ? '' : 's'}
          </Badge>
        )}
      </div>
      <ul className="space-y-3">
        {items.map((i) => (
          <li key={`${i.kind}:${i.id}`}>
            <ItemCard item={i} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[120px_1fr] sm:gap-3">
      <dt className="text-xs font-medium text-muted-foreground sm:pt-0.5">{label}</dt>
      <dd className="min-w-0 text-sm text-pretty">{children}</dd>
    </div>
  );
}

function ItemCard({ item }: { item: BandejaItem }) {
  const router = useRouter();
  const [mode, setMode] = useState<'idle' | 'return' | 'answer'>('idle');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const areaId = useId();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const res = await fn();
      if (!res.ok) setError(res.error ?? 'Error');
      else {
        setMode('idle');
        setText('');
      }
      router.refresh();
    });

  const isReview = item.kind === 'review';

  return (
    <article
      className={cn(
        'relative overflow-hidden rounded-xl border bg-card shadow-xs',
        item.urgent && 'border-destructive/45'
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute inset-y-0 left-0 w-1',
          item.urgent ? 'bg-destructive' : isReview ? 'bg-info' : 'bg-warning'
        )}
      />
      <div className="space-y-4 p-4 pl-5">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {isReview ? (
                <Badge tone="info">
                  <Eye aria-hidden />
                  Revisión pendiente
                </Badge>
              ) : (
                <Badge tone="warning">
                  <ShieldAlert aria-hidden />
                  Bloqueo que necesita tu decisión
                </Badge>
              )}
              {item.urgent && (
                <Badge tone="danger" dot>
                  Urgente
                </Badge>
              )}
            </div>
            <h3 className="font-medium text-pretty">{item.title}</h3>
            <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
              <span>{item.person}</span>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" aria-hidden />
                espera {item.wait}
              </span>
            </p>
          </div>
          {item.taskUrl && (
            <Button asChild size="sm" variant="ghost" className="self-start text-muted-foreground">
              <a href={item.taskUrl} target="_blank" rel="noopener noreferrer">
                Abrir tarea
                <ExternalLink aria-hidden />
              </a>
            </Button>
          )}
        </header>

        {item.kind === 'review' ? (
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
            {item.note ? (
              <>
                <span className="text-muted-foreground">Enlace o comentario: </span>
                <span className="break-words">{item.note}</span>
              </>
            ) : (
              <span className="text-muted-foreground">Sin enlace ni comentario.</span>
            )}
          </div>
        ) : (
          <dl className="space-y-2.5 rounded-lg bg-muted/50 p-3">
            <Field label="Pregunta">{item.question}</Field>
            {item.summary && <Field label="Resumen">{item.summary}</Field>}
            {item.options.length > 0 && (
              <Field label="Opciones">
                <ul className="ml-4 list-disc space-y-0.5">
                  {item.options.map((o, idx) => (
                    <li key={idx}>{o}</li>
                  ))}
                </ul>
              </Field>
            )}
            {item.recommendation && (
              <Field label="Recomendación">
                <span className="inline-flex items-start gap-1.5">
                  <Sparkles className="mt-0.5 size-3.5 shrink-0 text-brand" aria-hidden />
                  {item.recommendation}
                </span>
              </Field>
            )}
          </dl>
        )}

        {mode === 'idle' ? (
          <div className="flex flex-wrap gap-2">
            {item.kind === 'review' ? (
              <>
                <Button
                  size="sm"
                  className="bg-brand text-white hover:bg-brand/90"
                  disabled={pending}
                  onClick={() => run(() => inboxAccept(item.id))}
                >
                  <Check aria-hidden />
                  Aceptar
                </Button>
                <Button size="sm" variant="outline" disabled={pending} onClick={() => setMode('return')}>
                  <CornerDownLeft aria-hidden />
                  Devolver
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                className="bg-brand text-white hover:bg-brand/90"
                disabled={pending}
                onClick={() => setMode('answer')}
              >
                <MessageSquare aria-hidden />
                Responder
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <label htmlFor={areaId} className="text-xs font-medium text-muted-foreground">
              {mode === 'return' ? 'Motivo de la devolución (obligatorio)' : 'Tu respuesta para la persona'}
            </label>
            <textarea
              id={areaId}
              rows={3}
              className={areaClass}
              placeholder={mode === 'return' ? 'Motivo de la devolución (obligatorio)' : 'Tu respuesta para la persona'}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="bg-brand text-white hover:bg-brand/90"
                disabled={pending || !text.trim()}
                onClick={() =>
                  run(() => (mode === 'return' ? inboxReturn(item.id, text) : inboxAnswer(item.id, text)))
                }
              >
                {mode === 'return' ? 'Devolver con este motivo' : 'Enviar respuesta'}
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => setMode('idle')}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </article>
  );
}

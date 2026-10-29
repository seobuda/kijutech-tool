'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
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
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500';

export function BandejaList({ items }: { items: BandejaItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center space-y-1">
        <p className="font-medium">No tienes nada pendiente 🎉</p>
        <p className="text-sm text-muted-foreground">
          Las revisiones y los bloqueos que necesiten tu decisión aparecerán aquí.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {items.map((i) => (
        <ItemCard key={`${i.kind}:${i.id}`} item={i} />
      ))}
    </div>
  );
}

function ItemCard({ item }: { item: BandejaItem }) {
  const router = useRouter();
  const [mode, setMode] = useState<'idle' | 'return' | 'answer'>('idle');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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

  return (
    <div className={`rounded-lg border bg-white p-4 space-y-3 ${item.urgent ? 'border-red-300' : 'border-gray-200'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">
            {item.kind === 'review' ? '👀 Revisión pendiente' : '🚫 Bloqueo que necesita tu decisión'}
            {item.urgent && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-red-700">Urgente</span>}
          </p>
          <p className="font-medium">{item.title}</p>
          <p className="text-xs text-muted-foreground">
            {item.person} · espera {item.wait}
            {item.taskUrl && (
              <>
                {' · '}
                <a href={item.taskUrl} target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">
                  Abrir tarea
                </a>
              </>
            )}
          </p>
        </div>
      </div>

      {item.kind === 'review' ? (
        <p className="text-sm">
          {item.note ? (
            <>
              <span className="text-muted-foreground">Enlace o comentario: </span>
              {item.note}
            </>
          ) : (
            <span className="text-muted-foreground">Sin enlace ni comentario.</span>
          )}
        </p>
      ) : (
        <div className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">Pregunta: </span>
            {item.question}
          </p>
          {item.summary && (
            <p>
              <span className="text-muted-foreground">Resumen: </span>
              {item.summary}
            </p>
          )}
          {item.options.length > 0 && (
            <div>
              <p className="text-muted-foreground">Opciones:</p>
              <ul className="list-disc ml-5">
                {item.options.map((o, idx) => (
                  <li key={idx}>{o}</li>
                ))}
              </ul>
            </div>
          )}
          {item.recommendation && (
            <p>
              <span className="text-muted-foreground">Recomendación: </span>
              {item.recommendation}
            </p>
          )}
        </div>
      )}

      {mode === 'idle' ? (
        <div className="flex flex-wrap gap-2">
          {item.kind === 'review' ? (
            <>
              <Button size="sm" disabled={pending} onClick={() => run(() => inboxAccept(item.id))}>
                ✅ Aceptar
              </Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => setMode('return')}>
                ↩️ Devolver
              </Button>
            </>
          ) : (
            <Button size="sm" disabled={pending} onClick={() => setMode('answer')}>
              💬 Responder
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            rows={3}
            className={areaClass}
            placeholder={mode === 'return' ? 'Motivo de la devolución (obligatorio)' : 'Tu respuesta para la persona'}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
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
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

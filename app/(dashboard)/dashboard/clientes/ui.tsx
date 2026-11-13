'use client';

// Piezas comunes de la sección Clientes: estilos, mensajes, bloques de formulario, confirmación de borrado y un
// ayudante para ejecutar acciones del servidor mostrando el resultado.
import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const focusRing = 'focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/40 focus-visible:border-brand';
export const areaClass = cn('w-full rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground', focusRing);
export const selectClass = cn('h-9 rounded-md border border-input bg-card px-2.5 text-sm shadow-xs', focusRing);
export const checkClass = 'size-4 shrink-0 rounded accent-[var(--brand)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand';
export const brandBtn = 'bg-brand text-white hover:bg-brand/90';
export const dangerGhost = 'text-muted-foreground hover:bg-destructive-soft hover:text-destructive';
export const fieldHint = 'text-xs text-muted-foreground';

export type Msg = { type: 'ok' | 'error'; text: string } | null;
export type Result = { ok: boolean; error?: string };

export function MsgLine({ msg, className }: { msg: Msg; className?: string }) {
  if (!msg) return null;
  return (
    <p
      role={msg.type === 'error' ? 'alert' : 'status'}
      className={cn('inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm', msg.type === 'ok' ? 'bg-success-soft text-success' : 'bg-destructive-soft text-destructive', className)}
    >
      {msg.type === 'ok' ? <Check className="size-3.5" aria-hidden /> : <AlertTriangle className="size-3.5" aria-hidden />}
      {msg.text}
    </p>
  );
}

/** Bloque de formulario: título y explicación a la izquierda (en pantallas anchas) y campos a la derecha. */
export function FormSection({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="m-0 grid min-w-0 gap-4 border-0 border-t px-4 py-5 first:border-t-0 sm:px-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-8">
      <legend className="sr-only">{title}</legend>
      <div aria-hidden>
        <p className="text-sm font-semibold">{title}</p>
        {description && <p className="mt-1 text-xs text-muted-foreground text-pretty">{description}</p>}
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </fieldset>
  );
}

/** Botón «Eliminar» que pide confirmación en línea (sin ventanas del navegador). */
export function ConfirmDelete({ what, disabled, onConfirm, label = 'Eliminar' }: { what: string; disabled?: boolean; onConfirm: () => void; label?: string }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button size="sm" variant="ghost" className={dangerGhost} disabled={disabled} onClick={() => setAsking(true)}>
        <Trash2 aria-hidden />
        {label}
      </Button>
    );
  }
  return (
    <span role="group" aria-label="Confirmar eliminación" className="flex flex-wrap items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive-soft px-2 py-1 text-sm text-destructive">
      ¿Eliminar {what}?
      <Button
        size="sm"
        variant="destructive"
        disabled={disabled}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        Sí, eliminar
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
        No
      </Button>
    </span>
  );
}

/** Ejecuta una acción del servidor, enseña el resultado y refresca la página. */
export function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const run = (fn: () => Promise<Result>, okText: string, after?: () => void) =>
    start(async () => {
      setMsg(null);
      const res = await fn();
      if (!res.ok) {
        setMsg({ type: 'error', text: res.error ?? 'No se pudo completar' });
        return;
      }
      setMsg({ type: 'ok', text: okText });
      after?.();
      router.refresh();
    });
  return { run, pending, msg, setMsg };
}

/** Texto de un campo opcional: «—» si está vacío. */
export const orDash = (v: string | null | undefined) => (v && v.trim() ? v : '—');

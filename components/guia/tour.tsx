'use client';

// Visita guiada (fase 5 UX, 21 nov 2026): una ventanita anclada a cada parte de la pantalla, con Atrás, Siguiente y
// Saltar. Siguiendo la guía de Chrome «persistent-app-tours»: <dialog popover="manual"> con su título, el foco dentro al
// abrirse, el resto de la aplicación inerte durante la visita y anclaje con CSS Anchor Positioning (si el navegador no
// lo admite, la ventanita queda abajo en el centro). Un recuadro ilumina el elemento que se explica.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import type { TourStep } from './steps';

const PAD = 6;
const ANCHOR = '--tour-target';

export function Tour({ steps, onClose }: { steps: TourStep[]; onClose: (finished: boolean) => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const step = steps[i];
  const last = i === steps.length - 1;
  const target = step?.target ? (document.querySelector(step.target) as HTMLElement | null) : null;

  const close = useCallback(
    (finished: boolean) => {
      try {
        dialog.current?.hidePopover();
      } catch {
        /* ya cerrada */
      }
      onClose(finished);
    },
    [onClose]
  );

  // El resto de la aplicación, inerte mientras dura la visita (la ventanita va fuera, en el body).
  useEffect(() => {
    const app = document.getElementById('app-root');
    if (app) app.inert = true;
    try {
      dialog.current?.showPopover();
    } catch {
      /* sin Popover API: se ve igual, como bloque fijo */
    }
    // Obligatorio (guía de Chrome): llevar el foco dentro en cuanto se abre, al botón principal.
    nextBtn.current?.focus();
    return () => {
      if (app) app.inert = false;
      document.querySelectorAll<HTMLElement>('[data-tour-anchor]').forEach((el) => {
        el.style.removeProperty('anchor-name');
        el.removeAttribute('data-tour-anchor');
      });
    };
  }, []);

  // En cada paso: anclar la ventanita al elemento, llevarlo a la vista, medirlo para el recuadro y mover el foco dentro.
  useLayoutEffect(() => {
    document.querySelectorAll<HTMLElement>('[data-tour-anchor]').forEach((el) => {
      el.style.removeProperty('anchor-name');
      el.removeAttribute('data-tour-anchor');
    });
    if (target) {
      target.style.setProperty('anchor-name', ANCHOR);
      target.setAttribute('data-tour-anchor', '');
      target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      setRect(target.getBoundingClientRect());
    } else {
      setRect(null);
    }
    nextBtn.current?.focus();
  }, [target, i]);

  // El recuadro sigue al elemento si cambia el tamaño de la ventana o se desplaza algo.
  useEffect(() => {
    if (!target) return;
    const update = () => setRect(target.getBoundingClientRect());
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [target]);

  // Teclado: Esc sale; flechas para avanzar y volver.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (last) close(true);
        else setI((n) => n + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setI((n) => Math.max(0, n - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close, last]);

  if (!step) return null;

  return createPortal(
    <>
      {/* Oscurece todo menos el elemento que se explica. */}
      <div
        aria-hidden
        className="pointer-events-none fixed z-[60] rounded-xl ring-2 ring-brand transition-all duration-200 ease-out"
        style={
          rect
            ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2, boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.5)' }
            : { inset: 0, boxShadow: 'none', background: 'rgb(0 0 0 / 0.5)', borderRadius: 0, outline: 'none' }
        }
      />
      <dialog
        ref={dialog}
        popover="manual"
        role="dialog"
        aria-labelledby="guia-titulo"
        aria-describedby="guia-texto"
        data-anchored={target ? 'true' : undefined}
        data-placement={step.placement ?? 'right'}
        className="tour-step w-[min(22rem,calc(100vw-2rem))] rounded-xl border bg-popover p-4 text-popover-foreground shadow-xl"
      >
        <p className="text-xs font-medium text-muted-foreground tabular-nums">
          Paso {i + 1} de {steps.length}
        </p>
        <h2 id="guia-titulo" className="mt-1 text-base font-semibold text-balance">
          {step.title}
        </h2>
        <p id="guia-texto" className="mt-1.5 text-sm text-muted-foreground text-pretty">
          {step.body}
        </p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" onClick={() => close(false)} className="rounded-md px-2 py-1 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
            Saltar
          </button>
          <div className="flex gap-2">
            {i > 0 && (
              <button
                type="button"
                onClick={() => setI((n) => n - 1)}
                className="h-9 rounded-lg border px-3 text-sm font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
              >
                Atrás
              </button>
            )}
            <button
              ref={nextBtn}
              type="button"
              onClick={() => (last ? close(true) : setI((n) => n + 1))}
              className={cn('h-9 rounded-lg bg-brand px-3 text-sm font-medium text-white hover:bg-brand/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring')}
            >
              {last ? 'Terminar' : 'Siguiente'}
            </button>
          </div>
        </div>
      </dialog>
    </>,
    document.body
  );
}

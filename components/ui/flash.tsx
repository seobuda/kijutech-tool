'use client';

// Aviso breve de «hecho» que sobrevive al refresco de la página (23 nov 2026). En Para ti, al decidir algo la tarjeta
// desaparece al momento y su mensaje con ella; este aviso queda unos segundos abajo para confirmar qué se hizo.
// Solo actúa dentro de <FlashScope>: fuera, useFlash() devuelve una función que no hace nada.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, X } from 'lucide-react';

const FlashCtx = createContext<((text: string) => void) | null>(null);

const SHOW_MS = 5000;

/** Función para mostrar el aviso (o nada, fuera de un FlashScope). */
export function useFlash(): (text: string) => void {
  return useContext(FlashCtx) ?? noop;
}
const noop = () => undefined;

export function FlashScope({ children }: { children: ReactNode }) {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((t: string) => {
    setText(t);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setText(null), SHOW_MS);
  }, []);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <FlashCtx.Provider value={show}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex justify-center sm:inset-x-auto sm:right-6">
        {text && (
          <p className="pointer-events-auto flex max-w-md items-center gap-2 rounded-lg border border-success/30 bg-card px-3.5 py-2.5 text-sm shadow-lg" data-testid="flash">
            <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden />
            <span className="min-w-0 flex-1">{text}</span>
            <button type="button" onClick={() => setText(null)} className="rounded p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring" aria-label="Cerrar aviso">
              <X className="size-3.5" aria-hidden />
            </button>
          </p>
        )}
      </div>
    </FlashCtx.Provider>
  );
}

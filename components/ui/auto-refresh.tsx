'use client';

// Actualización automática de las pantallas que muestran trabajo que llega solo (correos, bandeja,
// encargos, agente). Consulta cada pocos segundos SOLO mientras la pestaña está visible, y una vez al
// volver a ella. Son consultas ligeras a la base de datos (nunca a ClickUp ni a Resend).
// Se eligió esto frente a una conexión permanente (SSE/websockets) por simplicidad con el volumen actual.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

export function useAutoRefresh(fn: () => void | Promise<void>, everyMs: number, enabled = true) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (!enabled) return;
    let running = false;
    const tick = async () => {
      if (running || document.visibilityState !== 'visible') return;
      running = true;
      try {
        await fnRef.current();
      } finally {
        running = false;
      }
    };
    const id = window.setInterval(() => void tick(), everyMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [everyMs, enabled]);
}

/** Indicador «En directo · actualizado hace X s». */
export function LiveIndicator({ updatedAt, className }: { updatedAt: number | null; className?: string }) {
  const [, setNow] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setNow((n) => n + 1), 5_000);
    return () => window.clearInterval(id);
  }, []);
  const secs = updatedAt ? Math.max(0, Math.round((Date.now() - updatedAt) / 1000)) : null;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)} aria-live="off">
      <span className="relative flex size-2" aria-hidden>
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
        <span className="relative inline-flex size-2 rounded-full bg-success" />
      </span>
      En directo
      {secs !== null && <span>· actualizado {secs < 5 ? 'ahora' : `hace ${secs < 60 ? `${secs} s` : `${Math.round(secs / 60)} min`}`}</span>}
    </span>
  );
}

/**
 * Para páginas que se pintan en el servidor (Mi bandeja, Encargos, Agente): vuelve a pedir los datos
 * cada `everyMs` con router.refresh(). El estado de los formularios abiertos se conserva.
 */
export function AutoRefresh({ everyMs = 20_000, className }: { everyMs?: number; className?: string }) {
  const router = useRouter();
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  useEffect(() => setUpdatedAt(Date.now()), []);
  useAutoRefresh(() => {
    router.refresh();
    setUpdatedAt(Date.now());
  }, everyMs);
  return <LiveIndicator updatedAt={updatedAt} className={className} />;
}

'use client';

import { useEffect } from 'react';

// Envía al registro central de errores (POST /api/errores) los fallos del navegador: errores de JavaScript y promesas
// rechazadas sin capturar. Como mucho uno igual por minuto y 20 por carga de página, para no inundar nada.
const sent = new Map<string, number>();
let total = 0;

export function sendClientError(kind: string, message: string, stack?: string | null, digest?: string | null) {
  if (typeof window === 'undefined' || !message) return;
  const key = `${kind}|${message.slice(0, 200)}`;
  const now = Date.now();
  if ((sent.get(key) ?? 0) > now - 60_000 || total >= 20) return;
  sent.set(key, now);
  total++;
  try {
    void fetch('/api/errores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, message: message.slice(0, 2000), stack: stack?.slice(0, 6000) ?? null, digest: digest ?? null, path: window.location.pathname }),
      keepalive: true
    }).catch(() => undefined);
  } catch {
    /* informar de un error nunca rompe la pantalla */
  }
}

export function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      // Errores de scripts de otros dominios (extensiones del navegador) llegan sin detalle: no aportan nada.
      if (!e.message || e.message === 'Script error.') return;
      sendClientError('javascript', e.message, e.error instanceof Error ? e.error.stack : `${e.filename}:${e.lineno}:${e.colno}`);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason;
      sendClientError('promesa', r instanceof Error ? r.message : String(r ?? 'promesa rechazada'), r instanceof Error ? r.stack : null);
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
  return null;
}

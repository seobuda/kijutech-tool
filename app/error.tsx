'use client';

import Link from 'next/link';
import { CircleIcon } from 'lucide-react';

// Página de error genérica: nunca muestra el detalle técnico (eso queda solo en los logs
// del servidor; `error.digest` es el código para localizarlo allí).
export default function ErrorPage({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center min-h-[100dvh]">
      <div className="max-w-md space-y-6 p-4 text-center">
        <div className="flex justify-center">
          <CircleIcon className="size-12 text-brand" />
        </div>
        <h1 className="text-3xl font-bold text-foreground tracking-tight">Algo ha fallado</h1>
        <p className="text-base text-muted-foreground">
          No hemos podido completar la acción. Inténtalo de nuevo y, si sigue pasando, avisa al
          administrador{error.digest ? ` indicando este código: ${error.digest}` : ''}.
        </p>
        <div className="flex justify-center gap-3">
          <button
            onClick={reset}
            className="py-2 px-4 rounded-full text-sm font-medium text-white bg-brand hover:bg-brand/90"
          >
            Reintentar
          </button>
          <Link
            href="/dashboard"
            className="py-2 px-4 border border-input rounded-full text-sm font-medium text-foreground/80 bg-card hover:bg-muted"
          >
            Ir al panel
          </Link>
        </div>
      </div>
    </div>
  );
}

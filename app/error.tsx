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
          <CircleIcon className="size-12 text-orange-500" />
        </div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Algo ha fallado</h1>
        <p className="text-base text-gray-500">
          No hemos podido completar la acción. Inténtalo de nuevo y, si sigue pasando, avisa al
          administrador{error.digest ? ` indicando este código: ${error.digest}` : ''}.
        </p>
        <div className="flex justify-center gap-3">
          <button
            onClick={reset}
            className="py-2 px-4 rounded-full text-sm font-medium text-white bg-orange-600 hover:bg-orange-700"
          >
            Reintentar
          </button>
          <Link
            href="/dashboard"
            className="py-2 px-4 border border-gray-300 rounded-full text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            Ir al panel
          </Link>
        </div>
      </div>
    </div>
  );
}

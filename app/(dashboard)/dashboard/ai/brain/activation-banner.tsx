'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function ActivationBanner({ label }: { label: string }) {
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2">
      <p className="text-sm text-amber-800">
        El {label} está listo. ¿Activarlo?
      </p>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          onClick={() => setMessage('Función disponible en próxima versión')}
        >
          Activar
        </Button>
        {message && <p className="text-xs text-amber-800">{message}</p>}
      </div>
    </div>
  );
}

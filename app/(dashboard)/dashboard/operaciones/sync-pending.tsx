'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { syncClickUpNow } from '@/lib/operaciones/actions';

// La estructura de ClickUp (espacios, listas, miembros) vive en la base de datos.
// Si todavía no se ha sincronizado nunca (p. ej. justo tras pegar el token), se
// espera unos segundos recargando sola, o se puede sincronizar a mano.
export function SyncPending({ reason }: { reason: 'never' | 'no-spaces' }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (reason !== 'never') return;
    // Comprueba cada 3 s durante un minuto si la sincronización en segundo plano ya terminó.
    let n = 0;
    const id = setInterval(() => {
      if (++n > 20) clearInterval(id);
      else router.refresh();
    }, 3000);
    return () => clearInterval(id);
  }, [reason, router]);

  const sync = () =>
    startTransition(async () => {
      setError(null);
      const res = await syncClickUpNow();
      if (!res.ok) setError(res.error);
      router.refresh();
    });

  if (reason === 'no-spaces') {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center space-y-3">
        <p className="font-medium">No hay espacios seleccionados</p>
        <p className="text-sm text-muted-foreground">
          Elige en Ajustes qué espacios de ClickUp se sincronizan para que aparezcan aquí.
        </p>
        <Link
          href="/dashboard/operaciones/ajustes"
          className="inline-block rounded-full bg-orange-500 px-4 py-2 text-sm text-white hover:bg-orange-600"
        >
          Ir a Ajustes ClickUp
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center space-y-3">
      <p className="font-medium">Sincronizando la estructura de ClickUp por primera vez…</p>
      <p className="text-sm text-muted-foreground">
        Se guardan espacios, listas y miembros para que las pantallas abran al instante. Tarda unos
        segundos; esta página se actualiza sola.
      </p>
      <Button onClick={sync} disabled={pending}>
        {pending ? 'Sincronizando…' : 'Sincronizar ahora'}
      </Button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

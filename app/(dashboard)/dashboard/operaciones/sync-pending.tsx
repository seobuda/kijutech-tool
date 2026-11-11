'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FolderKanban, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/page';
import { cn } from '@/lib/utils';
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
      <EmptyState
        icon={FolderKanban}
        title="No hay espacios seleccionados"
        description="Elige en Ajustes qué espacios de ClickUp se sincronizan para que aparezcan aquí."
        action={
          <Button asChild className="bg-brand text-white hover:bg-brand/90">
            <Link href="/dashboard/operaciones/ajustes">Ir a Ajustes ClickUp</Link>
          </Button>
        }
      />
    );
  }

  return (
    <EmptyState
      icon={RefreshCw}
      title="Sincronizando la estructura de ClickUp por primera vez…"
      description="Se guardan espacios, listas y miembros para que las pantallas abran al instante. Tarda unos segundos; esta página se actualiza sola."
      action={
        <div className="flex flex-col items-center gap-2">
          <Button onClick={sync} disabled={pending} className="bg-brand text-white hover:bg-brand/90">
            <RefreshCw className={cn(pending && 'animate-spin')} aria-hidden />
            {pending ? 'Sincronizando…' : 'Sincronizar ahora'}
          </Button>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      }
    />
  );
}

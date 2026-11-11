'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Brush, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import { sendCleanupAction } from '@/lib/operaciones/cleanup-actions';

export type CleanupPersonView = {
  id: string;
  name: string;
  status: { status: string; reviewed: number; total: number; at: number } | null;
};

const when = (ms: number) =>
  new Date(ms).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });

function statusLabel(s: CleanupPersonView['status']): string {
  if (!s) return 'Sin limpiezas todavía';
  if (s.status === 'en_curso') return `En curso: ${s.reviewed} de ${s.total} revisadas (desde ${when(s.at)})`;
  return `Última: ${s.reviewed} de ${s.total} revisadas · ${s.status === 'parada' ? 'parada' : 'completada'} ${when(s.at)}`;
}

// Botones de la limpieza de vencidas: a una persona o a todas. Se usa en Equipo y en Automatizaciones.
export function CleanupPanel({ people, testMode }: { people: CleanupPersonView[]; testMode: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [asking, setAsking] = useState<string | null>(null); // persona o 'all' esperando confirmación

  const send = (target: string) =>
    startTransition(async () => {
      setMsg(null);
      setAsking(null);
      const r = await sendCleanupAction(target);
      setMsg(r.ok ? { type: 'ok', text: r.message } : { type: 'error', text: r.error });
      router.refresh();
    });

  return (
    <section className="rounded-xl border bg-card shadow-xs" data-testid="limpieza-panel" aria-labelledby="limpieza-titulo">
      <div className="flex flex-col gap-3 border-b px-4 py-3.5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand" aria-hidden>
            <Brush className="size-4" />
          </span>
          <div className="min-w-0">
            <p id="limpieza-titulo" className="flex flex-wrap items-center gap-2 text-sm font-semibold">
              Limpieza de vencidas
              {testMode && <Badge tone="warning">Modo pruebas</Badge>}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground text-pretty">
              El bot envía a cada persona sus tareas vencidas de una en una (cerrar, nueva fecha o descartar).
              {testMode && ' Modo pruebas: todo te llega a ti y las tareas de otras personas se simulan sin tocar ClickUp.'}
            </p>
          </div>
        </div>
        {asking === 'all' ? (
          <span className="flex shrink-0 flex-wrap items-center gap-2 text-sm" role="alert">
            ¿Enviar a todas?
            <Button
              size="sm"
              className="bg-brand text-white hover:bg-brand/90"
              disabled={pending}
              onClick={() => send('all')}
              data-testid="limpieza-todas-confirmar"
            >
              Sí, enviar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAsking(null)}>
              No
            </Button>
          </span>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 self-start"
            disabled={pending || people.length === 0}
            onClick={() => setAsking('all')}
            data-testid="limpieza-todas"
          >
            <Send aria-hidden />
            Enviar limpieza de vencidas a todas
          </Button>
        )}
      </div>
      <div className="px-4 py-2">
        {people.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">No hay fichas activas de equipo con miembro de ClickUp.</p>
        ) : (
          <ul className="divide-y text-sm">
            {people.map((p) => (
              <li
                key={p.id}
                className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                data-testid={`limpieza-${p.name}`}
              >
                <div className="min-w-0">
                  <span className="flex items-center gap-2 font-medium">
                    <span
                      aria-hidden
                      className={cn(
                        'size-2 shrink-0 rounded-full',
                        p.status?.status === 'en_curso' ? 'bg-info' : p.status ? 'bg-success' : 'bg-muted-foreground/40'
                      )}
                    />
                    {p.name}
                  </span>
                  <span className="mt-0.5 block pl-4 text-xs text-muted-foreground">{statusLabel(p.status)}</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 self-start sm:self-auto"
                  disabled={pending}
                  onClick={() => send(p.id)}
                  data-testid={`limpieza-enviar-${p.name}`}
                >
                  {p.status?.status === 'en_curso' ? 'Reenviar desde cero' : 'Enviar limpieza de vencidas'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {(pending || msg) && (
        <div className="space-y-1 border-t px-4 py-2.5">
          {pending && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
              <span className="inline-block size-3 animate-spin rounded-full border-2 border-brand/70 border-t-transparent" />
              Consultando ClickUp y preparando los mensajes…
            </p>
          )}
          {msg && (
            <p
              role="status"
              className={`text-xs ${msg.type === 'ok' ? 'text-success' : 'text-destructive'}`}
              data-testid="limpieza-msg"
            >
              {msg.text}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

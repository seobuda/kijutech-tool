'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
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
    <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3" data-testid="limpieza-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Limpieza de vencidas</p>
          <p className="text-xs text-muted-foreground">
            El bot envía a cada persona sus tareas vencidas de una en una (cerrar, nueva fecha o descartar).
            {testMode && ' Modo pruebas: todo te llega a ti y las tareas de otras personas se simulan sin tocar ClickUp.'}
          </p>
        </div>
        {asking === 'all' ? (
          <span className="flex items-center gap-2 text-sm">
            ¿Enviar a todas?
            <Button size="sm" disabled={pending} onClick={() => send('all')} data-testid="limpieza-todas-confirmar">Sí, enviar</Button>
            <Button size="sm" variant="ghost" onClick={() => setAsking(null)}>No</Button>
          </span>
        ) : (
          <Button size="sm" variant="outline" disabled={pending || people.length === 0} onClick={() => setAsking('all')} data-testid="limpieza-todas">
            Enviar limpieza de vencidas a todas
          </Button>
        )}
      </div>
      {people.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay fichas activas de equipo con miembro de ClickUp.</p>
      ) : (
        <ul className="divide-y divide-gray-200 text-sm">
          {people.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5" data-testid={`limpieza-${p.name}`}>
              <div>
                <span className="font-medium">{p.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">{statusLabel(p.status)}</span>
              </div>
              <Button size="sm" variant="outline" disabled={pending} onClick={() => send(p.id)} data-testid={`limpieza-enviar-${p.name}`}>
                {p.status?.status === 'en_curso' ? 'Reenviar desde cero' : 'Enviar limpieza de vencidas'}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {pending && <p className="text-xs text-muted-foreground">Consultando ClickUp y preparando los mensajes…</p>}
      {msg && <p className={`text-xs ${msg.type === 'ok' ? 'text-green-700' : 'text-red-600'}`} data-testid="limpieza-msg">{msg.text}</p>}
    </div>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { setClickupWatch } from '@/lib/operaciones/watch-actions';

type Props = {
  enabled: boolean;
  activatedAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
  unlinked: { id: string; name: string; tasks: number }[];
};

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Europe/Madrid' }) : '—';

export function VigilanciaAjustes({ enabled, activatedAt, lastRunAt, lastError, unlinked }: Props) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = () =>
    startTransition(async () => {
      setMsg(null);
      const res = await setClickupWatch(!enabled);
      setMsg(res.ok ? { ok: true, text: res.message } : { ok: false, text: res.error });
      router.refresh();
    });

  return (
    <Card className="max-w-5xl">
      <CardHeader>
        <CardTitle>Vigilar ClickUp</CardTitle>
        <CardDescription>
          Cada 2-3 minutos, una sola consulta a ClickUp busca tareas creadas o asignadas allí directamente. Si una tarea
          nueva (o recién reasignada) tiene como responsable a un miembro con Telegram vinculado, se crea un encargo
          «espejo» y esa persona recibe el aviso con los botones. Las tareas anteriores a la activación no avisan, ni
          las que alguien se crea y se asigna a sí mismo. Si se cierra una tarea en ClickUp, su encargo se completa.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant={enabled ? 'outline' : 'default'} disabled={pending} onClick={toggle}>
            {pending ? 'Un momento…' : enabled ? 'Desactivar vigilancia' : 'Activar vigilancia'}
          </Button>
          <span className={`text-sm ${enabled ? 'text-green-700' : 'text-muted-foreground'}`} data-testid="watch-state">
            {enabled ? 'Activa' : 'Desactivada'}
          </span>
        </div>
        {enabled && (
          <p className="text-xs text-muted-foreground">
            Activada el {fmt(activatedAt)} · última consulta: {fmt(lastRunAt)}
          </p>
        )}
        {lastError && <p className="text-sm text-red-600">Último error: {lastError}</p>}
        {msg && <p className={`text-sm ${msg.ok ? 'text-green-700' : 'text-red-600'}`}>{msg.text}</p>}
        {unlinked.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" data-testid="watch-unlinked">
            <p className="font-medium">Miembros sin Telegram vinculado con tareas asignadas recientes (no recibirán avisos):</p>
            <ul className="list-disc ml-5">
              {unlinked.map((m) => (
                <li key={m.id}>
                  {m.name} · {m.tasks} tarea{m.tasks === 1 ? '' : 's'}
                </li>
              ))}
            </ul>
            <p className="text-xs mt-1">Vincúlalos en la pestaña Telegram.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { fetchNoDateCounts, refreshTeamToday } from '@/lib/operaciones/team-actions';
import type { OpsTask } from '@/lib/operaciones/clickup';
import type { TeamTodayData } from '@/lib/operaciones/team-today';

const dateFmt = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  day: 'numeric',
  month: 'short'
});
const timeFmt = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
});

function TaskRow({ task, overdue }: { task: OpsTask; overdue?: boolean }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span
        className={`shrink-0 mt-0.5 rounded px-1.5 py-0.5 text-xs ${
          overdue ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
        }`}
      >
        {task.dueDate ? dateFmt.format(task.dueDate) : '—'}
      </span>
      <span className="min-w-0">
        <a
          href={task.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-900 hover:text-orange-600 hover:underline"
        >
          {task.name}
        </a>
        <span className="block text-xs text-muted-foreground">
          {task.listName}
          {task.status && ` · ${task.status}`}
        </span>
      </span>
    </li>
  );
}

type NoDateState =
  | { status: 'loading' }
  | { status: 'computing' }
  | { status: 'ready'; counts: Record<string, number>; computedAt: number }
  | { status: 'error'; error: string };

export function TeamGrid({ data }: { data: TeamTodayData }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [noDate, setNoDate] = useState<NoDateState>({ status: 'loading' });

  // "Sin fecha" se pide DESPUÉS de pintar la página; si el servidor aún lo está
  // calculando en segundo plano, se pregunta de nuevo cada pocos segundos.
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const startedAt = Date.now();
    const poll = async () => {
      try {
        const res = await fetchNoDateCounts();
        if (stopped) return;
        if (res.status === 'ready') {
          setNoDate({ status: 'ready', counts: res.counts, computedAt: res.computedAt });
          return;
        }
        if (res.status === 'error') {
          setNoDate({ status: 'error', error: res.error });
          return;
        }
        setNoDate({ status: 'computing' });
      } catch {
        if (!stopped) setNoDate({ status: 'error', error: 'sin respuesta del servidor' });
        return;
      }
      if (Date.now() - startedAt < 5 * 60 * 1000) timer = setTimeout(poll, 4000);
    };
    void poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const ordered = [...data.members].sort(
    (a, b) =>
      b.overdue.length - a.overdue.length ||
      b.today.length - a.today.length ||
      a.member.username.localeCompare(b.member.username)
  );

  const refresh = () =>
    startRefresh(async () => {
      setRefreshError(null);
      const res = await refreshTeamToday();
      if (!res.ok) setRefreshError(res.error);
      router.refresh();
    });

  return (
    <div className="space-y-4" data-testid="equipo-cargado">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Workspace <strong>{data.workspaceName ?? '—'}</strong> ·{' '}
          {new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'full' }).format(new Date())}{' '}
          · {data.spacesCount} espacios · datos de ClickUp de las {timeFmt.format(data.fetchedAt)}
          {data.cached ? ' (caché de 2 min)' : ` (${data.requests} petición${data.requests === 1 ? '' : 'es'})`}
        </p>
        <Button size="sm" variant="outline" onClick={refresh} disabled={refreshing}>
          {refreshing ? 'Actualizando…' : 'Actualizar ahora'}
        </Button>
      </div>

      {refreshError && <p className="text-sm text-red-600">{refreshError}</p>}
      {data.truncated && (
        <p className="text-sm text-amber-700">
          Hay muchísimas tareas vencidas: se han leído las primeras 3.000, así que algunas pueden faltar.
        </p>
      )}
      {data.spacesCount === 0 && (
        <p className="text-sm text-amber-700">
          No hay espacios seleccionados. Elige cuáles sincronizar en Ajustes ClickUp.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ordered.map(({ member, overdue, today }) => (
          <div key={member.id} className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium truncate min-w-0">{member.username}</p>
              <div className="flex gap-1 text-xs shrink-0">
                <span className="rounded bg-red-100 px-2 py-0.5 text-red-700">{overdue.length} vencidas</span>
                <span className="rounded bg-blue-100 px-2 py-0.5 text-blue-700">{today.length} hoy</span>
                <span
                  className="rounded bg-gray-100 px-2 py-0.5 text-gray-600"
                  title={
                    noDate.status === 'ready'
                      ? `Calculado a las ${timeFmt.format(noDate.computedAt)} (se recalcula cada 30 min)`
                      : noDate.status === 'error'
                        ? noDate.error
                        : 'Calculando en segundo plano…'
                  }
                >
                  {noDate.status === 'ready'
                    ? `${noDate.counts[member.id] ?? 0} sin fecha`
                    : noDate.status === 'error'
                      ? 'sin fecha: n/d'
                      : 'sin fecha: …'}
                </span>
              </div>
            </div>

            {overdue.length === 0 && today.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin tareas vencidas ni para hoy.</p>
            ) : (
              <ul className="space-y-2">
                {overdue.map((t) => (
                  <TaskRow key={`o-${t.id}`} task={t} overdue />
                ))}
                {today.map((t) => (
                  <TaskRow key={`t-${t.id}`} task={t} />
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

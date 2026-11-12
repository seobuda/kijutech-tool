'use client';

import { useEffect, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CalendarDays, CheckCircle2, ExternalLink, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function TaskRow({ task, overdue }: { task: OpsTask; overdue?: boolean }) {
  return (
    <li className="group flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted/50">
      <span
        className={cn(
          'mt-0.5 w-14 shrink-0 rounded-md px-1.5 py-0.5 text-center text-[11px] font-medium tabular-nums',
          overdue ? 'bg-destructive-soft text-destructive' : 'bg-info-soft text-info'
        )}
      >
        {task.dueDate ? dateFmt.format(task.dueDate) : '—'}
      </span>
      <span className="min-w-0 flex-1">
        <a
          href={task.url}
          target="_blank"
          rel="noopener noreferrer"
          className="line-clamp-2 rounded-sm text-foreground hover:text-brand hover:underline"
        >
          {task.name}
          <ExternalLink className="ml-1 inline size-3 opacity-0 transition-opacity group-hover:opacity-60" aria-hidden />
        </a>
        <span className="block truncate text-xs text-muted-foreground">
          {task.listName}
          {task.status && ` · ${task.status}`}
        </span>
      </span>
    </li>
  );
}

function Counter({
  value,
  label,
  tone,
  title
}: {
  value: ReactNode;
  label: string;
  tone: 'danger' | 'info' | 'neutral';
  title?: string;
}) {
  const toneCls = {
    danger: 'bg-destructive-soft text-destructive',
    info: 'bg-info-soft text-info',
    neutral: 'bg-muted text-muted-foreground'
  }[tone];
  return (
    <div className={cn('flex flex-col items-center rounded-lg px-2 py-1.5', toneCls)} title={title}>
      <span className="text-base font-semibold leading-tight tabular-nums">{value}</span>
      <span className="text-[11px] leading-tight">{label}</span>
    </div>
  );
}

type NoDateState =
  | { status: 'loading' }
  | { status: 'computing' }
  | { status: 'ready'; counts: Record<string, number>; computedAt: number }
  | { status: 'error'; error: string };

export type JornadaBadge = { icon: string; label: string; detail: string; tone: 'ok' | 'warn' | 'muted' };

export function TeamGrid({ data, jornada }: { data: TeamTodayData; jornada?: Record<string, JornadaBadge> }) {
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

  const noDateTitle =
    noDate.status === 'ready'
      ? `Calculado a las ${timeFmt.format(noDate.computedAt)} (se recalcula cada 30 min)`
      : noDate.status === 'error'
        ? noDate.error
        : 'Calculando en segundo plano…';

  return (
    <div className="space-y-4" data-testid="equipo-cargado">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold">
            <CalendarDays className="size-4 text-muted-foreground" aria-hidden />
            <span className="first-letter:uppercase">
              {new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'full' }).format(new Date())}
            </span>
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Workspace <strong className="font-medium text-foreground">{data.workspaceName ?? '—'}</strong> ·{' '}
            {data.spacesCount} espacios · datos de ClickUp de las {timeFmt.format(data.fetchedAt)}
            {data.cached ? ' (caché de 2 min)' : ` (${data.requests} petición${data.requests === 1 ? '' : 'es'})`}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={refresh} disabled={refreshing} className="self-start sm:self-auto">
          <RefreshCw className={cn(refreshing && 'animate-spin')} aria-hidden />
          {refreshing ? 'Actualizando…' : 'Actualizar ahora'}
        </Button>
      </div>

      {refreshError && (
        <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">
          {refreshError}
        </p>
      )}
      {data.truncated && (
        <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-strong">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          Hay muchísimas tareas vencidas: se han leído las primeras 3.000, así que algunas pueden faltar.
        </p>
      )}
      {data.spacesCount === 0 && (
        <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning-strong">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          No hay espacios seleccionados. Elige cuáles sincronizar en Ajustes ClickUp.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ordered.map(({ member, overdue, today }) => (
          <article
            key={member.id}
            className="flex flex-col rounded-xl border bg-card shadow-xs transition-shadow hover:shadow-sm"
            aria-label={member.username}
          >
            <header className="flex items-center gap-3 border-b px-4 py-3">
              <span
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold',
                  overdue.length > 0 ? 'bg-destructive-soft text-destructive' : 'bg-brand-soft text-brand'
                )}
                aria-hidden
              >
                {initials(member.username)}
              </span>
              <p className="min-w-0 flex-1 truncate font-medium">{member.username}</p>
              {jornada?.[member.id] && (
                <span
                  title={jornada[member.id].detail}
                  className={cn(
                    'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                    jornada[member.id].tone === 'ok' && 'bg-success-soft text-success',
                    jornada[member.id].tone === 'warn' && 'bg-warning-soft text-warning-strong',
                    jornada[member.id].tone === 'muted' && 'bg-muted text-muted-foreground'
                  )}
                >
                  <span aria-hidden>{jornada[member.id].icon}</span> {jornada[member.id].label}
                </span>
              )}
            </header>
            {jornada?.[member.id]?.detail && (
              <p className="border-b px-4 py-1.5 text-xs text-muted-foreground">{jornada[member.id].detail}</p>
            )}

            <div className="grid grid-cols-3 gap-2 px-4 pt-3">
              <Counter value={overdue.length} label="vencidas" tone={overdue.length > 0 ? 'danger' : 'neutral'} />
              <Counter value={today.length} label="hoy" tone={today.length > 0 ? 'info' : 'neutral'} />
              <Counter
                tone="neutral"
                title={noDateTitle}
                label={noDate.status === 'error' ? 'sin fecha: n/d' : 'sin fecha'}
                value={
                  noDate.status === 'ready'
                    ? (noDate.counts[member.id] ?? 0)
                    : noDate.status === 'error'
                      ? '—'
                      : '…'
                }
              />
            </div>

            <div className="flex-1 px-2 pb-3 pt-2">
              {overdue.length === 0 && today.length === 0 ? (
                <p className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="size-4 text-success" aria-hidden />
                  Sin tareas vencidas ni para hoy.
                </p>
              ) : (
                <ul className="max-h-80 space-y-0.5 overflow-y-auto">
                  {overdue.map((t) => (
                    <TaskRow key={`o-${t.id}`} task={t} overdue />
                  ))}
                  {today.map((t) => (
                    <TaskRow key={`t-${t.id}`} task={t} />
                  ))}
                </ul>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

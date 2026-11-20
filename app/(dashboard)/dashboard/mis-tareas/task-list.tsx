// Fila y lista de tareas (WorkTask): la usan Mis tareas y el Inicio de cada persona. No conoce ClickUp: el enlace
// externo es opcional y desaparecerá cuando la herramienta sustituya a ClickUp.
import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/page';
import { cn } from '@/lib/utils';
import type { WorkStatus, WorkTask } from '@/lib/operaciones/my-tasks';

const WORK_BADGE: Partial<Record<WorkStatus, { label: string; tone: 'danger' | 'warning' | 'info' | 'brand' }>> = {
  devuelto: { label: 'Devuelto', tone: 'danger' },
  bloqueado: { label: 'Bloqueado', tone: 'warning' },
  en_revision: { label: 'En revisión', tone: 'info' },
  en_curso: { label: 'En curso', tone: 'brand' }
};

const yearOf = (d: Date) => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', year: 'numeric' }).format(d);
// Con año cuando no es el actual: una tarea vencida hace un año no debe parecer de esta semana.
const fmtDue = (ms: number) => {
  const d = new Date(ms);
  const otherYear = yearOf(d) !== yearOf(new Date());
  return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', ...(otherYear ? { year: 'numeric' } : { weekday: 'short' }), day: 'numeric', month: 'short' }).format(d);
};

export function TaskRow({ task, late, showDue = true }: { task: WorkTask; late?: boolean; showDue?: boolean }) {
  const badge = task.workStatus ? WORK_BADGE[task.workStatus] : undefined;
  const meta = [task.clientName, task.listName && task.listName !== task.clientName ? task.listName : null].filter(Boolean).join(' · ');
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium">{task.title}</span>
          {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {meta}
          {showDue && task.dueMs !== null && (
            <span className={cn(late && 'text-destructive')}>
              {meta ? ' · ' : ''}
              {late ? 'vencía el ' : ''}
              {fmtDue(task.dueMs)}
            </span>
          )}
          {task.externalStatus && <span> · {task.externalStatus}</span>}
        </span>
      </span>
      {task.externalUrl && <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-label="Abrir en ClickUp" />}
    </>
  );
  const cls = 'flex items-start gap-2 px-3 py-2.5 text-sm transition-colors';
  return task.externalUrl ? (
    <a href={task.externalUrl} target="_blank" rel="noreferrer" className={cn(cls, 'hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring')}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function TaskList({ tasks, late, limit, empty, showDue }: { tasks: WorkTask[]; late?: boolean; limit?: number; empty: string; showDue?: boolean }) {
  if (tasks.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  const shown = limit ? tasks.slice(0, limit) : tasks;
  return (
    <ul className="divide-y rounded-lg border">
      {shown.map((t) => (
        <li key={t.id}>
          <TaskRow task={t} late={late} showDue={showDue} />
        </li>
      ))}
      {limit && tasks.length > limit && <li className="px-3 py-2 text-xs text-muted-foreground">y {tasks.length - limit} más</li>}
    </ul>
  );
}

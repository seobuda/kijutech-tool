import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { getClickUpToken } from '@/lib/operaciones/queries';
import {
  ClickUpError,
  OPS_TIMEZONE,
  getTeamToday,
  getWorkspaces,
  type OpsTask
} from '@/lib/operaciones/clickup';

export const dynamic = 'force-dynamic';

const dateFmt = new Intl.DateTimeFormat('es-ES', {
  timeZone: OPS_TIMEZONE,
  day: 'numeric',
  month: 'short'
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

export default async function EquipoHoyPage({
  searchParams
}: {
  searchParams: Promise<{ ws?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const conn = await getClickUpToken(user.tenantId);
  if (!conn) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center space-y-3">
        <p className="font-medium">Todavía no has conectado ClickUp</p>
        <p className="text-sm text-muted-foreground">
          Pega tu token personal para ver las tareas de hoy de todo el equipo.
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

  const { ws } = await searchParams;

  try {
    const workspaces = await getWorkspaces(conn.token);
    const workspace =
      workspaces.find((w) => w.id === (ws ?? conn.workspaceId)) ?? workspaces[0];
    if (!workspace) {
      return <p className="text-sm text-muted-foreground">Tu cuenta de ClickUp no tiene workspaces.</p>;
    }

    const { buckets, truncated } = await getTeamToday(conn.token, workspace);

    // Quien tiene más vencidas primero; después más tareas de hoy; después por nombre.
    const ordered = [...buckets].sort(
      (a, b) =>
        b.overdue.length - a.overdue.length ||
        b.today.length - a.today.length ||
        a.member.username.localeCompare(b.member.username)
    );

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Workspace <strong>{workspace.name}</strong> ·{' '}
            {new Intl.DateTimeFormat('es-ES', {
              timeZone: OPS_TIMEZONE,
              dateStyle: 'full'
            }).format(new Date())}{' '}
            · datos en directo de ClickUp (recarga la página para actualizar)
          </p>
          {workspaces.length > 1 && (
            <div className="flex gap-2 text-sm">
              {workspaces.map((w) => (
                <Link
                  key={w.id}
                  href={`/dashboard/operaciones/equipo-hoy?ws=${w.id}`}
                  className={w.id === workspace.id ? 'font-medium underline' : 'text-gray-500 hover:underline'}
                >
                  {w.name}
                </Link>
              ))}
            </div>
          )}
        </div>

        {truncated && (
          <p className="text-sm text-amber-700">
            El workspace tiene muchísimas tareas abiertas: se han leído las primeras 3.000, así que
            algunas pueden faltar.
          </p>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {ordered.map(({ member, overdue, today, noDateCount }) => (
            <div key={member.id} className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">{member.username}</p>
                  <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                </div>
                <div className="flex gap-1 text-xs shrink-0">
                  <span className="rounded bg-red-100 px-2 py-0.5 text-red-700">{overdue.length} vencidas</span>
                  <span className="rounded bg-blue-100 px-2 py-0.5 text-blue-700">{today.length} hoy</span>
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-gray-600">{noDateCount} sin fecha</span>
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
  } catch (e) {
    const msg = e instanceof ClickUpError ? e.message : 'No se pudo contactar con ClickUp';
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-2">
        <p className="font-medium text-red-700">No se han podido cargar los datos de ClickUp</p>
        <p className="text-sm text-red-700">{msg}</p>
        <Link href="/dashboard/operaciones/ajustes" className="text-sm underline">
          Revisar ajustes
        </Link>
      </div>
    );
  }
}

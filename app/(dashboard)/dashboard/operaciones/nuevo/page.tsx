import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { getClickUpToken } from '@/lib/operaciones/queries';
import { ClickUpError, getMe, getSpacesWithLists, getWorkspaces } from '@/lib/operaciones/clickup';
import { NuevoEncargoForm } from './nuevo-encargo-form';

export const dynamic = 'force-dynamic';

export default async function NuevoEncargoPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const conn = await getClickUpToken(user.tenantId);
  if (!conn) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center space-y-3">
        <p className="font-medium">Todavía no has conectado ClickUp</p>
        <p className="text-sm text-muted-foreground">
          Hace falta el token para elegir la lista de destino y crear la tarea.
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

  try {
    const workspaces = await getWorkspaces(conn.token);
    const workspace = workspaces.find((w) => w.id === conn.workspaceId) ?? workspaces[0];
    if (!workspace) {
      return <p className="text-sm text-muted-foreground">Tu cuenta de ClickUp no tiene workspaces.</p>;
    }
    const [spaces, me] = await Promise.all([
      getSpacesWithLists(conn.token, workspace.id),
      getMe(conn.token)
    ]);

    return <NuevoEncargoForm spaces={spaces} meId={String(me.id)} />;
  } catch (e) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-2">
        <p className="font-medium text-red-700">No se han podido cargar las listas de ClickUp</p>
        <p className="text-sm text-red-700">
          {e instanceof ClickUpError ? e.message : 'No se pudo contactar con ClickUp'}
        </p>
        <Link href="/dashboard/operaciones/ajustes" className="text-sm underline">
          Revisar ajustes
        </Link>
      </div>
    );
  }
}

import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { getClickUpConnection } from '@/lib/operaciones/queries';
import { ensureFresh } from '@/lib/operaciones/structure';
import { getTeamToday } from '@/lib/operaciones/team-today';
import { TeamGrid } from './team-grid';

export const dynamic = 'force-dynamic';

// La página se pinta al instante (solo mira la base de datos); las tareas se
// cargan después, dentro del <Suspense>, mientras se ve el indicador de carga.
export default async function EquipoHoyPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const conn = await getClickUpConnection(user.tenantId);
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

  void ensureFresh(user.tenantId); // refresca la estructura en segundo plano si tiene más de 1 hora

  return (
    <Suspense fallback={<Cargando />}>
      <TeamTodayContent tenantId={user.tenantId} />
    </Suspense>
  );
}

function Cargando() {
  return (
    <div className="space-y-4" data-testid="equipo-cargando">
      <p className="text-sm text-muted-foreground flex items-center gap-2">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-orange-500 border-t-transparent" />
        Cargando las tareas de hoy desde ClickUp…
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
            <div className="h-4 w-1/2 animate-pulse rounded bg-gray-200" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-gray-100" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}

async function TeamTodayContent({ tenantId }: { tenantId: string }) {
  try {
    const data = await getTeamToday(tenantId);
    return <TeamGrid data={data} />;
  } catch (e) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-2">
        <p className="font-medium text-red-700">No se han podido cargar los datos de ClickUp</p>
        <p className="text-sm text-red-700">{e instanceof Error ? e.message : 'Error desconocido'}</p>
        <Link href="/dashboard/operaciones/ajustes" className="text-sm underline">
          Revisar ajustes
        </Link>
      </div>
    );
  }
}

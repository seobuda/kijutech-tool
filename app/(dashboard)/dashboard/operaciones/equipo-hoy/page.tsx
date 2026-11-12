import Link from 'next/link';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { AlertTriangle, PlugZap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/page';
import { getUser } from '@/lib/db/queries';
import { getClickUpConnection } from '@/lib/operaciones/queries';
import { ensureFresh } from '@/lib/operaciones/structure';
import { getTeamToday } from '@/lib/operaciones/team-today';
import { TeamGrid, type JornadaBadge } from './team-grid';
import { getCurrentDays, jornadaSettings } from '@/lib/operaciones/jornada';
import { breakOver, fmtDuration, STATUS_ICON, STATUS_LABEL } from '@/lib/operaciones/jornada-core';

export const dynamic = 'force-dynamic';

// La página se pinta al instante (solo mira la base de datos); las tareas se
// cargan después, dentro del <Suspense>, mientras se ve el indicador de carga.
export default async function EquipoHoyPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const conn = await getClickUpConnection(user.tenantId);
  if (!conn) {
    return (
      <EmptyState
        icon={PlugZap}
        title="Todavía no has conectado ClickUp"
        description="Pega tu token personal para ver las tareas de hoy de todo el equipo."
        action={
          <Button asChild className="bg-brand text-white hover:bg-brand/90">
            <Link href="/dashboard/operaciones/ajustes">Ir a Ajustes ClickUp</Link>
          </Button>
        }
      />
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
    <div className="space-y-4" data-testid="equipo-cargando" aria-busy="true">
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <span className="inline-block size-4 animate-spin rounded-full border-2 border-brand/70 border-t-transparent" />
        Cargando las tareas de hoy desde ClickUp…
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-xl border bg-card shadow-xs">
            <div className="flex items-center gap-3 border-b px-4 py-3">
              <Skeleton className="size-9 rounded-full" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <div className="grid grid-cols-3 gap-2 px-4 pt-3">
              <Skeleton className="h-11 rounded-lg" />
              <Skeleton className="h-11 rounded-lg" />
              <Skeleton className="h-11 rounded-lg" />
            </div>
            <div className="space-y-2.5 p-4">
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Estado de la jornada real de cada persona (solo base de datos; vacío si la jornada está apagada).
async function jornadaBadges(tenantId: string): Promise<Record<string, JornadaBadge> | undefined> {
  const cfg = await jornadaSettings(tenantId);
  if (!cfg.enabled) return undefined;
  const days = await getCurrentDays(tenantId);
  const out: Record<string, JornadaBadge> = {};
  const hm = (ms: number, tz: string) => new Intl.DateTimeFormat('es-ES', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
  for (const [u, d] of days) {
    const st = d.state;
    const tz = d.sch.timezone;
    const parts: string[] = [];
    if (st.entradaAt) parts.push(`Entrada ${hm(st.entradaAt, tz)}${st.firstTask ? ` · «${st.firstTask.name}»` : ''}`);
    if (st.current) parts.push(`desde las ${hm(st.current.start, tz)}${st.current.reason ? ` · ${st.current.reason}` : ''}`);
    if (st.entradaAt) parts.push(`${fmtDuration(st.workedMin)} trabajadas · descansos ${fmtDuration(st.breakMin)}${breakOver(st, cfg.breakQuotaMin) ? ' ⚠️' : ''}`);
    if (st.status === 'ausente' && st.absenceReason) parts.push(st.absenceReason);
    out[u] = {
      icon: STATUS_ICON[st.status],
      label: STATUS_LABEL[st.status],
      detail: parts.join(' · '),
      tone: st.status === 'trabajando' ? 'ok' : st.status === 'sin_empezar' || st.status === 'fuera' ? 'warn' : 'muted'
    };
  }
  return out;
}

async function TeamTodayContent({ tenantId }: { tenantId: string }) {
  try {
    const [data, jornada] = await Promise.all([getTeamToday(tenantId), jornadaBadges(tenantId)]);
    return <TeamGrid data={data} jornada={jornada} />;
  } catch (e) {
    return (
      <div role="alert" className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive-soft p-4">
        <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
        <div className="min-w-0 space-y-1">
          <p className="font-medium text-destructive">No se han podido cargar los datos de ClickUp</p>
          <p className="text-sm text-destructive">{e instanceof Error ? e.message : 'Error desconocido'}</p>
          <Link href="/dashboard/operaciones/ajustes" className="inline-block text-sm font-medium underline">
            Revisar ajustes
          </Link>
        </div>
      </div>
    );
  }
}

import Link from 'next/link';
import { Suspense } from 'react';
import { CalendarClock, ListTodo, UserRound } from 'lucide-react';
import { requirePagePermission } from '@/lib/auth/permissions';
import { EmptyState, PageContainer, PageHeader, Section } from '@/components/ui/page';
import { getMyProfile, safeBlock } from '@/lib/inicio/panel';
import { getMyTasks, HORIZON_DAYS } from '@/lib/operaciones/my-tasks';
import { getClickUpConnection } from '@/lib/operaciones/queries';
import { Loading, Unavailable } from '../_inicio/parts';
import { TaskList } from './task-list';

export const dynamic = 'force-dynamic';

// Mis tareas (20 nov 2026): la lista completa de la persona para trabajar: vencidas, hoy, los próximos 7 días, hasta
// 14 días y cuántas no tienen fecha. Cada tarea lleva su estado en la herramienta (devuelto, bloqueado, en revisión).
// Es la pantalla de tareas que se quedará cuando la herramienta sustituya a ClickUp (lib/operaciones/my-tasks.ts).
export default async function MisTareasPage() {
  const user = await requirePagePermission('view');
  const profile = await safeBlock(user.tenantId, 'ficha propia', () => getMyProfile(user.tenantId, user.id));
  const header = (
    <PageHeader
      icon={ListTodo}
      title="Mis tareas"
      description="Todo lo que tienes asignado, por fecha: primero lo vencido y lo de hoy. Lo urgente que no es una tarea (devoluciones, bloqueos) lo tienes en Inicio."
    />
  );
  if (!profile?.clickupUserId) {
    return (
      <PageContainer className="space-y-6">
        {header}
        <EmptyState
          icon={UserRound}
          title="Tu usuario aún no está enlazado a tu ficha del equipo"
          description="Pide a quien lleva las operaciones que lo enlace en Equipo → Fichas. Después verás aquí todas tus tareas."
        />
      </PageContainer>
    );
  }
  return (
    <PageContainer className="space-y-6">
      {header}
      <Suspense fallback={<Section><div className="p-5"><Loading text="Cargando tus tareas…" /></div></Section>}>
        <AllTasks tenantId={user.tenantId} clickupUserId={profile.clickupUserId} />
      </Suspense>
    </PageContainer>
  );
}

async function AllTasks({ tenantId, clickupUserId }: { tenantId: string; clickupUserId: string }) {
  const conn = await safeBlock(tenantId, 'conexión de ClickUp', () => getClickUpConnection(tenantId));
  if (!conn) return <EmptyState icon={CalendarClock} title="Las tareas todavía no están conectadas" description="Cuando se conecte ClickUp, verás aquí todas tus tareas." />;
  const t = await safeBlock(tenantId, 'mis tareas', () => getMyTasks(tenantId, clickupUserId));
  if (!t) return <Section><div className="p-5"><Unavailable what="tus tareas" /></div></Section>;
  const total = t.overdue.length + t.today.length + t.week.length + t.later.length;
  if (total === 0 && !t.noDateCount) {
    return <EmptyState icon={CalendarClock} title="No tienes tareas pendientes" description={`Ni vencidas ni con fecha en los próximos ${HORIZON_DAYS} días. Si esperabas alguna, revisa su fecha y a quién está asignada.`} />;
  }
  return (
    <div className="space-y-4" data-testid="mis-tareas">
      {t.overdue.length > 0 && (
        <Section title={`Vencidas (${t.overdue.length})`} description="Ponte con ellas o cámbiales la fecha si ya no tocan." className="border-destructive/40">
          <div className="p-4"><TaskList tasks={t.overdue} late empty="" /></div>
        </Section>
      )}
      <Section title={`Hoy (${t.today.length})`}>
        <div className="p-4"><TaskList tasks={t.today} showDue={false} empty="Nada con fecha de hoy." /></div>
      </Section>
      <Section title={`Próximos 7 días (${t.week.length})`}>
        <div className="p-4"><TaskList tasks={t.week} empty="Nada en los próximos 7 días." /></div>
      </Section>
      {t.later.length > 0 && (
        <Section title={`Hasta ${HORIZON_DAYS} días (${t.later.length})`}>
          <div className="p-4"><TaskList tasks={t.later} empty="" /></div>
        </Section>
      )}
      <p className="text-sm text-muted-foreground">
        {t.noDateCount === null
          ? 'Contando las tareas sin fecha…'
          : t.noDateCount > 0
            ? `Además tienes ${t.noDateCount} tarea(s) sin fecha: ponles una para que aparezcan aquí y no se olviden.`
            : 'No tienes tareas sin fecha.'}
        {t.truncated && ' Hay muchas tareas: puede que no salgan todas.'}{' '}
        <Link href="/dashboard" className="text-brand underline-offset-2 hover:underline">Volver a Inicio</Link>
      </p>
    </div>
  );
}

import { requirePagePermission } from '@/lib/auth/permissions';
import { getJornadaOverview } from '@/lib/operaciones/jornada-overview';
import { todayIn } from '@/lib/operaciones/jornada';
import { DEFAULT_TEAM_TIMEZONE } from '@/lib/operaciones/team-profiles';
import { JornadaView } from './jornada-view';

export const dynamic = 'force-dynamic';

// Equipo → Jornada: entradas, pausas, salidas con motivo y horas trabajadas de cada persona, con
// correcciones (solo administración: es información sensible del equipo).
export default async function JornadaPage({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const user = await requirePagePermission('admin');
  const { fecha } = await searchParams;
  const today = todayIn(DEFAULT_TEAM_TIMEZONE);
  const date = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) && fecha <= today ? fecha : today;
  const data = await getJornadaOverview(user.tenantId, date);
  return <JornadaView date={date} today={today} {...data} />;
}

import { requirePagePermission } from '@/lib/auth/permissions';
import { getHealthOverview } from '@/lib/operaciones/health';
import { SaludView } from './salud-view';

export const dynamic = 'force-dynamic';

// Salud del sistema: estado de cada pieza, incidencias, gráficas y recomendaciones (solo administración).
export default async function SaludPage() {
  const user = await requirePagePermission('admin');
  const data = await getHealthOverview(user.tenantId);
  return (
    <SaludView
      checks={data.checks}
      incidents={data.incidents.map((i) => ({
        ...i,
        openedAt: i.openedAt.toISOString(),
        resolvedAt: i.resolvedAt ? i.resolvedAt.toISOString() : null
      }))}
      clickupPerHour={data.clickupPerHour}
      aiCostPerDay={data.aiCostPerDay}
      notificationsPerDay={data.notificationsPerDay}
      uptime7d={data.uptime7d}
    />
  );
}

import { requirePagePermission } from '@/lib/auth/permissions';
import { getTiemposOverview } from '@/lib/operaciones/tiempos-overview';
import { TiemposView } from './tiempos-view';

export const dynamic = 'force-dynamic';

const PERIODS = [7, 30, 90] as const;

// Equipo → Tiempos (paso 5B): márgenes por tipo de trabajo (editables, con la propuesta a partir de lo real),
// tiempos por persona, tareas fuera de margen con su motivo y URL, y correcciones. Solo administración.
export default async function TiemposPage({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const user = await requirePagePermission('admin');
  const { dias } = await searchParams;
  const days = PERIODS.find((p) => String(p) === dias) ?? 30;
  const data = await getTiemposOverview(user.tenantId, days);
  return <TiemposView data={data} periods={[...PERIODS]} />;
}

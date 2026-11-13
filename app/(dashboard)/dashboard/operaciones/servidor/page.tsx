import { requirePagePermission } from '@/lib/auth/permissions';
import { getInfraOverview } from '@/lib/operaciones/infra-watch';
import { ServidorView } from './servidor-view';

export const dynamic = 'force-dynamic';

// Sistema → Servidor y costes: DigitalOcean (coste del mes, previsión, facturas, recursos) y capacidad del servidor
// de la herramienta. Se pinta con la última lectura (se refresca sola cada hora o con el botón). Solo administración.
export default async function ServidorPage() {
  const user = await requirePagePermission('admin');
  const data = await getInfraOverview(user.tenantId);
  return <ServidorView data={data} />;
}

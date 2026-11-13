import { requirePagePermission } from '@/lib/auth/permissions';
import { getAiOverview } from '@/lib/operaciones/ai-watch';
import { GastoIaView } from './gasto-ia-view';

export const dynamic = 'force-dynamic';

// Sistema → Gasto de IA (vigía): presupuesto, previsión, gasto por día y por función, picos con su porqué,
// recomendaciones y, opcional, el coste real de la cuenta de Anthropic. Solo administración.
export default async function GastoIaPage() {
  const user = await requirePagePermission('admin');
  const data = await getAiOverview(user.tenantId);
  return <GastoIaView data={data} />;
}

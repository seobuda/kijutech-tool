import { requirePagePermission } from '@/lib/auth/permissions';
import { getAgentStats, listRecentActions } from '@/lib/operaciones/agent-actions';
import { AgenteView } from './agente-view';

export const dynamic = 'force-dynamic';

// Panel del agente: cuánto acierta cada tipo de acción y cuánta autonomía tiene (solo administración).
export default async function AgentePage() {
  const user = await requirePagePermission('admin');
  const [stats, recent] = await Promise.all([getAgentStats(user.tenantId, 30), listRecentActions(user.tenantId, 40)]);
  return (
    <AgenteView
      stats={stats}
      recent={recent.map((a) => ({
        id: a.id,
        kind: a.kind,
        status: a.status,
        summary: a.summary,
        proposal: a.proposal,
        final: a.final,
        decidedByName: a.decidedByName,
        decidedVia: a.decidedVia,
        createdAt: a.createdAt.toISOString(),
        decidedAt: a.decidedAt ? a.decidedAt.toISOString() : null
      }))}
    />
  );
}

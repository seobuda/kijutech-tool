import { requirePagePermission } from '@/lib/auth/permissions';
import { wireApp } from '@/lib/app-wiring';
import { listTools } from '@/lib/core/capabilities';
import { agentMonthSpend, listAgents, SERVER_TOOLS } from '@/lib/agentes/store';
import { VOICES } from '@/lib/agentes/voice';
import { listToolAutonomies } from '@/lib/operaciones/agent-capabilities';
import { AgentesView, type AgentRow, type ToolOption } from './agentes-view';

export const dynamic = 'force-dynamic';

export default async function AgentesPage() {
  const user = await requirePagePermission('admin');
  wireApp();
  const agents = await listAgents(user.tenantId);
  const rows: AgentRow[] = await Promise.all(
    agents.map(async (a) => ({
      id: a.id,
      key: a.key,
      name: a.name,
      kind: a.kind as 'principal' | 'subagente',
      role: a.role,
      instructions: a.instructions,
      tools: a.tools,
      model: a.model,
      voice: a.voice,
      monthlyBudgetUsd: a.monthlyBudgetUsd !== null ? Number(a.monthlyBudgetUsd) : null,
      active: a.active,
      spentMonth: Math.round((await agentMonthSpend(user.tenantId, a.key)) * 100) / 100
    }))
  );
  const tools: ToolOption[] = [
    ...listTools().map((t) => ({ name: t.name, title: t.title, module: t.module, risk: t.risk })),
    ...Object.entries(SERVER_TOOLS).map(([name, t]) => ({ name, title: t.title, module: 'anthropic', risk: 'lectura' as const }))
  ];
  return <AgentesView agents={rows} tools={tools} voices={[...VOICES]} autonomies={await listToolAutonomies(user.tenantId)} />;
}

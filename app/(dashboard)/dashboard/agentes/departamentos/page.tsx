import { requirePagePermission } from '@/lib/auth/permissions';
import { listAgents, listDepartments } from '@/lib/agentes/store';
import { listDeptBots } from '@/lib/operaciones/dept-bots';
import { getTelegramConfig } from '@/lib/operaciones/telegram-config';
import { DepartamentosView, type DeptView } from './departamentos-view';

export const dynamic = 'force-dynamic';

// Agentes → Departamentos (organigrama, 20 nov 2026): cada departamento, su jefe, quién está dentro y, si tiene chat
// propio, el estado de su bot de Telegram (el token se guarda cifrado y no se vuelve a enseñar).
export default async function DepartamentosPage() {
  const user = await requirePagePermission('admin');
  const [departments, agents, bots, main] = await Promise.all([listDepartments(user.tenantId), listAgents(user.tenantId), listDeptBots(user.tenantId), getTelegramConfig(user.tenantId)]);
  const rows: DeptView[] = departments.map((d) => {
    const head = d.headAgentKey ? agents.find((a) => a.key === d.headAgentKey) : null;
    const bot = d.botKey ? bots.find((b) => b.key === d.botKey) : null;
    return {
      key: d.key,
      name: d.name,
      description: d.description,
      reportsTo: d.reportsTo === 'gabinete' ? 'Gabinete' : 'Dirección (tú)',
      head: head ? { name: head.name, active: head.active } : null,
      members: agents.filter((a) => a.departmentKey === d.key && a.key !== d.headAgentKey).map((a) => ({ name: a.name, kind: a.kind, active: a.active })),
      botKey: d.botKey,
      bot: bot
        ? { username: bot.botUsername, name: bot.botName, ready: Boolean(bot.readyAt), lastError: bot.lastError }
        : null
    };
  });
  return <DepartamentosView departments={rows} webhookReady={main?.receiveMode === 'webhook'} />;
}

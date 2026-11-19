import { requirePagePermission } from '@/lib/auth/permissions';
import { ensureSimEnvironment, simChats } from '@/lib/operaciones/sim/env';
import { getScenarioOverview, getSimChat } from '@/lib/operaciones/sim/runner';
import { PruebasView } from './pruebas-view';

export const dynamic = 'force-dynamic';

// Sistema → Pruebas: escenarios simulados de punta a punta en el entorno de pruebas aislado, con su último resultado,
// y el Telegram simulado para ver lo que se probó (o probar a mano). Solo administración.
export default async function PruebasPage() {
  const user = await requirePagePermission('admin');
  const env = await ensureSimEnvironment(user.tenantId);
  const chats = simChats(env.simTenantId);
  const [scenarios, messages] = await Promise.all([getScenarioOverview(user.tenantId), getSimChat(env.simTenantId, chats[0].chatId)]);
  return <PruebasView initialScenarios={scenarios} initialMessages={messages} chats={chats.map((c) => ({ key: c.key, name: c.name, role: c.role }))} />;
}

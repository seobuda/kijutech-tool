import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { getStructure, selectedSpaces } from '@/lib/operaciones/structure';
import { canManageProfiles } from '@/lib/operaciones/team-profiles';
import { getLevels, getServices, listClients, possibleDuplicates, requestCountsByOption } from '@/lib/operaciones/clients';
import { ClientesView, type ClientView } from './clientes-view';

export const dynamic = 'force-dynamic';

export default async function ClientesPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in');
  if (!canManageProfiles(user)) redirect('/dashboard/operaciones');

  const [clients, levels, services, structure, counts] = await Promise.all([
    listClients(user.tenantId),
    getLevels(user.tenantId),
    getServices(user.tenantId),
    getStructure(user.tenantId),
    requestCountsByOption(user.tenantId)
  ]);

  const views: ClientView[] = clients.map((c) => ({
    id: c.id,
    name: c.name,
    aliases: c.aliases,
    clickupOptionId: c.clickupOptionId ?? '',
    usualSpaceId: c.usualSpaceId ?? '',
    usualListIds: c.usualListIds,
    level: c.level,
    deliveryDays: c.deliveryDays,
    monthlyHours: c.monthlyHours != null ? Number(c.monthlyHours) : null,
    workDays: c.workDays ? c.workDays.split(',').map(Number).filter((d) => d >= 1 && d <= 7) : [],
    tools: c.tools,
    business: c.business ?? '',
    offerings: c.offerings ?? '',
    area: c.area ?? '',
    audience: c.audience ?? '',
    goals: c.goals ?? '',
    strategy: c.strategy ?? '',
    notes: c.notes ?? '',
    active: c.active,
    services: c.services.map((s) => ({ key: s.serviceKey, responsibleClickupId: s.responsibleClickupId ?? '' })),
    requestCount: c.clickupOptionId ? (counts.get(c.clickupOptionId) ?? 0) : 0
  }));

  // Opciones del campo «Cliente» de ClickUp (todas las del campo) y cuáles aún no tienen ficha.
  const options = new Map<string, string>();
  for (const f of Object.values(structure.clientFields)) for (const o of f.options) options.set(o.id, o.label);
  const linked = new Set(clients.map((c) => c.clickupOptionId).filter(Boolean));

  return (
    <ClientesView
      clients={views}
      levels={levels}
      services={services}
      members={structure.members.map((m) => ({ id: m.id, username: m.username }))}
      spaces={selectedSpaces(structure).map((s) => ({
        id: s.id,
        name: s.name,
        lists: s.lists.map((l) => ({ id: l.id, name: l.folder ? `${l.folder} / ${l.name}` : l.name }))
      }))}
      options={[...options].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label, 'es'))}
      missingOptions={[...options].filter(([id]) => !linked.has(id)).length}
      duplicates={possibleDuplicates(clients.filter((c) => c.active))}
    />
  );
}

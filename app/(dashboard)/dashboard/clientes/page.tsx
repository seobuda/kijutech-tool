import { eq } from 'drizzle-orm';
import { checkPermission, requirePagePermission } from '@/lib/auth/permissions';
import { db } from '@/lib/db/drizzle';
import { opsClientActivity } from '@/lib/db/schema';
import { completenessByClient } from '@/lib/core/clients';
import { getStructure } from '@/lib/operaciones/structure';
import { evaluateClient, getLevels, getServices, listClients, possibleDuplicates, requestCountsByOption } from '@/lib/operaciones/clients';
import { getActivityRunInfo } from '@/lib/operaciones/client-activity';
import { ClientesView, type ClientRow } from './clientes-view';
import { ClientProposals } from './client-proposals';

export const dynamic = 'force-dynamic';

// Clientes (NÚCLEO, 14 nov 2026): lista de fichas con su estado, lo completas que están y el semáforo de Operaciones.
export default async function ClientesPage() {
  const user = await requirePagePermission('edit');
  const [clients, levels, services, structure, counts, activityRows, runInfo, completeness, isAdmin] = await Promise.all([
    listClients(user.tenantId),
    getLevels(user.tenantId),
    getServices(user.tenantId),
    getStructure(user.tenantId),
    requestCountsByOption(user.tenantId),
    db.select().from(opsClientActivity).where(eq(opsClientActivity.tenantId, user.tenantId)),
    getActivityRunInfo(user.tenantId),
    completenessByClient(user.tenantId),
    checkPermission('admin').then((r) => r.ok)
  ]);
  const now = Date.now();
  const serviceLabel = new Map(services.map((s) => [s.key, s.label]));
  const members = new Map(structure.members.map((m) => [m.id, m.username]));

  const rows: ClientRow[] = clients.map((c) => {
    const act = activityRows.find((a) => a.clientId === c.id) ?? null;
    const ev = evaluateClient(c, act, levels, now);
    const comp = completeness.get(c.id) ?? { pct: 0, missing: 0 };
    return {
      id: c.id,
      name: c.name,
      aliases: c.aliases,
      status: c.status,
      level: c.level,
      levelLabel: levels.find((l) => l.key === c.level)?.label ?? c.level,
      linked: Boolean(c.clickupOptionId),
      services: c.services.map((s) => `${serviceLabel.get(s.serviceKey) ?? s.serviceKey}${s.responsibleClickupId ? ` · ${members.get(s.responsibleClickupId) ?? '—'}` : ''}`),
      business: c.business ?? '',
      completeness: comp.pct,
      missing: comp.missing,
      requestCount: c.clickupOptionId ? (counts.get(c.clickupOptionId) ?? 0) : 0,
      monthlyHours: c.monthlyHours != null ? Number(c.monthlyHours) : null,
      alert: {
        state: ev.state,
        note: ev.note,
        lastActivityDays: act?.lastActivityMs ? Math.floor((now - act.lastActivityMs) / 86_400_000) : null,
        hasData: Boolean(act),
        windowDays: act?.windowDays ?? 0,
        hoursMonth: act ? Number(act.hoursMonth) : 0,
        completedMonth: act?.completedMonth ?? 0,
        upcoming: act?.upcomingTasks ?? 0,
        horizonDays: act?.horizonDays ?? 0
      }
    };
  });

  const linked = new Set(clients.map((c) => c.clickupOptionId).filter(Boolean));
  const optionIds = new Set(Object.values(structure.clientFields).flatMap((f) => f.options.map((o) => o.id)));
  const missingOptions = [...optionIds].filter((id) => !linked.has(id)).length;
  const incomplete = clients.filter((c) => c.active && c.clickupOptionId && (c.services.length === 0 || c.usualListIds.length === 0)).length;

  return (
    <div className="space-y-4">
      {incomplete > 0 && <ClientProposals incomplete={incomplete} />}
      <ClientesView rows={rows} levels={levels} services={services} runInfo={runInfo} missingOptions={missingOptions} duplicates={possibleDuplicates(clients.filter((c) => c.active))} isAdmin={isAdmin} />
    </div>
  );
}

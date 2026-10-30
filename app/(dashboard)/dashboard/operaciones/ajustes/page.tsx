import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { getClickUpConnection, getClickUpRequestStats } from '@/lib/operaciones/queries';
import { getTranscriptionModel } from '@/lib/operaciones/settings';
import { getStructure } from '@/lib/operaciones/structure';
import { getStatusGroups } from '@/lib/operaciones/status-map';
import { getWorkTypes } from '@/lib/operaciones/work-types';
import { AjustesClickUp } from './ajustes-clickup';
import { FlujoAjustes } from './flujo-ajustes';
import { VigilanciaAjustes } from './vigilancia-ajustes';
import { getUnlinkedWithTasks, getWatch } from '@/lib/operaciones/watch';

export const dynamic = 'force-dynamic';

export default async function AjustesClickUpPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const [conn, transcriptionModel, structure, stats] = await Promise.all([
    getClickUpConnection(user.tenantId),
    getTranscriptionModel(user.tenantId),
    getStructure(user.tenantId),
    getClickUpRequestStats(user.tenantId)
  ]);

  const [watch, unlinked] = await Promise.all([getWatch(user.tenantId), getUnlinkedWithTasks(user.tenantId)]);
  const [statusGroups, workTypes] = await Promise.all([
    getStatusGroups(user.tenantId),
    getWorkTypes(user.tenantId, true)
  ]);

  return (
    <div className="space-y-6">
      <AjustesClickUp
        hasToken={Boolean(conn)}
        updatedAt={conn?.updatedAt.toISOString() ?? null}
        transcriptionModel={transcriptionModel}
        structure={{
          syncedAt: structure.syncedAt?.toISOString() ?? null,
          workspaceName: structure.workspaceName,
          membersCount: structure.members.length,
          spaces: structure.spaces.map((s) => ({
            id: s.id,
            name: s.name,
            selected: s.selected,
            listCount: s.lists.length
          }))
        }}
        stats={stats}
      />
      <VigilanciaAjustes
        enabled={Boolean(watch?.enabled)}
        activatedAt={watch?.activatedAt?.toISOString() ?? null}
        lastRunAt={watch?.lastRunAt?.toISOString() ?? null}
        lastError={watch?.lastError ?? null}
        unlinked={unlinked}
      />
      <FlujoAjustes
        groups={statusGroups.map((g) => ({
          key: g.key,
          statuses: g.statuses,
          listIds: g.listIds,
          listNames: g.listNames,
          values: g.values,
          edited: g.edited
        }))}
        workTypes={workTypes.map((t) => ({ key: t.key, label: t.label, active: t.active }))}
      />
    </div>
  );
}

import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { getClickUpConnection, getClickUpRequestStats } from '@/lib/operaciones/queries';
import { getTranscriptionModel } from '@/lib/operaciones/settings';
import { getStructure } from '@/lib/operaciones/structure';
import { AjustesClickUp } from './ajustes-clickup';

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
    </div>
  );
}

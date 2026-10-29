import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { getClickUpConnection } from '@/lib/operaciones/queries';
import { getTranscriptionModel } from '@/lib/operaciones/settings';
import { AjustesClickUp } from './ajustes-clickup';

export default async function AjustesClickUpPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const [conn, transcriptionModel] = await Promise.all([
    getClickUpConnection(user.tenantId),
    getTranscriptionModel(user.tenantId)
  ]);
  return (
    <AjustesClickUp
      hasToken={Boolean(conn)}
      updatedAt={conn?.updatedAt.toISOString() ?? null}
      transcriptionModel={transcriptionModel}
    />
  );
}

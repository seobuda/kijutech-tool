import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { getClickUpConnection } from '@/lib/operaciones/queries';
import { AjustesClickUp } from './ajustes-clickup';

export default async function AjustesClickUpPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const conn = await getClickUpConnection(user.tenantId);
  return <AjustesClickUp hasToken={Boolean(conn)} updatedAt={conn?.updatedAt.toISOString() ?? null} />;
}

import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { canManageProfiles } from '@/lib/operaciones/team-profiles';
import { getPilotData, listSuggestions } from '@/lib/operaciones/pilot';
import { PilotoView } from './piloto-view';

export const dynamic = 'force-dynamic';

export default async function PilotoPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in');
  if (!canManageProfiles(user)) redirect('/dashboard/operaciones');
  const [data, suggestions] = await Promise.all([getPilotData(user.tenantId), listSuggestions(user.tenantId)]);
  return <PilotoView data={data} suggestions={suggestions} />;
}

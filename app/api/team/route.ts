import { getUserIfAllowed } from '@/lib/auth/permissions';
import { getSafeTeam } from '@/lib/db/queries';

// Solo nombre y correo de los miembros, y solo para quien tiene algún rol.
export async function GET() {
  const user = await getUserIfAllowed('view');
  if (!user) return Response.json(null, { status: 401 });
  return Response.json(await getSafeTeam());
}

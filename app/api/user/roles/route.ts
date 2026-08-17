import { getUser, getUserTenantRoleNames } from '@/lib/db/queries';

export async function GET() {
  const user = await getUser();
  if (!user) {
    return Response.json({ roles: [] });
  }

  const roles = await getUserTenantRoleNames(user.id);
  return Response.json({ roles });
}

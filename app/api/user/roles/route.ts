import { getUser, getUserTenantRoleNames } from '@/lib/db/queries';
import { getTenantAiMode } from '@/lib/ai/queries';

export async function GET() {
  const user = await getUser();
  if (!user) {
    return Response.json({ roles: [], aiKeyModeAllowed: 'platform_only' });
  }

  const [roles, aiKeyModeAllowed] = await Promise.all([
    getUserTenantRoleNames(user.id),
    getTenantAiMode(user.tenantId),
  ]);
  return Response.json({ roles, aiKeyModeAllowed });
}

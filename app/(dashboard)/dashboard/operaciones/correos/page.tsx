import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { opsClients } from '@/lib/db/schema';
import { requirePagePermission } from '@/lib/auth/permissions';
import { CorreosView } from './correos-view';

export const dynamic = 'force-dynamic';

export default async function CorreosPage() {
  const user = await requirePagePermission('edit');
  const clients = await db
    .select({ id: opsClients.id, name: opsClients.name })
    .from(opsClients)
    .where(and(eq(opsClients.tenantId, user.tenantId), eq(opsClients.active, true)))
    .orderBy(asc(opsClients.name));
  return <CorreosView clients={clients} />;
}

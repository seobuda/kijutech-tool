import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clients } from '@/lib/db/schema';
import { requirePagePermission } from '@/lib/auth/permissions';
import { CorreosView } from './correos-view';

export const dynamic = 'force-dynamic';

export default async function CorreosPage() {
  const user = await requirePagePermission('edit');
  // Clientes a los que se puede asignar un correo: todos menos los dados de baja.
  const list = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(and(eq(clients.tenantId, user.tenantId), inArray(clients.status, ['prospecto', 'onboarding', 'activo', 'pausado'])))
    .orderBy(asc(clients.name));
  return <CorreosView clients={list} />;
}

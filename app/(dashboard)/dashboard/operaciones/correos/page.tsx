import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { clients } from '@/lib/db/schema';
import { requirePagePermission } from '@/lib/auth/permissions';
import { CorreosView } from './correos-view';

export const dynamic = 'force-dynamic';

// ?id= abre ese correo al entrar (lo usa Para ti para «Ver el correo completo»).
export default async function CorreosPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const user = await requirePagePermission('edit');
  const { id } = await searchParams;
  const initialId = id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
  // Clientes a los que se puede asignar un correo: todos menos los dados de baja.
  const list = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(and(eq(clients.tenantId, user.tenantId), inArray(clients.status, ['prospecto', 'onboarding', 'activo', 'pausado'])))
    .orderBy(asc(clients.name));
  return <CorreosView clients={list} initialId={initialId} />;
}

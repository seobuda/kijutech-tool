import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/db/queries';
import { getClickUpConnection } from '@/lib/operaciones/queries';
import { ensureFresh, getStructure, selectedSpaces } from '@/lib/operaciones/structure';
import { getWorkTypeOptions } from '@/lib/operaciones/work-types';
import { SyncPending } from '../sync-pending';
import { NuevoEncargoForm } from './nuevo-encargo-form';

export const dynamic = 'force-dynamic';

export default async function NuevoEncargoPage() {
  const user = await getUser();
  if (!user) redirect('/sign-in');

  const conn = await getClickUpConnection(user.tenantId);
  if (!conn) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center space-y-3">
        <p className="font-medium">Todavía no has conectado ClickUp</p>
        <p className="text-sm text-muted-foreground">
          Hace falta el token para elegir la lista de destino y crear la tarea.
        </p>
        <Link
          href="/dashboard/operaciones/ajustes"
          className="inline-block rounded-full bg-orange-500 px-4 py-2 text-sm text-white hover:bg-orange-600"
        >
          Ir a Ajustes ClickUp
        </Link>
      </div>
    );
  }

  // Las listas y los miembros salen de la caché: abrir esta página NO llama a ClickUp.
  const structure = await getStructure(user.tenantId);
  void ensureFresh(user.tenantId);
  if (!structure.syncedAt) return <SyncPending reason="never" />;
  const spaces = selectedSpaces(structure);
  if (spaces.length === 0) return <SyncPending reason="no-spaces" />;

  return <NuevoEncargoForm spaces={spaces} clientFields={structure.clientFields} workTypes={await getWorkTypeOptions(user.tenantId)} members={structure.members} meId={structure.meId ?? ''} />;
}

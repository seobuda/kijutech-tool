import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PlugZap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/page';
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
      <EmptyState
        icon={PlugZap}
        title="Todavía no has conectado ClickUp"
        description="Hace falta el token para elegir la lista de destino y crear la tarea."
        action={
          <Button asChild className="bg-brand text-white hover:bg-brand/90">
            <Link href="/dashboard/operaciones/ajustes">Ir a Ajustes ClickUp</Link>
          </Button>
        }
      />
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

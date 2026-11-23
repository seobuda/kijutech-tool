import { ProjectForm } from '../project-form';
import { requirePagePermission } from '@/lib/auth/permissions';
import { clientsForProjectPicker } from '@/lib/projects/scope';

// ?cliente=<id o nombre> (desde la ficha del cliente) deja el cliente ya elegido.
export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  // Crear un proyecto es de editor o más (la acción ya lo exige; la página también).
  const user = await requirePagePermission('edit');
  const { cliente } = await searchParams;
  const clients = await clientsForProjectPicker(user.tenantId);
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8 lg:py-8">
      <h1 className="text-lg lg:text-2xl font-medium mb-6">Nuevo proyecto</h1>
      <ProjectForm clients={clients} defaultClient={cliente?.slice(0, 200)} />
    </section>
  );
}

import { ProjectForm } from '../project-form';
import { requirePagePermission } from '@/lib/auth/permissions';

// ?cliente=<nombre> (desde la pestaña SEO de la ficha del cliente) deja el cliente ya escrito.
export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  // Crear un proyecto es de editor o más (la acción ya lo exige; la página también).
  await requirePagePermission('edit');
  const { cliente } = await searchParams;
  return (
    <section className="mx-auto w-full max-w-[1400px] px-4 py-6 lg:px-8 lg:py-8">
      <h1 className="text-lg lg:text-2xl font-medium mb-6">Nuevo proyecto</h1>
      <ProjectForm defaultClientName={cliente?.slice(0, 200)} />
    </section>
  );
}

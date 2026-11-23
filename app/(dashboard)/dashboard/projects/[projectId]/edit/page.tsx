import { notFound } from 'next/navigation';
import { getProjectById } from '@/lib/db/queries';
import { ProjectForm } from '../../project-form';
import { requirePagePermission } from '@/lib/auth/permissions';
import { clientsForProjectPicker, projectAssetIds } from '@/lib/projects/scope';

export default async function EditProjectPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  // Editar un proyecto es de editor o más (la acción ya lo exige; la página también).
  const user = await requirePagePermission('edit');
  const { projectId } = await params;
  const project = await getProjectById(projectId);

  if (!project) {
    notFound();
  }
  const [clients, scope] = await Promise.all([clientsForProjectPicker(user.tenantId), projectAssetIds(project.id)]);

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6 lg:px-8 lg:py-8">
      <h1 className="text-lg lg:text-2xl font-medium mb-6">Editar proyecto</h1>
      <ProjectForm project={project} clients={clients} scope={scope} />
    </section>
  );
}

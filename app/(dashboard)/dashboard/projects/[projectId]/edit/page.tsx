import { notFound } from 'next/navigation';
import { getProjectById } from '@/lib/db/queries';
import { ProjectForm } from '../../project-form';

export default async function EditProjectPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProjectById(projectId);

  if (!project) {
    notFound();
  }

  return (
    <section className="flex-1 p-4 lg:p-8">
      <h1 className="text-lg lg:text-2xl font-medium mb-6">Editar proyecto</h1>
      <ProjectForm project={project} />
    </section>
  );
}

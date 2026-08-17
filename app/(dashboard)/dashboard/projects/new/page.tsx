import { ProjectForm } from '../project-form';

export default function NewProjectPage() {
  return (
    <section className="flex-1 p-4 lg:p-8">
      <h1 className="text-lg lg:text-2xl font-medium mb-6">Nuevo proyecto</h1>
      <ProjectForm />
    </section>
  );
}

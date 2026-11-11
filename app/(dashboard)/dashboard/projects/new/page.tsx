import { ProjectForm } from '../project-form';

export default function NewProjectPage() {
  return (
    <section className="mx-auto w-full max-w-[1400px] px-4 py-6 lg:px-8 lg:py-8">
      <h1 className="text-lg lg:text-2xl font-medium mb-6">Nuevo proyecto</h1>
      <ProjectForm />
    </section>
  );
}

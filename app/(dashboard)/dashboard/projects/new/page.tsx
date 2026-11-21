import { ProjectForm } from '../project-form';

// ?cliente=<nombre> (desde la pestaña SEO de la ficha del cliente) deja el cliente ya escrito.
export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ cliente?: string }> }) {
  const { cliente } = await searchParams;
  return (
    <section className="mx-auto w-full max-w-[1400px] px-4 py-6 lg:px-8 lg:py-8">
      <h1 className="text-lg lg:text-2xl font-medium mb-6">Nuevo proyecto</h1>
      <ProjectForm defaultClientName={cliente?.slice(0, 200)} />
    </section>
  );
}

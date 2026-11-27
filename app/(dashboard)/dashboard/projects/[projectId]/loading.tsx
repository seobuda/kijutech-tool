// Carga de cualquier pantalla del proyecto (plan de UX v2, fase 1): esqueleto en lugar de pantalla en blanco.
import { PageContainer } from '@/components/ui/page';

export default function ProjectLoading() {
  return (
    <PageContainer>
      <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Cargando el proyecto">
        <div className="h-4 w-24 rounded bg-muted" />
        <div className="h-8 w-80 max-w-full rounded bg-muted" />
        <div className="h-9 w-full rounded bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-muted" />
          ))}
        </div>
        <div className="h-64 rounded-xl bg-muted" />
      </div>
    </PageContainer>
  );
}

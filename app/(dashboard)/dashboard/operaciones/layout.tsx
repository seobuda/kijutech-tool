import { OperacionesTabs } from './operaciones-tabs';

export default function OperacionesLayout({ children }: { children: React.ReactNode }) {
  return (
    <section className="flex-1 p-4 lg:p-8 space-y-6">
      <div>
        <h1 className="text-lg lg:text-2xl font-medium">Operaciones</h1>
        <p className="text-sm text-muted-foreground">
          Seguimiento del trabajo del equipo con datos en directo de ClickUp.
        </p>
      </div>
      <OperacionesTabs />
      {children}
    </section>
  );
}

import { requirePagePermission } from '@/lib/auth/permissions';
import { PageContainer } from '@/components/ui/page';
import { OperacionesTabs } from './operaciones-tabs';

// Módulo Operaciones, mostrado en tres secciones (Operaciones, Equipo y Sistema): la cabecera y las
// pestañas dependen de la ruta (ver OPS_SECTIONS en components/app-shell/nav.ts).
export default async function OperacionesLayout({ children }: { children: React.ReactNode }) {
  await requirePagePermission('view');
  return (
    <PageContainer className="space-y-6">
      <OperacionesTabs />
      <div className="animate-fade-up">{children}</div>
    </PageContainer>
  );
}

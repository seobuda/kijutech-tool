import { LayoutGrid } from 'lucide-react';
import { requirePagePermission } from '@/lib/auth/permissions';
import { PageContainer, PageHeader } from '@/components/ui/page';
import { OperacionesTabs } from './operaciones-tabs';

export default async function OperacionesLayout({ children }: { children: React.ReactNode }) {
  await requirePagePermission('view');
  return (
    <PageContainer className="space-y-6">
      <PageHeader
        icon={LayoutGrid}
        title="Operaciones"
        description="El centro de mando del agente: entrada de trabajo, equipo, clientes y seguimiento con datos en directo de ClickUp."
      />
      <OperacionesTabs />
      <div className="animate-fade-up">{children}</div>
    </PageContainer>
  );
}

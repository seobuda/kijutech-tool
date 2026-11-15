import { LineChart } from 'lucide-react';
import { checkPermission, requirePagePermission } from '@/lib/auth/permissions';
import { PageContainer, PageHeader } from '@/components/ui/page';
import { tenantOverview } from '@/lib/rendimiento/report';
import { getSettings } from '@/lib/rendimiento/store';
import { PanelView } from './panel-view';

export const dynamic = 'force-dynamic';

// Panel central de Rendimiento (módulo Rendimiento, paso B2): todos los clientes con sus cifras de Google de los últimos
// 28 días frente a los 28 anteriores, para ver de un vistazo quién cae y quién sube. Sin llamadas a Google.
export default async function RendimientoPage() {
  const user = await requirePagePermission('edit');
  const [rows, isAdmin, settings] = await Promise.all([tenantOverview(user.tenantId, 28), checkPermission('admin').then((r) => r.ok), getSettings(user.tenantId)]);
  return (
    <PageContainer className="space-y-6">
      <PageHeader
        icon={LineChart}
        title="Rendimiento de los clientes"
        description="Clics desde Google, sesiones, conversiones y su ficha de Google de cada cliente: últimos 28 días (hasta el último día con datos) frente a los 28 anteriores. Se guarda cada día, así que el histórico va más allá de los 16 meses de Google."
      />
      <PanelView
        rows={rows}
        isAdmin={isAdmin}
        settings={{
          alertsEnabled: settings.alertsEnabled,
          alertPct: settings.alertPct,
          alertRises: settings.alertRises,
          alertMinVolume: settings.alertMinVolume,
          monthlyReport: settings.monthlyReport,
          weeklySection: settings.weeklySection
        }}
      />
    </PageContainer>
  );
}

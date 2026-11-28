import Link from 'next/link';
import { ArrowLeft, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageContainer, PageHeader } from '@/components/ui/page';
import { requirePagePermission } from '@/lib/auth/permissions';
import { settingsView } from '@/lib/ads/access';
import { AjustesView } from './ajustes-view';

export const dynamic = 'force-dynamic';

// Google Ads · Ajustes (solo admin): conexión (clave de la cuenta de servicio o «SIM», MCC, token de desarrollador
// opcional, versión de la API), «Probar conexión», descarga y la lista de cuentas con su cliente y su nivel. Las
// credenciales nunca llegan al navegador: solo si están guardadas y una pista enmascarada.
export default async function AdsAjustesPage() {
  const user = await requirePagePermission('admin');
  const view = await settingsView(user.tenantId);
  return (
    <PageContainer className="space-y-6">
      <PageHeader
        icon={Settings}
        title="Ajustes de Google Ads"
        description="Conexión con la MCC de la agencia (solo lectura), descarga de los datos y cuentas que se siguen. La herramienta no cambia nada en Google Ads."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/ads">
              <ArrowLeft aria-hidden /> Volver a Google Ads
            </Link>
          </Button>
        }
      />
      <AjustesView settings={view.settings} accounts={view.accounts} clients={view.clients} />
    </PageContainer>
  );
}

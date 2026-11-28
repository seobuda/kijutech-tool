import Link from 'next/link';
import { ArrowLeft, Briefcase, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState, PageContainer, PageHeader, Section } from '@/components/ui/page';
import { checkPermission, requirePagePermission } from '@/lib/auth/permissions';
import { portfolioView } from '@/lib/ads/views';
import { CarteraTable } from './cartera-table';

export const dynamic = 'force-dynamic';

// Google Ads · Cartera (paso 2; diseño §7): una fila por cuenta seguida para ver de un vistazo cómo va cada una sin entrar
// en las 25. Lo no comprobado sale en gris; el CPL se compara con el objetivo o, sin él, con su línea base (avisando de que
// no es un objetivo de negocio). Sin llamadas a Google.
export default async function AdsCarteraPage() {
  const user = await requirePagePermission('view');
  const [{ rows, coverage, currencies }, isAdmin] = await Promise.all([portfolioView(user.tenantId), checkPermission('admin').then((r) => r.ok)]);
  return (
    <PageContainer className="space-y-6">
      <PageHeader
        icon={Briefcase}
        title="Google Ads · Cartera"
        description="Todas las cuentas seguidas en una tabla: gasto y ritmo del mes, CPL frente a su objetivo, conversiones, medición, hallazgos abiertos, último cambio y revisiones. Pulsa una columna para ordenar y una cuenta para abrir su expediente."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/ads">
              <ArrowLeft aria-hidden /> Volver a Hoy
            </Link>
          </Button>
        }
      />
      {coverage.mode === 'sim' && (
        <div role="status" className="rounded-xl border bg-warning-soft px-4 py-3 text-sm text-warning-strong">
          <strong>SIMULADO.</strong> Cuentas y cifras inventadas: no tienen cliente ni objetivo, y el CPL se compara con su línea base.
        </div>
      )}
      {!rows.length ? (
        <EmptyState
          icon={Megaphone}
          title="Aún no hay cuentas seguidas"
          description={coverage.configured ? 'Cuando la descarga traiga las cuentas de la MCC aparecerán aquí, una por fila.' : 'Google Ads aún no está conectado.'}
          action={isAdmin ? <Button asChild><Link href="/dashboard/ads/ajustes">Ir a Ajustes de Google Ads</Link></Button> : <Button asChild variant="outline"><Link href="/dashboard/ads">Volver a Hoy</Link></Button>}
        />
      ) : (
        <Section title={`${rows.length} cuenta${rows.length > 1 ? 's' : ''}`} description={`${coverage.headline}${currencies.length > 1 ? ` Hay cuentas en ${currencies.join(', ')}: cada cifra va en la moneda de su cuenta y no se suman.` : ''} Ritmo: proyección a fin de mes frente al presupuesto acordado o, sin acuerdo, la suma de presupuestos diarios.`}>
          <CarteraTable rows={rows} />
        </Section>
      )}
    </PageContainer>
  );
}

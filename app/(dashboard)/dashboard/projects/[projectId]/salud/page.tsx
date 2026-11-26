// Proyecto → Salud técnica (Hito 1 SEO, 23 nov 2026). Rastreo de la web del alcance, hallazgos de la auditoría (sin IA)
// y los datos estructurados (JSON-LD) listos para pegar, generados desde la ficha del cliente.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Stethoscope } from 'lucide-react';
import { checkPermission, requirePagePermission } from '@/lib/auth/permissions';
import { PageContainer, PageHeader } from '@/components/ui/page';
import { getSaludView } from '@/lib/seo/salud/view';
import { BUSINESS_TYPES } from '@/lib/core/business-types';
import { ProjectSeoNav } from '../seo-nav';
import { SaludPanel } from './salud-panel';
import { VigilanciaPanel } from './vigilancia-panel';
import { VelocidadPanel } from './velocidad-panel';
import { getVigilanciaView } from '@/lib/seo/vigilancia/view';

export default async function SaludPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ tipo?: string }> }) {
  const user = await requirePagePermission('view');
  const { projectId } = await params;
  const { tipo } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) notFound();
  const [view, canEdit, vigilancia] = await Promise.all([getSaludView(user.tenantId, projectId, tipo ?? null), checkPermission('edit').then((r) => r.ok), getVigilanciaView(user.tenantId, projectId)]);
  if (!view) notFound();

  return (
    <PageContainer>
      <Link href="/dashboard/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Proyectos
      </Link>
      <PageHeader
        icon={Stethoscope}
        title={`Salud técnica · ${view.project.name}`}
        description={
          <>
            {view.project.clientName ? `Cliente: ${view.project.clientName}. ` : ''}
            Rastreamos la web como lo haría Google, aplicamos las comprobaciones técnicas sin IA y lo que falla queda como hallazgo. Lo que se arregla se cierra solo en la siguiente auditoría.
          </>
        }
      />
      <ProjectSeoNav projectId={projectId} active="salud" />
      {vigilancia && <VigilanciaPanel projectId={projectId} view={vigilancia} canEdit={canEdit} />}
      {vigilancia && <VelocidadPanel speed={vigilancia.speed} />}
      <SaludPanel view={view} canEdit={canEdit} businessType={view.businessType} businessTypes={BUSINESS_TYPES} />
    </PageContainer>
  );
}

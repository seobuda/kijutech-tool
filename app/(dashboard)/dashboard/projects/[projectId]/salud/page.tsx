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
import { listMoneyPages } from '@/lib/seo/cambios/dinero';
import { listChanges } from '@/lib/seo/cambios/registro';
import { CambiosPanel } from './cambios-panel';
import { pickView, SubNav } from '../sub-nav';

export default async function SaludPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ tipo?: string; vista?: string }> }) {
  const user = await requirePagePermission('view');
  const { projectId } = await params;
  const { tipo, vista: rawVista } = await searchParams;
  const vista = pickView(rawVista, ['problemas', 'vigilancia', 'cambios'] as const);
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) notFound();
  const [view, canEdit, vigilancia, money, changes] = await Promise.all([getSaludView(user.tenantId, projectId, tipo ?? null), checkPermission('edit').then((r) => r.ok), getVigilanciaView(user.tenantId, projectId), listMoneyPages(user.tenantId, projectId), listChanges(user.tenantId, projectId)]);
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
      <SubNav
        base={`/dashboard/projects/${projectId}/salud`}
        active={vista}
        items={[
          { key: 'problemas', label: 'Problemas', count: view.open.length, alert: view.counts.critico > 0 },
          { key: 'vigilancia', label: 'Vigilancia y velocidad', count: vigilancia?.processes.filter((x) => x.lastStatus === 'aviso' || x.lastStatus === 'error').length ?? 0, alert: true },
          { key: 'cambios', label: 'Páginas de dinero y cambios', count: money.filter((m) => m.pending).length, alert: true }
        ]}
      />
      {vista === 'vigilancia' && vigilancia && <VigilanciaPanel projectId={projectId} view={vigilancia} canEdit={canEdit} />}
      {vista === 'vigilancia' && vigilancia && <VelocidadPanel speed={vigilancia.speed} />}
      {vista === 'cambios' && <CambiosPanel projectId={projectId} money={money} changes={changes} canEdit={canEdit} />}
      {vista === 'problemas' && <SaludPanel view={view} canEdit={canEdit} businessType={view.businessType} businessTypes={BUSINESS_TYPES} />}
    </PageContainer>
  );
}

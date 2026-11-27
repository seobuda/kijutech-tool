// Proyecto → Autoridad (SEO parte 10, 27 nov 2026; docs/DISENO-SEO-CIERRE.md §B): enlaces del cliente frente a su
// competencia confirmada, dominios nuevos y perdidos, y webs que enlazan a la competencia y no al cliente (huecos).
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Link2 } from 'lucide-react';
import { checkPermission, requirePagePermission } from '@/lib/auth/permissions';
import { PageContainer, PageHeader } from '@/components/ui/page';
import { getAutoridadView } from '@/lib/seo/autoridad/autoridad';
import { getDossierView } from '@/lib/seo/expediente/view';
import { ProjectSeoNav } from '../seo-nav';
import { AutoridadPanel } from './autoridad-panel';

export default async function AutoridadPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await requirePagePermission('view');
  const { projectId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) notFound();
  const [dossier, view, canEdit, isAdmin] = await Promise.all([
    getDossierView(user.tenantId, projectId),
    getAutoridadView(user.tenantId, projectId),
    checkPermission('edit').then((r) => r.ok),
    checkPermission('admin').then((r) => r.ok)
  ]);
  if (!dossier) notFound();
  return (
    <PageContainer>
      <Link href="/dashboard/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Proyectos
      </Link>
      <PageHeader
        icon={Link2}
        title={`Autoridad · ${dossier.project.name}`}
        description="Cuántas webs enlazan a este negocio frente a su competencia confirmada, cuáles gana y pierde cada mes, y qué webs enlazan a la competencia y no a él (las oportunidades de enlace más realistas). Datos de DataForSEO: son una estimación, no la lista completa de Google."
      />
      <ProjectSeoNav projectId={projectId} active="autoridad" />
      <AutoridadPanel projectId={projectId} view={view} canEdit={canEdit} isAdmin={isAdmin} />
    </PageContainer>
  );
}

// Proyecto → Expediente (Hito 1 SEO, 23 nov 2026). Lo que el sistema sabe del negocio, cada dato con su origen y su
// confianza: se recoge solo (ficha, web, archivo de Internet, Search Console) y una persona confirma, no escribe.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, IdCard } from 'lucide-react';
import { checkPermission, requirePagePermission } from '@/lib/auth/permissions';
import { PageContainer, PageHeader } from '@/components/ui/page';
import { getDossierView } from '@/lib/seo/expediente/view';
import { BUSINESS_TYPES } from '@/lib/core/business-types';
import { ProjectSeoNav } from '../seo-nav';
import { DossierPanel } from './dossier-panel';

export default async function ExpedientePage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await requirePagePermission('view');
  const { projectId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) notFound();
  const [view, canEdit] = await Promise.all([getDossierView(user.tenantId, projectId), checkPermission('edit').then((r) => r.ok)]);
  if (!view) notFound();
  return (
    <PageContainer>
      <Link href="/dashboard/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Proyectos
      </Link>
      <PageHeader
        icon={IdCard}
        title={`Expediente · ${view.project.name}`}
        description={
          <>
            {view.project.clientName ? `Cliente: ${view.project.clientName}. ` : ''}
            El sistema reúne lo que se sabe del negocio desde la ficha, su web, el archivo de Internet y Search Console. Cada dato lleva de dónde sale y cuánto nos fiamos: tú confirmas o corriges.
          </>
        }
      />
      <ProjectSeoNav projectId={projectId} active="expediente" />
      <DossierPanel view={view} canEdit={canEdit} businessTypes={BUSINESS_TYPES} />
    </PageContainer>
  );
}

// Proyecto → Posiciones (SEO parte 4, 26 nov 2026): la posición real en Google de las búsquedas que se siguen, cada
// semana, con el mapa (paquete local), el AI Overview y la cuota de visibilidad frente a la competencia confirmada.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, TrendingUp } from 'lucide-react';
import { checkPermission, requirePagePermission } from '@/lib/auth/permissions';
import { PageContainer, PageHeader } from '@/components/ui/page';
import { getPositionsView } from '@/lib/seo/posiciones/view';
import { getDossierView } from '@/lib/seo/expediente/view';
import { ProjectSeoNav } from '../seo-nav';
import { PosicionesPanel } from './posiciones-panel';

export default async function PosicionesPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await requirePagePermission('view');
  const { projectId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) notFound();
  const [view, canEdit, dossier] = await Promise.all([getPositionsView(user.tenantId, projectId), checkPermission('edit').then((r) => r.ok), getDossierView(user.tenantId, projectId)]);
  if (!view || !dossier) notFound();
  return (
    <PageContainer>
      <Link href="/dashboard/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Proyectos
      </Link>
      <PageHeader
        icon={TrendingUp}
        title={`Posiciones · ${dossier.project.name}`}
        description="Dónde sale de verdad en Google cada semana, desde su zona y en móvil: el resultado normal, el mapa con negocios y el resumen de IA (AI Overview). Las búsquedas salen solas de Search Console, de sus servicios × su zona y de su marca; puedes añadir, pausar o quitar."
      />
      <ProjectSeoNav projectId={projectId} active="posiciones" />
      <PosicionesPanel projectId={projectId} view={view} canEdit={canEdit} />
    </PageContainer>
  );
}

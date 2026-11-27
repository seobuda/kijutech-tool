// Proyecto → Local (SEO parte 5a, 26 nov 2026): la ficha de Google del cliente (identificada y vigilada), sus reseñas
// frente a la competencia y el enlace para conseguir reseñas. Datos de DataForSEO (Google Places no permite guardarlos).
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, MapPin } from 'lucide-react';
import { checkPermission, requirePagePermission } from '@/lib/auth/permissions';
import { PageContainer, PageHeader } from '@/components/ui/page';
import { getLocalView } from '@/lib/seo/local/view';
import { getDossierView } from '@/lib/seo/expediente/view';
import { ProjectSeoNav } from '../seo-nav';
import { LocalPanel } from './local-panel';
import { GeogridPanel } from './geogrid-panel';
import { getGeogridView } from '@/lib/seo/local/geogrid-view';
import { getCitasView } from '@/lib/seo/local/citas-view';
import { CitasPanel } from './citas-panel';

export default async function LocalPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await requirePagePermission('view');
  const { projectId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) notFound();
  const [view, canEdit, dossier, grid, citas] = await Promise.all([getLocalView(user.tenantId, projectId), checkPermission('edit').then((r) => r.ok), getDossierView(user.tenantId, projectId), getGeogridView(user.tenantId, projectId), getCitasView(user.tenantId, projectId)]);
  if (!view || !dossier) notFound();
  return (
    <PageContainer>
      <Link href="/dashboard/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Proyectos
      </Link>
      <PageHeader
        icon={MapPin}
        title={`Local · ${dossier.project.name}`}
        description="Su ficha de Google: la vigilamos cada semana (si cambia el nombre, la categoría, el teléfono, la web o el horario, o si aparece cerrada) y comparamos sus reseñas con las de la competencia. Abajo, el enlace para pedir reseñas a sus clientes."
      />
      <ProjectSeoNav projectId={projectId} active="local" />
      <LocalPanel projectId={projectId} view={view} canEdit={canEdit} clientName={dossier.project.clientName ?? dossier.project.name} />
      {view.client && <GeogridPanel projectId={projectId} grid={grid} canEdit={canEdit} />}
      {view.clientId && <CitasPanel projectId={projectId} citas={citas} canEdit={canEdit} name={view.client?.snap?.title ?? dossier.project.clientName ?? dossier.project.name} category={view.client?.snap?.category ?? null} projectPath={`/dashboard/projects/${projectId}`} />}
    </PageContainer>
  );
}

// Proyecto → IA (SEO parte 11, 27 nov 2026; docs/DISENO-SEO-CIERRE.md §A): si ChatGPT, Gemini, Google (modo IA) y
// Perplexity recomiendan al cliente o a su competencia ante las preguntas de compra que se siguen. Tres muestras al mes.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Bot } from 'lucide-react';
import { checkPermission, requirePagePermission } from '@/lib/auth/permissions';
import { PageContainer, PageHeader } from '@/components/ui/page';
import { getAiPanelView } from '@/lib/seo/panel-ia/panel';
import { getDossierView } from '@/lib/seo/expediente/view';
import { ProjectSeoNav } from '../seo-nav';
import { IaPanel } from './ia-panel';

export default async function IaPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await requirePagePermission('view');
  const { projectId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) notFound();
  const [dossier, view, canEdit] = await Promise.all([getDossierView(user.tenantId, projectId), getAiPanelView(user.tenantId, projectId), checkPermission('edit').then((r) => r.ok)]);
  if (!dossier) notFound();
  return (
    <PageContainer>
      <Link href="/dashboard/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Proyectos
      </Link>
      <PageHeader
        icon={Bot}
        title={`IA · ${dossier.project.name}`}
        description="Qué responden ChatGPT, Gemini, Google (modo IA) y Perplexity a las preguntas que haría un cliente, y si nombran o citan a este negocio o a su competencia. Se pregunta tres veces al mes porque las respuestas cambian: es una muestra, no una verdad."
      />
      <ProjectSeoNav projectId={projectId} active="ia" />
      <IaPanel projectId={projectId} view={view} canEdit={canEdit} />
    </PageContainer>
  );
}

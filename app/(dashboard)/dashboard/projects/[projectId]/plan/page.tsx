// Proyecto → Plan de mejora (Hito 1 SEO, 23 nov 2026). Propuestas de trabajo hechas por reglas a partir de los hallazgos
// de Salud técnica (sin IA), ordenadas por gravedad e impacto en Google y ajustadas a las horas del proyecto. Al aprobar
// una, se crea el encargo y queda registrada su técnica y su hipótesis para medir después si funcionó.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { ArrowLeft, ClipboardList } from 'lucide-react';
import { db } from '@/lib/db/drizzle';
import { clients, projects } from '@/lib/db/schema';
import { checkPermission, requirePagePermission } from '@/lib/auth/permissions';
import { PageContainer, PageHeader } from '@/components/ui/page';
import { listPlanItems } from '@/lib/seo/plan/plan';
import { techniqueLabel } from '@/lib/core/techniques';
import { ProjectSeoNav } from '../seo-nav';
import { PlanPanel, type PlanItemView } from './plan-panel';

export default async function PlanPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await requirePagePermission('view');
  const { projectId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) notFound();
  const [p] = await db
    .select({ id: projects.id, name: projects.name, clientId: projects.clientId, clientName: clients.name, monthlyHours: projects.monthlyHours })
    .from(projects)
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, user.tenantId)))
    .limit(1);
  if (!p) notFound();
  const [items, canEdit] = await Promise.all([listPlanItems(user.tenantId, projectId), checkPermission('edit').then((r) => r.ok)]);
  const view: PlanItemView[] = items.map((i) => ({
    id: i.id,
    title: i.title,
    description: i.description,
    technique: i.technique,
    techniqueLabel: techniqueLabel(i.technique),
    priority: i.priority,
    estHours: Number(i.estHours),
    urls: i.urls.length,
    overHours: Boolean((i.evidence as { overHours?: boolean }).overHours),
    impressions: Number((i.evidence as { impressions?: number }).impressions ?? 0),
    hypothesis: i.hypothesis,
    status: i.status,
    requestUrl: i.requestUrl,
    requestError: i.requestError,
    decidedBy: i.decidedBy,
    decidedAt: i.decidedAt?.toISOString() ?? null,
    rejectNote: i.rejectNote,
    updatedAt: i.updatedAt.toISOString()
  }));
  return (
    <PageContainer>
      <Link href="/dashboard/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Proyectos
      </Link>
      <PageHeader
        icon={ClipboardList}
        title={`Plan de mejora · ${p.name}`}
        description={
          <>
            {p.clientName ? `Cliente: ${p.clientName}. ` : ''}
            Lo que hay que arreglar, agrupado en encargos y ordenado por gravedad y por lo que se ve en Google. Se rehace solo después de cada auditoría. Al aprobar una propuesta se crea el encargo.
          </>
        }
      />
      <ProjectSeoNav projectId={projectId} active="plan" />
      <PlanPanel projectId={projectId} items={view} canEdit={canEdit} monthlyHours={p.monthlyHours != null ? Number(p.monthlyHours) : null} />
    </PageContainer>
  );
}

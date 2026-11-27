// Proyecto → Trabajo → Plan de servicio (Jefe SEO, D2; docs/PLAN-SEO-JEFE.md §4). El plan a 12-24 meses que propone el Jefe
// SEO con Opus: tesis, diagnóstico, frentes por trimestre con sus evidencias y pronósticos, riesgos, lo que no sabe y lo que
// descartó. Los planes en sombra solo los ven administradores; el resto del equipo ve el aprobado.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { ArrowLeft, Compass } from 'lucide-react';
import { db } from '@/lib/db/drizzle';
import { clients, projects } from '@/lib/db/schema';
import { checkPermission, requirePagePermission } from '@/lib/auth/permissions';
import { PageContainer, PageHeader } from '@/components/ui/page';
import { getPlanView } from '@/lib/seo/jefe/plan';
import { listPlanChanges } from '@/lib/seo/jefe/cambios';
import { ProjectSeoNav } from '../seo-nav';
import { ServicioPanel } from './servicio-panel';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ServicioPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ v?: string }> }) {
  const user = await requirePagePermission('view');
  const { projectId } = await params;
  const { v } = await searchParams;
  if (!UUID.test(projectId)) notFound();
  const [p] = await db
    .select({ id: projects.id, name: projects.name, clientName: clients.name })
    .from(projects)
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, user.tenantId)))
    .limit(1);
  if (!p) notFound();
  const isAdmin = (await checkPermission('admin')).ok;
  const view = await getPlanView(user.tenantId, projectId, isAdmin, v && UUID.test(v) ? v : null);
  // Cambios propuestos y conversación con el Jefe: solo administradores (la página se abre con permiso de lectura).
  const changes = isAdmin ? await listPlanChanges(user.tenantId, projectId) : [];
  return (
    <PageContainer>
      <Link href="/dashboard/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Proyectos
      </Link>
      <PageHeader
        icon={Compass}
        title={`Plan de servicio · ${p.clientName ?? p.name}`}
        description="El rumbo del proyecto a 12-24 meses: qué se trabaja en cada trimestre y por qué, con los datos que lo respaldan. Lo propone el Jefe SEO y lo aprueba un administrador; las estrategias trimestrales salen de aquí."
      />
      <ProjectSeoNav projectId={projectId} active="servicio" />
      <ServicioPanel projectId={projectId} view={JSON.parse(JSON.stringify(view))} isAdmin={isAdmin} changes={JSON.parse(JSON.stringify(changes))} />
    </PageContainer>
  );
}

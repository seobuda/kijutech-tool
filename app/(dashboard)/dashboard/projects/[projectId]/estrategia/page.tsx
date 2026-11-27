// Proyecto → Trabajo → Estrategia (ciclos; docs/PLAN-SEO-CICLOS.md, fases A+C, aprobado por Enric el 27 nov 2026).
// La estrategia activa del proyecto: líneas del catálogo, ritmo, calendario por semanas y el lote de cada mes para aprobar.
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { ArrowLeft, Target } from 'lucide-react';
import { db } from '@/lib/db/drizzle';
import { clients, projects } from '@/lib/db/schema';
import { checkPermission, requirePagePermission } from '@/lib/auth/permissions';
import { PageContainer, PageHeader } from '@/components/ui/page';
import { getCycleView } from '@/lib/seo/estrategia/ciclos';
import { ProjectSeoNav } from '../seo-nav';
import { EstrategiaPanel } from './estrategia-panel';

export default async function EstrategiaPage({ params }: { params: Promise<{ projectId: string }> }) {
  const user = await requirePagePermission('view');
  const { projectId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) notFound();
  const [p] = await db
    .select({ id: projects.id, name: projects.name, clientName: clients.name })
    .from(projects)
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, user.tenantId)))
    .limit(1);
  if (!p) notFound();
  const [view, canEdit, isAdmin] = await Promise.all([getCycleView(user.tenantId, projectId), checkPermission('edit').then((r) => r.ok), checkPermission('admin').then((r) => r.ok)]);
  return (
    <PageContainer>
      <Link href="/dashboard/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        Proyectos
      </Link>
      <PageHeader icon={Target} title={`Estrategia · ${p.clientName ?? p.name}`} description="El trabajo planificado del proyecto por periodos (trimestral por defecto): qué líneas se hacen, a qué ritmo y cuándo cae cada tarea. Los arreglos que van saliendo siguen en el Plan de mejora, con su reserva de horas." />
      <ProjectSeoNav projectId={projectId} active="estrategia" />
      <EstrategiaPanel projectId={projectId} view={JSON.parse(JSON.stringify(view))} canEdit={canEdit} isAdmin={isAdmin} />
    </PageContainer>
  );
}

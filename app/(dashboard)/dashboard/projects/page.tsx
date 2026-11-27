import Link from 'next/link';
import { ClientesTabs } from '@/components/clientes-tabs';
import { Button } from '@/components/ui/button';
import { Archive, ArrowUpRight, FolderKanban, Globe, Pencil, PlusCircle, Stethoscope } from 'lucide-react';
import { getProjectsForUser, getUser, getUserTenantRoleNames } from '@/lib/db/queries';
import { Badge, EmptyState, PageContainer, PageHeader } from '@/components/ui/page';
import { ArchiveProjectButton } from './archive-project-button';
import { requirePagePermission } from '@/lib/auth/permissions';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { findings, seoPlanItems } from '@/lib/db/schema';
import { reportError } from '@/lib/core/errors';

const MANAGE_ROLES = ['admin', 'super_admin'];

const STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'neutral' }> = {
  active: { label: 'Activo', tone: 'success' },
  paused: { label: 'En pausa', tone: 'warning' },
  archived: { label: 'Archivado', tone: 'neutral' }
};

export default async function ProjectsPage() {
  // Sin rol no se ve nada (regla de seguridad): la lista de proyectos es de lector o más.
  const me = await requirePagePermission('view');
  const user = await getUser();
  const [projects, roleNames] = await Promise.all([
    getProjectsForUser(),
    user ? getUserTenantRoleNames(user.id) : Promise.resolve([])
  ]);
  const canManage = roleNames.some((r) => MANAGE_ROLES.includes(r));
  // Semáforo de cada tarjeta (simulación SEO del 27 nov, atasco 7): problemas graves abiertos y propuestas por aprobar.
  const ids = projects.map((p) => p.id);
  const [sev, pend] = ids.length
    ? await Promise.all([
        db
          .select({ projectId: findings.projectId, severity: findings.severity, n: sql<number>`count(*)::int` })
          .from(findings)
          .where(and(eq(findings.tenantId, me.tenantId), inArray(findings.projectId, ids), eq(findings.status, 'abierto'), inArray(findings.severity, ['critico', 'importante'])))
          .groupBy(findings.projectId, findings.severity),
        db
          .select({ projectId: seoPlanItems.projectId, n: sql<number>`count(*)::int` })
          .from(seoPlanItems)
          .where(and(eq(seoPlanItems.tenantId, me.tenantId), inArray(seoPlanItems.projectId, ids), eq(seoPlanItems.status, 'pendiente')))
          .groupBy(seoPlanItems.projectId)
      ]).catch((error) => {
        reportError({ error, source: 'seo', area: 'semáforos de proyectos' });
        return [[], []] as const;
      })
    : [[], []];
  const countOf = (id: string, s: string) => Number(sev.find((x) => x.projectId === id && x.severity === s)?.n ?? 0);
  const pendingOf = (id: string) => Number(pend.find((x) => x.projectId === id)?.n ?? 0);

  const newButton = (
    <Button asChild className="bg-brand text-white hover:bg-brand/90">
      <Link href="/dashboard/projects/new">
        <PlusCircle className="size-4" />
        Nuevo proyecto
      </Link>
    </Button>
  );

  return (
    <PageContainer className="space-y-6">
      <ClientesTabs active="seo" />
      <PageHeader
        icon={FolderKanban}
        title="Proyectos SEO"
        description="Cada proyecto SEO de un cliente: su salud técnica, expediente, palabras, posiciones en Google, ficha y mapa local y plan de mejora."
        actions={
          <>
            {canManage && (
              <Button asChild variant="outline">
                <Link href="/dashboard/projects/archived">
                  <Archive className="size-4" />
                  Archivados
                </Link>
              </Button>
            )}
            {newButton}
          </>
        }
      />

      {projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="Todavía no hay proyectos"
          description="Crea el primero con el nombre del cliente y su dominio; después podrás abrir su recorrido SEO."
          action={newButton}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => {
            const st = STATUS[project.status] ?? { label: project.status, tone: 'neutral' as const };
            return (
              <li
                key={project.id}
                className="group flex flex-col rounded-xl border bg-card p-5 shadow-xs transition-shadow hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold">{project.name}</p>
                    <p className="truncate text-sm text-muted-foreground">{project.clientName || 'Sin cliente'}</p>
                  </div>
                  <Badge tone={st.tone} dot>
                    {st.label}
                  </Badge>
                </div>
                {(countOf(project.id, 'critico') > 0 || countOf(project.id, 'importante') > 0 || pendingOf(project.id) > 0) && (
                  <p className="mt-3 flex flex-wrap gap-1.5">
                    {countOf(project.id, 'critico') > 0 && <Badge tone="danger">{countOf(project.id, 'critico')} crítico(s)</Badge>}
                    {countOf(project.id, 'importante') > 0 && <Badge tone="warning">{countOf(project.id, 'importante')} importante(s)</Badge>}
                    {pendingOf(project.id) > 0 && <Badge tone="info">{pendingOf(project.id)} propuesta(s) por aprobar</Badge>}
                  </p>
                )}
                {project.domain && (
                  <p className="mt-3 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                    <Globe className="size-3.5 shrink-0" />
                    {project.domain}
                  </p>
                )}
                <div className="mt-5 flex items-center gap-2 border-t pt-4">
                  <Button asChild size="sm" className="bg-brand text-white hover:bg-brand/90">
                    <Link href={`/dashboard/projects/${project.id}/resumen`}>
                      Abrir SEO
                      <ArrowUpRight className="size-3.5" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/dashboard/projects/${project.id}/salud`}>
                      <Stethoscope className="size-3.5" />
                      Salud
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" aria-label="Editar proyecto">
                    <Link href={`/dashboard/projects/${project.id}/edit`}>
                      <Pencil className="size-3.5" />
                      Editar
                    </Link>
                  </Button>
                  {canManage && (
                    <div className="ml-auto">
                      <ArchiveProjectButton projectId={project.id} />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </PageContainer>
  );
}

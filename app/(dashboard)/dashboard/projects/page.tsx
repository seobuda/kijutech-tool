import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Archive, ArrowUpRight, FolderKanban, Globe, Pencil, PlusCircle } from 'lucide-react';
import { getProjectsForUser, getUser, getUserTenantRoleNames } from '@/lib/db/queries';
import { Badge, EmptyState, PageContainer, PageHeader } from '@/components/ui/page';
import { ArchiveProjectButton } from './archive-project-button';

const MANAGE_ROLES = ['admin', 'super_admin'];

const STATUS: Record<string, { label: string; tone: 'success' | 'warning' | 'neutral' }> = {
  active: { label: 'Activo', tone: 'success' },
  paused: { label: 'En pausa', tone: 'warning' },
  archived: { label: 'Archivado', tone: 'neutral' }
};

export default async function ProjectsPage() {
  const user = await getUser();
  const [projects, roleNames] = await Promise.all([
    getProjectsForUser(),
    user ? getUserTenantRoleNames(user.id) : Promise.resolve([])
  ]);
  const canManage = roleNames.some((r) => MANAGE_ROLES.includes(r));

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
      <PageHeader
        icon={FolderKanban}
        title="Proyectos SEO"
        description="Cada proyecto recorre las etapas del método: onboarding, kickoff, radiografía y keyword research."
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
                {project.domain && (
                  <p className="mt-3 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
                    <Globe className="size-3.5 shrink-0" />
                    {project.domain}
                  </p>
                )}
                <div className="mt-5 flex items-center gap-2 border-t pt-4">
                  <Button asChild size="sm" className="bg-brand text-white hover:bg-brand/90">
                    <Link href={`/dashboard/projects/${project.id}/seo`}>
                      Abrir SEO
                      <ArrowUpRight className="size-3.5" />
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

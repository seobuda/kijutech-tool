import Link from 'next/link';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Archive, Pencil, PlusCircle } from 'lucide-react';
import { getProjectsForUser, getUser, getUserTenantRoleNames } from '@/lib/db/queries';
import { ArchiveProjectButton } from './archive-project-button';

const MANAGE_ROLES = ['admin', 'super_admin'];

export default async function ProjectsPage() {
  const user = await getUser();
  const [projects, roleNames] = await Promise.all([
    getProjectsForUser(),
    user ? getUserTenantRoleNames(user.id) : Promise.resolve([])
  ]);
  const canManage = roleNames.some((r) => MANAGE_ROLES.includes(r));

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg lg:text-2xl font-medium">Proyectos</h1>
        <div className="flex items-center space-x-2">
          {canManage && (
            <Link href="/dashboard/projects/archived">
              <Button variant="outline">
                <Archive className="mr-2 h-4 w-4" />
                Proyectos archivados
              </Button>
            </Link>
          )}
          <Link href="/dashboard/projects/new">
            <Button className="bg-orange-500 hover:bg-orange-600 text-white">
              <PlusCircle className="mr-2 h-4 w-4" />
              Nuevo proyecto
            </Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Todos los proyectos</CardTitle>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <p className="text-muted-foreground">
              Todavía no hay proyectos. Crea el primero.
            </p>
          ) : (
            <ul className="space-y-4">
              {projects.map((project) => (
                <li
                  key={project.id}
                  className="flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium">{project.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {project.clientName || '—'} · {project.domain || '—'}
                    </p>
                  </div>
                  <div className="flex items-center space-x-4">
                    <p className="text-sm text-muted-foreground capitalize">
                      {project.status}
                    </p>
                    <Link href={`/dashboard/projects/${project.id}/edit`}>
                      <Button variant="outline" size="sm">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                    <Link href={`/dashboard/projects/${project.id}/seo`}>
                      <Button variant="outline" size="sm">
                        Abrir SEO
                      </Button>
                    </Link>
                    {canManage && (
                      <ArchiveProjectButton projectId={project.id} />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

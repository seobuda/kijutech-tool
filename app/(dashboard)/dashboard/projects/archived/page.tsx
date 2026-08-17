import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import {
  getArchivedProjectsForUser,
  getUser,
  getUserTenantRoleNames
} from '@/lib/db/queries';
import { RestoreProjectButton } from './restore-project-button';
import { DeleteProjectButton } from './delete-project-button';

const MANAGE_ROLES = ['admin', 'super_admin'];

export default async function ArchivedProjectsPage() {
  const user = await getUser();
  if (!user) {
    redirect('/sign-in');
  }

  const roleNames = await getUserTenantRoleNames(user.id);
  if (!roleNames.some((r) => MANAGE_ROLES.includes(r))) {
    redirect('/dashboard/projects');
  }

  const projects = await getArchivedProjectsForUser();

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="mb-6">
        <Link href="/dashboard/projects">
          <Button variant="ghost" size="sm" className="mb-2 -ml-2">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a proyectos
          </Button>
        </Link>
        <h1 className="text-lg lg:text-2xl font-medium">
          Proyectos archivados
        </h1>
        <p className="text-sm text-muted-foreground">
          Restaura un proyecto para volver a verlo en la lista, o bórralo
          permanentemente si ya no lo necesitas.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Archivados</CardTitle>
        </CardHeader>
        <CardContent>
          {projects.length === 0 ? (
            <p className="text-muted-foreground">
              No hay proyectos archivados.
            </p>
          ) : (
            <ul className="space-y-6">
              {projects.map((project) => (
                <li
                  key={project.id}
                  className="flex items-center justify-between border-b border-gray-100 pb-6 last:border-b-0 last:pb-0"
                >
                  <div>
                    <p className="font-medium">{project.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {project.clientName || '—'} · {project.domain || '—'}
                    </p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RestoreProjectButton projectId={project.id} />
                    <DeleteProjectButton
                      projectId={project.id}
                      projectName={project.name}
                    />
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

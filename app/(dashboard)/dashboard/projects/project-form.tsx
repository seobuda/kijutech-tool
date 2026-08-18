'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { createProject, updateProject } from '@/lib/projects/actions';
import type { Project } from '@/lib/db/schema';

type ActionState = {
  error?: string;
  success?: string;
};

type Props = {
  project?: Project;
};

export function ProjectForm({ project }: Props) {
  const isEditing = Boolean(project);
  const action = isEditing ? updateProject : createProject;
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    action,
    {}
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Datos del proyecto</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" action={formAction}>
          {project && <input type="hidden" name="id" value={project.id} />}
          <div>
            <Label htmlFor="name" className="mb-2">
              Nombre
            </Label>
            <Input
              id="name"
              name="name"
              placeholder="Nombre del proyecto"
              defaultValue={project?.name ?? ''}
              required
            />
          </div>
          <div>
            <Label htmlFor="clientName" className="mb-2">
              Cliente
            </Label>
            <Input
              id="clientName"
              name="clientName"
              placeholder="Nombre del cliente"
              defaultValue={project?.clientName ?? ''}
            />
          </div>
          <div>
            <Label htmlFor="domain" className="mb-2">
              Dominio
            </Label>
            <Input
              id="domain"
              name="domain"
              placeholder="ejemplo.com"
              defaultValue={project?.domain ?? ''}
            />
          </div>
          <div>
            <Label htmlFor="location" className="mb-2">
              Ubicación objetivo
            </Label>
            <Input
              id="location"
              name="location"
              placeholder="Ej: Barcelona, Sant Cugat, España..."
              defaultValue={project?.location ?? ''}
            />
          </div>
          {state.error && <p className="text-red-500 text-sm">{state.error}</p>}
          {state.success && (
            <p className="text-green-500 text-sm">{state.success}</p>
          )}
          <Button
            type="submit"
            className="bg-orange-500 hover:bg-orange-600 text-white"
            disabled={isPending}
          >
            {isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isEditing ? 'Guardando...' : 'Creando...'}
              </>
            ) : isEditing ? (
              'Guardar cambios'
            ) : (
              'Crear proyecto'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

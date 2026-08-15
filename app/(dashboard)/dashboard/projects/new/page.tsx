'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { createProject } from '@/lib/projects/actions';

type ActionState = {
  error?: string;
  success?: string;
};

export default function NewProjectPage() {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    createProject,
    {}
  );

  return (
    <section className="flex-1 p-4 lg:p-8">
      <h1 className="text-lg lg:text-2xl font-medium mb-6">Nuevo proyecto</h1>

      <Card>
        <CardHeader>
          <CardTitle>Datos del proyecto</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" action={formAction}>
            <div>
              <Label htmlFor="name" className="mb-2">
                Nombre
              </Label>
              <Input
                id="name"
                name="name"
                placeholder="Nombre del proyecto"
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
              />
            </div>
            <div>
              <Label htmlFor="domain" className="mb-2">
                Dominio
              </Label>
              <Input id="domain" name="domain" placeholder="ejemplo.com" />
            </div>
            {state.error && (
              <p className="text-red-500 text-sm">{state.error}</p>
            )}
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
                  Creando...
                </>
              ) : (
                'Crear proyecto'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}

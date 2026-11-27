'use client';

// Error en una pantalla del proyecto (plan de UX v2, fase 1): mensaje genérico con «Reintentar» y salida a la lista, en vez
// de la pantalla de error de la app. El detalle va al registro de errores del servidor.
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/ui/page';

export default function ProjectError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <PageContainer>
      <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border p-6 text-center">
        <AlertTriangle className="size-6 text-warning-strong" aria-hidden />
        <p className="font-medium">No se ha podido cargar esta pantalla del proyecto.</p>
        <p className="text-sm text-muted-foreground">Puede ser un fallo puntual. Si se repite, avisa: queda registrado para revisarlo.</p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => reset()}>
            Reintentar
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href="/dashboard/projects">Ver todos los proyectos</Link>
          </Button>
        </div>
      </div>
    </PageContainer>
  );
}

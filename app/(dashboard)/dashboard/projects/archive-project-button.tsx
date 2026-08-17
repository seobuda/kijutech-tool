'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Archive, Loader2 } from 'lucide-react';
import { archiveProject } from '@/lib/projects/actions';

export function ArchiveProjectButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleArchive() {
    const confirmed = window.confirm(
      '¿Archivar este proyecto? Dejará de aparecer en la lista de proyectos activos. Podrás restaurarlo o borrarlo permanentemente desde "Proyectos archivados".'
    );
    if (!confirmed) {
      return;
    }
    startTransition(async () => {
      await archiveProject(projectId);
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleArchive}
      disabled={isPending}
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <Archive className="mr-2 h-4 w-4" />
          Archivar
        </>
      )}
    </Button>
  );
}

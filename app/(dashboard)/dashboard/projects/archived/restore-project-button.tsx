'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, RotateCcw } from 'lucide-react';
import { restoreProject } from '@/lib/projects/actions';

export function RestoreProjectButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleRestore() {
    startTransition(async () => {
      await restoreProject(projectId);
      router.refresh();
    });
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleRestore}
      disabled={isPending}
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <RotateCcw className="mr-2 h-4 w-4" />
          Restaurar
        </>
      )}
    </Button>
  );
}

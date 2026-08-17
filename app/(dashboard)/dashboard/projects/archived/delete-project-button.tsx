'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Trash2 } from 'lucide-react';
import { deleteProjectPermanently } from '@/lib/projects/actions';

const CONFIRMATION_WORD = 'BORRAR';

export function DeleteProjectButton({
  projectId,
  projectName
}: {
  projectId: string;
  projectName: string;
}) {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteProjectPermanently(projectId, confirmationText);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al borrar');
      }
    });
  }

  if (!isConfirming) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="text-red-600 hover:text-red-700"
        onClick={() => setIsConfirming(true)}
      >
        <Trash2 className="mr-2 h-4 w-4" />
        Borrar permanentemente
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-end space-y-2">
      <p className="text-sm text-muted-foreground">
        Escribe <strong>{CONFIRMATION_WORD}</strong> para borrar
        definitivamente &ldquo;{projectName}&rdquo; y todos sus datos SEO. No
        se puede deshacer.
      </p>
      <div className="flex items-center space-x-2">
        <Input
          value={confirmationText}
          onChange={(e) => setConfirmationText(e.target.value)}
          placeholder={CONFIRMATION_WORD}
          className="w-40"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setIsConfirming(false);
            setConfirmationText('');
            setError(null);
          }}
        >
          Cancelar
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-red-600 hover:text-red-700"
          disabled={confirmationText !== CONFIRMATION_WORD || isPending}
          onClick={handleDelete}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            'Confirmar borrado'
          )}
        </Button>
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
    </div>
  );
}

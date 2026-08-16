'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';
import { deleteKnowledgeCard, type ActionState } from '@/lib/seo/admin-actions';

export function DeleteCardButton({ cardId }: { cardId: string }) {
  const [state, deleteAction, isPending] = useActionState<ActionState, FormData>(
    deleteKnowledgeCard,
    {}
  );

  return (
    <form action={deleteAction}>
      <input type="hidden" name="id" value={cardId} />
      <Button type="submit" variant="outline" size="sm" disabled={isPending}>
        <Trash2 className="h-4 w-4" />
      </Button>
      {state?.error && <p className="text-red-500 text-xs mt-1">{state.error}</p>}
    </form>
  );
}

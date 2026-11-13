'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { retryJobAction } from '@/lib/agentes/actions';

export function RetryJobButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { await retryJobAction(id); router.refresh(); })}>
      <RotateCcw className="size-4" aria-hidden /> Reintentar
    </Button>
  );
}

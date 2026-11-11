'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { retryRequest } from '@/lib/operaciones/request-actions';

export function RetryButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const retry = () =>
    startTransition(async () => {
      setError(null);
      const res = await retryRequest(requestId);
      if (!res.ok) setError(res.error);
      router.refresh();
    });

  return (
    <div className="space-y-1">
      <Button size="sm" variant="outline" onClick={retry} disabled={pending}>
        <RotateCcw className={cn(pending && 'animate-spin')} aria-hidden />
        {pending ? 'Reintentando…' : 'Reintentar'}
      </Button>
      {error && (
        <p role="alert" className="max-w-[14rem] whitespace-normal text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
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
        {pending ? 'Reintentando…' : 'Reintentar'}
      </Button>
      {error && <p className="text-xs text-red-600 max-w-[14rem] whitespace-normal">{error}</p>}
    </div>
  );
}

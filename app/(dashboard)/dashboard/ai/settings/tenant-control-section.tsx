'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Loader2, Check } from 'lucide-react';
import { updateTenantAiMode } from '@/lib/ai/actions';
import { AI_KEY_MODE_LABELS } from '@/lib/ai/provider-meta';

type Tenant = {
  id: string;
  name: string;
  aiKeyModeAllowed: string;
};

const MODES = ['platform_only', 'byok_allowed', 'byok_required'];

export function TenantControlSection({ initialTenants }: { initialTenants: Tenant[] }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="p-2 text-left font-medium">Tenant</th>
            <th className="p-2 text-left font-medium">Modo de claves de IA</th>
            <th className="p-2 text-left font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {initialTenants.map((tenant) => (
            <TenantRow key={tenant.id} tenant={tenant} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TenantRow({ tenant }: { tenant: Tenant }) {
  const router = useRouter();
  const [mode, setMode] = useState(tenant.aiKeyModeAllowed);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      const result = await updateTenantAiMode(tenant.id, mode);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <tr className="border-t">
      <td className="p-2">{tenant.name}</td>
      <td className="p-2">
        <select
          value={mode}
          onChange={(e) => {
            setMode(e.target.value);
            setSaved(false);
          }}
          className="border-input h-9 rounded-md border bg-background px-2 text-sm"
        >
          {MODES.map((m) => (
            <option key={m} value={m}>
              {AI_KEY_MODE_LABELS[m]}
            </option>
          ))}
        </select>
      </td>
      <td className="p-2">
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={handleSave} disabled={isPending}>
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <Check className="h-4 w-4" />
            ) : (
              'Guardar'
            )}
          </Button>
        </div>
        {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
      </td>
    </tr>
  );
}

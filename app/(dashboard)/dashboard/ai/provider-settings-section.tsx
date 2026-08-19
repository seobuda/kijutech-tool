'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Check, Trash2 } from 'lucide-react';
import { saveProviderSettings, deleteProviderKey } from '@/lib/ai/actions';
import { AI_PROVIDER_META, type AiProviderKey } from '@/lib/ai/provider-meta';

export type ProviderRowData = {
  provider: AiProviderKey;
  model: string;
  isActive: boolean;
  isDefault: boolean;
  hasKey: boolean;
};

type Props = {
  tenantId: string;
  keyMode: 'platform' | 'byok';
  initialRows: ProviderRowData[];
};

export function ProviderSettingsSection({ tenantId, keyMode, initialRows }: Props) {
  const [rows, setRows] = useState(initialRows);

  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <ProviderRow
          key={row.provider}
          tenantId={tenantId}
          keyMode={keyMode}
          row={row}
          onDefaultToggled={(provider) => {
            setRows((prev) =>
              prev.map((r) => ({ ...r, isDefault: r.provider === provider }))
            );
          }}
        />
      ))}
    </div>
  );
}

function ProviderRow({
  tenantId,
  keyMode,
  row,
  onDefaultToggled,
}: {
  tenantId: string;
  keyMode: 'platform' | 'byok';
  row: ProviderRowData;
  onDefaultToggled: (provider: AiProviderKey) => void;
}) {
  const router = useRouter();
  const meta = AI_PROVIDER_META[row.provider];

  const [model, setModel] = useState(row.model || meta.defaultModel);
  const [apiKey, setApiKey] = useState('');
  const [isActive, setIsActive] = useState(row.isActive);
  const [isDefault, setIsDefault] = useState(row.isDefault);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleDefaultChange(checked: boolean) {
    setIsDefault(checked);
    if (checked) {
      onDefaultToggled(row.provider);
    }
  }

  function handleSave() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      const result = await saveProviderSettings({
        provider: row.provider,
        model,
        apiKey: apiKey.trim() ? apiKey.trim() : undefined,
        isActive,
        isDefault,
        keyMode,
        tenantId,
      });
      if ('error' in result) {
        setError(result.error);
        return;
      }
      setApiKey('');
      setSaved(true);
      router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm(`¿Eliminar la API key de ${meta.label}? Esta acción no se puede deshacer.`)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deleteProviderKey(row.provider, tenantId);
      if ('error' in result) {
        setError(result.error);
        return;
      }
      setIsActive(false);
      setIsDefault(false);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {meta.emoji} {meta.label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${row.provider}-model`}>Modelo</Label>
            <Input
              id={`${row.provider}-model`}
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
                setSaved(false);
              }}
              placeholder={meta.defaultModel}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${row.provider}-key`}>API key</Label>
            <Input
              id={`${row.provider}-key`}
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setSaved(false);
              }}
              placeholder={row.hasKey ? '••••••••' : 'Introduce una API key'}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <Switch
              id={`${row.provider}-active`}
              checked={isActive}
              onCheckedChange={(checked) => {
                setIsActive(checked);
                setSaved(false);
              }}
            />
            <Label htmlFor={`${row.provider}-active`}>Activo</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id={`${row.provider}-default`}
              checked={isDefault}
              onCheckedChange={(checked) => {
                handleDefaultChange(checked);
                setSaved(false);
              }}
            />
            <Label htmlFor={`${row.provider}-default`}>Por defecto</Label>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" onClick={handleSave} disabled={isPending} size="sm">
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : saved ? (
              <Check className="h-4 w-4" />
            ) : (
              'Guardar'
            )}
          </Button>
          {row.hasKey && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleDelete}
              disabled={isPending}
            >
              <Trash2 className="h-4 w-4" />
              Eliminar key
            </Button>
          )}
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}
        {saved && !error && <p className="text-green-600 text-sm">Guardado.</p>}
      </CardContent>
    </Card>
  );
}

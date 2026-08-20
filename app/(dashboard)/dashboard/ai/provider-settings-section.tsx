'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ChevronDown, Loader2, Check, Trash2 } from 'lucide-react';
import { saveProviderSettings, deleteProviderKey } from '@/lib/ai/actions';
import {
  AI_PROVIDER_META,
  EMBEDDING_PROVIDERS,
  EMBEDDING_PROVIDER_META,
  DEFAULT_EMBEDDING_MODEL,
  type AiProviderKey,
  type EmbeddingProviderKey,
} from '@/lib/ai/provider-meta';

export type ProviderRowData = {
  provider: AiProviderKey;
  model: string;
  isActive: boolean;
  isDefault: boolean;
  hasKey: boolean;
  embeddingProvider: string | null;
  embeddingModel: string;
  hasEmbeddingKey: boolean;
};

const SAME_AS_CHAT = 'same_as_chat';

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

  const [embeddingsOpen, setEmbeddingsOpen] = useState(false);
  const [embeddingProvider, setEmbeddingProvider] = useState<string>(
    row.embeddingProvider ?? SAME_AS_CHAT
  );
  const [embeddingModel, setEmbeddingModel] = useState(row.embeddingModel);
  const [embeddingApiKey, setEmbeddingApiKey] = useState('');
  const [hasEmbeddingKey, setHasEmbeddingKey] = useState(row.hasEmbeddingKey);

  const embeddingModelPlaceholder =
    embeddingProvider === SAME_AS_CHAT
      ? ''
      : DEFAULT_EMBEDDING_MODEL[embeddingProvider] ?? '';

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
        embeddingProvider: embeddingProvider === SAME_AS_CHAT ? null : embeddingProvider,
        embeddingModel: embeddingModel.trim() ? embeddingModel.trim() : undefined,
        embeddingApiKey: embeddingApiKey.trim() ? embeddingApiKey.trim() : undefined,
      });
      if ('error' in result) {
        setError(result.error);
        return;
      }
      setApiKey('');
      setEmbeddingApiKey('');
      setHasEmbeddingKey(
        embeddingProvider !== SAME_AS_CHAT && (Boolean(embeddingApiKey.trim()) || hasEmbeddingKey)
      );
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

        <div className="border-t pt-4">
          <button
            type="button"
            onClick={() => setEmbeddingsOpen((prev) => !prev)}
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${embeddingsOpen ? 'rotate-180' : ''}`}
            />
            Configuración de embeddings (opcional)
          </button>

          {embeddingsOpen && (
            <div className="mt-3 space-y-4">
              <p className="text-sm text-muted-foreground">
                Por defecto usa el mismo proveedor que el chat. Configura esto solo si
                quieres usar un proveedor diferente para embeddings (ej: Voyage AI con
                Anthropic, o Gemini con cualquier proveedor).
              </p>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`${row.provider}-embedding-provider`}>
                    Proveedor de embeddings
                  </Label>
                  <select
                    id={`${row.provider}-embedding-provider`}
                    value={embeddingProvider}
                    onChange={(e) => {
                      setEmbeddingProvider(e.target.value);
                      setSaved(false);
                    }}
                    className="border-input focus-visible:border-ring focus-visible:ring-ring/50 flex h-9 w-full items-center rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none focus-visible:ring-[3px] md:text-sm dark:bg-input/30"
                  >
                    <option value={SAME_AS_CHAT}>Mismo que chat</option>
                    {EMBEDDING_PROVIDERS.map((key) => (
                      <option key={key} value={key}>
                        {EMBEDDING_PROVIDER_META[key as EmbeddingProviderKey].label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`${row.provider}-embedding-model`}>
                    Modelo de embeddings
                  </Label>
                  <Input
                    id={`${row.provider}-embedding-model`}
                    value={embeddingModel}
                    onChange={(e) => {
                      setEmbeddingModel(e.target.value);
                      setSaved(false);
                    }}
                    placeholder={embeddingModelPlaceholder}
                    disabled={embeddingProvider === SAME_AS_CHAT}
                  />
                </div>
              </div>

              {embeddingProvider !== SAME_AS_CHAT && (
                <div className="space-y-1.5">
                  <Label htmlFor={`${row.provider}-embedding-key`}>
                    API key de embeddings
                  </Label>
                  <Input
                    id={`${row.provider}-embedding-key`}
                    type="password"
                    value={embeddingApiKey}
                    onChange={(e) => {
                      setEmbeddingApiKey(e.target.value);
                      setSaved(false);
                    }}
                    placeholder={
                      hasEmbeddingKey ? '••••••••' : 'Deja vacío para usar la misma key del chat'
                    }
                  />
                </div>
              )}
            </div>
          )}
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

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Check, Pencil, Plus } from 'lucide-react';
import { updateModelPricing, addModelPricing } from '@/lib/ai/actions';
import { AI_PROVIDERS, AI_PROVIDER_META } from '@/lib/ai/provider-meta';
import type { AiModelPricing } from '@/lib/db/schema';

type Props = {
  initialRows: AiModelPricing[];
};

export function PricingSection({ initialRows }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addingNew, setAddingNew] = useState(false);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-2 text-left font-medium">Proveedor</th>
              <th className="p-2 text-left font-medium">Modelo</th>
              <th className="p-2 text-left font-medium">Input (€/1k)</th>
              <th className="p-2 text-left font-medium">Output (€/1k)</th>
              <th className="p-2 text-left font-medium">Desde</th>
              <th className="p-2 text-left font-medium">Hasta</th>
              <th className="p-2 text-left font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) =>
              editingId === row.id ? (
                <EditableRow
                  key={row.id}
                  row={row}
                  onCancel={() => setEditingId(null)}
                  onSaved={(updated) => {
                    setRows((prev) =>
                      prev.map((r) => (r.id === row.id ? { ...r, ...updated } : r))
                    );
                    setEditingId(null);
                    router.refresh();
                  }}
                />
              ) : (
                <tr key={row.id} className="border-t">
                  <td className="p-2">
                    {AI_PROVIDER_META[row.provider as keyof typeof AI_PROVIDER_META]
                      ?.emoji ?? ''}{' '}
                    {row.provider}
                  </td>
                  <td className="p-2">{row.model}</td>
                  <td className="p-2">{row.inputCostPer1k}</td>
                  <td className="p-2">{row.outputCostPer1k}</td>
                  <td className="p-2">{row.effectiveFrom}</td>
                  <td className="p-2">{row.effectiveTo ?? '—'}</td>
                  <td className="p-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingId(row.id)}
                    >
                      <Pencil className="h-4 w-4" />
                      Editar
                    </Button>
                  </td>
                </tr>
              )
            )}
            {addingNew && (
              <NewRow
                onCancel={() => setAddingNew(false)}
                onAdded={() => {
                  setAddingNew(false);
                  router.refresh();
                }}
              />
            )}
          </tbody>
        </table>
      </div>

      {!addingNew && (
        <Button type="button" variant="outline" size="sm" onClick={() => setAddingNew(true)}>
          <Plus className="h-4 w-4" />
          Nueva entrada
        </Button>
      )}
    </div>
  );
}

function EditableRow({
  row,
  onCancel,
  onSaved,
}: {
  row: AiModelPricing;
  onCancel: () => void;
  onSaved: (updated: Partial<AiModelPricing>) => void;
}) {
  const [inputCost, setInputCost] = useState(row.inputCostPer1k);
  const [outputCost, setOutputCost] = useState(row.outputCostPer1k);
  const [effectiveTo, setEffectiveTo] = useState(row.effectiveTo ?? '');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateModelPricing(
        row.id,
        Number(inputCost),
        Number(outputCost),
        effectiveTo || undefined
      );
      if ('error' in result) {
        setError(result.error);
        return;
      }
      onSaved({
        inputCostPer1k: inputCost,
        outputCostPer1k: outputCost,
        effectiveTo: effectiveTo || null,
      });
    });
  }

  return (
    <tr className="border-t bg-muted/30">
      <td className="p-2">
        {AI_PROVIDER_META[row.provider as keyof typeof AI_PROVIDER_META]?.emoji ?? ''}{' '}
        {row.provider}
      </td>
      <td className="p-2">{row.model}</td>
      <td className="p-2">
        <Input
          type="number"
          step="0.000001"
          min="0"
          value={inputCost}
          onChange={(e) => setInputCost(e.target.value)}
          className="w-28"
        />
      </td>
      <td className="p-2">
        <Input
          type="number"
          step="0.000001"
          min="0"
          value={outputCost}
          onChange={(e) => setOutputCost(e.target.value)}
          className="w-28"
        />
      </td>
      <td className="p-2">{row.effectiveFrom}</td>
      <td className="p-2">
        <Input
          type="date"
          value={effectiveTo}
          onChange={(e) => setEffectiveTo(e.target.value)}
          className="w-36"
        />
      </td>
      <td className="p-2">
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={handleSave} disabled={isPending}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={isPending}>
            Cancelar
          </Button>
        </div>
        {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
      </td>
    </tr>
  );
}

function NewRow({ onCancel, onAdded }: { onCancel: () => void; onAdded: () => void }) {
  const [provider, setProvider] = useState<string>(AI_PROVIDERS[0]);
  const [model, setModel] = useState('');
  const [inputCost, setInputCost] = useState('0');
  const [outputCost, setOutputCost] = useState('0');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      const result = await addModelPricing(provider, model, Number(inputCost), Number(outputCost));
      if ('error' in result) {
        setError(result.error);
        return;
      }
      onAdded();
    });
  }

  return (
    <tr className="border-t bg-muted/30">
      <td className="p-2">
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="border-input h-9 w-full rounded-md border bg-background px-2 text-sm"
        >
          {AI_PROVIDERS.map((p) => (
            <option key={p} value={p}>
              {AI_PROVIDER_META[p].emoji} {AI_PROVIDER_META[p].label}
            </option>
          ))}
        </select>
      </td>
      <td className="p-2">
        <Input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder={AI_PROVIDER_META[provider as keyof typeof AI_PROVIDER_META].defaultModel}
          className="w-40"
        />
      </td>
      <td className="p-2">
        <Input
          type="number"
          step="0.000001"
          min="0"
          value={inputCost}
          onChange={(e) => setInputCost(e.target.value)}
          className="w-28"
        />
      </td>
      <td className="p-2">
        <Input
          type="number"
          step="0.000001"
          min="0"
          value={outputCost}
          onChange={(e) => setOutputCost(e.target.value)}
          className="w-28"
        />
      </td>
      <td className="p-2 text-muted-foreground">hoy</td>
      <td className="p-2">—</td>
      <td className="p-2">
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={handleAdd} disabled={isPending}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Añadir'}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={isPending}>
            Cancelar
          </Button>
        </div>
        {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
      </td>
    </tr>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { mutate } from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2, X } from 'lucide-react';
import {
  addCustomChecklistItem,
  markStageComplete,
  removeChecklistItem,
  resetOnboardingStage,
  toggleOnboardingChecklistItem
} from '@/lib/seo/actions';
import { seoProgressSwrKey } from '@/lib/seo/client-keys';
import { ONBOARDING_CHECKLIST_ITEMS } from '@/lib/seo/onboarding-checklist-items';
import { useSeoAssistantFocus } from '../seo-assistant-context';
import type { SeoOnboardingChecklistItem } from '@/lib/db/schema';

const FIXED_LABELS: Record<string, string> = Object.fromEntries(
  ONBOARDING_CHECKLIST_ITEMS.map((item) => [item.itemKey, item.label])
);

function labelForItem(itemKey: string) {
  return (
    FIXED_LABELS[itemKey] ??
    itemKey
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  );
}

type ChecklistItemState = { itemKey: string; checked: boolean };

type Props = {
  projectId: string;
  initialChecklist: SeoOnboardingChecklistItem[];
  stageStatus: string;
};

export function OnboardingChecklist({
  projectId,
  initialChecklist,
  stageStatus
}: Props) {
  const setFocusedKey = useSeoAssistantFocus();

  const [items, setItems] = useState<ChecklistItemState[]>(
    initialChecklist.map((item) => ({
      itemKey: item.itemKey,
      checked: item.checked
    }))
  );
  const [newToolLabel, setNewToolLabel] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isResetting, setIsResetting] = useState(false);
  const [localStatus, setLocalStatus] = useState(stageStatus);

  function toggle(itemKey: string) {
    const current = items.find((item) => item.itemKey === itemKey);
    const newValue = !current?.checked;
    setItems((prev) =>
      prev.map((item) =>
        item.itemKey === itemKey ? { ...item, checked: newValue } : item
      )
    );
    setSavingKey(itemKey);
    startTransition(async () => {
      await toggleOnboardingChecklistItem(projectId, itemKey, newValue);
      setSavingKey(null);
    });
  }

  function handleAddCustom() {
    const label = newToolLabel.trim();
    if (!label) {
      return;
    }
    const itemKey = label.toLowerCase().replace(/\s+/g, '_');
    if (items.some((item) => item.itemKey === itemKey)) {
      setNewToolLabel('');
      return;
    }
    setItems((prev) => [...prev, { itemKey, checked: false }]);
    setNewToolLabel('');
    startTransition(async () => {
      await addCustomChecklistItem(projectId, label);
    });
  }

  function handleRemove(itemKey: string) {
    setItems((prev) => prev.filter((item) => item.itemKey !== itemKey));
    startTransition(async () => {
      await removeChecklistItem(projectId, itemKey);
    });
  }

  function handleComplete() {
    if (!allChecked) {
      return;
    }
    startTransition(async () => {
      await markStageComplete(projectId, 'onboarding');
      mutate(seoProgressSwrKey(projectId));
      setLocalStatus('completed');
    });
  }

  function handleReset() {
    const confirmed = window.confirm(
      '¿Seguro que quieres reiniciar esta etapa? Se desmarcarán todos los checks.'
    );
    if (!confirmed) {
      return;
    }
    setIsResetting(true);
    startTransition(async () => {
      await resetOnboardingStage(projectId);
      setItems((prev) => prev.map((item) => ({ ...item, checked: false })));
      setLocalStatus('pending');
      mutate(seoProgressSwrKey(projectId));
      setIsResetting(false);
    });
  }

  const allChecked = items.length > 0 && items.every((item) => item.checked);
  const canReset = localStatus === 'completed' || localStatus === 'in_progress';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Checklist de herramientas</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length > 0 ? (
          <ul className="space-y-2 mb-4">
            {items.map((item) => (
              <li key={item.itemKey} className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={item.checked}
                  onChange={() => toggle(item.itemKey)}
                  onFocus={() => setFocusedKey(item.itemKey)}
                  onBlur={() => setFocusedKey(null)}
                  className="h-4 w-4 rounded border-input"
                />
                <span className="text-sm">{labelForItem(item.itemKey)}</span>
                {savingKey === item.itemKey && (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                )}
                <button
                  type="button"
                  onClick={() => handleRemove(item.itemKey)}
                  className="text-muted-foreground hover:text-red-600"
                  aria-label={`Eliminar ${labelForItem(item.itemKey)}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground mb-4">
            Sin herramientas en la checklist. Añade una abajo.
          </p>
        )}

        <div className="flex items-center space-x-2 mb-6">
          <Input
            value={newToolLabel}
            onChange={(e) => setNewToolLabel(e.target.value)}
            onFocus={() => setFocusedKey(null)}
            placeholder="Nombre de la herramienta"
            className="max-w-xs"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddCustom}
            disabled={!newToolLabel.trim()}
          >
            Añadir herramienta
          </Button>
        </div>

        <div className="flex items-center space-x-3">
          <Button
            onClick={handleComplete}
            disabled={isPending || !allChecked}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {localStatus === 'completed' ? (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Etapa completada
              </>
            ) : (
              'Marcar etapa como completada'
            )}
          </Button>
          {canReset && (
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              disabled={isResetting}
            >
              {isResetting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reiniciar etapa
            </Button>
          )}
        </div>
        {!allChecked && items.length > 0 && (
          <p className="text-sm text-muted-foreground mt-2">
            Marca todos los ítems de la checklist para poder completar la etapa.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

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
  removeCustomChecklistItem,
  resetOnboardingStage,
  toggleOnboardingChecklistItem
} from '@/lib/seo/actions';
import { seoProgressSwrKey } from '@/lib/seo/client-keys';
import { ONBOARDING_CHECKLIST_ITEMS as CHECKLIST_ITEMS } from '@/lib/seo/onboarding-checklist-items';
import { useSeoAssistantFocus } from '../seo-assistant-context';
import type { SeoOnboardingChecklistItem } from '@/lib/db/schema';

function labelFromItemKey(itemKey: string) {
  return itemKey
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

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

  const initialMap = Object.fromEntries(
    initialChecklist.map((item) => [item.itemKey, item.checked])
  );
  const [checked, setChecked] = useState<Record<string, boolean>>(
    Object.fromEntries(
      CHECKLIST_ITEMS.map((item) => [
        item.itemKey,
        initialMap[item.itemKey] ?? false
      ])
    )
  );
  const [customItems, setCustomItems] = useState(
    initialChecklist
      .filter((item) => item.isCustom)
      .map((item) => ({ itemKey: item.itemKey, checked: item.checked }))
  );
  const [newToolLabel, setNewToolLabel] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isResetting, setIsResetting] = useState(false);
  const [localStatus, setLocalStatus] = useState(stageStatus);

  function toggle(itemKey: string) {
    const newValue = !checked[itemKey];
    setChecked((prev) => ({ ...prev, [itemKey]: newValue }));
    setSavingKey(itemKey);
    startTransition(async () => {
      await toggleOnboardingChecklistItem(projectId, itemKey, newValue);
      setSavingKey(null);
    });
  }

  function toggleCustom(itemKey: string) {
    const current = customItems.find((item) => item.itemKey === itemKey);
    const newValue = !current?.checked;
    setCustomItems((prev) =>
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
    const alreadyExists =
      CHECKLIST_ITEMS.some((item) => item.itemKey === itemKey) ||
      customItems.some((item) => item.itemKey === itemKey);
    if (alreadyExists) {
      setNewToolLabel('');
      return;
    }
    setCustomItems((prev) => [...prev, { itemKey, checked: false }]);
    setNewToolLabel('');
    startTransition(async () => {
      await addCustomChecklistItem(projectId, label);
    });
  }

  function handleRemoveCustom(itemKey: string) {
    setCustomItems((prev) => prev.filter((item) => item.itemKey !== itemKey));
    startTransition(async () => {
      await removeCustomChecklistItem(projectId, itemKey);
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
      setChecked(
        Object.fromEntries(CHECKLIST_ITEMS.map((item) => [item.itemKey, false]))
      );
      setCustomItems((prev) => prev.map((item) => ({ ...item, checked: false })));
      setLocalStatus('pending');
      mutate(seoProgressSwrKey(projectId));
      setIsResetting(false);
    });
  }

  const allChecked =
    CHECKLIST_ITEMS.every((item) => checked[item.itemKey]) &&
    customItems.every((item) => item.checked);

  const canReset = localStatus === 'completed' || localStatus === 'in_progress';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Checklist de herramientas</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 mb-4">
          {CHECKLIST_ITEMS.map((item) => (
            <li key={item.itemKey} className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={checked[item.itemKey] ?? false}
                onChange={() => toggle(item.itemKey)}
                onFocus={() => setFocusedKey(item.itemKey)}
                onBlur={() => setFocusedKey(null)}
                className="h-4 w-4 rounded border-input"
              />
              <span className="text-sm">{item.label}</span>
              {savingKey === item.itemKey && (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
            </li>
          ))}
          {customItems.map((item) => (
            <li key={item.itemKey} className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={item.checked}
                onChange={() => toggleCustom(item.itemKey)}
                onFocus={() => setFocusedKey(item.itemKey)}
                onBlur={() => setFocusedKey(null)}
                className="h-4 w-4 rounded border-input"
              />
              <span className="text-sm">{labelFromItemKey(item.itemKey)}</span>
              {savingKey === item.itemKey && (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
              <button
                type="button"
                onClick={() => handleRemoveCustom(item.itemKey)}
                className="text-muted-foreground hover:text-red-600"
                aria-label={`Eliminar ${labelFromItemKey(item.itemKey)}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>

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
        {!allChecked && (
          <p className="text-sm text-muted-foreground mt-2">
            Marca todos los ítems de la checklist para poder completar la etapa.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

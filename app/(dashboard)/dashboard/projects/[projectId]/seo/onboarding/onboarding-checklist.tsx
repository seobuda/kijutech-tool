'use client';

import { useState, useTransition } from 'react';
import { mutate } from 'swr';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2 } from 'lucide-react';
import {
  markStageComplete,
  toggleOnboardingChecklistItem
} from '@/lib/seo/actions';
import { seoProgressSwrKey } from '@/lib/seo/client-keys';
import type { SeoOnboardingChecklistItem } from '@/lib/db/schema';

const CHECKLIST_ITEMS = [
  {
    itemKey: 'gsc_verificado',
    label: 'Google Search Console verificado y con datos'
  },
  { itemKey: 'ga4_configurado', label: 'Google Analytics 4 configurado' },
  {
    itemKey: 'se_ranking_creado',
    label: 'SE Ranking creado y dominio añadido'
  },
  {
    itemKey: 'gbp_reclamado',
    label: 'Google Business Profile reclamado (si aplica)'
  }
];

type Props = {
  projectId: string;
  initialChecklist: SeoOnboardingChecklistItem[];
};

export function OnboardingChecklist({ projectId, initialChecklist }: Props) {
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
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [completed, setCompleted] = useState(false);

  function toggle(itemKey: string) {
    const newValue = !checked[itemKey];
    setChecked((prev) => ({ ...prev, [itemKey]: newValue }));
    setSavingKey(itemKey);
    startTransition(async () => {
      await toggleOnboardingChecklistItem(projectId, itemKey, newValue);
      setSavingKey(null);
    });
  }

  function handleComplete() {
    if (!allChecked) {
      return;
    }
    startTransition(async () => {
      await markStageComplete(projectId, 'onboarding');
      mutate(seoProgressSwrKey(projectId));
      setCompleted(true);
    });
  }

  const allChecked = CHECKLIST_ITEMS.every((item) => checked[item.itemKey]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Checklist de herramientas</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 mb-6">
          {CHECKLIST_ITEMS.map((item) => (
            <li key={item.itemKey} className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={checked[item.itemKey] ?? false}
                onChange={() => toggle(item.itemKey)}
                className="h-4 w-4 rounded border-input"
              />
              <span className="text-sm">{item.label}</span>
              {savingKey === item.itemKey && (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
            </li>
          ))}
        </ul>
        <Button
          onClick={handleComplete}
          disabled={isPending || !allChecked}
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          {completed ? (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Etapa completada
            </>
          ) : (
            'Marcar etapa como completada'
          )}
        </Button>
        {!allChecked && (
          <p className="text-sm text-muted-foreground mt-2">
            Marca todos los ítems de la checklist para poder completar la etapa.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

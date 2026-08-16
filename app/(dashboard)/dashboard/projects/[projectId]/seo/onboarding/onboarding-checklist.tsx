'use client';

import { useState, useTransition } from 'react';
import { mutate } from 'swr';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { markStageComplete } from '@/lib/seo/actions';
import { seoProgressSwrKey } from '@/lib/seo/client-keys';

const CHECKLIST_ITEMS = [
  'Google Search Console verificado y con datos',
  'Google Analytics 4 configurado',
  'SE Ranking creado y dominio añadido',
  'Google Business Profile reclamado (si aplica)'
];

export function OnboardingChecklist({ projectId }: { projectId: string }) {
  const [checked, setChecked] = useState<boolean[]>(
    CHECKLIST_ITEMS.map(() => false)
  );
  const [isPending, startTransition] = useTransition();
  const [completed, setCompleted] = useState(false);

  function toggle(index: number) {
    setChecked((prev) => prev.map((v, i) => (i === index ? !v : v)));
  }

  function handleComplete() {
    startTransition(async () => {
      await markStageComplete(projectId, 'onboarding');
      mutate(seoProgressSwrKey(projectId));
      setCompleted(true);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Checklist de herramientas</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 mb-6">
          {CHECKLIST_ITEMS.map((item, index) => (
            <li key={item} className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={checked[index]}
                onChange={() => toggle(index)}
                className="h-4 w-4 rounded border-input"
              />
              <span className="text-sm">{item}</span>
            </li>
          ))}
        </ul>
        <Button
          onClick={handleComplete}
          disabled={isPending}
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Guardando...
            </>
          ) : completed ? (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Etapa completada
            </>
          ) : (
            'Marcar etapa como completada'
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

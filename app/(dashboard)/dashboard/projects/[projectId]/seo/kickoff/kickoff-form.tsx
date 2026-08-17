'use client';

import { useState, useTransition } from 'react';
import { mutate } from 'swr';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2 } from 'lucide-react';
import {
  saveKickoffAnswers,
  markStageComplete,
  resetKickoffStage
} from '@/lib/seo/actions';
import { seoProgressSwrKey } from '@/lib/seo/client-keys';
import { KICKOFF_QUESTIONS } from '@/lib/seo/kickoff-questions';
import { useSeoAssistantFocus } from '../seo-assistant-context';
import type { SeoKickoffAnswer } from '@/lib/db/schema';

const textareaClassName =
  'flex w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm';

type Props = {
  projectId: string;
  existingAnswers: SeoKickoffAnswer[];
  stageStatus: string;
};

export function KickoffForm({ projectId, existingAnswers, stageStatus }: Props) {
  const setFocusedKey = useSeoAssistantFocus();
  const answersMap = Object.fromEntries(
    existingAnswers.map((a) => [a.questionKey, a.answer ?? ''])
  );
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(
      KICKOFF_QUESTIONS.map((q) => [q.questionKey, answersMap[q.questionKey] ?? ''])
    )
  );
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [localStatus, setLocalStatus] = useState(stageStatus);

  function handleSave() {
    startTransition(async () => {
      const answers = KICKOFF_QUESTIONS.map((q) => ({
        questionKey: q.questionKey,
        answer: values[q.questionKey] ?? ''
      }));
      await saveKickoffAnswers(projectId, answers);
      setSaved(true);
    });
  }

  function handleComplete() {
    startTransition(async () => {
      await markStageComplete(projectId, 'kickoff');
      mutate(seoProgressSwrKey(projectId));
      setLocalStatus('completed');
    });
  }

  function handleReset() {
    const confirmed = window.confirm(
      '¿Seguro que quieres reiniciar esta etapa? Se borrarán todas las respuestas guardadas.'
    );
    if (!confirmed) {
      return;
    }
    setIsResetting(true);
    startTransition(async () => {
      await resetKickoffStage(projectId);
      setValues(
        Object.fromEntries(KICKOFF_QUESTIONS.map((q) => [q.questionKey, '']))
      );
      setSaved(false);
      setLocalStatus('pending');
      mutate(seoProgressSwrKey(projectId));
      setIsResetting(false);
    });
  }

  const canReset = localStatus === 'completed' || localStatus === 'in_progress';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preguntas de Kickoff</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {KICKOFF_QUESTIONS.map((q) => (
          <div key={q.questionKey}>
            <Label htmlFor={q.questionKey} className="mb-2">
              {q.question}
            </Label>
            <textarea
              id={q.questionKey}
              rows={3}
              value={values[q.questionKey] ?? ''}
              onChange={(e) =>
                setValues((prev) => ({
                  ...prev,
                  [q.questionKey]: e.target.value
                }))
              }
              onFocus={() => setFocusedKey(q.questionKey)}
              onBlur={() => setFocusedKey(null)}
              className={textareaClassName}
            />
          </div>
        ))}
        <div className="flex items-center space-x-3 pt-2">
          <Button onClick={handleSave} disabled={isPending} variant="outline">
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Guardar respuestas
          </Button>
          <Button
            onClick={handleComplete}
            disabled={isPending}
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
        {saved && <p className="text-green-500 text-sm">Respuestas guardadas.</p>}
      </CardContent>
    </Card>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2, Copy, ExternalLink, X } from 'lucide-react';
import { saveStep3Notes, completeStep3, resetStep3 } from '@/lib/seo/kw-actions';

const textareaClassName =
  'flex w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm';

type Props = {
  projectId: string;
  tutorText: string | null;
  tutorUrl: string;
  initialNotes: string;
  stageStatus: string;
};

export function ClusteringPanel({
  projectId,
  tutorText,
  tutorUrl,
  initialNotes,
  stageStatus
}: Props) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [notesSaved, setNotesSaved] = useState(true);
  const [localStatus, setLocalStatus] = useState(stageStatus);
  const [isResetting, setIsResetting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSaveNotes() {
    startTransition(async () => {
      await saveStep3Notes(projectId, notes);
      setNotesSaved(true);
    });
  }

  function handleComplete() {
    startTransition(async () => {
      await completeStep3(projectId);
      setLocalStatus('completed');
      router.refresh();
    });
  }

  function handleReset() {
    const confirmed = window.confirm(
      '¿Seguro que quieres reiniciar este paso? Se borrarán las notas.'
    );
    if (!confirmed) return;
    setIsResetting(true);
    startTransition(async () => {
      await resetStep3(projectId);
      setNotes('');
      setLocalStatus('pending');
      router.refresh();
      setIsResetting(false);
    });
  }

  async function handleCopy() {
    if (!tutorText) return;
    await navigator.clipboard.writeText(tutorText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const canReset = localStatus === 'completed' || localStatus === 'in_progress';

  return (
    <div className="space-y-6">
      <Card className="border-l-4 border-l-purple-400">
        <CardHeader>
          <CardTitle>Texto para el Tutor Kijutech</CardTitle>
        </CardHeader>
        <CardContent>
          {tutorText ? (
            <>
              <pre className="text-sm whitespace-pre-wrap font-sans bg-gray-50 rounded-md p-3 max-h-80 overflow-y-auto">
                {tutorText}
              </pre>
              <div className="flex items-center space-x-2 mt-3">
                <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
                  <Copy className="mr-2 h-4 w-4" />
                  {copied ? 'Copiado' : 'Copiar'}
                </Button>
                <a href={tutorUrl} target="_blank" rel="noopener noreferrer">
                  <Button type="button" variant="outline" size="sm">
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Abrir Tutor Kijutech
                  </Button>
                </a>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">
              Todavía no hay texto generado — completa primero el paso 2.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notas del clustering</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-2">
            Anota aquí lo que devuelve la IA antes de introducirlo en el mapa.
          </p>
          <textarea
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setNotesSaved(false);
            }}
            rows={10}
            className={textareaClassName}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={handleSaveNotes}
            disabled={isPending || notesSaved}
          >
            {notesSaved ? <CheckCircle2 className="h-4 w-4" /> : 'Guardar progreso'}
          </Button>
        </CardContent>
      </Card>

      <div className="flex items-center space-x-3">
        <Button
          onClick={handleComplete}
          disabled={isPending}
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          {localStatus === 'completed' ? (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Marcar paso como completado
            </>
          ) : (
            'Marcar paso como completado'
          )}
        </Button>
        {canReset && (
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={isResetting}
          >
            {isResetting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <X className="mr-2 h-4 w-4" />
                Reiniciar paso
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

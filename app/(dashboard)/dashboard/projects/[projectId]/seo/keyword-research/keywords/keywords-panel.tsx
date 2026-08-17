'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2, Trash2, Copy, Plus, X } from 'lucide-react';
import {
  importKwRaw,
  addKwRawManual,
  deleteKwRaw,
  updateKwRawVolume,
  completeStep2,
  resetStep2
} from '@/lib/seo/kw-actions';
import { useSeoAssistantFocus } from '../../seo-assistant-context';
import type { SeoKwRaw } from '@/lib/db/schema';

type Props = {
  projectId: string;
  initialRawKeywords: SeoKwRaw[];
  instructions: string | null;
  initialTutorText: string | null;
  stageStatus: string;
};

export function KeywordsPanel({
  projectId,
  initialRawKeywords,
  instructions,
  initialTutorText,
  stageStatus
}: Props) {
  const router = useRouter();
  const setFocusedKey = useSeoAssistantFocus();

  const [rawKeywords, setRawKeywords] = useState(initialRawKeywords);
  const [bulkText, setBulkText] = useState('');
  const [manualKeyword, setManualKeyword] = useState('');
  const [manualVolume, setManualVolume] = useState('');
  const [tutorText, setTutorText] = useState(initialTutorText);
  const [localStatus, setLocalStatus] = useState(stageStatus);
  const [isResetting, setIsResetting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canComplete = rawKeywords.length >= 10;
  const assignedCount = rawKeywords.filter((k) => k.assigned).length;

  function handleImport() {
    if (!bulkText.trim()) return;
    startTransition(async () => {
      const inserted = await importKwRaw(projectId, bulkText);
      setRawKeywords((prev) => [...inserted, ...prev]);
      setBulkText('');
      router.refresh();
    });
  }

  function handleAddManual() {
    if (!manualKeyword.trim()) return;
    startTransition(async () => {
      const row = await addKwRawManual(
        projectId,
        manualKeyword.trim(),
        manualVolume ? parseInt(manualVolume, 10) : null
      );
      setRawKeywords((prev) => [row, ...prev]);
      setManualKeyword('');
      setManualVolume('');
      router.refresh();
    });
  }

  function handleDelete(id: string) {
    const confirmed = window.confirm('¿Eliminar esta keyword?');
    if (!confirmed) return;
    startTransition(async () => {
      await deleteKwRaw(id);
      setRawKeywords((prev) => prev.filter((k) => k.id !== id));
      router.refresh();
    });
  }

  function handleVolumeChange(id: string, value: string) {
    const volume = value ? parseInt(value, 10) : null;
    setRawKeywords((prev) =>
      prev.map((k) => (k.id === id ? { ...k, monthlyVolume: volume } : k))
    );
    startTransition(async () => {
      await updateKwRawVolume(id, volume);
    });
  }

  function handleComplete() {
    if (!canComplete) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await completeStep2(projectId);
        setTutorText(result.tutorText);
        setLocalStatus('completed');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al completar el paso');
      }
    });
  }

  function handleReset() {
    const confirmed = window.confirm(
      '¿Seguro que quieres reiniciar este paso? Se borrarán todas las keywords importadas.'
    );
    if (!confirmed) return;
    setIsResetting(true);
    startTransition(async () => {
      await resetStep2(projectId);
      setRawKeywords([]);
      setTutorText(null);
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
      {instructions && (
        <Card className="border-l-4 border-l-orange-400">
          <CardHeader>
            <CardTitle>Instrucciones del paso 1 (referencia)</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm whitespace-pre-wrap font-sans bg-gray-50 rounded-md p-3">
              {instructions}
            </pre>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Importar keywords</CardTitle>
        </CardHeader>
        <CardContent>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            onFocus={() => setFocusedKey('kw_import')}
            onBlur={() => setFocusedKey(null)}
            rows={6}
            placeholder={
              'Pega aquí las keywords extraídas de SE Ranking y Google Ads.\nFormato: una keyword por línea.\nPuedes añadir el volumen separado por coma: keyword, 500'
            }
            className="flex w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm"
          />
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={handleImport}
            disabled={isPending || !bulkText.trim()}
          >
            Importar keywords
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Keywords importadas</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            {rawKeywords.length} keywords importadas · {assignedCount} asignadas
            a clusters · {rawKeywords.length - assignedCount} sin asignar
          </p>

          {rawKeywords.length === 0 ? (
            <p className="text-muted-foreground mb-4">
              Todavía no hay keywords importadas.
            </p>
          ) : (
            <ul className="space-y-2 mb-4 max-h-96 overflow-y-auto">
              {rawKeywords.map((k) => (
                <li
                  key={k.id}
                  className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-b-0"
                >
                  <span className="text-sm">
                    {k.keyword}
                    {k.assigned && (
                      <span className="ml-2 text-xs text-green-600">
                        asignada
                      </span>
                    )}
                  </span>
                  <div className="flex items-center space-x-2">
                    <Input
                      type="number"
                      value={k.monthlyVolume ?? ''}
                      onChange={(e) => handleVolumeChange(k.id, e.target.value)}
                      className="w-24 h-8"
                      placeholder="vol/mes"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => handleDelete(k.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center space-x-2">
            <Input
              value={manualKeyword}
              onChange={(e) => setManualKeyword(e.target.value)}
              placeholder="Añadir keyword manualmente"
              className="max-w-xs"
            />
            <Input
              type="number"
              value={manualVolume}
              onChange={(e) => setManualVolume(e.target.value)}
              placeholder="vol/mes"
              className="w-28"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAddManual}
              disabled={isPending || !manualKeyword.trim()}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {tutorText && (
        <Card className="border-l-4 border-l-purple-400">
          <CardHeader>
            <CardTitle>Texto para el Tutor Kijutech</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm whitespace-pre-wrap font-sans bg-gray-50 rounded-md p-3 max-h-80 overflow-y-auto">
              {tutorText}
            </pre>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={handleCopy}
            >
              <Copy className="mr-2 h-4 w-4" />
              {copied ? 'Copiado' : 'Copiar texto para el Tutor'}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center space-x-3">
        <Button
          onClick={handleComplete}
          disabled={isPending || !canComplete}
          className="bg-orange-500 hover:bg-orange-600 text-white"
        >
          {localStatus === 'completed' ? (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Paso completado
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
      {error && <p className="text-red-500 text-sm">{error}</p>}
      {!canComplete && (
        <p className="text-sm text-muted-foreground">
          Necesitas al menos 10 keywords para completar este paso.
        </p>
      )}
    </div>
  );
}

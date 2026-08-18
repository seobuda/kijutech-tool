'use client';

import { useRef, useState, useTransition, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2, Trash2, Copy, Plus, X, Upload } from 'lucide-react';
import {
  importKwRaw,
  importKwRawFromCSV,
  addKwRawManual,
  deleteKwRaw,
  updateKwRawVolume,
  completeStep2,
  resetStep2,
  type SeRankingCsvRow
} from '@/lib/seo/kw-actions';
import {
  parseCSV,
  isSeRankingCsvHeader,
  parseSeRankingCsvRows
} from '@/lib/seo/csv-parse';
import { SERANKING_EXACT_URL_NOTE } from '@/lib/seo/kw-instructions';
import { keywordDifficultyLabel } from '@/lib/seo/format';
import { useSeoAssistantFocus } from '../../seo-assistant-context';
import type { SeoKwRaw } from '@/lib/db/schema';

function mergeRawKeywords(prev: SeoKwRaw[], upserted: SeoKwRaw[]) {
  const byId = new Map(upserted.map((r) => [r.id, r]));
  const remaining = prev.filter((r) => !byId.has(r.id));
  return [...upserted, ...remaining];
}

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

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvPreview, setCsvPreview] = useState<SeRankingCsvRow[] | null>(null);
  const [isImportingCsv, setIsImportingCsv] = useState(false);

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

  function handleCsvButtonClick() {
    fileInputRef.current?.click();
  }

  function handleCsvFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setCsvError(null);
    setCsvPreview(null);

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      const rows = parseCSV(text);
      if (rows.length === 0 || !isSeRankingCsvHeader(rows[0])) {
        setCsvError(
          'Este archivo no parece ser un CSV de SE Ranking. Comprueba que exportaste desde Investigación de la Competencia.'
        );
        return;
      }
      const parsed = parseSeRankingCsvRows(rows).filter((r) => r.keyword.length > 0);
      if (parsed.length === 0) {
        setCsvError('El archivo no contiene ninguna keyword.');
        return;
      }
      setCsvPreview(parsed);
    };
    reader.onerror = () => {
      setCsvError('No se pudo leer el archivo.');
    };
    reader.readAsText(file);
  }

  function handleConfirmCsvImport() {
    if (!csvPreview) return;
    setIsImportingCsv(true);
    startTransition(async () => {
      const upserted = await importKwRawFromCSV(projectId, csvPreview);
      setRawKeywords((prev) => mergeRawKeywords(prev, upserted));
      setCsvPreview(null);
      setIsImportingCsv(false);
      router.refresh();
    });
  }

  function handleCancelCsvPreview() {
    setCsvPreview(null);
    setCsvError(null);
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

          <div className="mt-6 border-t pt-4">
            <p className="text-sm text-muted-foreground mb-2">
              ⚠️ {SERANKING_EXACT_URL_NOTE}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleCsvFileChange}
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleCsvButtonClick}
              disabled={isPending}
            >
              <Upload className="mr-2 h-4 w-4" />
              Importar CSV de SE Ranking
            </Button>
            {csvError && <p className="text-red-500 text-sm mt-2">{csvError}</p>}
          </div>
        </CardContent>
      </Card>

      {csvPreview && (
        <Card className="border-l-4 border-l-blue-400">
          <CardHeader>
            <CardTitle>
              Se van a importar {csvPreview.length} keywords desde SE Ranking. ¿Confirmar?
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 mb-4 max-h-64 overflow-y-auto text-sm">
              {csvPreview.map((row, i) => (
                <li
                  key={`${row.keyword}-${i}`}
                  className="flex items-center justify-between border-b border-gray-100 pb-1 last:border-b-0"
                >
                  <span>{row.keyword}</span>
                  <span className="text-muted-foreground">
                    {row.volume != null ? `${row.volume}/mes` : '—'}
                    {row.position != null ? ` · Pos. ${row.position}` : ''}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex items-center space-x-2">
              <Button
                type="button"
                onClick={handleConfirmCsvImport}
                disabled={isImportingCsv}
                className="bg-orange-500 hover:bg-orange-600 text-white"
              >
                {isImportingCsv ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Confirmar importación'
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancelCsvPreview}
                disabled={isImportingCsv}
              >
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
              {rawKeywords.map((k) => {
                const fromCsv = k.source === 'seranking_csv';
                const difficulty =
                  fromCsv && k.serankingDifficulty != null
                    ? keywordDifficultyLabel(k.serankingDifficulty)
                    : null;

                return (
                <li
                  key={k.id}
                  className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-b-0"
                >
                  <div className="text-sm">
                    <div>
                      {k.keyword}
                      {fromCsv && (
                        <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                          SE Ranking
                        </span>
                      )}
                      {k.assigned && (
                        <span className="ml-2 text-xs text-green-600">
                          asignada
                        </span>
                      )}
                    </div>
                    {fromCsv && (
                      <div className="flex items-center gap-2 mt-1">
                        {k.serankingPosition != null && (
                          <span className="text-xs text-muted-foreground">
                            Pos. {k.serankingPosition}
                          </span>
                        )}
                        {difficulty && (
                          <span
                            className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${difficulty.className}`}
                          >
                            {difficulty.label}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
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
                );
              })}
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

'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Sparkles, ChevronDown, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { analyzeKeywordsWithAI } from '@/lib/seo/kw-ai-actions';
import type { ParsedCluster, ParsedReasonedItem } from '@/lib/ai/parsers/cluster-keywords';
import { ClusteringPanel } from './clustering-panel';
import { ClusterReview } from './cluster-review';

type AnalysisResult = {
  clusters: ParsedCluster[];
  unassigned: ParsedReasonedItem[];
  irrelevant: ParsedReasonedItem[];
  jobId: string;
  estimatedCost: number | null;
  providerUsed: string;
  modelUsed: string;
};

type ManualPanelProps = {
  tutorText: string | null;
  tutorUrl: string;
  initialNotes: string;
  stageStatus: string;
};

type Props = {
  projectId: string;
  activeProvider: { provider: string; model: string } | null;
  keywordCount: number;
  existingClustersCount: number;
  manualPanelProps: ManualPanelProps;
};

function getAnalyzingMessage(seconds: number): string {
  if (seconds < 5) return 'Analizando keywords...';
  if (seconds < 30) return 'Procesando con IA... esto puede tardar unos segundos';
  if (seconds < 60) return 'Agrupando por intención de búsqueda...';
  if (seconds < 90) return 'Generando clasificación estratégica...';
  return 'Casi listo, finalizando el análisis...';
}

export function ClusteringStepClient({
  projectId,
  activeProvider,
  keywordCount,
  existingClustersCount,
  manualPanelProps,
}: Props) {
  const [view, setView] = useState<'idle' | 'analyzing' | 'error' | 'review'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorRawResponse, setErrorRawResponse] = useState<string | null>(null);
  const [rawResponseExpanded, setRawResponseExpanded] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [manualExpanded, setManualExpanded] = useState(!activeProvider);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Feedback visual progresivo mientras dura la llamada (hasta 180s de
  // timeout en el gateway) — solo un contador local, sin llamadas al
  // servidor.
  useEffect(() => {
    if (view !== 'analyzing') return;
    setElapsedSeconds(0);
    const interval = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [view]);

  function handleAnalyze() {
    setView('analyzing');
    setErrorMsg(null);
    setErrorRawResponse(null);
    setRawResponseExpanded(false);
    analyzeKeywordsWithAI(projectId).then((result) => {
      if ('error' in result) {
        setErrorMsg(result.error);
        setErrorRawResponse(result.rawResponse ?? null);
        setView('error');
        return;
      }
      setAnalysis(result);
      setView('review');
    });
  }

  if (view === 'review' && analysis) {
    return (
      <ClusterReview
        projectId={projectId}
        analysis={analysis}
        existingClustersCount={existingClustersCount}
        onDiscard={() => {
          setAnalysis(null);
          setView('idle');
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {activeProvider ? (
        <Card className="border-l-4 border-l-orange-400 bg-orange-50/50">
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-orange-500" />
              <h3 className="font-semibold">Clustering automático disponible</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Proveedor: <span className="font-medium">{activeProvider.provider}</span> ·
              Modelo: <span className="font-medium">{activeProvider.model}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              La IA analizará tus {keywordCount} keywords y generará los clusters
              automáticamente. Podrás revisar y editar antes de confirmar.
            </p>

            {view === 'error' && errorMsg && (
              errorRawResponse ? (
                <div className="rounded-md border border-red-300 bg-red-50 p-3 space-y-2">
                  <p className="text-sm font-medium text-red-800">
                    Error al procesar la respuesta de la IA
                  </p>
                  <p className="text-sm text-red-700">{errorMsg}</p>
                  <div>
                    <button
                      type="button"
                      onClick={() => setRawResponseExpanded((v) => !v)}
                      className="flex items-center gap-1 text-xs font-medium text-red-800 hover:text-red-900"
                    >
                      {rawResponseExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" />
                      )}
                      Ver respuesta raw
                    </button>
                    {rawResponseExpanded && (
                      <textarea
                        readOnly
                        value={errorRawResponse}
                        rows={10}
                        className="mt-2 w-full rounded-md border border-red-200 bg-white p-2 font-mono text-xs text-gray-700"
                      />
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-red-600">{errorMsg}</p>
              )
            )}

            <Button
              type="button"
              onClick={handleAnalyze}
              disabled={view === 'analyzing' || keywordCount < 3}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {view === 'analyzing' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {getAnalyzingMessage(elapsedSeconds)}
                </>
              ) : view === 'error' ? (
                'Reintentar'
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Analizar con IA
                </>
              )}
            </Button>
            {keywordCount < 3 && (
              <p className="text-xs text-muted-foreground">
                Necesitas al menos 3 keywords en el paso 2 para poder analizarlas.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <p className="text-sm text-muted-foreground">
          Configura un proveedor de IA en{' '}
          <Link href="/dashboard/ai/settings" className="underline">
            IA &amp; Modelos
          </Link>{' '}
          para automatizar este paso.
        </p>
      )}

      {activeProvider ? (
        <div>
          <button
            type="button"
            onClick={() => setManualExpanded((v) => !v)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            {manualExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            O hazlo manualmente con el Tutor
          </button>
          {manualExpanded && (
            <div className="mt-4">
              <ClusteringPanel projectId={projectId} {...manualPanelProps} />
            </div>
          )}
        </div>
      ) : (
        <ClusteringPanel projectId={projectId} {...manualPanelProps} />
      )}
    </div>
  );
}

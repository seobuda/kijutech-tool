'use client';

import { useState } from 'react';
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

export function ClusteringStepClient({
  projectId,
  activeProvider,
  keywordCount,
  existingClustersCount,
  manualPanelProps,
}: Props) {
  const [view, setView] = useState<'idle' | 'analyzing' | 'error' | 'review'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [manualExpanded, setManualExpanded] = useState(!activeProvider);

  function handleAnalyze() {
    setView('analyzing');
    setErrorMsg(null);
    analyzeKeywordsWithAI(projectId).then((result) => {
      if ('error' in result) {
        setErrorMsg(result.error);
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
              <p className="text-sm text-red-600">{errorMsg}</p>
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
                  Analizando keywords...
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

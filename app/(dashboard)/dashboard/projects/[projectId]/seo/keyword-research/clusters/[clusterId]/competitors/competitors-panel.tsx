'use client';

import { useEffect, useState, useTransition } from 'react';
import useSWR, { mutate } from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { X, Sparkles, Loader2 } from 'lucide-react';
import {
  saveCompetitorUrls,
  deleteCompetitor,
  refreshAnalysis,
  generateCompetitorAnalysis,
} from '@/lib/seo/competitor-actions';
import { seoClusterCompetitorsSwrKey } from '@/lib/seo/client-keys';
import type { SeoClusterCompetitor, SeoCompetitorAnalysis } from '@/lib/db/schema';
import type {
  AnalysisRecommendation,
  AnalysisStructureSection,
  ParsedCompetitorAnalysis,
} from '@/lib/ai/parsers/competitor-analysis';

const MAX_URLS = 5;
const POLL_INTERVAL_MS = 3000;

const STATUS_META: Record<string, { emoji: string; label: string }> = {
  pending: { emoji: '🟡', label: 'Analizando...' },
  scraping: { emoji: '🟡', label: 'Analizando...' },
  done: { emoji: '✅', label: 'Listo' },
  failed: { emoji: '❌', label: 'Error al acceder' },
};

const PRIORITY_META: Record<string, { emoji: string; cardClass: string; badgeClass: string }> = {
  critico: {
    emoji: '🔴',
    cardClass: 'border-2 border-red-300 bg-red-50/40',
    badgeClass: 'bg-red-100 text-red-700',
  },
  recomendado: {
    emoji: '🟡',
    cardClass: 'border border-amber-300 bg-amber-50/40',
    badgeClass: 'bg-amber-100 text-amber-700',
  },
  diferenciador: {
    emoji: '🟢',
    cardClass: 'border border-green-300 bg-green-50/40',
    badgeClass: 'bg-green-100 text-green-700',
  },
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type ApiData = { competitors: SeoClusterCompetitor[]; analysis: SeoCompetitorAnalysis | null };

// analysis_json guarda o bien el análisis parseado, o bien { error: "..." }
// cuando el parseo de la respuesta de la IA falló (generateCompetitorAnalysis
// en lib/seo/competitor-actions.ts) — se distingue en runtime, no hay
// columna aparte para el estado.
function isValidAnalysis(json: unknown): json is ParsedCompetitorAnalysis {
  return (
    typeof json === 'object' &&
    json !== null &&
    Array.isArray((json as Record<string, unknown>).recommendations)
  );
}

function isAnalysisError(json: unknown): json is { error: string } {
  return (
    typeof json === 'object' &&
    json !== null &&
    typeof (json as Record<string, unknown>).error === 'string'
  );
}

function RecommendationCard({ rec }: { rec: AnalysisRecommendation }) {
  const meta = PRIORITY_META[rec.priority] ?? PRIORITY_META.recomendado;
  return (
    <Card className={meta.cardClass}>
      <CardContent className="pt-6 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span>{meta.emoji}</span>
            <span className="font-semibold">{rec.action}</span>
          </div>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${meta.badgeClass}`}
          >
            {rec.competitor_count}/5 competidores
          </span>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Qué es
          </p>
          <p className="text-sm">{rec.what}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Por qué importa
          </p>
          <p className="text-sm">{rec.why}</p>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Cómo ejecutarlo
          </p>
          <p className="text-sm">{rec.how}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function RecommendedStructure({ sections }: { sections: AnalysisStructureSection[] }) {
  if (sections.length === 0) return null;
  return (
    <div>
      <h3 className="text-base font-medium mb-3">Estructura sugerida para esta landing</h3>
      <ol className="space-y-2 list-decimal list-inside">
        {sections
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((s) => (
            <li key={s.order} className="text-sm">
              <span className="font-medium">{s.section}</span> — {s.one_line}
            </li>
          ))}
      </ol>
      <p className="text-xs text-muted-foreground mt-3">
        Esta estructura está basada en el análisis de los competidores que actualmente aparecen
        antes que tú en Google. Úsala como punto de partida, no como regla fija.
      </p>
    </div>
  );
}

function AnalysisView({
  data,
  generatedAt,
  onRefresh,
  isRefreshing,
}: {
  data: ParsedCompetitorAnalysis;
  generatedAt: Date | string;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  return (
    <div className="space-y-4">
      <Card className="bg-muted/30">
        <CardContent className="pt-6 space-y-3">
          <p className="text-sm">{data.summary}</p>
          <div className="flex items-center justify-between gap-3 border-t pt-3">
            <p className="text-xs text-muted-foreground">
              Generado el {new Date(generatedAt).toLocaleDateString('es-ES')}
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRefresh}
              disabled={isRefreshing}
            >
              {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Regenerar análisis'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {data.recommendations.map((rec, i) => (
          <RecommendationCard key={i} rec={rec} />
        ))}
      </div>

      <RecommendedStructure sections={data.recommended_structure} />
    </div>
  );
}

function AnalysisLoading({ competitorCount }: { competitorCount: number }) {
  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          Analizando {competitorCount} competidores... esto puede tardar unos segundos.
        </p>
        <div className="space-y-2 animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4" />
          <div className="h-4 bg-gray-200 rounded w-full" />
          <div className="h-4 bg-gray-200 rounded w-5/6" />
          <div className="h-20 bg-gray-200 rounded" />
        </div>
      </CardContent>
    </Card>
  );
}

function AnalysisError({
  message,
  onRetry,
  isRetrying,
}: {
  message: string;
  onRetry: () => void;
  isRetrying: boolean;
}) {
  return (
    <Card className="border-red-300 bg-red-50/40">
      <CardContent className="pt-6 space-y-3">
        <p className="text-sm text-red-700">{message}</p>
        <Button type="button" size="sm" variant="outline" onClick={onRetry} disabled={isRetrying}>
          {isRetrying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reintentar'}
        </Button>
      </CardContent>
    </Card>
  );
}

type Props = {
  projectId: string;
  clusterId: string;
  initialCompetitors: SeoClusterCompetitor[];
  initialAnalysis: SeoCompetitorAnalysis | null;
};

export function CompetitorsPanel({ projectId, clusterId, initialCompetitors, initialAnalysis }: Props) {
  const key = seoClusterCompetitorsSwrKey(projectId, clusterId);
  const { data } = useSWR<ApiData>(key, fetcher, {
    fallbackData: { competitors: initialCompetitors, analysis: initialAnalysis },
    refreshInterval: (latest) => {
      const stillWorking = (latest?.competitors ?? []).some(
        (c) => c.scrapeStatus === 'pending' || c.scrapeStatus === 'scraping'
      );
      return stillWorking ? POLL_INTERVAL_MS : 0;
    },
  });

  const competitors = data?.competitors ?? [];
  const analysis = data?.analysis ?? null;

  const [isEditing, setIsEditing] = useState(competitors.length === 0);
  const [formUrls, setFormUrls] = useState<string[]>(
    competitors.length > 0 ? competitors.map((c) => c.url) : ['']
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Transition separada de la del formulario de URLs: generar el análisis
  // puede tardar 10-20s y no debe bloquear ni confundirse con guardar/borrar
  // URLs, que son casi instantáneos.
  const [isGenerating, startGenerating] = useTransition();
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Si el usuario borra la última URL desde la vista de lista, vuelve al
  // formulario con el mensaje de estado vacío en vez de dejar una tarjeta
  // sin filas y sin explicación.
  useEffect(() => {
    if (competitors.length === 0 && !isEditing) {
      setFormUrls(['']);
      setIsEditing(true);
    }
  }, [competitors.length, isEditing]);

  function openEditForm() {
    setFormUrls(competitors.length > 0 ? competitors.map((c) => c.url) : ['']);
    setError(null);
    setIsEditing(true);
  }

  function handleUrlChange(index: number, value: string) {
    setFormUrls((prev) => prev.map((u, i) => (i === index ? value : u)));
  }

  function handleAddUrlField() {
    setFormUrls((prev) => (prev.length >= MAX_URLS ? prev : [...prev, '']));
  }

  function handleRemoveUrlField(index: number) {
    setFormUrls((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await saveCompetitorUrls(clusterId, formUrls);
      if (result && 'error' in result && result.error) {
        setError(result.error);
        return;
      }
      setIsEditing(false);
      mutate(key);
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteCompetitor(id);
      mutate(key);
    });
  }

  function handleGenerateAnalysis() {
    setGenerationError(null);
    startGenerating(async () => {
      const result = await generateCompetitorAnalysis(clusterId);
      if (result && 'error' in result && result.error) {
        setGenerationError(result.error);
      }
      mutate(key);
    });
  }

  function handleRefreshAnalysis() {
    setGenerationError(null);
    startGenerating(async () => {
      await refreshAnalysis(clusterId);
      const result = await generateCompetitorAnalysis(clusterId);
      if (result && 'error' in result && result.error) {
        setGenerationError(result.error);
      }
      mutate(key);
    });
  }

  const allDone = competitors.length > 0 && competitors.every((c) => c.scrapeStatus === 'done');

  if (isEditing) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-4">
          {competitors.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Busca en Google las keywords principales de este cluster e introduce las URLs que
              aparecen en el top 5. El sistema las analizará automáticamente.
            </p>
          )}

          <div className="space-y-2">
            {formUrls.map((url, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={url}
                  onChange={(e) => handleUrlChange(i, e.target.value)}
                  placeholder={`https://competidor-${i + 1}.com/pagina`}
                  className="h-9"
                />
                {formUrls.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveUrlField(i)}
                    className="text-muted-foreground hover:text-red-600"
                    aria-label={`Eliminar URL ${i + 1}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {formUrls.length < MAX_URLS && (
            <button
              type="button"
              onClick={handleAddUrlField}
              className="text-sm text-orange-600 hover:text-orange-700"
            >
              + Añadir otra URL
            </button>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={handleSave}
              disabled={isPending || formUrls.every((u) => !u.trim())}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              Guardar y analizar
            </Button>
            {competitors.length > 0 && (
              <Button type="button" variant="outline" onClick={() => setIsEditing(false)}>
                Cancelar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-6 space-y-3">
          {competitors.map((c) => {
            const status = STATUS_META[c.scrapeStatus] ?? STATUS_META.pending;
            return (
              <div key={c.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <span>{status.emoji}</span>
                  <span className="truncate">{c.url}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-muted-foreground">{status.label}</span>
                  <button
                    type="button"
                    onClick={() => handleDelete(c.id)}
                    className="text-muted-foreground hover:text-red-600"
                    aria-label={`Eliminar ${c.url}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}

          <div className="pt-2">
            <Button type="button" variant="outline" size="sm" onClick={openEditForm}>
              Añadir/editar URLs
            </Button>
          </div>
        </CardContent>
      </Card>

      {isGenerating ? (
        <AnalysisLoading competitorCount={competitors.length} />
      ) : analysis && isValidAnalysis(analysis.analysisJson) ? (
        <AnalysisView
          data={analysis.analysisJson}
          generatedAt={analysis.createdAt}
          onRefresh={handleRefreshAnalysis}
          isRefreshing={isGenerating}
        />
      ) : generationError || (analysis && isAnalysisError(analysis.analysisJson)) ? (
        <AnalysisError
          message={
            generationError ??
            (analysis && isAnalysisError(analysis.analysisJson) ? analysis.analysisJson.error : '')
          }
          onRetry={handleGenerateAnalysis}
          isRetrying={isGenerating}
        />
      ) : (
        allDone && (
          <Button
            type="button"
            onClick={handleGenerateAnalysis}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Generar análisis IA →
          </Button>
        )
      )}
    </div>
  );
}

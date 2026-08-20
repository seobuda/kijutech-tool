'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Search, X, Bot, Copy, ChevronDown, ChevronRight, AlertTriangle, ArrowRight } from 'lucide-react';
import { confirmAIClusters } from '@/lib/seo/kw-ai-actions';
import { recordClusterFeedback } from '@/lib/seo/kw-feedback-actions';
import type { ClusterProposal, ReasonedItem } from '@/lib/ai/clustering/types';
import { URL_TYPE_META } from '@/lib/seo/format';
import { StrategyBadges, type StrategyField } from '../strategy-badges';

const DIFFICULTY_OPTIONS = [
  { value: '', label: '—' },
  { value: 'easy', label: 'Fácil' },
  { value: 'medium', label: 'Media' },
  { value: 'hard', label: 'Difícil' },
];

const selectClassName =
  'flex h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]';

type EditableKeyword = {
  keyword: string;
  monthlyVolume: number | null;
  isPrimary: boolean;
  excluded: boolean;
  pendingVerification: boolean;
};

// Snapshot inmutable de los valores propuestos por la IA, para poder
// distinguir al confirmar si el usuario dejó el cluster tal cual
// ('confirmed') o lo tocó ('edited') — ese matiz alimenta el feedback
// del RAG (lib/ai/clustering/feedback/capture.ts).
type OriginalSnapshot = {
  title: string;
  targetUrl: string;
  difficulty: string;
  destination: string | null;
  contentType: string | null;
  searchIntent: string | null;
  keywordCount: number;
};

type EditableCluster = {
  uid: string;
  title: string;
  targetUrl: string;
  difficulty: string;
  urlType: string | null;
  isAiSuggested: boolean;
  reasoning: string | null;
  lowVolume: boolean;
  destination: string | null;
  contentType: string | null;
  searchIntent: string | null;
  strategyNote: string | null;
  keywords: EditableKeyword[];
  original: OriginalSnapshot;
};

function toEditable(clusters: ClusterProposal[]): EditableCluster[] {
  return clusters.map((c) => ({
    uid: crypto.randomUUID(),
    title: c.title,
    targetUrl: c.target_url ?? '',
    difficulty: c.difficulty ?? '',
    urlType: c.url_type,
    isAiSuggested: c.is_ai_suggested,
    reasoning: c.reasoning,
    lowVolume: c.low_volume,
    destination: c.destination,
    contentType: c.content_type,
    searchIntent: c.search_intent,
    strategyNote: c.strategy_note,
    keywords: c.keywords.map((k) => ({
      keyword: k.keyword,
      monthlyVolume: k.monthly_volume,
      isPrimary: k.is_primary,
      excluded: false,
      pendingVerification: k.pending_verification,
    })),
    original: {
      title: c.title,
      targetUrl: c.target_url ?? '',
      difficulty: c.difficulty ?? '',
      destination: c.destination,
      contentType: c.content_type,
      searchIntent: c.search_intent,
      keywordCount: c.keywords.length,
    },
  }));
}

function computeFeedbackType(cluster: EditableCluster): 'confirmed' | 'edited' {
  const activeKeywordCount = cluster.keywords.filter((k) => !k.excluded).length;
  const unchanged =
    cluster.title === cluster.original.title &&
    cluster.targetUrl === cluster.original.targetUrl &&
    cluster.difficulty === cluster.original.difficulty &&
    cluster.destination === cluster.original.destination &&
    cluster.contentType === cluster.original.contentType &&
    cluster.searchIntent === cluster.original.searchIntent &&
    activeKeywordCount === cluster.original.keywordCount;
  return unchanged ? 'confirmed' : 'edited';
}

type Props = {
  projectId: string;
  analysis: {
    clusters: ClusterProposal[];
    unassigned: ReasonedItem[];
    irrelevant: ReasonedItem[];
    jobId: string;
    estimatedCost: number | null;
    providerUsed: string;
    modelUsed: string;
  };
  existingClustersCount: number;
  onDiscard: () => void;
};

export function ClusterReview({ projectId, analysis, existingClustersCount, onDiscard }: Props) {
  const [clusters, setClusters] = useState<EditableCluster[]>(() => toEditable(analysis.clusters));
  const [unassigned, setUnassigned] = useState<ReasonedItem[]>(analysis.unassigned);
  const [showModeChoice, setShowModeChoice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [irrelevantExpanded, setIrrelevantExpanded] = useState(false);
  const [copyConfirmation, setCopyConfirmation] = useState<string | null>(null);
  const [movingKeyword, setMovingKeyword] = useState<{ uid: string; index: number } | null>(null);

  const hasSuggestedClusters = clusters.some((c) => c.isAiSuggested);

  function updateCluster(uid: string, patch: Partial<EditableCluster>) {
    setClusters((prev) => prev.map((c) => (c.uid === uid ? { ...c, ...patch } : c)));
  }

  function updateClusterStrategyField(uid: string, field: StrategyField, value: string) {
    const cluster = clusters.find((c) => c.uid === uid);
    if (!cluster) return;

    const patch: Partial<EditableCluster> =
      field === 'destination'
        ? { destination: value }
        : field === 'content_type'
          ? { contentType: value }
          : { searchIntent: value };
    updateCluster(uid, patch);

    if (field === 'content_type') {
      void recordClusterFeedback({
        projectId,
        jobId: analysis.jobId,
        feedbackType: 'content_type_changed',
        originalValue: { content_type: cluster.contentType },
        correctedValue: { content_type: value },
      });
    } else if (field === 'search_intent') {
      void recordClusterFeedback({
        projectId,
        jobId: analysis.jobId,
        feedbackType: 'intent_changed',
        originalValue: { search_intent: cluster.searchIntent },
        correctedValue: { search_intent: value },
      });
    }
  }

  function toggleKeywordExcluded(clusterUid: string, index: number) {
    const cluster = clusters.find((c) => c.uid === clusterUid);
    const keyword = cluster?.keywords[index];

    setClusters((prev) =>
      prev.map((c) =>
        c.uid !== clusterUid
          ? c
          : {
              ...c,
              keywords: c.keywords.map((k, i) =>
                i === index ? { ...k, excluded: !k.excluded } : k
              ),
            }
      )
    );

    // Solo se registra al DESMARCAR (excluir) — volver a marcarla no es la
    // señal de feedback que interesa (deshacer un error de clic no dice
    // nada sobre si la keyword pertenecía o no al cluster).
    if (keyword && !keyword.excluded) {
      void recordClusterFeedback({
        projectId,
        jobId: analysis.jobId,
        feedbackType: 'keyword_removed',
        originalValue: { cluster: cluster?.title, keyword: keyword.keyword },
      });
    }
  }

  function moveKeywordToCluster(sourceUid: string, index: number, targetUid: string) {
    if (!targetUid || targetUid === sourceUid) return;
    const sourceCluster = clusters.find((c) => c.uid === sourceUid);
    const targetCluster = clusters.find((c) => c.uid === targetUid);
    const keyword = sourceCluster?.keywords[index];
    if (!sourceCluster || !targetCluster || !keyword) return;

    setClusters((prev) =>
      prev.map((c) => {
        if (c.uid === sourceUid) {
          const remaining = c.keywords.filter((_, i) => i !== index);
          // Si la keyword movida era la principal, la siguiente por volumen
          // (entre las que siguen activas) la sustituye.
          if (keyword.isPrimary) {
            const next = [...remaining]
              .filter((k) => !k.excluded)
              .sort((a, b) => (b.monthlyVolume ?? 0) - (a.monthlyVolume ?? 0))[0];
            return {
              ...c,
              keywords: remaining.map((k) => ({ ...k, isPrimary: k === next })),
            };
          }
          return { ...c, keywords: remaining };
        }
        if (c.uid === targetUid) {
          return { ...c, keywords: [...c.keywords, { ...keyword, excluded: false, isPrimary: false }] };
        }
        return c;
      })
    );
    setMovingKeyword(null);

    void recordClusterFeedback({
      projectId,
      jobId: analysis.jobId,
      feedbackType: 'keyword_moved',
      originalValue: { cluster_origen: sourceCluster.title, keyword: keyword.keyword },
      correctedValue: { cluster_destino: targetCluster.title },
    });
  }

  function removeCluster(uid: string) {
    if (!confirm('¿Eliminar este cluster propuesto?')) return;
    const cluster = clusters.find((c) => c.uid === uid);
    setClusters((prev) => prev.filter((c) => c.uid !== uid));

    if (cluster) {
      void recordClusterFeedback({
        projectId,
        jobId: analysis.jobId,
        feedbackType: 'cluster_deleted',
        originalValue: {
          title: cluster.title,
          keywords: cluster.keywords.map((k) => k.keyword),
          search_intent: cluster.searchIntent,
        },
      });
    }
  }

  function assignUnassignedKeyword(keyword: string, targetUid: string) {
    if (!targetUid) return;
    setClusters((prev) =>
      prev.map((c) =>
        c.uid !== targetUid
          ? c
          : {
              ...c,
              keywords: [
                ...c.keywords,
                {
                  keyword,
                  monthlyVolume: null,
                  isPrimary: false,
                  excluded: false,
                  pendingVerification: false,
                },
              ],
            }
      )
    );
    setUnassigned((prev) => prev.filter((k) => k.keyword !== keyword));
  }

  async function handleCopySuggested() {
    const suggestedKeywords = clusters
      .filter((c) => c.isAiSuggested)
      .flatMap((c) => c.keywords.map((k) => k.keyword));

    if (suggestedKeywords.length === 0) return;

    await navigator.clipboard.writeText(suggestedKeywords.join('\n'));
    setCopyConfirmation(
      `${suggestedKeywords.length} keywords copiadas. Pégalas en SE Ranking para verificar sus volúmenes.`
    );
    setTimeout(() => setCopyConfirmation(null), 4000);
  }

  function buildPayload() {
    return clusters
      .map((c) => ({
        title: c.title.trim(),
        targetUrl: c.targetUrl.trim() || null,
        difficulty: (c.difficulty || null) as 'easy' | 'medium' | 'hard' | null,
        urlType: c.urlType,
        isAiSuggested: c.isAiSuggested,
        reasoning: c.reasoning,
        lowVolume: c.lowVolume,
        destination: c.destination,
        contentType: c.contentType,
        searchIntent: c.searchIntent,
        strategyNote: c.strategyNote,
        feedbackType: computeFeedbackType(c),
        keywords: c.keywords
          .filter((k) => !k.excluded)
          .map((k) => ({
            keyword: k.keyword,
            monthlyVolume: k.monthlyVolume,
            isPrimary: k.isPrimary,
            pendingVerification: k.pendingVerification,
          })),
      }))
      .filter((c) => c.title && c.keywords.length > 0);
  }

  function doConfirm(mode: 'add' | 'replace') {
    setError(null);
    const payload = buildPayload();
    if (payload.length === 0) {
      setError('No hay ningún cluster válido para confirmar (título y al menos 1 keyword).');
      return;
    }

    for (const cluster of clusters) {
      if (computeFeedbackType(cluster) === 'confirmed') {
        void recordClusterFeedback({
          projectId,
          jobId: analysis.jobId,
          feedbackType: 'cluster_confirmed',
          originalValue: {
            title: cluster.title,
            search_intent: cluster.searchIntent,
            content_type: cluster.contentType,
          },
        });
      }
    }

    startTransition(async () => {
      const result = await confirmAIClusters(projectId, payload, mode, analysis.jobId);
      if (result && 'error' in result) {
        setError(result.error);
      }
    });
  }

  function handleConfirmClick() {
    setError(null);
    const payload = buildPayload();
    if (payload.length === 0) {
      setError('No hay ningún cluster válido para confirmar (título y al menos 1 keyword).');
      return;
    }
    if (existingClustersCount > 0) {
      setShowModeChoice(true);
      return;
    }
    doConfirm('add');
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-medium">
            {clusters.length} clusters generados · Revisa y edita antes de confirmar
          </h3>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full">
          <Bot className="h-3.5 w-3.5" />
          {analysis.modelUsed}
          {analysis.estimatedCost != null && ` · ~${analysis.estimatedCost.toFixed(4)}€`}
        </span>
      </div>

      {hasSuggestedClusters && (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={handleCopySuggested}>
            <Copy className="h-4 w-4" />
            Copiar keywords sugeridas para SE Ranking
          </Button>
          {copyConfirmation && (
            <p className="text-xs text-green-600 mt-1.5">{copyConfirmation}</p>
          )}
        </div>
      )}

      {clusters.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">
              No queda ningún cluster propuesto. Descarta y vuelve a intentarlo, o
              reasigna alguna de las keywords sin clasificar.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
          {clusters.map((cluster) => {
            const totalVolume = cluster.keywords
              .filter((k) => !k.excluded)
              .reduce((sum, k) => sum + (k.monthlyVolume ?? 0), 0);
            const urlTypeMeta = cluster.urlType ? URL_TYPE_META[cluster.urlType] : null;

            return (
              <Card
                key={cluster.uid}
                className={
                  cluster.isAiSuggested
                    ? 'bg-yellow-50 border-yellow-300'
                    : 'bg-blue-50/60 border-blue-200'
                }
              >
                <CardContent className="p-4 space-y-3">
                  {cluster.isAiSuggested && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium bg-yellow-200/70 text-yellow-900 px-2 py-1 rounded-full">
                      ✨ Sugerido por IA · Verificar volumen
                    </span>
                  )}

                  <div className="flex items-start justify-between gap-2">
                    <Input
                      value={cluster.title}
                      onChange={(e) => updateCluster(cluster.uid, { title: e.target.value })}
                      className="h-8 font-medium"
                    />
                    <button
                      type="button"
                      onClick={() => removeCluster(cluster.uid)}
                      className="text-muted-foreground hover:text-red-600 shrink-0 mt-1.5"
                      aria-label="Eliminar cluster"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {!cluster.isAiSuggested && (urlTypeMeta || cluster.lowVolume) && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {urlTypeMeta && (
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${urlTypeMeta.className}`}
                        >
                          {urlTypeMeta.label}
                        </span>
                      )}
                      {cluster.lowVolume && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-yellow-100 text-yellow-800">
                          Volumen bajo
                        </span>
                      )}
                    </div>
                  )}
                  {!cluster.isAiSuggested && cluster.reasoning && (
                    <p className="text-xs text-muted-foreground">{cluster.reasoning}</p>
                  )}

                  <StrategyBadges
                    values={{
                      destination: cluster.destination,
                      contentType: cluster.contentType,
                      searchIntent: cluster.searchIntent,
                    }}
                    strategyNote={cluster.strategyNote}
                    onChange={(field, value) =>
                      updateClusterStrategyField(cluster.uid, field, value)
                    }
                  />

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">URL destino</Label>
                    <Input
                      value={cluster.targetUrl}
                      onChange={(e) => updateCluster(cluster.uid, { targetUrl: e.target.value })}
                      placeholder="/slug-en-espanol"
                      className="h-8"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Dificultad</Label>
                    <select
                      value={cluster.difficulty}
                      onChange={(e) => updateCluster(cluster.uid, { difficulty: e.target.value })}
                      className={selectClassName}
                    >
                      {DIFFICULTY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="border-t pt-2 space-y-1.5">
                    {cluster.keywords.map((k, i) => {
                      const otherClusters = clusters.filter((c) => c.uid !== cluster.uid);
                      const isMoving =
                        movingKeyword?.uid === cluster.uid && movingKeyword.index === i;

                      return (
                      <div key={`${k.keyword}-${i}`} className={k.excluded ? 'opacity-40' : ''}>
                        <div className="flex items-center justify-between gap-2 text-sm">
                          <label className="flex items-center gap-1.5 truncate">
                            <input
                              type="checkbox"
                              checked={!k.excluded}
                              onChange={() => toggleKeywordExcluded(cluster.uid, i)}
                              title="Desmarca para excluir esta keyword"
                            />
                            {k.isPrimary && <span className="text-orange-500">★</span>}
                            {k.keyword}
                          </label>
                          <span className="flex items-center gap-1.5 shrink-0">
                            {k.pendingVerification ? (
                              <span
                                className="text-muted-foreground text-xs"
                                title="Volumen pendiente de verificar en SE Ranking"
                              >
                                —/mes
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">
                                {k.monthlyVolume ?? '—'}/mes
                              </span>
                            )}
                            {otherClusters.length > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setMovingKeyword(
                                    isMoving ? null : { uid: cluster.uid, index: i }
                                  )
                                }
                                className="text-muted-foreground hover:text-foreground"
                                aria-label={`Mover ${k.keyword} a otro cluster`}
                                title="Mover a otro cluster"
                              >
                                <ArrowRight className="h-3 w-3" />
                              </button>
                            )}
                          </span>
                        </div>
                        {isMoving && (
                          <select
                            autoFocus
                            defaultValue=""
                            onChange={(e) => moveKeywordToCluster(cluster.uid, i, e.target.value)}
                            className={`${selectClassName} mt-1 h-7 w-full text-xs`}
                          >
                            <option value="" disabled>
                              Mover a...
                            </option>
                            {otherClusters.map((c) => (
                              <option key={c.uid} value={c.uid}>
                                {c.title || '(sin título)'}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                      );
                    })}
                  </div>

                  <div className="border-t pt-2 flex items-center gap-1.5 text-sm">
                    <Search className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-semibold">{totalVolume}</span>
                    <span className="text-xs text-muted-foreground">búsq./mes</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {unassigned.length > 0 && (
        <Card>
          <CardContent className="pt-6 space-y-2">
            <p className="text-sm font-medium">{unassigned.length} keywords sin clasificar</p>
            <div className="space-y-1.5">
              {unassigned.map((item) => (
                <div key={item.keyword} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">
                    {item.keyword}
                    {item.reason && (
                      <span className="text-muted-foreground text-xs"> — {item.reason}</span>
                    )}
                  </span>
                  <select
                    defaultValue=""
                    onChange={(e) => assignUnassignedKeyword(item.keyword, e.target.value)}
                    className={selectClassName}
                  >
                    <option value="">Añadir al cluster...</option>
                    {clusters.map((c) => (
                      <option key={c.uid} value={c.uid}>
                        {c.title || '(sin título)'}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {analysis.irrelevant.length > 0 && (
        <Card>
          <CardContent className="pt-6 space-y-2">
            <button
              type="button"
              onClick={() => setIrrelevantExpanded((v) => !v)}
              className="flex items-center gap-1.5 text-sm font-medium w-full text-left"
            >
              {irrelevantExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              Keywords descartadas por la IA ({analysis.irrelevant.length})
            </button>
            {irrelevantExpanded && (
              <div className="space-y-2 pt-2">
                <p className="text-xs text-muted-foreground">
                  La IA consideró estas keywords fuera del sector o sin valor estratégico.
                  Si crees que alguna debe incluirse, añádela manualmente al cluster
                  correcto.
                </p>
                <div className="space-y-1">
                  {analysis.irrelevant.map((item) => (
                    <p key={item.keyword} className="text-sm">
                      <span className="font-medium">{item.keyword}</span>
                      {item.reason && (
                        <span className="text-muted-foreground"> — {item.reason}</span>
                      )}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {showModeChoice ? (
        <Card className="border-amber-300 bg-amber-50/60">
          <CardContent className="pt-6 space-y-3">
            <p className="text-sm flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Ya tienes {existingClustersCount} clusters en este proyecto. ¿Qué quieres hacer?
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() => doConfirm('add')}
                disabled={isPending}
              >
                Añadir a los existentes
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => {
                  if (
                    confirm(
                      `Esto borrará los ${existingClustersCount} clusters existentes y sus keywords. ¿Seguro?`
                    )
                  ) {
                    doConfirm('replace');
                  }
                }}
                disabled={isPending}
              >
                Reemplazar todos
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowModeChoice(false)}
                disabled={isPending}
              >
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="flex items-center gap-3">
          <Button
            type="button"
            onClick={handleConfirmClick}
            disabled={isPending}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Confirmar y crear clusters
          </Button>
          <Button type="button" variant="outline" onClick={onDiscard} disabled={isPending}>
            Descartar y volver
          </Button>
        </div>
      )}
    </div>
  );
}

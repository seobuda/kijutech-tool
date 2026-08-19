'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Search, X, Bot } from 'lucide-react';
import { confirmAIClusters } from '@/lib/seo/kw-ai-actions';
import type { ParsedCluster } from '@/lib/ai/parsers/cluster-keywords';

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
};

type EditableCluster = {
  uid: string;
  title: string;
  targetUrl: string;
  difficulty: string;
  keywords: EditableKeyword[];
};

function toEditable(clusters: ParsedCluster[]): EditableCluster[] {
  return clusters.map((c) => ({
    uid: crypto.randomUUID(),
    title: c.title,
    targetUrl: c.target_url ?? '',
    difficulty: c.difficulty ?? '',
    keywords: c.keywords.map((k) => ({
      keyword: k.keyword,
      monthlyVolume: k.monthly_volume,
      isPrimary: k.is_primary,
      excluded: false,
    })),
  }));
}

type Props = {
  projectId: string;
  analysis: {
    clusters: ParsedCluster[];
    unassigned: string[];
    estimatedCost: number | null;
    providerUsed: string;
    modelUsed: string;
  };
  existingClustersCount: number;
  onDiscard: () => void;
};

export function ClusterReview({ projectId, analysis, existingClustersCount, onDiscard }: Props) {
  const [clusters, setClusters] = useState<EditableCluster[]>(() => toEditable(analysis.clusters));
  const [unassigned, setUnassigned] = useState<string[]>(analysis.unassigned);
  const [showModeChoice, setShowModeChoice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateCluster(uid: string, patch: Partial<EditableCluster>) {
    setClusters((prev) => prev.map((c) => (c.uid === uid ? { ...c, ...patch } : c)));
  }

  function toggleKeywordExcluded(clusterUid: string, index: number) {
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
  }

  function removeCluster(uid: string) {
    if (!confirm('¿Eliminar este cluster propuesto?')) return;
    setClusters((prev) => prev.filter((c) => c.uid !== uid));
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
                { keyword, monthlyVolume: null, isPrimary: false, excluded: false },
              ],
            }
      )
    );
    setUnassigned((prev) => prev.filter((k) => k !== keyword));
  }

  function buildPayload() {
    return clusters
      .map((c) => ({
        title: c.title.trim(),
        targetUrl: c.targetUrl.trim() || null,
        difficulty: (c.difficulty || null) as 'easy' | 'medium' | 'hard' | null,
        keywords: c.keywords
          .filter((k) => !k.excluded)
          .map((k) => ({
            keyword: k.keyword,
            monthlyVolume: k.monthlyVolume,
            isPrimary: k.isPrimary,
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
    startTransition(async () => {
      const result = await confirmAIClusters(projectId, payload, mode);
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

            return (
              <Card key={cluster.uid} className="bg-blue-50/60 border-blue-200">
                <CardContent className="p-4 space-y-3">
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
                    {cluster.keywords.map((k, i) => (
                      <label
                        key={`${k.keyword}-${i}`}
                        className={`flex items-center justify-between gap-2 text-sm ${
                          k.excluded ? 'opacity-40' : ''
                        }`}
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <input
                            type="checkbox"
                            checked={!k.excluded}
                            onChange={() => toggleKeywordExcluded(cluster.uid, i)}
                            title="Desmarca para excluir esta keyword"
                          />
                          {k.isPrimary && <span className="text-orange-500">★</span>}
                          {k.keyword}
                        </span>
                        <span className="text-muted-foreground text-xs shrink-0">
                          {k.monthlyVolume ?? '—'}/mes
                        </span>
                      </label>
                    ))}
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
              {unassigned.map((keyword) => (
                <div key={keyword} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{keyword}</span>
                  <select
                    defaultValue=""
                    onChange={(e) => assignUnassignedKeyword(keyword, e.target.value)}
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

      {error && <p className="text-sm text-red-600">{error}</p>}

      {showModeChoice ? (
        <Card className="border-amber-300 bg-amber-50/60">
          <CardContent className="pt-6 space-y-3">
            <p className="text-sm">
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

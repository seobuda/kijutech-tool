'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Plus, X, Star, Pencil, Search, TrendingUp, ArrowRight, Globe } from 'lucide-react';
import {
  updateKwClusterStatus,
  deleteKwCluster,
  updateKwCluster,
  addClusterKeyword,
  deleteClusterKeyword,
  updateClientNote,
  updateClusterStrategy,
  moveKeywordBetweenClusters
} from '@/lib/seo/kw-actions';
import { recordClusterFeedback } from '@/lib/seo/kw-feedback-actions';
import { estimateTrafficAtPositionOne } from '@/lib/seo/kw-instructions';
import { keywordDifficultyLabel, urlTypeLabel } from '@/lib/seo/format';
import { ClusterForm, type ClusterFormValues } from './cluster-form';
import { StrategyBadges, type StrategyField } from '../strategy-badges';
import type { SeoKwClusterWithKeywords } from '@/lib/seo/kw-queries';

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'active', label: 'Activo' },
  { value: 'completed', label: 'Completado' },
  { value: 'archived', label: 'Archivado' }
];

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  active: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  archived: 'bg-orange-100 text-orange-800'
};

const DIFFICULTY_LABEL: Record<string, { label: string; color: string }> = {
  easy: { label: 'Fácil', color: 'bg-green-500' },
  medium: { label: 'Media', color: 'bg-yellow-500' },
  hard: { label: 'Difícil', color: 'bg-red-500' }
};

type Props = {
  cluster: SeoKwClusterWithKeywords;
  otherClusters: SeoKwClusterWithKeywords[];
  onUpdated: (cluster: SeoKwClusterWithKeywords) => void;
  onDeleted: (id: string) => void;
  onKeywordMoved: () => void;
};

export function ClusterCard({ cluster, otherClusters, onUpdated, onDeleted, onKeywordMoved }: Props) {
  const [isEditing, setIsEditing] = useState(false);
  const [isAddingKeyword, setIsAddingKeyword] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const [newVolume, setNewVolume] = useState('');
  const [newIsPrimary, setNewIsPrimary] = useState(false);
  const [clientNote, setClientNote] = useState(cluster.clientNote ?? '');
  const [noteSaved, setNoteSaved] = useState(true);
  const [strategyError, setStrategyError] = useState<string | null>(null);
  const [movingKeywordId, setMovingKeywordId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const totalVolume = cluster.keywords.reduce(
    (sum, k) => sum + (k.monthlyVolume ?? 0),
    0
  );
  const estimatedTraffic = estimateTrafficAtPositionOne(totalVolume);

  function handleStatusChange(status: string) {
    startTransition(async () => {
      await updateKwClusterStatus(cluster.id, status);
      onUpdated({ ...cluster, status });
    });
  }

  function handleDelete() {
    const confirmed = window.confirm(
      '¿Eliminar este cluster y todas sus keywords?'
    );
    if (!confirmed) return;
    startTransition(async () => {
      await deleteKwCluster(cluster.id);
      onDeleted(cluster.id);
    });
  }

  function handleEditSubmit(values: ClusterFormValues) {
    startTransition(async () => {
      const updated = await updateKwCluster(cluster.id, {
        title: values.title.trim(),
        targetUrl: values.targetUrl.trim() || null,
        difficulty: values.difficulty || null,
        priority: values.priority ? parseInt(values.priority, 10) : 0,
        notes: values.notes.trim() || null,
        clientNote: values.clientNote.trim() || null
      });
      onUpdated({ ...cluster, ...updated });
      setClientNote(updated.clientNote ?? '');
      setIsEditing(false);
    });
  }

  function handleAddKeyword() {
    if (!newKeyword.trim()) return;
    startTransition(async () => {
      const keyword = await addClusterKeyword(cluster.id, {
        keyword: newKeyword.trim(),
        monthlyVolume: newVolume ? parseInt(newVolume, 10) : null,
        isPrimary: newIsPrimary
      });
      const keywords = newIsPrimary
        ? cluster.keywords.map((k) => ({ ...k, isPrimary: false })).concat(keyword)
        : cluster.keywords.concat(keyword);
      onUpdated({ ...cluster, keywords });
      setNewKeyword('');
      setNewVolume('');
      setNewIsPrimary(false);
      setIsAddingKeyword(false);
    });
  }

  function handleDeleteKeyword(id: string, isPrimary: boolean) {
    if (isPrimary) {
      const confirmed = window.confirm(
        'Esta es la keyword principal del cluster. ¿Eliminarla igualmente?'
      );
      if (!confirmed) return;
    }
    startTransition(async () => {
      await deleteClusterKeyword(id);
      onUpdated({
        ...cluster,
        keywords: cluster.keywords.filter((k) => k.id !== id)
      });
    });
  }

  function handleStrategyChange(field: StrategyField, value: string) {
    setStrategyError(null);
    const key =
      field === 'destination' ? 'destination' : field === 'content_type' ? 'contentType' : 'searchIntent';
    const previousValue = cluster[key];

    startTransition(async () => {
      const result = await updateClusterStrategy(cluster.id, field, value);
      if ('error' in result) {
        setStrategyError(result.error);
        return;
      }
      onUpdated({ ...cluster, [key]: value });

      if (field === 'search_intent') {
        void recordClusterFeedback({
          projectId: cluster.projectId,
          feedbackType: 'intent_changed',
          originalValue: { search_intent: previousValue },
          correctedValue: { search_intent: value },
          clusterId: cluster.id,
        });
      } else if (field === 'content_type') {
        void recordClusterFeedback({
          projectId: cluster.projectId,
          feedbackType: 'content_type_changed',
          originalValue: { content_type: previousValue },
          correctedValue: { content_type: value },
          clusterId: cluster.id,
        });
      }
    });
  }

  function handleMoveKeyword(keywordId: string, keyword: string, targetClusterId: string) {
    if (!targetClusterId) return;
    const targetCluster = otherClusters.find((c) => c.id === targetClusterId);
    setMovingKeywordId(null);
    startTransition(async () => {
      const result = await moveKeywordBetweenClusters(keywordId, targetClusterId);
      if ('error' in result) {
        setStrategyError(result.error);
        return;
      }
      void recordClusterFeedback({
        projectId: cluster.projectId,
        feedbackType: 'keyword_moved',
        originalValue: { cluster_origen: cluster.title, keyword },
        correctedValue: { cluster_destino: targetCluster?.title ?? null },
        clusterId: cluster.id,
        keyword,
      });
      onKeywordMoved();
    });
  }

  function handleSaveClientNote() {
    startTransition(async () => {
      await updateClientNote(cluster.id, clientNote);
      onUpdated({ ...cluster, clientNote });
      setNoteSaved(true);
    });
  }

  if (isEditing) {
    return (
      <Card>
        <CardContent className="pt-6">
          <ClusterForm
            initialValues={{
              title: cluster.title,
              targetUrl: cluster.targetUrl ?? '',
              difficulty: cluster.difficulty ?? '',
              priority: String(cluster.priority),
              notes: cluster.notes ?? '',
              clientNote: cluster.clientNote ?? ''
            }}
            onSubmit={handleEditSubmit}
            onCancel={() => setIsEditing(false)}
            isPending={isPending}
            submitLabel="Guardar cambios"
          />
        </CardContent>
      </Card>
    );
  }

  const difficulty = cluster.difficulty ? DIFFICULTY_LABEL[cluster.difficulty] : null;
  const urlType = urlTypeLabel(cluster.urlType);

  return (
    <Card className="py-0 gap-0 h-full min-h-[320px] w-full max-w-[320px] flex flex-col">
      <CardContent className="p-4 flex-1 flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              STATUS_BADGE[cluster.status] ?? STATUS_BADGE.pending
            }`}
          >
            {STATUS_OPTIONS.find((s) => s.value === cluster.status)?.label ??
              cluster.status}
          </span>
          <div className="flex items-center gap-1.5">
            {cluster.isAiSuggested && (
              <span
                className="text-xs font-medium bg-yellow-200/80 text-yellow-900 px-2 py-0.5 rounded-full"
                title="Cluster sugerido por IA"
              >
                ✨ IA
              </span>
            )}
            <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                aria-label="Menú del cluster"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Cambiar estado</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {STATUS_OPTIONS.map((s) => (
                    <DropdownMenuItem
                      key={s.value}
                      onClick={() => handleStatusChange(s.value)}
                    >
                      {s.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem onClick={() => setIsEditing(true)}>
                <Pencil className="h-4 w-4" />
                Editar cluster
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  href={`/dashboard/projects/${cluster.projectId}/seo/keyword-research/clusters/${cluster.id}/competitors`}
                >
                  <Globe className="h-4 w-4" />
                  Competidores SERP
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={handleDelete}>
                <X className="h-4 w-4" />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div>
          <p className="text-lg font-semibold leading-snug">{cluster.title}</p>
          {cluster.targetUrl && (
            <p className="text-sm text-muted-foreground truncate">{cluster.targetUrl}</p>
          )}
          {urlType && (
            <span
              className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium ${urlType.className}`}
            >
              {urlType.label}
            </span>
          )}
        </div>

        <div>
          <StrategyBadges
            values={{
              destination: cluster.destination,
              contentType: cluster.contentType,
              searchIntent: cluster.searchIntent
            }}
            strategyNote={cluster.strategyNote}
            onChange={handleStrategyChange}
          />
          {strategyError && <p className="text-xs text-red-600 mt-1">{strategyError}</p>}
        </div>

        {difficulty && (
          <p className="text-sm flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${difficulty.color}`} />
            Dificultad: {difficulty.label}
          </p>
        )}

        <div className="border-t pt-3 space-y-2">
          {cluster.keywords.map((k) => {
            const difficulty =
              k.difficulty != null ? keywordDifficultyLabel(k.difficulty) : null;

            return (
            <div key={k.id} className="text-sm">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 truncate">
                  {k.isPrimary && (
                    <Star className="h-3 w-3 text-orange-500 shrink-0" fill="currentColor" />
                  )}
                  {k.keyword}
                  {difficulty && (
                    <span
                      className={`ml-1 text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${difficulty.className}`}
                    >
                      {difficulty.label}
                    </span>
                  )}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  {k.pendingVerification ? (
                    <span
                      className="text-muted-foreground flex items-center gap-1"
                      title="Verificar volumen en SE Ranking"
                    >
                      —/mes ⚠️
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      {k.monthlyVolume ?? '—'}/mes
                    </span>
                  )}
                  {otherClusters.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setMovingKeywordId((v) => (v === k.id ? null : k.id))}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`Mover ${k.keyword} a otro cluster`}
                      title="Mover a otro cluster"
                    >
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDeleteKeyword(k.id, k.isPrimary)}
                    className="text-muted-foreground hover:text-red-600"
                    aria-label={`Eliminar ${k.keyword}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              </div>
              {movingKeywordId === k.id && (
                <select
                  autoFocus
                  defaultValue=""
                  onChange={(e) => handleMoveKeyword(k.id, k.keyword, e.target.value)}
                  className="mt-1 flex h-7 w-full rounded-md border border-input bg-transparent px-2 text-xs shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                >
                  <option value="" disabled>
                    Mover a...
                  </option>
                  {otherClusters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              )}
            </div>
            );
          })}

          {isAddingKeyword ? (
            <div className="space-y-2 pt-2">
              <Input
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                placeholder="Keyword"
                className="h-8"
              />
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={newVolume}
                  onChange={(e) => setNewVolume(e.target.value)}
                  placeholder="Vol/mes"
                  className="h-8 w-24"
                />
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={newIsPrimary}
                    onChange={(e) => setNewIsPrimary(e.target.checked)}
                  />
                  Principal
                </label>
                <Button size="sm" onClick={handleAddKeyword} disabled={isPending || !newKeyword.trim()}>
                  Añadir
                </Button>
                <Button size="sm" variant="outline" onClick={() => setIsAddingKeyword(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsAddingKeyword(true)}
              className="text-sm text-orange-600 hover:text-orange-700 flex items-center gap-1 pt-1"
            >
              <Plus className="h-3 w-3" /> Añadir keyword
            </button>
          )}
        </div>

        <div className="border-t pt-3 flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-lg font-semibold leading-none">{totalVolume}</span>
            <span className="text-xs text-muted-foreground">búsq./mes</span>
          </div>
          <div className="flex items-center gap-1.5">
            <TrendingUp className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-lg font-semibold leading-none">~{estimatedTraffic}</span>
            <span className="text-xs text-muted-foreground">visitas (pos. 1)</span>
          </div>
        </div>

        <div className="border-t pt-3 mt-auto">
          <Label className="mb-1 text-xs text-muted-foreground">
            Nota para el cliente
          </Label>
          <textarea
            value={clientNote}
            onChange={(e) => {
              setClientNote(e.target.value);
              setNoteSaved(false);
            }}
            rows={2}
            className="flex w-full min-w-0 rounded-md border border-input bg-transparent px-2 py-1.5 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={handleSaveClientNote}
            disabled={isPending || noteSaved}
          >
            Editar nota
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

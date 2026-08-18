'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, CheckCircle2, Plus, ExternalLink, Link as LinkIcon, X } from 'lucide-react';
import {
  createKwCluster,
  generateShareToken,
  completeStep4,
  resetStep4
} from '@/lib/seo/kw-actions';
import { ClusterCard } from './cluster-card';
import { ClusterForm, type ClusterFormValues } from './cluster-form';
import type { SeoKwClusterWithKeywords } from '@/lib/seo/kw-queries';

const FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activos' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'completed', label: 'Completados' },
  { value: 'archived', label: 'Archivados' }
];

type Props = {
  projectId: string;
  initialClusters: SeoKwClusterWithKeywords[];
  initialShareToken: string | null;
  stageStatus: string;
};

export function ClustersBoard({
  projectId,
  initialClusters,
  initialShareToken,
  stageStatus
}: Props) {
  const router = useRouter();
  const [clusters, setClusters] = useState(initialClusters);
  const [filter, setFilter] = useState('all');
  const [isCreating, setIsCreating] = useState(false);
  const [shareToken, setShareToken] = useState(initialShareToken);
  const [copied, setCopied] = useState(false);
  const [localStatus, setLocalStatus] = useState(stageStatus);
  const [isResetting, setIsResetting] = useState(false);
  const [isPending, startTransition] = useTransition();

  const filteredClusters =
    filter === 'all' ? clusters : clusters.filter((c) => c.status === filter);

  function handleCreate(values: ClusterFormValues) {
    startTransition(async () => {
      const cluster = await createKwCluster(projectId, {
        title: values.title.trim(),
        targetUrl: values.targetUrl.trim() || null,
        difficulty: values.difficulty || null,
        priority: values.priority ? parseInt(values.priority, 10) : 0,
        notes: values.notes.trim() || null,
        clientNote: values.clientNote.trim() || null
      });
      setClusters((prev) =>
        [...prev, cluster].sort((a, b) => a.priority - b.priority)
      );
      setIsCreating(false);
      router.refresh();
    });
  }

  function handleUpdated(updated: SeoKwClusterWithKeywords) {
    setClusters((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  }

  function handleDeleted(id: string) {
    setClusters((prev) => prev.filter((c) => c.id !== id));
  }

  async function ensureShareToken() {
    if (shareToken) return shareToken;
    const token = await generateShareToken(projectId);
    setShareToken(token);
    return token;
  }

  function handleViewAsClient() {
    startTransition(async () => {
      const token = await ensureShareToken();
      window.open(`/share/${token}/keyword-research`, '_blank');
    });
  }

  function handleCopyLink() {
    startTransition(async () => {
      const token = await ensureShareToken();
      await navigator.clipboard.writeText(
        `${window.location.origin}/share/${token}/keyword-research`
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleComplete() {
    startTransition(async () => {
      await completeStep4(projectId);
      setLocalStatus('completed');
      router.refresh();
    });
  }

  function handleReset() {
    const confirmed = window.confirm(
      '¿Seguro que quieres reiniciar este paso? Se borrarán TODOS los clusters y sus keywords. Esta acción no se puede deshacer.'
    );
    if (!confirmed) return;
    setIsResetting(true);
    startTransition(async () => {
      await resetStep4(projectId);
      setClusters([]);
      setLocalStatus('pending');
      router.refresh();
      setIsResetting(false);
    });
  }

  const canReset = localStatus === 'completed' || localStatus === 'in_progress';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              type="button"
              size="sm"
              variant={filter === f.value ? 'secondary' : 'outline'}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopyLink}
            disabled={isPending}
          >
            <LinkIcon className="mr-2 h-4 w-4" />
            {copied ? 'Copiado' : 'Copiar enlace del cliente'}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleViewAsClient}
            disabled={isPending}
          >
            <ExternalLink className="mr-2 h-4 w-4" />
            Ver como cliente
          </Button>
          <Button
            type="button"
            size="sm"
            className="bg-orange-500 hover:bg-orange-600 text-white"
            onClick={() => setIsCreating((v) => !v)}
          >
            <Plus className="mr-2 h-4 w-4" />
            Nuevo cluster
          </Button>
        </div>
      </div>

      {isCreating && (
        <Card>
          <CardContent className="pt-6">
            <ClusterForm
              onSubmit={handleCreate}
              onCancel={() => setIsCreating(false)}
              isPending={isPending}
              submitLabel="Crear cluster"
            />
          </CardContent>
        </Card>
      )}

      {filteredClusters.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">
              {clusters.length === 0
                ? 'Todavía no hay clusters. Crea el primero con "Nuevo cluster".'
                : 'No hay clusters con este filtro.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
          {filteredClusters.map((cluster) => (
            <ClusterCard
              key={cluster.id}
              cluster={cluster}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          ))}
        </div>
      )}

      <div className="flex items-center space-x-3">
        <Button
          onClick={handleComplete}
          disabled={isPending}
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
    </div>
  );
}

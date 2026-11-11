import { estimateTrafficAtPositionOne } from '@/lib/seo/kw-instructions';
import { keywordDifficultyLabel, urlTypeLabel } from '@/lib/seo/format';
import type { SeoKwClusterWithKeywords } from '@/lib/seo/kw-queries';

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-info-soft text-info',
  completed: 'bg-success-soft text-success'
};

const STATUS_LABEL: Record<string, string> = {
  active: 'En curso',
  completed: 'Completado'
};

const DIFFICULTY_LABEL: Record<string, { label: string; color: string }> = {
  easy: { label: 'Fácil', color: 'bg-success' },
  medium: { label: 'Media', color: 'bg-warning' },
  hard: { label: 'Difícil', color: 'bg-destructive' }
};

export function PublicClusterCard({
  cluster
}: {
  cluster: SeoKwClusterWithKeywords;
}) {
  const totalVolume = cluster.keywords.reduce(
    (sum, k) => sum + (k.monthlyVolume ?? 0),
    0
  );
  const estimatedTraffic = estimateTrafficAtPositionOne(totalVolume);
  const difficulty = cluster.difficulty ? DIFFICULTY_LABEL[cluster.difficulty] : null;
  const primary = cluster.keywords.find((k) => k.isPrimary);
  const urlType = urlTypeLabel(cluster.urlType);

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm p-6 space-y-3">
      <span
        className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
          STATUS_BADGE[cluster.status] ?? 'bg-muted text-muted-foreground'
        }`}
      >
        {STATUS_LABEL[cluster.status] ?? cluster.status}
      </span>
      <div>
        <p className="font-medium text-lg">{cluster.title}</p>
        {cluster.targetUrl && (
          <p className="text-sm text-muted-foreground">{cluster.targetUrl}</p>
        )}
        {urlType && (
          <span
            className={`inline-block mt-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${urlType.className}`}
          >
            {urlType.label}
          </span>
        )}
      </div>
      {difficulty && (
        <p className="text-sm flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${difficulty.color}`} />
          Dificultad: {difficulty.label}
        </p>
      )}
      {primary && (
        <p className="text-sm font-medium flex items-center gap-2">
          <span>★ {primary.keyword}</span>
          {primary.difficulty != null && (
            <span
              className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${keywordDifficultyLabel(primary.difficulty).className}`}
            >
              {keywordDifficultyLabel(primary.difficulty).label}
            </span>
          )}
        </p>
      )}
      <div className="text-sm text-muted-foreground space-y-1 border-t pt-3">
        <p>📊 {totalVolume} búsquedas/mes totales</p>
        <p>🎯 ~{estimatedTraffic} visitas est. (posición 1)</p>
      </div>
      {cluster.clientNote && (
        <p className="text-sm italic text-muted-foreground border-t pt-3">
          💬 &ldquo;{cluster.clientNote}&rdquo;
        </p>
      )}
    </div>
  );
}

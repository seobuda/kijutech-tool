import { estimateTrafficAtPositionOne } from '@/lib/seo/kw-instructions';
import { keywordDifficultyLabel } from '@/lib/seo/format';
import type { SeoKwClusterWithKeywords } from '@/lib/seo/kw-queries';

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700'
};

const STATUS_LABEL: Record<string, string> = {
  active: 'En curso',
  completed: 'Completado'
};

const DIFFICULTY_LABEL: Record<string, { label: string; color: string }> = {
  easy: { label: 'Fácil', color: 'bg-green-500' },
  medium: { label: 'Media', color: 'bg-yellow-500' },
  hard: { label: 'Difícil', color: 'bg-red-500' }
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

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-3">
      <span
        className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium ${
          STATUS_BADGE[cluster.status] ?? 'bg-gray-100 text-gray-600'
        }`}
      >
        {STATUS_LABEL[cluster.status] ?? cluster.status}
      </span>
      <div>
        <p className="font-medium text-lg">{cluster.title}</p>
        {cluster.targetUrl && (
          <p className="text-sm text-muted-foreground">{cluster.targetUrl}</p>
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
        <p className="text-sm italic text-gray-600 border-t pt-3">
          💬 &ldquo;{cluster.clientNote}&rdquo;
        </p>
      )}
    </div>
  );
}

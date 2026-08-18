import type { SeoKwClusterWithKeywords } from '@/lib/seo/kw-queries';

const STATUS_DOT: Record<string, string> = {
  active: 'bg-blue-500',
  completed: 'bg-green-500'
};

export function PublicTimeline({
  clusters
}: {
  clusters: SeoKwClusterWithKeywords[];
}) {
  if (clusters.length === 0) {
    return null;
  }

  const phases: SeoKwClusterWithKeywords[][] = [];
  for (let i = 0; i < clusters.length; i += 3) {
    phases.push(clusters.slice(i, i + 3));
  }

  return (
    <section>
      <h2 className="text-xl font-medium mb-6">Plan de trabajo</h2>
      <div className="flex flex-col lg:flex-row gap-8 lg:gap-6">
        {phases.map((phase, phaseIndex) => (
          <div key={phaseIndex} className="flex-1">
            <p className="text-sm font-semibold text-orange-600 mb-3">
              Fase {phaseIndex + 1}
            </p>
            <div className="lg:border-t-2 lg:border-orange-200 lg:pt-4 space-y-3 border-l-2 lg:border-l-0 border-orange-200 pl-4 lg:pl-0">
              {phase.map((cluster) => (
                <div key={cluster.id} className="flex items-center gap-2">
                  <span
                    className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                      STATUS_DOT[cluster.status] ?? 'bg-gray-400'
                    }`}
                  />
                  <span className="text-sm">{cluster.title}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

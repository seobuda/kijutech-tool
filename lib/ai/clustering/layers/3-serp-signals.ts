import type { ClusterGroup } from '../types';

function hasFeature(serpFeatures: string | null, feature: string): boolean {
  if (!serpFeatures) return false;
  return serpFeatures
    .split(',')
    .map((f) => f.trim().toLowerCase())
    .includes(feature.toLowerCase());
}

function shareWithFeature(group: ClusterGroup, feature: string): number {
  if (group.keywords.length === 0) return 0;
  const count = group.keywords.filter((k) => hasFeature(k.serp_features, feature)).length;
  return count / group.keywords.length;
}

function averagePosition(group: ClusterGroup): number | null {
  const positions = group.keywords
    .map((k) => k.position)
    .filter((p): p is number => p != null);
  if (positions.length === 0) return null;
  return positions.reduce((sum, p) => sum + p, 0) / positions.length;
}

function totalVolume(group: ClusterGroup): number {
  return group.keywords.reduce((sum, k) => sum + (k.volume ?? 0), 0);
}

// Análisis matemático puro de las señales SERP del CSV — sin IA. Cada
// grupo recibe una o más señales que la Capa 4 usa para clasificar.
export function analyzeSerpSignals(groups: ClusterGroup[]): ClusterGroup[] {
  return groups.map((group) => {
    const signals: string[] = [];

    if (shareWithFeature(group, 'Resultados locales') > 0.5) {
      signals.push('local_intent');
    }
    if (shareWithFeature(group, 'GBP') > 0.5) {
      signals.push('local_physical');
    }
    if (shareWithFeature(group, 'Vídeo') > 0.5) {
      signals.push('informational_intent');
    }

    const avgPosition = averagePosition(group);
    if (avgPosition != null && avgPosition < 5) {
      signals.push('high_competition');
    }

    if (totalVolume(group) < 20) {
      signals.push('low_volume');
    }

    if (signals.length === 0) {
      signals.push('transactional_intent');
    }

    return { ...group, serp_signals: signals };
  });
}

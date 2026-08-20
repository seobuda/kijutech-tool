import type { ClusterGroup, KeywordInput } from '../types';

export const ORPHAN_SIMILARITY_THRESHOLD = 0.35;

function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return 1 - dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Rescata keywords marcadas como noise por HDBSCAN (Capa 2) que en realidad
// caen cerca del centroide de un grupo ya formado — sin esto, nombres
// propios y marcas locales (embeddings dispersos, sin suficiente masa
// crítica de vecinos) se pierden en unassigned aunque pertenezcan
// claramente a un cluster existente. Usa el `centroid_embedding` que la
// Capa 2 ya calculó por grupo, en vez de recalcularlo aquí.
export function assignOrphans(
  groups: ClusterGroup[],
  noiseKeywords: KeywordInput[],
  embeddingMap: Map<string, number[]>
): { groups: ClusterGroup[]; unassigned: KeywordInput[] } {
  if (noiseKeywords.length === 0) {
    return { groups, unassigned: [] };
  }

  const updatedGroups = groups.map((group) => ({ ...group, keywords: [...group.keywords] }));
  const unassigned: KeywordInput[] = [];

  for (const kw of noiseKeywords) {
    const embedding = embeddingMap.get(kw.keyword);
    if (!embedding) {
      unassigned.push(kw);
      continue;
    }

    let bestIdx = -1;
    let bestDistance = Infinity;
    updatedGroups.forEach((group, idx) => {
      if (!group.centroid_embedding) return;
      const distance = cosineDistance(embedding, group.centroid_embedding);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIdx = idx;
      }
    });

    if (bestIdx !== -1 && bestDistance <= ORPHAN_SIMILARITY_THRESHOLD) {
      updatedGroups[bestIdx].keywords.push(kw);
    } else {
      unassigned.push(kw);
    }
  }

  return { groups: updatedGroups, unassigned };
}

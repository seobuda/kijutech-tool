import { HDBSCAN } from 'hdbscan-ts';
import type { KeywordInput, ClusterGroup, PipelineConfig } from '../types';

function centroid(vectors: number[][]): number[] {
  const dims = vectors[0]?.length ?? 0;
  const sums = new Array(dims).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dims; i++) {
      sums[i] += v[i];
    }
  }
  return sums.map((s) => s / vectors.length);
}

// El pedido especifica `Promise<ClusterGroup[]>` como tipo de retorno,
// pero las keywords marcadas como noise (label -1) necesitan llegar de
// algún modo al array "unassigned" del pipeline — ClusterGroup no tiene
// ningún campo para distinguir "es ruido". Se devuelve también `noise`
// junto a `groups`, la desviación mínima necesaria para que el pipeline
// pueda enrutarlas correctamente.
export async function groupByHdbscan(
  embeddedKeywords: Array<{ keyword: KeywordInput; embedding: number[] }>,
  config: PipelineConfig
): Promise<{ groups: ClusterGroup[]; noise: KeywordInput[] }> {
  if (embeddedKeywords.length === 0) {
    return { groups: [], noise: [] };
  }

  const hdbscan = new HDBSCAN({
    minClusterSize: config.min_cluster_size,
    minSamples: config.min_samples,
  });
  const labels = hdbscan.fit(embeddedKeywords.map((k) => k.embedding));

  const byLabel = new Map<number, Array<{ keyword: KeywordInput; embedding: number[] }>>();
  const noise: KeywordInput[] = [];

  labels.forEach((label, i) => {
    if (label === -1) {
      noise.push(embeddedKeywords[i].keyword);
      return;
    }
    if (!byLabel.has(label)) {
      byLabel.set(label, []);
    }
    byLabel.get(label)!.push(embeddedKeywords[i]);
  });

  const groups: ClusterGroup[] = Array.from(byLabel.values()).map((members) => ({
    keywords: members.map((m) => m.keyword),
    centroid_embedding: centroid(members.map((m) => m.embedding)),
  }));

  return { groups, noise };
}

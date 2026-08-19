export type ParsedClusterKeyword = {
  keyword: string;
  monthly_volume: number | null;
  is_primary: boolean;
};

export type ParsedCluster = {
  title: string;
  target_url: string | null;
  difficulty: 'easy' | 'medium' | 'hard' | null;
  primary_keyword: string | null;
  keywords: ParsedClusterKeyword[];
};

export type ParsedClusteringResult = {
  clusters: ParsedCluster[];
  unassigned: string[];
};

function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch ? fenceMatch[1] : trimmed;
}

export function parseClusteringResponse(raw: string): ParsedClusteringResult {
  let data: unknown;
  try {
    data = JSON.parse(stripMarkdownFences(raw));
  } catch {
    throw new Error('La respuesta de la IA no es JSON válido');
  }

  if (
    typeof data !== 'object' ||
    data === null ||
    !Array.isArray((data as Record<string, unknown>).clusters)
  ) {
    throw new Error(
      'La respuesta de la IA no tiene la estructura esperada (falta "clusters")'
    );
  }

  const rawClusters = (data as { clusters: unknown[] }).clusters;
  const rawUnassigned = (data as Record<string, unknown>).unassigned;

  const clusters: ParsedCluster[] = [];

  for (const rawCluster of rawClusters) {
    if (typeof rawCluster !== 'object' || rawCluster === null) {
      continue;
    }

    const c = rawCluster as Record<string, unknown>;
    const title = typeof c.title === 'string' ? c.title.trim() : '';
    const rawKeywords = Array.isArray(c.keywords) ? c.keywords : [];

    if (!title || rawKeywords.length === 0) {
      continue;
    }

    const keywords: ParsedClusterKeyword[] = rawKeywords
      .filter(
        (k): k is Record<string, unknown> =>
          typeof k === 'object' && k !== null && typeof k.keyword === 'string'
      )
      .map((k) => ({
        keyword: k.keyword as string,
        monthly_volume:
          typeof k.monthly_volume === 'number' ? k.monthly_volume : null,
        is_primary: k.is_primary === true,
      }));

    if (keywords.length === 0) {
      continue;
    }

    clusters.push({
      title,
      target_url: typeof c.target_url === 'string' ? c.target_url : null,
      difficulty:
        c.difficulty === 'easy' || c.difficulty === 'medium' || c.difficulty === 'hard'
          ? c.difficulty
          : null,
      primary_keyword:
        typeof c.primary_keyword === 'string' ? c.primary_keyword : null,
      keywords,
    });
  }

  const unassigned: string[] = Array.isArray(rawUnassigned)
    ? rawUnassigned.filter((k): k is string => typeof k === 'string')
    : [];

  return { clusters, unassigned };
}

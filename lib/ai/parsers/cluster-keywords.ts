export type ParsedClusterKeyword = {
  keyword: string;
  monthly_volume: number | null;
  is_primary: boolean;
  pending_verification: boolean;
};

export type ParsedCluster = {
  title: string;
  target_url: string | null;
  difficulty: 'easy' | 'medium' | 'hard' | null;
  primary_keyword: string | null;
  url_type: string | null;
  is_ai_suggested: boolean;
  reasoning: string | null;
  low_volume: boolean;
  keywords: ParsedClusterKeyword[];
};

export type ParsedReasonedItem = {
  keyword: string;
  reason: string;
};

export type ParsedClusteringResult = {
  clusters: ParsedCluster[];
  unassigned: ParsedReasonedItem[];
  irrelevant: ParsedReasonedItem[];
};

function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch ? fenceMatch[1] : trimmed;
}

function parseClusterList(
  rawList: unknown[],
  isAiSuggested: boolean
): ParsedCluster[] {
  const clusters: ParsedCluster[] = [];

  for (const rawCluster of rawList) {
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
        // Los clusters sugeridos por IA no traen volumen real del CSV —
        // se fuerza null/true independientemente de lo que devuelva el
        // modelo, no es algo que el modelo deba decidir.
        monthly_volume: isAiSuggested
          ? null
          : typeof k.monthly_volume === 'number'
            ? k.monthly_volume
            : null,
        is_primary: k.is_primary === true,
        pending_verification: isAiSuggested,
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
      url_type: typeof c.url_type === 'string' ? c.url_type : null,
      is_ai_suggested: isAiSuggested,
      reasoning: typeof c.reasoning === 'string' ? c.reasoning : null,
      low_volume: c.low_volume === true,
      keywords,
    });
  }

  return clusters;
}

function parseReasonedList(raw: unknown, allowStringFallback: boolean): ParsedReasonedItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  const items: ParsedReasonedItem[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string' && allowStringFallback) {
      items.push({ keyword: entry, reason: '' });
      continue;
    }
    if (typeof entry === 'object' && entry !== null) {
      const e = entry as Record<string, unknown>;
      if (typeof e.keyword === 'string') {
        items.push({
          keyword: e.keyword,
          reason: typeof e.reason === 'string' ? e.reason : '',
        });
      }
    }
  }
  return items;
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

  const d = data as Record<string, unknown>;

  const realClusters = parseClusterList(d.clusters as unknown[], false);
  const suggestedClusters = Array.isArray(d.suggested_clusters)
    ? parseClusterList(d.suggested_clusters, true)
    : [];

  const unassigned = parseReasonedList(d.unassigned, true);
  const irrelevant = parseReasonedList(d.irrelevant, false);

  return {
    clusters: [...realClusters, ...suggestedClusters],
    unassigned,
    irrelevant,
  };
}

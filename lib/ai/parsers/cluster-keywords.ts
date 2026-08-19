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
  destination: string | null;
  content_type: string | null;
  search_intent: string | null;
  strategy_note: string | null;
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

// Los modelos a veces envuelven el JSON en markdown o añaden texto antes
// o después pese a que el prompt lo prohíbe explícitamente. Se intentan
// varias estrategias de extracción en orden, de la más estricta a la más
// permisiva, y se usa la primera que produzca JSON parseable.
function extractJson(raw: string): unknown {
  const trimmed = raw.trim();

  // 1. La respuesta ya es JSON válido tal cual.
  try {
    return JSON.parse(trimmed);
  } catch {
    // sigue con la siguiente estrategia
  }

  // 2. Extrae desde la primera "{" hasta la última "}" del string,
  // por si el modelo añadió texto antes/después del objeto JSON.
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      // sigue con la siguiente estrategia
    }
  }

  // 3. Extrae el contenido de un bloque ```json ... ``` o ``` ... ```.
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]);
    } catch {
      // sigue con la siguiente estrategia
    }
  }

  // 4. Ninguna estrategia funcionó.
  throw new Error('La respuesta de la IA no es JSON válido');
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
      destination: typeof c.destination === 'string' ? c.destination : null,
      content_type: typeof c.content_type === 'string' ? c.content_type : null,
      search_intent: typeof c.search_intent === 'string' ? c.search_intent : null,
      strategy_note: typeof c.strategy_note === 'string' ? c.strategy_note : null,
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
  const data = extractJson(raw);

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

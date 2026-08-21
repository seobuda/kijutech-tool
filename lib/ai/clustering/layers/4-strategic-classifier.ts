import { getAdapter, getPrompt, withTimeout, CALL_TIMEOUT_MS } from '@/lib/ai/gateway';
import type { AIMessage } from '@/lib/ai/types';
import type { ClusterGroup, ClusterProposal, ClusteringExample } from '../types';

// Un objeto JSON completo por grupo (title, reasoning, strategy_note...)
// pesa bastante en español; con muchos grupos (ej. Noise Recovery —
// lib/ai/clustering/layers/2b-orphan-assignment.ts — rescata como grupo
// propio keywords que antes se descartaban como noise) un límite fijo se
// queda corto y la respuesta se corta a mitad de generación, dando JSON
// incompleto que ninguna estrategia de extracción puede recuperar (visto
// en producción con 16, 30+ y 38 grupos). Se escala con el número de
// grupos en vez de fijar un valor único: 300 tokens/grupo, mínimo 2000
// (proyectos pequeños), máximo 12000.
function computeMaxTokens(groupCount: number): number {
  return Math.min(Math.max(groupCount * 300, 2000), 12000);
}

const FALLBACK_SYSTEM_PROMPT =
  'Eres un experto en estrategia SEO. Recibes grupos de keywords ya agrupados por ' +
  'similitud semántica. Tu trabajo es clasificarlos estratégicamente y nombrarlos. ' +
  'Responde ÚNICAMENTE con JSON válido.';

const FALLBACK_USER_TEMPLATE = `Clasifica estratégicamente estos {count} grupos de keywords.

Para cada grupo ya tienes las keywords agrupadas por similitud semántica.
Tu trabajo es: nombrarlos, asignar URL, clasificar intención y tipo de contenido.

SEÑALES SERP disponibles por grupo (úsalas para clasificar):
- local_intent: búsquedas con resultados locales de Google
- local_physical: búsquedas con Google Business Profile
- informational_intent: búsquedas con resultados de vídeo
- high_competition: competidor en posición 1-4
- low_volume: grupo con menos de 20 búsquedas/mes totales
- transactional_intent: sin señales especiales detectadas

{examples_section}

LÍMITE ESTRICTO: reasoning máximo 12 palabras, strategy_note máximo 15 palabras. Sin excepciones.

FUSIÓN DE GRUPOS: revisa los grupos candidatos. Si dos o más grupos representan exactamente la misma intención de búsqueda real (la misma página debería cubrir todas esas keywords), inclúyelos juntos en el mismo array group_indexes. Sé conservador: solo fusiona cuando estés seguro de que es la misma intención, no solo temas parecidos. Presta especial atención a keywords que son variantes casi idénticas entre sí (mismo núcleo semántico con palabras de más o de menos).

GRUPOS A CLASIFICAR:
{groups_list}

FORMATO JSON (sin nada más):
{
  "clusters": [
    {
      "group_indexes": [0],
      "title": "Título descriptivo",
      "target_url": "/slug-espanol-sin-acentos",
      "url_type": "landing_servicio|landing_local|articulo_satelite|comparativa_competidores|blog_informacional",
      "destination": "own_site|external_site",
      "content_type": "landing_transaccional|articulo_pilar|articulo_satelite|landing_local|comparativa",
      "search_intent": "transaccional|informacional|navegacional|local",
      "difficulty": "easy|medium|hard",
      "low_volume": false,
      "reasoning": "Máximo 12 palabras. Por qué este grupo tiene esta intención.",
      "strategy_note": "Máximo 15 palabras. Una frase sobre cómo ejecutar este cluster.",
      "primary_keyword": "keyword principal del grupo"
    }
  ],
  "suggested": [
    {
      "title": "Cluster sugerido",
      "target_url": "/slug",
      "url_type": "landing_servicio",
      "destination": "own_site",
      "content_type": "landing_transaccional",
      "search_intent": "transaccional",
      "difficulty": "easy",
      "reasoning": "Máximo 12 palabras. Por qué esta keyword tiene potencial.",
      "strategy_note": "Máximo 15 palabras. Cómo ejecutarlo.",
      "primary_keyword": "keyword sugerida",
      "suggested_keywords": ["keyword1", "keyword2"]
    }
  ],
  "irrelevant_groups": [0, 3, 7]
}`;

function formatGroupsList(groups: ClusterGroup[]): string {
  return groups
    .map((g, i) => {
      const totalVolume = g.keywords.reduce((sum, k) => sum + (k.volume ?? 0), 0);
      const keywordsList = g.keywords
        .map((k) => `${k.keyword}${k.volume ? ` (${k.volume}/mes)` : ''}`)
        .join(', ');
      const signals = g.serp_signals && g.serp_signals.length > 0 ? g.serp_signals.join(', ') : 'ninguna';

      return `Grupo ${i}:\nKeywords: ${keywordsList}\nVolumen total: ${totalVolume}/mes\nSeñales SERP: ${signals}`;
    })
    .join('\n\n');
}

function formatExamplesSection(examples: ClusteringExample[]): string {
  if (examples.length === 0) {
    return '';
  }

  const list = examples
    .map(
      (e) =>
        `- "${e.clusterTitle}" (${e.keywords.join(', ')}) → destino: ${e.destination ?? '?'}, ` +
        `tipo: ${e.contentType ?? '?'}, intención: ${e.searchIntent ?? '?'}, url_type: ${e.urlType ?? '?'}`
    )
    .join('\n');

  return `EJEMPLOS DE CLASIFICACIONES ANTERIORES VALIDADAS (úsalos como referencia de estilo y criterio):\n${list}\n`;
}

function buildPrompt(
  groups: ClusterGroup[],
  suggestedCount: number,
  examples: ClusteringExample[],
  dbTemplate: { system_prompt: string; user_prompt_template: string } | null
): { system: string; user: string } {
  const template = dbTemplate?.user_prompt_template ?? FALLBACK_USER_TEMPLATE;
  const system = dbTemplate?.system_prompt ?? FALLBACK_SYSTEM_PROMPT;

  const user = template
    .split('{count}')
    .join(String(groups.length))
    .split('{examples_section}')
    .join(formatExamplesSection(examples))
    .split('{groups_list}')
    .join(formatGroupsList(groups));

  // El template (BD o fallback) no tiene placeholder para el número de
  // sugerencias — es un parámetro de ejecución (config.max_suggested_clusters),
  // no algo que un admin edite por prompt. Se añade como instrucción aparte.
  return {
    system,
    user: `${user}\n\nSugiere como máximo ${suggestedCount} clusters nuevos en "suggested".`,
  };
}

// Extracción robusta de JSON (misma lógica de 3 estrategias que
// lib/ai/parsers/json-extractor.ts, duplicada aquí en vez de compartida
// porque valida una estructura de respuesta distinta — grupos con índice,
// no keywords sueltas).
function extractJson(raw: string): unknown {
  const trimmed = raw.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    // sigue
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      // sigue
    }
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]);
    } catch {
      // sigue
    }
  }

  console.error('=== AI RAW RESPONSE (cluster_strategic parsing failed) ===');
  console.error(raw);
  console.error('=== END RAW RESPONSE ===');
  throw new Error('La respuesta de clasificación estratégica no es JSON válido');
}

function pickPrimaryKeyword(keywords: ClusterGroup['keywords']): string {
  return keywords.reduce((best, k) => ((k.volume ?? 0) > (best.volume ?? 0) ? k : best)).keyword;
}

// Fusiona los grupos originales de HDBSCAN que la Capa 4 decidió que son
// la misma intención real (group_indexes con más de un elemento): junta
// sus keywords y combina las señales SERP de la Capa 3 — OR para
// high_competition/local_intent/local_physical/informational_intent (si
// algún grupo fusionado la tenía, el cluster final la hereda), AND para
// low_volume (solo si TODOS los grupos fusionados eran de volumen bajo).
function mergeGroups(groups: ClusterGroup[]): {
  keywords: ClusterGroup['keywords'];
  lowVolume: boolean;
} {
  const keywords = groups.flatMap((g) => g.keywords);
  const lowVolume = groups.length > 0 && groups.every((g) => g.serp_signals?.includes('low_volume'));
  return { keywords, lowVolume };
}

function toProposalFromGroups(
  raw: Record<string, unknown>,
  mergedGroups: ClusterGroup[]
): ClusterProposal | null {
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (!title || mergedGroups.length === 0) {
    return null;
  }

  const { keywords, lowVolume } = mergeGroups(mergedGroups);
  if (keywords.length === 0) {
    return null;
  }

  // Se calcula siempre a partir del volumen real combinado, sin confiar
  // en lo que diga el modelo — igual que se hace con otros campos
  // reglados en cluster-keywords.ts (ver decisiones de esta sesión).
  const primaryKeyword = pickPrimaryKeyword(keywords);

  return {
    title,
    target_url: typeof raw.target_url === 'string' ? raw.target_url : null,
    url_type: typeof raw.url_type === 'string' ? raw.url_type : null,
    destination: typeof raw.destination === 'string' ? raw.destination : null,
    content_type: typeof raw.content_type === 'string' ? raw.content_type : null,
    search_intent: typeof raw.search_intent === 'string' ? raw.search_intent : null,
    difficulty: typeof raw.difficulty === 'string' ? raw.difficulty : null,
    low_volume: lowVolume,
    reasoning: typeof raw.reasoning === 'string' ? raw.reasoning : null,
    strategy_note: typeof raw.strategy_note === 'string' ? raw.strategy_note : null,
    is_ai_suggested: false,
    primary_keyword: primaryKeyword,
    keywords: keywords.map((k) => ({
      keyword: k.keyword,
      monthly_volume: k.volume,
      is_primary: k.keyword === primaryKeyword,
      pending_verification: false,
    })),
  };
}

function toProposalFromSuggestion(raw: Record<string, unknown>): ClusterProposal | null {
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const suggestedKeywords = Array.isArray(raw.suggested_keywords)
    ? raw.suggested_keywords.filter((k): k is string => typeof k === 'string')
    : [];

  if (!title || suggestedKeywords.length === 0) {
    return null;
  }

  const primaryKeyword =
    typeof raw.primary_keyword === 'string' ? raw.primary_keyword : suggestedKeywords[0];

  return {
    title,
    target_url: typeof raw.target_url === 'string' ? raw.target_url : null,
    url_type: typeof raw.url_type === 'string' ? raw.url_type : null,
    destination: typeof raw.destination === 'string' ? raw.destination : null,
    content_type: typeof raw.content_type === 'string' ? raw.content_type : null,
    search_intent: typeof raw.search_intent === 'string' ? raw.search_intent : null,
    difficulty: typeof raw.difficulty === 'string' ? raw.difficulty : null,
    low_volume: false,
    reasoning: typeof raw.reasoning === 'string' ? raw.reasoning : null,
    strategy_note: typeof raw.strategy_note === 'string' ? raw.strategy_note : null,
    is_ai_suggested: true,
    primary_keyword: primaryKeyword,
    keywords: suggestedKeywords.map((kw) => ({
      keyword: kw,
      monthly_volume: null,
      is_primary: kw === primaryKeyword,
      pending_verification: true,
    })),
  };
}

export async function classifyStrategically(
  groups: ClusterGroup[],
  suggestedCount: number,
  examples: ClusteringExample[],
  provider: string,
  model: string,
  apiKey: string
): Promise<{
  clusters: ClusterProposal[];
  suggested: ClusterProposal[];
  irrelevantGroupIndexes: number[];
  // Índices de `groups` que sí llegaron a un cluster o a irrelevant_groups
  // — el pipeline usa esto para detectar grupos que la IA omitió por
  // completo (ni clasificados ni marcados irrelevantes) y no perderlos
  // silenciosamente.
  matchedGroupIndexes: number[];
  inputTokens: number;
  outputTokens: number;
}> {
  const adapter = getAdapter(provider);
  if (!adapter) {
    throw new Error(`Proveedor de IA desconocido: ${provider}`);
  }

  const dbPrompt = await getPrompt('cluster_strategic');
  const { system, user } = buildPrompt(groups, suggestedCount, examples, dbPrompt);

  const messages: AIMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];

  const response = await withTimeout(
    adapter.sendMessage(messages, model, apiKey, computeMaxTokens(groups.length)),
    CALL_TIMEOUT_MS
  );
  const data = extractJson(response.content);

  if (typeof data !== 'object' || data === null || !Array.isArray((data as Record<string, unknown>).clusters)) {
    throw new Error(
      'La respuesta de clasificación estratégica no tiene la estructura esperada (falta "clusters")'
    );
  }

  const d = data as Record<string, unknown>;

  const clusters: ClusterProposal[] = [];
  const matchedGroupIndexes: number[] = [];
  for (const rawCluster of d.clusters as unknown[]) {
    if (typeof rawCluster !== 'object' || rawCluster === null) continue;
    const c = rawCluster as Record<string, unknown>;
    const groupIndexes = Array.isArray(c.group_indexes)
      ? c.group_indexes.filter((i): i is number => typeof i === 'number')
      : [];
    if (groupIndexes.length === 0) continue;

    const mergedGroups = groupIndexes
      .map((idx) => groups[idx])
      .filter((g): g is ClusterGroup => Boolean(g));
    if (mergedGroups.length === 0) continue;

    const proposal = toProposalFromGroups(c, mergedGroups);
    if (proposal) {
      clusters.push(proposal);
      matchedGroupIndexes.push(...groupIndexes);
    }
  }

  const suggested: ClusterProposal[] = [];
  if (Array.isArray(d.suggested)) {
    for (const rawSuggestion of d.suggested) {
      if (typeof rawSuggestion !== 'object' || rawSuggestion === null) continue;
      const proposal = toProposalFromSuggestion(rawSuggestion as Record<string, unknown>);
      if (proposal) suggested.push(proposal);
    }
  }

  const irrelevantGroupIndexes: number[] = Array.isArray(d.irrelevant_groups)
    ? d.irrelevant_groups.filter((i): i is number => typeof i === 'number')
    : [];

  return {
    clusters,
    suggested,
    irrelevantGroupIndexes,
    matchedGroupIndexes,
    inputTokens: response.input_tokens,
    outputTokens: response.output_tokens,
  };
}

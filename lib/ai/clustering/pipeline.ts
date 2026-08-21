import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { aiJobs } from '@/lib/db/schema';
import { getModelPricing } from '@/lib/ai/gateway';
import { detectBrandKeywords, brandGroupToProposal } from './layers/0b-brand-detection';
import { normalizeByIntent } from './layers/0-intent-normalizer';
import { embedKeywords } from './layers/1-embeddings';
import { groupByHdbscan } from './layers/2-hdbscan';
import { assignOrphans } from './layers/2b-orphan-assignment';
import { analyzeSerpSignals } from './layers/3-serp-signals';
import { classifyStrategically } from './layers/4-strategic-classifier';
import { findSimilarExamples } from './feedback/retrieval';
import { DEFAULT_PIPELINE_CONFIG } from './types';
import type { ClusteringInput, ClusteringOutput, PipelineConfig } from './types';

// Consulta el precio del modelo de embeddings realmente usado (Capa 1) en
// ai_model_pricing. Si nadie ha añadido una fila de precio para ese
// modelo (pestaña "Precios por modelo" en IA & Modelos), embeddings_cost
// sale en 0 — no bloquea el pipeline por falta de un dato administrativo.
async function estimateEmbeddingsCost(
  provider: string,
  model: string,
  keywordCount: number
): Promise<number> {
  const pricing = await getModelPricing(provider, model);
  if (!pricing) return 0;

  // Estimación aproximada de tokens (keywords son textos muy cortos):
  // ~4 caracteres por token, sin llamar a un tokenizer real.
  const estimatedTokens = keywordCount * 5; // margen generoso para keywords cortas
  return (estimatedTokens / 1000) * Number(pricing.inputCostPer1k);
}

// Mapa de arquitectura (Parte A) — metadata co-ubicada con el código real
// que orquesta el pipeline. Cuando clusterKeywords() cambie de orden o de
// capas, este array debe reflejarlo: es la fuente que consume
// lib/architecture-map/registry.ts para el nivel 2 del Mapa Visual del
// Sistema. No se mantiene a mano por separado del código — cualquiera que
// toque el pipeline sin actualizar este array deja el mapa desincronizado.
// Detalle técnico opcional, mostrado en un modal aparte (icono Info en la
// tarjeta) para no ensuciar la vista general del mapa. Compartido entre
// ProcessStep (nivel 2) y SystemNode (nivel 1, en registry.ts). Solo se
// rellena con información real, verificada contra el código y los docs de
// sesión — no todos los nodos lo necesitan.
export interface TechnicalDetail {
  summary: string;
  stack?: string[];
  keyDecisions?: string[];
}

export interface ProcessStep {
  id: string;
  name: string;
  description: string;
  status: 'built' | 'in_progress' | 'planned';
  file: string;
  technicalDetail?: TechnicalDetail;
}

export const CLUSTERING_PROCESS_MAP: ProcessStep[] = [
  {
    id: 'brand-detection',
    name: 'Detección de marca',
    description:
      'Reconoce automáticamente cuando una búsqueda menciona a un competidor conocido y la separa como información, no como página a crear.',
    status: 'built',
    file: 'layers/0b-brand-detection.ts',
    technicalDetail: {
      summary:
        'Compara cada keyword contra los nombres de los competidores registrados en el proyecto (seo_kw_competitors), usando coincidencia de texto normalizado. No usa IA — es una comparación matemática de texto, sin coste de tokens.',
      stack: ['Normalización NFD + strip de diacríticos', 'seo_kw_competitors (BD)'],
      keyDecisions: [
        'Nombre de competidor mínimo 4 caracteres, para evitar falsos positivos con nombres muy cortos',
        'Si varios competidores matchean la misma keyword, gana el nombre más largo (más específico)',
        'content_type: "competencia_detectada" es el único campo que sobrevive al guardado en BD para marcar estos clusters como informativos, no accionables',
      ],
    },
  },
  {
    id: 'intent-normalizer',
    name: 'Normalización de intención',
    description:
      'Detecta si dos palabras clave significan lo mismo aunque se escriban distinto (ej. "precios" no cambia la intención).',
    status: 'built',
    file: 'layers/0-intent-normalizer.ts',
    technicalDetail: {
      summary:
        'Agrupa keywords que comparten más del 60% de sus palabras (raíz + variante) y solo llama a la IA para decidir si la palabra que las distingue (el "modificador") cambia realmente la intención de búsqueda.',
      stack: ['Comparación de solape de palabras (sin IA)', 'Llamada LLM corta solo para modificadores nuevos', 'Tabla ai_intent_modifiers (caché)'],
      keyDecisions: [
        'Umbral de solape: 60% de palabras compartidas para considerar dos keywords candidatas',
        'Cada modificador clasificado se cachea en BD — la próxima vez que aparece, no se vuelve a llamar a la IA',
        'ai_intent_modifiers es una tabla global sin tenant_id: el aprendizaje de idioma se comparte entre todos los tenants',
      ],
    },
  },
  {
    id: 'embeddings',
    name: 'Vectorización semántica',
    description: 'Convierte cada palabra clave en un punto matemático que representa su significado.',
    status: 'built',
    file: 'layers/1-embeddings.ts',
    technicalDetail: {
      summary:
        'Llama a la API de embeddings del proveedor activo (Voyage, OpenAI o Gemini) para convertir cada keyword en un vector de 1536 dimensiones.',
      stack: ['fetch() directo, sin SDK', 'Voyage AI / OpenAI / Gemini embeddings', 'pgvector — vector(1536)'],
      keyDecisions: [
        'Lotes de 100 keywords por llamada',
        'Vectores con menos de 1536 dimensiones (Voyage, 1024) se rellenan con ceros — no afecta la similitud dentro de un mismo proveedor, pero impide comparar vectores entre proveedores distintos',
        'Anthropic no tiene API de embeddings propia — un tenant con Anthropic como chat necesita configurar Voyage/OpenAI/Gemini aparte para esta capa',
      ],
    },
  },
  {
    id: 'hdbscan',
    name: 'Agrupación matemática',
    description: 'Agrupa las palabras clave más parecidas entre sí usando matemáticas puras, sin IA.',
    status: 'built',
    file: 'layers/2-hdbscan.ts',
    technicalDetail: {
      summary:
        'Algoritmo de clustering por densidad. No requiere saber de antemano cuántos grupos van a salir, a diferencia de K-Means.',
      stack: ['hdbscan-ts 1.0.17', 'pgvector para almacenar los vectores'],
      keyDecisions: [
        'min_cluster_size: 1 — evita descartar keywords aisladas como ruido (bajado de 2 a 1 en el fix "Noise Recovery")',
        'Las keywords marcadas como ruido no se descartan aquí — pasan a la Capa 2b (rescate de huérfanas)',
      ],
    },
  },
  {
    id: 'orphan-assignment',
    name: 'Rescate de huérfanas',
    description: 'Palabras clave que quedaron solas se reasignan al grupo más parecido si tiene sentido.',
    status: 'built',
    file: 'layers/2b-orphan-assignment.ts',
    technicalDetail: {
      summary:
        'Para cada keyword marcada como ruido por HDBSCAN, calcula su distancia coseno al centroide de cada grupo ya formado; si la más cercana está lo bastante próxima, la asigna a ese grupo.',
      stack: ['Distancia coseno (cálculo propio, sin librería nueva)'],
      keyDecisions: [
        'Umbral de similitud: 0.35 — valor inicial razonado, aún no calibrado con datos de producción a gran escala',
        'Reutiliza el centroid_embedding ya calculado por la Capa 2 en vez de recalcularlo',
      ],
    },
  },
  {
    id: 'serp-signals',
    name: 'Señales de Google',
    description:
      'Analiza qué tipo de resultados muestra Google para cada grupo (local, informativo, competido...).',
    status: 'built',
    file: 'layers/3-serp-signals.ts',
    technicalDetail: {
      summary:
        'Traduce los datos de SE Ranking ya importados (posiciones, features) a etiquetas que la Capa 4 usa para clasificar, sin llamar a ninguna API externa nueva.',
      stack: ['Datos ya importados de SE Ranking'],
      keyDecisions: [
        'Sin IA — análisis puro de los datos ya disponibles en seo_kw_raw',
        'Señales detectadas: local_intent, local_physical, informational_intent, high_competition, low_volume',
      ],
    },
  },
  {
    id: 'strategic-classification',
    name: 'Clasificación estratégica con IA',
    description:
      'La inteligencia artificial nombra cada grupo, decide su tipo de página, y puede fusionar grupos que en realidad son la misma intención de búsqueda.',
    status: 'built',
    file: 'layers/4-strategic-classifier.ts',
    technicalDetail: {
      summary:
        'Un LLM corto recibe los grupos ya formados (no las keywords sueltas) y decide título, URL, tipo de contenido e intención — y puede fusionar varios grupos en un único cluster si representan la misma intención real.',
      stack: [
        'Anthropic / OpenAI / Gemini / DeepSeek (según proveedor activo del tenant)',
        'RAG — hasta 5 ejemplos ya confirmados por humanos, vía similitud de embeddings',
      ],
      keyDecisions: [
        'max_tokens dinámico: min(max(nº_grupos × 300, 2000), 12000) — antes era un valor fijo que truncaba la respuesta con muchos grupos',
        'reasoning ≤12 palabras, strategy_note ≤15 palabras — límite añadido para dejar margen dentro del cap dinámico',
        'Al fusionar grupos, low_volume se recalcula por AND y primary_keyword es la de mayor volumen combinado — no se confía en el LLM para estos dos campos',
      ],
    },
  },
];

// La interfaz externa (ClusteringInput → ClusteringOutput) no cambia
// aunque cambien las capas internas.
export async function clusterKeywords(
  input: ClusteringInput,
  config?: Partial<PipelineConfig>
): Promise<ClusteringOutput> {
  const startTime = Date.now();
  const cfg: PipelineConfig = { ...DEFAULT_PIPELINE_CONFIG, ...config };
  const layersUsed: string[] = [];

  // Capa 0b — detección de marca (antes que nada más): saca del pipeline
  // las keywords que son búsquedas de marca de un competidor conocido del
  // proyecto. No pasan por Capa 0-4 — se convierten directamente en
  // clusters informativos al final, sin coste de tokens.
  const { brandGroups, remainingKeywords } = detectBrandKeywords(
    input.keywords,
    input.competitors
  );
  layersUsed.push('brand_detection');

  // Capa 0 — normalización por intención (raíz + modificador). Va antes de
  // los embeddings porque su resultado (qué keywords comparten raíz) se
  // usa para forzar su agrupación después de la Capa 1 — ver más abajo.
  const normalizedGroups = await normalizeByIntent(
    remainingKeywords,
    input.provider,
    input.model,
    input.apiKey
  );
  layersUsed.push('intent_normalizer');

  // Capa 1 — embeddings
  const embedded = await embedKeywords(
    remainingKeywords,
    input.embeddingProvider,
    input.embeddingApiKey,
    input.embeddingModel,
    cfg
  );
  layersUsed.push('embeddings');
  const embeddingsCost = await estimateEmbeddingsCost(
    input.embeddingProvider,
    input.embeddingModel,
    remainingKeywords.length
  );

  // Truco técnico: las keywords que la Capa 0 agrupó bajo una misma raíz
  // por intención comparten literalmente el embedding de esa raíz, para
  // que HDBSCAN las agrupe siempre juntas sin depender de que la
  // similitud semántica pura alcance el umbral.
  const embeddingByKeyword = new Map(embedded.map((e) => [e.keyword.keyword, e.embedding]));
  for (const group of normalizedGroups) {
    const rootEmbedding = embeddingByKeyword.get(group.root_keyword.keyword);
    if (!rootEmbedding) continue;
    for (const entry of embedded) {
      if (entry.keyword.keyword === group.root_keyword.keyword) continue;
      if (group.keywords.some((k) => k.keyword === entry.keyword.keyword)) {
        entry.embedding = rootEmbedding;
      }
    }
  }

  // Capa 2 — HDBSCAN
  const { groups: rawGroups, noise } = await groupByHdbscan(embedded, cfg);
  layersUsed.push('hdbscan');

  // Capa 2b — orphan assignment (sin IA): rescata keywords marcadas como
  // noise por HDBSCAN cuyo embedding cae cerca del centroide de un grupo
  // ya formado (ej. marcas/nombres propios sin suficiente masa crítica de
  // vecinos). Lo que sigue aislado de verdad pasa a orphanUnassigned.
  const embeddingMap = new Map(embedded.map((e) => [e.keyword.keyword, e.embedding]));
  const { groups: rescuedGroups, unassigned: orphanUnassigned } = assignOrphans(
    rawGroups,
    noise,
    embeddingMap
  );
  layersUsed.push('orphan_assignment');

  // Capa 3 — señales SERP (sin IA)
  const groups = analyzeSerpSignals(rescuedGroups);
  layersUsed.push('serp_signals');

  // RAG — ejemplos similares ya validados por humanos, si hay suficientes
  const groupEmbeddings = groups
    .map((g) => g.centroid_embedding)
    .filter((e): e is number[] => Boolean(e));
  const examples = await findSimilarExamples(groupEmbeddings, input.tenantId, 5);
  if (examples.length > 0) {
    layersUsed.push('rag_feedback');
  }

  // Capa 4 — clasificación estratégica (LLM). Este pipeline no pasa por
  // callAI() (recibe provider/model/apiKey ya resueltos, no tenantId para
  // una segunda resolución), así que el registro en ai_jobs para el
  // monitor de uso se hace aquí directamente, con el mismo patrón que
  // usa callAI() internamente.
  const [job] = await db
    .insert(aiJobs)
    .values({
      tenantId: input.tenantId,
      projectId: input.projectId,
      function: 'cluster_strategic',
      status: 'processing',
      input: {
        groups_count: groups.length,
        total_keywords: input.keywords.length,
        examples_used: examples.length,
      },
    })
    .returning();

  try {
    const classification = await classifyStrategically(
      groups,
      cfg.max_suggested_clusters,
      examples,
      input.provider,
      input.model,
      input.apiKey
    );

    const llmPricing = await getModelPricing(input.provider, input.model);
    const llmCost = llmPricing
      ? (classification.inputTokens / 1000) * Number(llmPricing.inputCostPer1k) +
        (classification.outputTokens / 1000) * Number(llmPricing.outputCostPer1k)
      : 0;

    await db
      .update(aiJobs)
      .set({
        status: 'completed',
        output: {
          clusters_count: classification.clusters.length,
          suggested_count: classification.suggested.length,
        },
        provider: input.provider,
        model: input.model,
        inputTokens: classification.inputTokens,
        outputTokens: classification.outputTokens,
        estimatedCost: llmCost.toFixed(6),
        completedAt: new Date(),
      })
      .where(eq(aiJobs.id, job.id));

    layersUsed.push('strategic_classifier');

    const matchedSet = new Set(classification.matchedGroupIndexes);
    const irrelevantSet = new Set(classification.irrelevantGroupIndexes);

    const irrelevant = classification.irrelevantGroupIndexes.flatMap((idx) => {
      const group = groups[idx];
      if (!group) return [];
      return group.keywords.map((k) => ({
        keyword: k.keyword,
        reason: 'Grupo descartado por la IA como irrelevante para la estrategia de contenido',
      }));
    });

    // Red de seguridad: grupos que la IA no clasificó ni marcó como
    // irrelevantes (el JSON no debería cortarse con el input reducido de
    // esta capa, pero si un grupo se queda fuera igualmente, sus
    // keywords no deben desaparecer sin más).
    const omittedGroupsUnassigned = groups.flatMap((group, idx) => {
      if (matchedSet.has(idx) || irrelevantSet.has(idx)) return [];
      return group.keywords.map((k) => ({
        keyword: k.keyword,
        reason: 'La IA no clasificó este grupo',
      }));
    });

    const unassigned = [
      ...orphanUnassigned.map((k) => ({
        keyword: k.keyword,
        reason: 'No se agrupó con ninguna otra keyword por similitud semántica',
      })),
      ...omittedGroupsUnassigned,
    ];

    return {
      clusters: classification.clusters,
      suggested: classification.suggested,
      brandGroups: brandGroups.map(brandGroupToProposal),
      unassigned,
      irrelevant,
      metadata: {
        total_keywords: input.keywords.length,
        processing_time_ms: Date.now() - startTime,
        embeddings_cost: embeddingsCost,
        llm_cost: llmCost,
        layers_used: layersUsed,
        job_id: job.id,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    await db
      .update(aiJobs)
      .set({ status: 'failed', error: message, completedAt: new Date() })
      .where(eq(aiJobs.id, job.id));
    throw error;
  }
}

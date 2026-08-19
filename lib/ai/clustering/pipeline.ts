import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { aiJobs } from '@/lib/db/schema';
import { getModelPricing } from '@/lib/ai/gateway';
import { embedKeywords } from './layers/1-embeddings';
import { groupByHdbscan } from './layers/2-hdbscan';
import { analyzeSerpSignals } from './layers/3-serp-signals';
import { classifyStrategically } from './layers/4-strategic-classifier';
import { findSimilarExamples } from './feedback/retrieval';
import { DEFAULT_PIPELINE_CONFIG } from './types';
import type { ClusteringInput, ClusteringOutput, PipelineConfig } from './types';

// Nombre del modelo de embeddings usado por cada proveedor — solo para
// consultar su precio en ai_model_pricing. Si nadie ha añadido una fila
// de precio para el modelo de embeddings (pestaña "Precios por modelo"
// en IA & Modelos), embeddings_cost sale en 0 — no bloquea el pipeline
// por falta de un dato administrativo.
const EMBEDDING_MODEL_BY_PROVIDER: Record<string, string> = {
  anthropic: 'voyage-3',
  openai: 'text-embedding-3-small',
  gemini: 'text-embedding-004',
};

async function estimateEmbeddingsCost(provider: string, keywordCount: number): Promise<number> {
  const modelName = EMBEDDING_MODEL_BY_PROVIDER[provider];
  if (!modelName) return 0;

  const pricing = await getModelPricing(provider, modelName);
  if (!pricing) return 0;

  // Estimación aproximada de tokens (keywords son textos muy cortos):
  // ~4 caracteres por token, sin llamar a un tokenizer real.
  const estimatedTokens = keywordCount * 5; // margen generoso para keywords cortas
  return (estimatedTokens / 1000) * Number(pricing.inputCostPer1k);
}

// La interfaz externa (ClusteringInput → ClusteringOutput) no cambia
// aunque cambien las capas internas.
export async function clusterKeywords(
  input: ClusteringInput,
  config?: Partial<PipelineConfig>
): Promise<ClusteringOutput> {
  const startTime = Date.now();
  const cfg: PipelineConfig = { ...DEFAULT_PIPELINE_CONFIG, ...config };
  const layersUsed: string[] = [];

  // Capa 1 — embeddings
  const embedded = await embedKeywords(input.keywords, input.provider, input.apiKey, cfg);
  layersUsed.push('embeddings');
  const embeddingsCost = await estimateEmbeddingsCost(input.provider, input.keywords.length);

  // Capa 2 — HDBSCAN
  const { groups: rawGroups, noise } = await groupByHdbscan(embedded, cfg);
  layersUsed.push('hdbscan');

  // Capa 3 — señales SERP (sin IA)
  const groups = analyzeSerpSignals(rawGroups);
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
      ...noise.map((k) => ({
        keyword: k.keyword,
        reason: 'No se agrupó con ninguna otra keyword por similitud semántica',
      })),
      ...omittedGroupsUnassigned,
    ];

    return {
      clusters: classification.clusters,
      suggested: classification.suggested,
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

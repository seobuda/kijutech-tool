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

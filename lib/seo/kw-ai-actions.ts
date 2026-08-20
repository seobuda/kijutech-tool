'use server';

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { aiJobs, seoKwClusterKeywords, seoKwClusters, seoKwRaw } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { assertUserInProjectTenant } from '@/lib/seo/actions';
import { getKwRaw } from '@/lib/seo/kw-queries';
import { completeStep3 } from '@/lib/seo/kw-actions';
import { callAI, resolveActiveProvider, getEmbeddingConfig } from '@/lib/ai/gateway';
import { buildClusteringPrompt } from '@/lib/ai/prompts/cluster-keywords';
import { clusterKeywords } from '@/lib/ai/clustering/pipeline';
import { captureClusteringFeedback } from '@/lib/ai/clustering/feedback/capture';
import type { KeywordInput, ClusterProposal, ReasonedItem } from '@/lib/ai/clustering/types';

// Estas acciones viven en lib/seo/ (no en lib/ai/actions.ts, aunque el
// pedido original las situaba ahí) porque leen y escriben tablas del
// módulo SEO (seo_kw_raw, seo_kw_clusters, seo_kw_cluster_keywords).
// lib/ai/ solo conoce tablas núcleo + ai_*, igual que un módulo nunca
// importa a otro módulo directamente — aquí es el módulo SEO el que
// depende de la infraestructura de IA (clusterKeywords/callAI), no al
// revés.

type AnalyzeResult =
  | { error: string; rawResponse?: string | null }
  | {
      clusters: ClusterProposal[];
      unassigned: ReasonedItem[];
      irrelevant: ReasonedItem[];
      jobId: string;
      estimatedCost: number | null;
      providerUsed: string;
      modelUsed: string;
    };

async function safeAssertUserInProjectTenant(projectId: string) {
  try {
    return { ok: true as const, ...(await assertUserInProjectTenant(projectId)) };
  } catch (err) {
    return {
      ok: false as const,
      error: err instanceof Error ? err.message : 'No autorizado',
    };
  }
}

export async function analyzeKeywordsWithAI(projectId: string): Promise<AnalyzeResult> {
  const auth = await safeAssertUserInProjectTenant(projectId);
  if (!auth.ok) {
    return { error: auth.error };
  }

  const rawKeywords = await getKwRaw(projectId);
  if (rawKeywords.length < 3) {
    return { error: 'Necesitas al menos 3 keywords para analizar con IA' };
  }

  let activeProvider;
  let embeddingConfig;
  try {
    activeProvider = await resolveActiveProvider(auth.user.tenantId);
    embeddingConfig = await getEmbeddingConfig(auth.user.tenantId, activeProvider.keyMode as 'platform' | 'byok');
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'No hay ningún proveedor de IA activo',
    };
  }

  const keywordsInput: KeywordInput[] = rawKeywords.map((k) => ({
    keyword: k.keyword,
    volume: k.monthlyVolume,
    position: k.serankingPosition,
    difficulty: k.serankingDifficulty,
    serp_features: k.serankingSerpFeatures,
    url: k.serankingUrl,
  }));

  let result;
  try {
    result = await clusterKeywords({
      projectId,
      tenantId: auth.user.tenantId,
      keywords: keywordsInput,
      provider: activeProvider.provider,
      model: activeProvider.model,
      apiKey: activeProvider.apiKey,
      embeddingProvider: embeddingConfig.provider,
      embeddingModel: embeddingConfig.model,
      embeddingApiKey: embeddingConfig.apiKey,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'El análisis con IA falló' };
  }

  return {
    // La pantalla de revisión espera un único array de clusters, donde
    // is_ai_suggested distingue los reales de los sugeridos — el
    // pipeline los separa en dos, se fusionan aquí para no tocar la UI.
    clusters: [...result.clusters, ...result.suggested],
    unassigned: result.unassigned,
    irrelevant: result.irrelevant,
    jobId: result.metadata.job_id,
    estimatedCost: result.metadata.embeddings_cost + result.metadata.llm_cost,
    providerUsed: activeProvider.provider,
    modelUsed: activeProvider.model,
  };
}

type ConfirmClusterInput = {
  title: string;
  targetUrl: string | null;
  difficulty: 'easy' | 'medium' | 'hard' | null;
  urlType: string | null;
  isAiSuggested: boolean;
  reasoning: string | null;
  lowVolume: boolean;
  destination: string | null;
  contentType: string | null;
  searchIntent: string | null;
  strategyNote: string | null;
  // 'confirmed' si el usuario no tocó nada de lo que propuso la IA,
  // 'edited' si cambió título/badges/keywords — lo calcula la pantalla
  // de revisión comparando contra el snapshot original. Ausente para
  // clusters creados a mano (paso 4, "Nuevo cluster"), que no pasan por
  // el feedback de RAG.
  feedbackType?: 'confirmed' | 'edited';
  keywords: Array<{
    keyword: string;
    monthlyVolume: number | null;
    isPrimary: boolean;
    pendingVerification: boolean;
  }>;
};

// No devuelve en el camino feliz: redirige al paso 4 (throw interno de
// Next.js), por eso el tipo de retorno solo cubre el caso de error.
export async function confirmAIClusters(
  projectId: string,
  clusters: ConfirmClusterInput[],
  mode: 'add' | 'replace' = 'add',
  jobId?: string | null
): Promise<{ error: string }> {
  const auth = await safeAssertUserInProjectTenant(projectId);
  if (!auth.ok) {
    return { error: auth.error };
  }

  const validClusters = clusters.filter((c) => c.title.trim() && c.keywords.length > 0);
  if (validClusters.length === 0) {
    return { error: 'No hay ningún cluster válido para confirmar' };
  }

  try {
    const rawRows = await getKwRaw(projectId);
    const rawByKeyword = new Map(
      rawRows.map((r) => [r.keyword.trim().toLowerCase(), r])
    );

    await db.transaction(async (tx) => {
      if (mode === 'replace') {
        await tx.delete(seoKwClusters).where(eq(seoKwClusters.projectId, projectId));
      }

      for (const cluster of validClusters) {
        const [insertedCluster] = await tx
          .insert(seoKwClusters)
          .values({
            projectId,
            title: cluster.title.trim(),
            targetUrl: cluster.targetUrl?.trim() || null,
            difficulty: cluster.difficulty,
            priority: 0,
            urlType: cluster.urlType,
            isAiSuggested: cluster.isAiSuggested,
            reasoning: cluster.reasoning,
            lowVolume: cluster.lowVolume,
            destination: cluster.destination,
            contentType: cluster.contentType,
            searchIntent: cluster.searchIntent,
            strategyNote: cluster.strategyNote,
          })
          .returning();

        for (const kw of cluster.keywords) {
          const rawMatch = rawByKeyword.get(kw.keyword.trim().toLowerCase());

          await tx.insert(seoKwClusterKeywords).values({
            clusterId: insertedCluster.id,
            keyword: kw.keyword,
            monthlyVolume: kw.monthlyVolume,
            isPrimary: kw.isPrimary,
            difficulty: rawMatch?.serankingDifficulty ?? null,
            pendingVerification: kw.pendingVerification,
          });

          if (rawMatch) {
            await tx
              .update(seoKwRaw)
              .set({ assigned: true })
              .where(eq(seoKwRaw.id, rawMatch.id));
          }
        }
      }
    });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'No se pudieron crear los clusters',
    };
  }

  // Feedback para el RAG de la Capa 4 — best-effort, en background, solo
  // si esta confirmación viene del pipeline de IA (jobId presente; los
  // clusters creados a mano en el paso 4 no tienen uno). No se espera
  // (sin `await`) para no retrasar la redirección al paso 4.
  if (jobId) {
    void resolveActiveProvider(auth.user.tenantId)
      .then((provider) => getEmbeddingConfig(auth.user.tenantId, provider.keyMode as 'platform' | 'byok'))
      .then((embeddingConfig) =>
        Promise.all(
          validClusters.map((cluster) => {
            const proposal: ClusterProposal = {
              title: cluster.title.trim(),
              target_url: cluster.targetUrl?.trim() || null,
              url_type: cluster.urlType,
              destination: cluster.destination,
              content_type: cluster.contentType,
              search_intent: cluster.searchIntent,
              difficulty: cluster.difficulty,
              low_volume: cluster.lowVolume,
              reasoning: cluster.reasoning,
              strategy_note: cluster.strategyNote,
              is_ai_suggested: cluster.isAiSuggested,
              primary_keyword: cluster.keywords.find((k) => k.isPrimary)?.keyword ?? cluster.keywords[0].keyword,
              keywords: cluster.keywords.map((k) => ({
                keyword: k.keyword,
                monthly_volume: k.monthlyVolume,
                is_primary: k.isPrimary,
                pending_verification: k.pendingVerification,
              })),
            };

            return captureClusteringFeedback(
              auth.user.tenantId,
              projectId,
              jobId,
              proposal,
              proposal,
              cluster.feedbackType ?? 'confirmed',
              embeddingConfig.provider,
              embeddingConfig.apiKey,
              embeddingConfig.model
            );
          })
        )
      )
      .catch((err) => {
        console.error('Feedback de clustering en background falló (ignorado):', err);
      });
  }

  try {
    await completeStep3(projectId);
  } catch {
    // El paso ya quedó marcado in_progress; si esto falla no bloqueamos
    // la confirmación de los clusters, que ya se guardaron correctamente.
  }

  redirect(`/dashboard/projects/${projectId}/seo/keyword-research/clusters`);
}

type TestPromptResult =
  | { error: string }
  | {
      rawResponse: string;
      inputTokens: number;
      outputTokens: number;
      estimatedCost: number | null;
      provider: string;
      model: string;
      jobId: string;
    };

export async function testAiPrompt(
  projectId: string,
  promptData: { systemPrompt: string; userPromptTemplate: string }
): Promise<TestPromptResult> {
  const user = await getUser();
  if (!user) {
    return { error: 'No autenticado' };
  }

  const auth = await safeAssertUserInProjectTenant(projectId);
  if (!auth.ok) {
    return { error: auth.error };
  }

  const systemPrompt = promptData.systemPrompt.trim();
  const userPromptTemplate = promptData.userPromptTemplate.trim();
  if (!systemPrompt || !userPromptTemplate) {
    return { error: 'El system prompt y el user prompt template no pueden estar vacíos' };
  }

  const rawKeywords = await getKwRaw(projectId);
  if (rawKeywords.length < 3) {
    return { error: 'El proyecto seleccionado tiene menos de 3 keywords' };
  }

  const keywordsForPrompt = rawKeywords.map((k) => ({
    keyword: k.keyword,
    volume: k.monthlyVolume,
    position: k.serankingPosition,
    difficulty: k.serankingDifficulty,
  }));

  const { user: userPrompt } = buildClusteringPrompt(keywordsForPrompt, userPromptTemplate);

  let response;
  try {
    response = await callAI({
      tenantId: auth.user.tenantId,
      projectId,
      function: 'test_prompt',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'La llamada a la IA falló' };
  }

  const [job] = await db
    .select({ estimatedCost: aiJobs.estimatedCost })
    .from(aiJobs)
    .where(eq(aiJobs.id, response.jobId))
    .limit(1);

  return {
    rawResponse: response.content,
    inputTokens: response.input_tokens,
    outputTokens: response.output_tokens,
    estimatedCost: job?.estimatedCost != null ? Number(job.estimatedCost) : null,
    provider: response.provider,
    model: response.model,
    jobId: response.jobId,
  };
}

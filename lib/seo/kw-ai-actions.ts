'use server';

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { aiJobs, seoKwClusterKeywords, seoKwClusters, seoKwRaw } from '@/lib/db/schema';
import { getUser } from '@/lib/db/queries';
import { assertUserInProjectTenant } from '@/lib/seo/actions';
import { getKwRaw } from '@/lib/seo/kw-queries';
import { completeStep3 } from '@/lib/seo/kw-actions';
import { callAI, getPrompt } from '@/lib/ai/gateway';
import { buildClusteringPrompt } from '@/lib/ai/prompts/cluster-keywords';
import {
  parseClusteringResponse,
  type ParsedCluster,
  type ParsedReasonedItem,
} from '@/lib/ai/parsers/cluster-keywords';

// Estas 3 acciones viven en lib/seo/ (no en lib/ai/actions.ts, aunque el
// pedido original las situaba ahí) porque leen y escriben tablas del
// módulo SEO (seo_kw_raw, seo_kw_clusters, seo_kw_cluster_keywords).
// lib/ai/ solo conoce tablas núcleo + ai_*, igual que un módulo nunca
// importa a otro módulo directamente — aquí es el módulo SEO el que
// depende de la infraestructura de IA (callAI/getPrompt), no al revés.

type AnalyzeResult =
  | { error: string }
  | {
      clusters: ParsedCluster[];
      unassigned: ParsedReasonedItem[];
      irrelevant: ParsedReasonedItem[];
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

  const keywordsForPrompt = rawKeywords.map((k) => ({
    keyword: k.keyword,
    volume: k.monthlyVolume,
    position: k.serankingPosition,
    difficulty: k.serankingDifficulty,
  }));

  const dbPrompt = await getPrompt('cluster_keywords');
  const { system, user } = dbPrompt
    ? {
        system: dbPrompt.system_prompt,
        user: buildClusteringPrompt(keywordsForPrompt, dbPrompt.user_prompt_template).user,
      }
    : buildClusteringPrompt(keywordsForPrompt);

  let response;
  try {
    response = await callAI({
      tenantId: auth.user.tenantId,
      projectId,
      function: 'cluster_keywords',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      promptKey: 'cluster_keywords',
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'La llamada a la IA falló' };
  }

  let parsed;
  try {
    parsed = parseClusteringResponse(response.content);
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : 'No se pudo interpretar la respuesta de la IA',
    };
  }

  const [job] = await db
    .select({ estimatedCost: aiJobs.estimatedCost })
    .from(aiJobs)
    .where(eq(aiJobs.id, response.jobId))
    .limit(1);

  return {
    clusters: parsed.clusters,
    unassigned: parsed.unassigned,
    irrelevant: parsed.irrelevant,
    jobId: response.jobId,
    estimatedCost: job?.estimatedCost != null ? Number(job.estimatedCost) : null,
    providerUsed: response.provider,
    modelUsed: response.model,
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
  mode: 'add' | 'replace' = 'add'
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

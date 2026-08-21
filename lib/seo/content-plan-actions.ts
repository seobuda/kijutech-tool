'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { seoKwClusters, seoKwClusterKeywords, type SeoClusterContentPlan } from '@/lib/db/schema';
import { assertUserInProjectTenant } from '@/lib/seo/actions';
import {
  getContentPlan,
  saveManualQuestions,
  saveContentPlanAnalysis,
  getUnusedInformationalKeywords,
  getCompetitorContentGap,
} from '@/lib/seo/content-plan-queries';
import { buildContentPlanPrompt, type ContentPlanKeyword } from '@/lib/seo/content-plan-prompt';
import { callAI, getModelPricing } from '@/lib/ai/gateway';
import { extractJsonFromLLMResponse } from '@/lib/ai/parsers/json-extractor';

const MAX_CLUSTER_KEYWORDS_IN_PROMPT = 5;
const CONTENT_PLAN_MAX_TOKENS = 4096;

// Mismo patrón que assertClusterAccess() en competitor-actions.ts (no
// exportado desde allí, así que se repite aquí en vez de importarlo).
async function assertClusterAccess(clusterId: string) {
  const [cluster] = await db.select().from(seoKwClusters).where(eq(seoKwClusters.id, clusterId)).limit(1);

  if (!cluster) {
    throw new Error('Cluster no encontrado');
  }

  const { user } = await assertUserInProjectTenant(cluster.projectId);
  return { cluster, tenantId: user.tenantId };
}

function contentPlanPath(projectId: string, clusterId: string) {
  return `/dashboard/projects/${projectId}/seo/keyword-research/clusters/${clusterId}/content-plan`;
}

export async function updateManualQuestions(clusterId: string, questionsText: string) {
  const { cluster, tenantId } = await assertClusterAccess(clusterId);

  const questions = questionsText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const saved = await saveManualQuestions(clusterId, tenantId, questions);
  revalidatePath(contentPlanPath(cluster.projectId, clusterId));
  return saved;
}

export type ArticleIdea = {
  priority: 'alta' | 'media' | 'baja';
  title: string;
  target_question: string;
  source: 'keyword_existente' | 'pregunta_google' | 'gap_competidor' | 'sugerencia_ia';
  what: string;
  why: string;
  how: string;
};

export type ContentPlanAnalysis = {
  summary: string;
  article_ideas: ArticleIdea[];
};

const VALID_PRIORITIES = new Set(['alta', 'media', 'baja']);
// 'sugerencia_ia' no es una etiqueta que el prompt le pida al modelo — es
// el valor de corrección que aplica correctSourceAttribution() cuando el
// modelo etiqueta una idea con una fuente que no tenía datos reales de
// entrada. Se acepta igualmente aquí porque parseArticleIdeas() también
// debe tolerarla si, por lo que sea, el modelo la usa por su cuenta.
const VALID_SOURCES = new Set(['keyword_existente', 'pregunta_google', 'gap_competidor', 'sugerencia_ia']);
const PRIORITY_ORDER: Record<string, number> = { alta: 0, media: 1, baja: 2 };

function parseArticleIdeas(raw: unknown): ArticleIdea[] {
  if (!Array.isArray(raw)) return [];

  const items: ArticleIdea[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const priority = typeof e.priority === 'string' && VALID_PRIORITIES.has(e.priority) ? e.priority : null;
    const source = typeof e.source === 'string' && VALID_SOURCES.has(e.source) ? e.source : null;
    if (
      !priority ||
      !source ||
      typeof e.title !== 'string' ||
      typeof e.target_question !== 'string' ||
      typeof e.what !== 'string' ||
      typeof e.why !== 'string' ||
      typeof e.how !== 'string'
    ) {
      continue;
    }
    items.push({
      priority: priority as ArticleIdea['priority'],
      title: e.title,
      target_question: e.target_question,
      source: source as ArticleIdea['source'],
      what: e.what,
      why: e.why,
      how: e.how,
    });
  }

  // Se reordena defensivamente aunque el prompt ya se lo pida al modelo —
  // mismo patrón que parseRecommendations() en parsers/competitor-analysis.ts.
  return items.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]).slice(0, 8);
}

function parseContentPlanResponse(raw: string): ContentPlanAnalysis {
  const data = extractJsonFromLLMResponse(raw);
  if (typeof data !== 'object' || data === null) {
    throw new Error('La respuesta de la IA no tiene la estructura esperada');
  }
  const d = data as Record<string, unknown>;
  return {
    summary: typeof d.summary === 'string' ? d.summary : '',
    article_ideas: parseArticleIdeas(d.article_ideas),
  };
}

// El modelo a veces etiqueta una idea con una fuente (source) que no tenía
// ningún dato real detrás — ej. "gap_competidor" en un cluster sin ningún
// competidor scrapeado todavía. Verificado con un caso real: 5 de 8 ideas
// etiquetadas "gap_competidor" en un cluster con seo_cluster_competitors
// vacío. La idea en sí puede seguir siendo válida (conocimiento general
// del modelo), pero la etiqueta de origen es falsa si no hay dato real que
// la respalde — se corrige la etiqueta a 'sugerencia_ia', sin descartar
// la idea.
function correctSourceAttribution(
  ideas: ArticleIdea[],
  available: { hasInformationalKeywords: boolean; hasManualQuestions: boolean; hasCompetitorData: boolean }
): ArticleIdea[] {
  return ideas.map((idea) => {
    const isFalseAttribution =
      (idea.source === 'gap_competidor' && !available.hasCompetitorData) ||
      (idea.source === 'pregunta_google' && !available.hasManualQuestions) ||
      (idea.source === 'keyword_existente' && !available.hasInformationalKeywords);

    if (!isFalseAttribution) return idea;
    return { ...idea, source: 'sugerencia_ia' as const };
  });
}

export async function generateContentPlan(
  clusterId: string
): Promise<{ error: string } | { success: true; plan: SeoClusterContentPlan }> {
  const { cluster, tenantId } = await assertClusterAccess(clusterId);

  const [existingPlan, informationalKeywords, competitorGap] = await Promise.all([
    getContentPlan(clusterId, tenantId),
    getUnusedInformationalKeywords(cluster.projectId, clusterId),
    getCompetitorContentGap(clusterId, tenantId),
  ]);

  const manualQuestions = (existingPlan?.manualQuestions as string[] | null) ?? [];
  const hasCompetitorGap = competitorGap.h2s.length > 0 || competitorGap.faqQuestions.length > 0;

  if (informationalKeywords.length === 0 && manualQuestions.length === 0 && !hasCompetitorGap) {
    return {
      error:
        'Añade preguntas de Google o espera a que termine el análisis de competidores para generar ideas de contenido.',
    };
  }

  const clusterKeywords = await db
    .select()
    .from(seoKwClusterKeywords)
    .where(eq(seoKwClusterKeywords.clusterId, clusterId));

  const topClusterKeywords: ContentPlanKeyword[] = [...clusterKeywords]
    .sort((a, b) => (b.monthlyVolume ?? 0) - (a.monthlyVolume ?? 0))
    .slice(0, MAX_CLUSTER_KEYWORDS_IN_PROMPT)
    .map((k) => ({ keyword: k.keyword, monthlyVolume: k.monthlyVolume }));

  const { system, user } = buildContentPlanPrompt({
    cluster: {
      title: cluster.title,
      targetUrl: cluster.targetUrl,
      keywords: topClusterKeywords,
    },
    informationalKeywords: informationalKeywords.map((k) => ({ keyword: k.keyword, monthlyVolume: k.monthlyVolume })),
    manualQuestions,
    competitorGap,
  });

  let response;
  try {
    response = await callAI({
      tenantId,
      projectId: cluster.projectId,
      function: 'content_plan',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      maxTokens: CONTENT_PLAN_MAX_TOKENS,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Error al llamar a la IA' };
  }

  let parsed: ContentPlanAnalysis;
  try {
    parsed = parseContentPlanResponse(response.content);
    parsed = {
      ...parsed,
      article_ideas: correctSourceAttribution(parsed.article_ideas, {
        hasInformationalKeywords: informationalKeywords.length > 0,
        hasManualQuestions: manualQuestions.length > 0,
        // Distinto de hasCompetitorGap (usado arriba para el prompt): aquí
        // "datos reales" es que exista al menos un competidor con scraping
        // completado, aunque su página concreta no tuviera h2s/FAQs que
        // extraer — hasCompetitorGap sería un falso negativo en ese caso.
        hasCompetitorData: competitorGap.competitorCount > 0,
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo interpretar la respuesta de la IA';
    await saveContentPlanAnalysis({
      clusterId,
      tenantId,
      analysisJson: { error: message },
      modelUsed: response.model,
    });
    revalidatePath(contentPlanPath(cluster.projectId, clusterId));
    return { error: message };
  }

  const pricing = await getModelPricing(response.provider, response.model);
  const costEstimate = pricing
    ? (
        (response.input_tokens / 1000) * Number(pricing.inputCostPer1k) +
        (response.output_tokens / 1000) * Number(pricing.outputCostPer1k)
      ).toFixed(6)
    : null;

  const saved = await saveContentPlanAnalysis({
    clusterId,
    tenantId,
    analysisJson: parsed,
    modelUsed: response.model,
    tokensUsed: response.input_tokens + response.output_tokens,
    costEstimate,
  });

  revalidatePath(contentPlanPath(cluster.projectId, clusterId));
  return { success: true as const, plan: saved };
}

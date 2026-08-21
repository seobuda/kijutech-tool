'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { seoKwClusters, seoClusterCompetitors } from '@/lib/db/schema';
import { assertUserInProjectTenant } from '@/lib/seo/actions';
import {
  deleteCompetitorUrl,
  updateScrapeResult,
  deleteCompetitorAnalysis,
  saveCompetitorAnalysis,
} from '@/lib/seo/competitor-queries';
import { scrapeUrl } from '@/lib/seo/competitor-scraper';
import { buildAnalysisContext } from '@/lib/seo/competitor-analysis-builder';
import { buildCompetitorAnalysisPrompt } from '@/lib/seo/competitor-analysis-prompt';
import { callAI, getModelPricing } from '@/lib/ai/gateway';
import {
  parseCompetitorAnalysisResponse,
  CompetitorAnalysisParseError,
} from '@/lib/ai/parsers/competitor-analysis';

const MAX_COMPETITOR_URLS = 5;

// Mismo patrón que assertClusterAccess() en kw-actions.ts (no exportado
// desde allí), pero además devuelve tenantId — las tablas nuevas de este
// bloque guardan tenant_id directamente (seo_kw_clusters no lo tiene, solo
// project_id).
async function assertClusterAccess(clusterId: string) {
  const [cluster] = await db
    .select()
    .from(seoKwClusters)
    .where(eq(seoKwClusters.id, clusterId))
    .limit(1);

  if (!cluster) {
    throw new Error('Cluster no encontrado');
  }

  const { user } = await assertUserInProjectTenant(cluster.projectId);
  return { cluster, tenantId: user.tenantId };
}

function competitorsPath(projectId: string, clusterId: string) {
  return `/dashboard/projects/${projectId}/seo/keyword-research/clusters/${clusterId}/competitors`;
}

async function performScrape(competitorId: string) {
  const [row] = await db
    .select()
    .from(seoClusterCompetitors)
    .where(eq(seoClusterCompetitors.id, competitorId))
    .limit(1);
  if (!row) return;

  await updateScrapeResult(competitorId, 'scraping', null);
  const result = await scrapeUrl(row.url);

  if (result.ok) {
    await updateScrapeResult(competitorId, 'done', result.data);
  } else {
    await updateScrapeResult(competitorId, 'failed', { error: result.error });
  }
}

export async function saveCompetitorUrls(clusterId: string, urls: string[]) {
  const { cluster, tenantId } = await assertClusterAccess(clusterId);

  const cleanUrls = Array.from(
    new Set(urls.map((u) => u.trim()).filter(Boolean))
  ).slice(0, MAX_COMPETITOR_URLS);

  if (cleanUrls.length === 0) {
    return { error: 'Introduce al menos una URL' };
  }

  // Reemplazo completo del set de URLs del cluster en vez de upsert por
  // posición: el formulario siempre envía el conjunto entero (hasta 5
  // inputs juntos) y no hay unique constraint en (cluster_id, position)
  // que permita un ON CONFLICT limpio — borrar y reinsertar evita huecos
  // o posiciones duplicadas si el usuario reordena/quita URLs.
  const inserted = await db.transaction(async (tx) => {
    await tx.delete(seoClusterCompetitors).where(eq(seoClusterCompetitors.clusterId, clusterId));
    return tx
      .insert(seoClusterCompetitors)
      .values(
        cleanUrls.map((url, i) => ({
          clusterId,
          tenantId,
          url,
          position: i + 1,
        }))
      )
      .returning();
  });

  // Scraping en background — no bloqueante (mismo patrón "void ...catch()"
  // que ya usa kw-ai-actions.ts para el feedback de la Capa 4 del
  // clustering): la action devuelve de inmediato y el cliente hace polling
  // del estado de cada URL.
  for (const row of inserted) {
    void performScrape(row.id).catch((err) => {
      console.error('Scraping en background falló (ignorado):', err);
    });
  }

  revalidatePath(competitorsPath(cluster.projectId, clusterId));
  return { success: true as const };
}

export async function triggerScraping(competitorId: string) {
  const [row] = await db
    .select()
    .from(seoClusterCompetitors)
    .where(eq(seoClusterCompetitors.id, competitorId))
    .limit(1);
  if (!row) {
    throw new Error('Competidor no encontrado');
  }

  const { cluster } = await assertClusterAccess(row.clusterId);
  await performScrape(competitorId);
  revalidatePath(competitorsPath(cluster.projectId, row.clusterId));
}

export async function deleteCompetitor(competitorId: string) {
  const [row] = await db
    .select()
    .from(seoClusterCompetitors)
    .where(eq(seoClusterCompetitors.id, competitorId))
    .limit(1);
  if (!row) return;

  const { cluster, tenantId } = await assertClusterAccess(row.clusterId);
  await deleteCompetitorUrl(competitorId, tenantId);
  revalidatePath(competitorsPath(cluster.projectId, row.clusterId));
}

// Solo borra el análisis existente. Que no exista análisis es lo que la UI
// interpreta como "pendiente de re-analizar", no hace falta un flag aparte.
// El botón "Regenerar análisis" de la UI encadena esto con
// generateCompetitorAnalysis() en el cliente.
export async function refreshAnalysis(clusterId: string) {
  const { cluster, tenantId } = await assertClusterAccess(clusterId);
  await deleteCompetitorAnalysis(clusterId, tenantId);
  revalidatePath(competitorsPath(cluster.projectId, clusterId));
}

// El pedido especifica max_tokens: 2000 para la llamada al Gateway, pero
// CallAIParams (lib/ai/gateway.ts) no tiene ese campo — cada adapter trae
// su propio límite fijo (4096 en el de Anthropic), sin forma de
// sobreescribirlo desde el llamador. No se ha tocado gateway.ts para
// añadirlo (afectaría a todos los llamadores existentes del pipeline de
// clustering); 4096 es más generoso que 2000, así que no debería truncar
// el JSON de salida — ver informe de la sesión.
export async function generateCompetitorAnalysis(clusterId: string) {
  const { cluster, tenantId } = await assertClusterAccess(clusterId);

  const contextResult = await buildAnalysisContext(clusterId, tenantId);
  if (!contextResult.ok) {
    return { error: contextResult.error };
  }

  const { system, user } = buildCompetitorAnalysisPrompt(contextResult.context);

  let response;
  try {
    response = await callAI({
      tenantId,
      projectId: cluster.projectId,
      function: 'competitor_analysis',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Error al llamar a la IA' };
  }

  try {
    const parsed = parseCompetitorAnalysisResponse(response.content);

    const pricing = await getModelPricing(response.provider, response.model);
    const costEstimate = pricing
      ? (
          (response.input_tokens / 1000) * Number(pricing.inputCostPer1k) +
          (response.output_tokens / 1000) * Number(pricing.outputCostPer1k)
        ).toFixed(6)
      : null;

    const saved = await saveCompetitorAnalysis({
      clusterId,
      tenantId,
      analysisJson: parsed,
      modelUsed: response.model,
      tokensUsed: response.input_tokens + response.output_tokens,
      costEstimate,
    });

    revalidatePath(competitorsPath(cluster.projectId, clusterId));
    return { success: true as const, analysis: saved };
  } catch (error) {
    const message =
      error instanceof CompetitorAnalysisParseError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'No se pudo interpretar la respuesta de la IA';

    await saveCompetitorAnalysis({
      clusterId,
      tenantId,
      analysisJson: { error: message },
      modelUsed: response.model,
    });

    revalidatePath(competitorsPath(cluster.projectId, clusterId));
    return { error: message };
  }
}

import { db } from '@/lib/db/drizzle';
import { aiClusteringExamples } from '@/lib/db/schema';
import { embedTexts } from '../layers/1-embeddings';
import type { ClusterProposal } from '../types';

export async function captureClusteringFeedback(
  tenantId: string,
  projectId: string,
  jobId: string,
  // Reservado para comparar original vs. confirmado más adelante (p.ej.
  // detectar qué campos edita más el usuario) — no se usa todavía.
  _originalCluster: ClusterProposal,
  confirmedCluster: ClusterProposal,
  feedbackType: 'confirmed' | 'edited' | 'deleted',
  embeddingProvider: string,
  embeddingApiKey: string,
  embeddingModel: string
): Promise<void> {
  if (feedbackType === 'deleted') {
    return;
  }

  try {
    const text = `${confirmedCluster.title}: ${confirmedCluster.keywords.map((k) => k.keyword).join(', ')}`;
    const [embedding] = await embedTexts([text], embeddingProvider, embeddingApiKey, embeddingModel);

    // ClusterProposal.keywords no lleva position/difficulty/serp_features
    // (esos campos viven en seo_kw_raw, no en la propuesta ya clasificada)
    // — se guardan como null. Si en el futuro el RAG necesita esa señal
    // extra, habría que enriquecer aquí con una consulta a seo_kw_raw.
    await db.insert(aiClusteringExamples).values({
      tenantId,
      projectId,
      keywords: confirmedCluster.keywords.map((k) => ({
        keyword: k.keyword,
        volume: k.monthly_volume,
        position: null,
        difficulty: null,
        serp_features: null,
      })),
      serpSignals: [],
      clusterTitle: confirmedCluster.title,
      targetUrl: confirmedCluster.target_url,
      searchIntent: confirmedCluster.search_intent,
      contentType: confirmedCluster.content_type,
      destination: confirmedCluster.destination,
      urlType: confirmedCluster.url_type,
      embedding,
      feedbackType,
      sourceJobId: jobId,
    });
  } catch (err) {
    // Best-effort: el feedback nunca debe bloquear la confirmación de
    // clusters. Se deja constancia en logs para poder diagnosticar si
    // deja de capturarse silenciosamente.
    console.error('captureClusteringFeedback falló (ignorado, best-effort):', err);
  }
}

export type KeywordInput = {
  keyword: string;
  volume: number | null;
  position: number | null;
  difficulty: number | null;
  serp_features: string | null;
  url: string | null;
};

// Decisión tomada sobre una keyword al agruparla por intención (Capa 0,
// lib/ai/clustering/layers/0-intent-normalizer.ts) — documenta por qué
// terminó en el grupo de su raíz (o por qué se separó a un grupo propio).
export type ModifierDecision = {
  keyword: string;
  modifier_found: string | null;
  effect: 'same_intent' | 'different_intent' | 'unknown';
  source: 'table' | 'ai_classified';
};

export type NormalizedGroup = {
  root_keyword: KeywordInput;
  keywords: KeywordInput[];
  modifier_decisions: ModifierDecision[];
};

export type ClusterGroup = {
  keywords: KeywordInput[];
  centroid_embedding?: number[];
  serp_signals?: string[]; // señales SERP predominantes del grupo
};

export type ClusterProposal = {
  title: string;
  target_url: string | null;
  url_type: string | null;
  destination: string | null;
  content_type: string | null;
  search_intent: string | null;
  difficulty: string | null;
  low_volume: boolean;
  reasoning: string | null;
  strategy_note: string | null;
  is_ai_suggested: boolean;
  primary_keyword: string;
  keywords: Array<{
    keyword: string;
    monthly_volume: number | null;
    is_primary: boolean;
    pending_verification: boolean;
  }>;
  // Marca informativa de la Capa 0b (lib/ai/clustering/layers/0b-brand-detection.ts).
  // No es una columna de seo_kw_clusters — la marca real y persistente que
  // sobrevive al guardado es content_type === 'competencia_detectada'; este
  // campo solo existe en memoria mientras el cluster aún no se ha
  // confirmado, para que la UI de revisión (paso 3) no dependa de comparar
  // strings de content_type.
  is_competitor_brand?: boolean;
};

export type ClusteringInput = {
  projectId: string;
  tenantId: string;
  keywords: KeywordInput[];
  // Competidores conocidos del proyecto (seo_kw_competitors.name) — los usa
  // la Capa 0b (lib/ai/clustering/layers/0b-brand-detection.ts) para sacar
  // del pipeline normal las keywords que son búsquedas de marca de un
  // competidor, antes de que lleguen a Capa 0/HDBSCAN/Capa 4.
  competitors: Array<{ name: string }>;
  provider: string;
  model: string;
  apiKey: string;
  // Proveedor/modelo/key de embeddings (Capa 1) — puede ser distinto del
  // proveedor de chat de arriba (usado por la Capa 4). Resueltos con
  // getEmbeddingConfig() en lib/ai/gateway.ts antes de llamar al pipeline.
  embeddingProvider: string;
  embeddingModel: string;
  embeddingApiKey: string;
};

export type ReasonedItem = { keyword: string; reason: string };

export type ClusteringOutput = {
  clusters: ClusterProposal[];
  suggested: ClusterProposal[];
  // Clusters de marca de competidor (Capa 0b) — no pasan por Capa 1-4, no
  // llevan target_url/destination ni cuestan tokens de LLM. Informativos,
  // no accionables (ver Parte B del pedido).
  brandGroups: ClusterProposal[];
  unassigned: ReasonedItem[];
  irrelevant: ReasonedItem[];
  metadata: {
    total_keywords: number;
    processing_time_ms: number;
    embeddings_cost: number;
    llm_cost: number;
    layers_used: string[];
    // No estaba en el pedido original, pero captureClusteringFeedback()
    // necesita un jobId para asociar el feedback a la llamada que lo
    // generó — es el id del ai_job de la Capa 4 (clasificación
    // estratégica), creado dentro de pipeline.ts.
    job_id: string;
  };
};

export type PipelineConfig = {
  embedding_model: string;
  embedding_dimensions: number; // 1536 para OpenAI, 1024 para Voyage
  min_cluster_size: number; // mínimo de keywords para formar cluster
  min_samples: number; // sensibilidad del HDBSCAN
  max_suggested_clusters: number; // máximo de clusters sugeridos por IA
};

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  embedding_model: 'text-embedding-3-small',
  embedding_dimensions: 1536,
  min_cluster_size: 1,
  min_samples: 1,
  max_suggested_clusters: 5,
};

// Ejemplo de feedback recuperado por RAG (lib/ai/clustering/feedback/retrieval.ts),
// usado para enriquecer el prompt de la Capa 4.
export type ClusteringExample = {
  clusterTitle: string;
  keywords: string[];
  targetUrl: string | null;
  urlType: string | null;
  destination: string | null;
  contentType: string | null;
  searchIntent: string | null;
};

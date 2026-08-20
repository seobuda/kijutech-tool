import { DEFAULT_EMBEDDING_MODEL } from '@/lib/ai/provider-meta';
import type { KeywordInput, PipelineConfig } from '../types';

const BATCH_SIZE = 100;

// La columna `embedding` en BD es vector(1536) fijo (tamaño de OpenAI).
// Voyage (1024) y Gemini (768) devuelven menos dimensiones — se rellenan
// con ceros hasta 1536 para poder guardarlas en la misma columna.
// Añadir dimensiones en cero no cambia el producto escalar ni la norma
// de un vector, así que la similitud coseno entre dos vectores del MISMO
// proveedor se preserva exactamente. Lo que este padding NO resuelve es
// comparar vectores de proveedores distintos entre sí — son espacios
// vectoriales diferentes, ese estilo de comparación no tiene sentido
// semántico independientemente del padding. Esto solo da resultados
// fiables si un proyecto usa siempre el mismo proveedor de embeddings.
const TARGET_DIMENSIONS = 1536;

function padToTargetDimensions(vector: number[]): number[] {
  if (vector.length >= TARGET_DIMENSIONS) {
    return vector.slice(0, TARGET_DIMENSIONS);
  }
  return [...vector, ...new Array(TARGET_DIMENSIONS - vector.length).fill(0)];
}

async function embedBatchVoyage(
  texts: string[],
  apiKey: string,
  model: string
): Promise<number[][]> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ input: texts, model }),
  });
  if (!res.ok) {
    throw new Error(`Voyage AI embeddings error (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  return data.data.map((d: { embedding: number[] }) => d.embedding);
}

async function embedBatchOpenAI(
  texts: string[],
  apiKey: string,
  model: string
): Promise<number[][]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ input: texts, model }),
  });
  if (!res.ok) {
    throw new Error(`OpenAI embeddings error (${res.status}): ${await res.text()}`);
  }
  const data = await res.json();
  return data.data.map((d: { embedding: number[] }) => d.embedding);
}

async function embedBatchGemini(
  texts: string[],
  apiKey: string,
  model: string
): Promise<number[][]> {
  // La API de Gemini (embedContent) no tiene endpoint de lote como
  // Voyage/OpenAI — un texto por llamada, paralelizadas dentro del lote.
  const results = await Promise.all(
    texts.map(async (text) => {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: { parts: [{ text }] } }),
        }
      );
      if (!res.ok) {
        throw new Error(`Gemini embeddings error (${res.status}): ${await res.text()}`);
      }
      const data = await res.json();
      return data.embedding.values as number[];
    })
  );
  return results;
}

// `provider` aquí es el proveedor de EMBEDDINGS ya resuelto por
// getEmbeddingConfig() (lib/ai/gateway.ts) — puede ser 'voyage' explícito
// (elegido en la subsección de embeddings de la UI) o 'anthropic' cuando
// el tenant no configuró un proveedor de embeddings propio (fallback:
// mismo proveedor que el chat, y Anthropic no tiene API de embeddings
// propia, así que ese fallback también usa Voyage).
function getEmbedBatchFn(provider: string) {
  if (provider === 'deepseek') {
    throw new Error(
      'DeepSeek no tiene API de embeddings propia. Configura un proveedor de embeddings específico (OpenAI, Gemini o Voyage AI) en IA & Modelos.'
    );
  }

  const embedBatch =
    provider === 'anthropic' || provider === 'voyage'
      ? embedBatchVoyage
      : provider === 'openai'
        ? embedBatchOpenAI
        : provider === 'gemini'
          ? embedBatchGemini
          : null;

  if (!embedBatch) {
    throw new Error(`Proveedor de embeddings desconocido: ${provider}`);
  }

  return embedBatch;
}

// Vectoriza textos arbitrarios (no necesariamente keywords sueltas) —
// la usan tanto embedKeywords() de abajo como lib/ai/clustering/feedback/
// (capture.ts vectoriza "título: keyword1, keyword2..." de un cluster
// confirmado, retrieval.ts vectoriza el mismo tipo de texto para
// comparar). Ya devuelve los vectores con el padding a 1536 aplicado.
export async function embedTexts(
  texts: string[],
  provider: string,
  apiKey: string,
  model: string = DEFAULT_EMBEDDING_MODEL[provider] ?? ''
): Promise<number[][]> {
  const embedBatch = getEmbedBatchFn(provider);
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const embeddings = await embedBatch(batch, apiKey, model);
    embeddings.forEach((e) => results.push(padToTargetDimensions(e)));
  }

  return results;
}

export async function embedKeywords(
  keywords: KeywordInput[],
  provider: string,
  apiKey: string,
  model: string,
  _config: PipelineConfig
): Promise<Array<{ keyword: KeywordInput; embedding: number[] }>> {
  const embeddings = await embedTexts(
    keywords.map((k) => k.keyword),
    provider,
    apiKey,
    model
  );

  return keywords.map((keyword, idx) => ({ keyword, embedding: embeddings[idx] }));
}

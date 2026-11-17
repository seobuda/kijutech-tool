import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { aiJobs } from '@/lib/db/schema';
import { getEmbeddingConfig, getModelPricing, resolveActiveProvider } from '@/lib/ai/gateway';
import { getTranscriptionModel } from '@/lib/operaciones/settings';

const TRANSCRIBE_MAX_TOKENS = 8192;
const TRANSCRIBE_TIMEOUT_MS = 180_000;

const INSTRUCTION =
  'Transcribe fielmente este audio. Escribe solo lo que se dice, en el idioma en que se hable ' +
  '(normalmente español), con puntuación normal y sin resumir, sin comentarios ni títulos. ' +
  'Si no se oye ninguna voz, responde con una cadena vacía.';

// La clave de Gemini es la que ya está guardada en IA & Modelos: la de
// embeddings (si el proveedor de embeddings es Gemini) o la de chat.
async function resolveGeminiKey(tenantId: string): Promise<{ apiKey: string; keyMode: string }> {
  const active = await resolveActiveProvider(tenantId);
  try {
    const emb = await getEmbeddingConfig(tenantId, active.keyMode as 'platform' | 'byok');
    if (emb.provider === 'gemini') return { apiKey: emb.apiKey, keyMode: active.keyMode };
  } catch {
    // sin configuración de embeddings: se prueba con el proveedor de chat
  }
  if (active.provider === 'gemini') return { apiKey: active.apiKey, keyMode: active.keyMode };
  throw new Error(
    'No hay ninguna clave de Gemini configurada (IA & Modelos). Hace falta para transcribir audio.'
  );
}

// Transcribe un audio con Gemini y deja constancia de la llamada en ai_jobs.
export async function transcribeAudio(params: {
  tenantId: string;
  noteId: string;
  mimeType: string;
  data: Buffer;
}): Promise<string> {
  const { tenantId, noteId, data } = params;
  // Gemini no admite parámetros en el tipo ("audio/webm;codecs=opus" → "audio/webm").
  const mimeType = params.mimeType.split(';')[0].trim() || 'audio/webm';
  const model = await getTranscriptionModel(tenantId);

  const [job] = await db
    .insert(aiJobs)
    .values({
      tenantId,
      function: 'ops_transcribe_audio',
      status: 'processing',
      input: { noteId, mimeType, sizeBytes: data.length, model }
    })
    .returning();

  try {
    const { apiKey, keyMode } = await resolveGeminiKey(tenantId);

    // Transcribir no necesita «pensar»: se desactiva en todos los modelos flash (antes solo con «2.5-flash», y
    // con gemini-flash-latest pensaba, I7). Si un modelo no acepta el ajuste (400), se repite sin él.
    const send = (noThinking: boolean) => fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { text: INSTRUCTION },
                { inline_data: { mime_type: mimeType, data: data.toString('base64') } }
              ]
            }
          ],
          generationConfig: {
            maxOutputTokens: TRANSCRIBE_MAX_TOKENS,
            ...(noThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {})
          }
        })
      }
    );
    const wantsNoThinking = /flash/i.test(model);
    let res = await send(wantsNoThinking);
    if (wantsNoThinking && res.status === 400) {
      const body = await res.clone().text();
      if (/thinking/i.test(body)) res = await send(false);
    }

    if (!res.ok) {
      // El mensaje de error de Google no incluye la clave, pero nunca se loguea la URL.
      throw new Error(`Gemini API error (${res.status}): ${(await res.text()).slice(0, 600)}`);
    }

    const json = await res.json();
    const text: string = (json.candidates?.[0]?.content?.parts ?? [])
      .filter((p: { thought?: boolean }) => !p.thought)
      .map((p: { text?: string }) => p.text ?? '')
      .join('')
      .trim();
    const inputTokens: number = json.usageMetadata?.promptTokenCount ?? 0;
    // El pensamiento se cobra como salida: se suma para que el coste sea real (I7).
    const outputTokens: number = (json.usageMetadata?.candidatesTokenCount ?? 0) + (json.usageMetadata?.thoughtsTokenCount ?? 0);

    const pricing = await getModelPricing('gemini', model);
    const cost = pricing
      ? (inputTokens / 1000) * Number(pricing.inputCostPer1k) +
        (outputTokens / 1000) * Number(pricing.outputCostPer1k)
      : null;

    await db
      .update(aiJobs)
      .set({
        status: 'completed',
        output: { content: text },
        provider: 'gemini',
        model,
        keyModeUsed: keyMode,
        inputTokens,
        outputTokens,
        estimatedCost: cost !== null ? cost.toFixed(6) : null,
        completedAt: new Date()
      })
      .where(eq(aiJobs.id, job.id));

    return text;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Error desconocido';
    await db
      .update(aiJobs)
      .set({ status: 'failed', error: message, completedAt: new Date() })
      .where(eq(aiJobs.id, job.id));
    throw e;
  }
}

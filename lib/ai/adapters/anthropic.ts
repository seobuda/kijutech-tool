import type { AIAdapter, AIMessage, AIResponse } from '@/lib/ai/types';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-6';
// La API de Anthropic exige max_tokens (a diferencia de OpenAI/Gemini/
// DeepSeek, que lo tratan como opcional con un default generoso) — este
// es el valor cuando el llamador no pide uno explícito vía el 4º
// parámetro de sendMessage().
const DEFAULT_MAX_TOKENS = 4096;

type AnthropicBody = { content?: Array<{ type?: string; text?: string }>; stop_reason?: string | null };

/**
 * Texto de una respuesta de la API de Anthropic. Los modelos actuales (Sonnet 5.5, Opus 5.5…) piensan por defecto:
 * la respuesta empieza con bloques `thinking` (texto vacío) y el texto viene después. Antes se leía solo el primer
 * bloque y la respuesta llegaba vacía (16 nov 2026: «crear encargo» por Telegram falló así). Se unen todos los bloques
 * `text`; si no hay ninguno, se lanza un error con el motivo para que quede en ai_jobs como fallo, no como respuesta vacía.
 */
export function anthropicText(data: AnthropicBody): string {
  const text = (data.content ?? [])
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('');
  if (!text.trim()) {
    const why =
      data.stop_reason === 'max_tokens'
        ? 'se agotó el límite de tokens antes de escribir la respuesta (todo se fue en pensar)'
        : data.stop_reason === 'refusal'
          ? 'el modelo rechazó la petición'
          : `sin texto (stop_reason: ${data.stop_reason ?? 'desconocido'})`;
    throw new Error(`Anthropic devolvió una respuesta vacía: ${why}.`);
  }
  return text;
}

export const anthropicAdapter: AIAdapter = {
  async sendMessage(
    messages: AIMessage[],
    model: string,
    apiKey: string,
    maxTokens?: number,
    signal?: AbortSignal
  ): Promise<AIResponse> {
    const resolvedModel = model || DEFAULT_MODEL;

    const systemMessages = messages.filter((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    const res = await fetch(ENDPOINT, {
      signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: resolvedModel,
        max_tokens: maxTokens ?? DEFAULT_MAX_TOKENS,
        system: systemMessages.map((m) => m.content).join('\n\n') || undefined,
        messages: conversationMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`Anthropic API error (${res.status}): ${errorBody}`);
    }

    const data = await res.json();

    return {
      content: anthropicText(data),
      input_tokens: data.usage?.input_tokens ?? 0,
      output_tokens: data.usage?.output_tokens ?? 0,
      model: resolvedModel,
      provider: 'anthropic',
    };
  },
};

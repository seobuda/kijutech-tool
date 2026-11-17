import type { AIAdapter, AIMessage, AIResponse } from '@/lib/ai/types';
import { finishResponse, type StopKind } from '@/lib/ai/adapters/common';

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
 * bloque y la respuesta llegaba vacía (16 nov 2026). Se unen todos los bloques `text` (puede quedar vacío: lo decide
 * finishResponse).
 */
export function anthropicText(data: AnthropicBody): string {
  return (data.content ?? [])
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('');
}

/** Motivo de parada de Anthropic → tipo común. */
export const anthropicStop = (r: string | null | undefined): StopKind => (r === 'max_tokens' ? 'cut' : r === 'refusal' ? 'refusal' : r === 'end_turn' || r === 'stop_sequence' ? 'ok' : 'other');

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
    const response: AIResponse = {
      content: anthropicText(data),
      input_tokens: data.usage?.input_tokens ?? 0,
      output_tokens: data.usage?.output_tokens ?? 0,
      model: resolvedModel,
      provider: 'anthropic',
    };
    return finishResponse(response, anthropicStop(data.stop_reason), data.stop_reason);
  },
};

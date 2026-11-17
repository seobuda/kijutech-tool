import type { AIAdapter, AIMessage, AIResponse } from '@/lib/ai/types';
import { finishResponse, type StopKind } from '@/lib/ai/adapters/common';

type GeminiBody = {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
};

/** Texto de Gemini: une todas las partes de texto, sin las de pensamiento (antes solo leía parts[0], I6). */
export function geminiText(data: GeminiBody): string {
  return (data.candidates?.[0]?.content?.parts ?? []).filter((p) => !p.thought && typeof p.text === 'string').map((p) => p.text as string).join('');
}

export function geminiStop(data: GeminiBody): StopKind {
  if (data.promptFeedback?.blockReason) return 'refusal';
  const r = data.candidates?.[0]?.finishReason;
  if (r === 'MAX_TOKENS') return 'cut';
  if (r === 'STOP') return 'ok';
  if (r && /SAFETY|RECITATION|BLOCKLIST|PROHIBITED|SPII/.test(r)) return 'refusal';
  return 'other';
}

/** Tokens de salida que cobra Gemini: el texto más el pensamiento (I7). */
export const geminiOutputTokens = (data: GeminiBody) => (data.usageMetadata?.candidatesTokenCount ?? 0) + (data.usageMetadata?.thoughtsTokenCount ?? 0);

const DEFAULT_MODEL = 'gemini-1.5-flash';

function toGeminiContents(messages: AIMessage[]) {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
}

export const geminiAdapter: AIAdapter = {
  async sendMessage(
    messages: AIMessage[],
    model: string,
    apiKey: string,
    maxTokens?: number,
    signal?: AbortSignal
  ): Promise<AIResponse> {
    const resolvedModel = model || DEFAULT_MODEL;
    const systemInstruction = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent?key=${apiKey}`;

    const res = await fetch(endpoint, {
      signal,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: toGeminiContents(messages),
        ...(systemInstruction
          ? { systemInstruction: { parts: [{ text: systemInstruction }] } }
          : {}),
        ...(maxTokens ? { generationConfig: { maxOutputTokens: maxTokens } } : {}),
      }),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`Gemini API error (${res.status}): ${errorBody}`);
    }

    const data = (await res.json()) as GeminiBody;
    const response: AIResponse = {
      content: geminiText(data),
      input_tokens: data.usageMetadata?.promptTokenCount ?? 0,
      output_tokens: geminiOutputTokens(data),
      model: resolvedModel,
      provider: 'gemini',
    };
    return finishResponse(response, geminiStop(data), data.promptFeedback?.blockReason ?? data.candidates?.[0]?.finishReason);
  },
};

import type { AIAdapter, AIMessage, AIResponse } from '@/lib/ai/types';
import { finishResponse } from '@/lib/ai/adapters/common';

const ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';

export const openaiAdapter: AIAdapter = {
  async sendMessage(
    messages: AIMessage[],
    model: string,
    apiKey: string,
    maxTokens?: number,
    signal?: AbortSignal
  ): Promise<AIResponse> {
    const resolvedModel = model || DEFAULT_MODEL;

    const res = await fetch(ENDPOINT, {
      signal,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: resolvedModel,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        // Los modelos de razonamiento (o1, o3, gpt-5…) rechazan max_tokens; max_completion_tokens vale para todos (I6).
        ...(maxTokens ? { max_completion_tokens: maxTokens } : {}),
      }),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`OpenAI API error (${res.status}): ${errorBody}`);
    }

    const data = await res.json();
    const choice = data.choices?.[0];
    const reason: string | null = choice?.finish_reason ?? null;
    const response: AIResponse = {
      content: choice?.message?.content ?? '',
      input_tokens: data.usage?.prompt_tokens ?? 0,
      output_tokens: data.usage?.completion_tokens ?? 0,
      model: resolvedModel,
      provider: 'openai',
    };
    const stop = choice?.message?.refusal || reason === 'content_filter' ? 'refusal' : reason === 'length' ? 'cut' : reason === 'stop' ? 'ok' : 'other';
    return finishResponse(response, stop, choice?.message?.refusal ? `refusal: ${String(choice.message.refusal).slice(0, 200)}` : reason);
  },
};

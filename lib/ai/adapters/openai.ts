import type { AIAdapter, AIMessage, AIResponse } from '@/lib/ai/types';

const ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4o-mini';

export const openaiAdapter: AIAdapter = {
  async sendMessage(
    messages: AIMessage[],
    model: string,
    apiKey: string,
    maxTokens?: number
  ): Promise<AIResponse> {
    const resolvedModel = model || DEFAULT_MODEL;

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: resolvedModel,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        ...(maxTokens ? { max_tokens: maxTokens } : {}),
      }),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`OpenAI API error (${res.status}): ${errorBody}`);
    }

    const data = await res.json();

    return {
      content: data.choices?.[0]?.message?.content ?? '',
      input_tokens: data.usage?.prompt_tokens ?? 0,
      output_tokens: data.usage?.completion_tokens ?? 0,
      model: resolvedModel,
      provider: 'openai',
    };
  },
};

import type { AIAdapter, AIMessage, AIResponse } from '@/lib/ai/types';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-6';

export const anthropicAdapter: AIAdapter = {
  async sendMessage(
    messages: AIMessage[],
    model: string,
    apiKey: string
  ): Promise<AIResponse> {
    const resolvedModel = model || DEFAULT_MODEL;

    const systemMessages = messages.filter((m) => m.role === 'system');
    const conversationMessages = messages.filter((m) => m.role !== 'system');

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: resolvedModel,
        max_tokens: 4096,
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
      content: data.content?.[0]?.text ?? '',
      input_tokens: data.usage?.input_tokens ?? 0,
      output_tokens: data.usage?.output_tokens ?? 0,
      model: resolvedModel,
      provider: 'anthropic',
    };
  },
};

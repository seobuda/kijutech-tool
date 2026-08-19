import type { AIAdapter, AIMessage, AIResponse } from '@/lib/ai/types';

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
    apiKey: string
  ): Promise<AIResponse> {
    const resolvedModel = model || DEFAULT_MODEL;
    const systemInstruction = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent?key=${apiKey}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: toGeminiContents(messages),
        ...(systemInstruction
          ? { systemInstruction: { parts: [{ text: systemInstruction }] } }
          : {}),
      }),
    });

    if (!res.ok) {
      const errorBody = await res.text();
      throw new Error(`Gemini API error (${res.status}): ${errorBody}`);
    }

    const data = await res.json();

    return {
      content: data.candidates?.[0]?.content?.parts?.[0]?.text ?? '',
      input_tokens: data.usageMetadata?.promptTokenCount ?? 0,
      output_tokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      model: resolvedModel,
      provider: 'gemini',
    };
  },
};

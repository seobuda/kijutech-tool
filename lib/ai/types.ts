export type AIMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type AIResponse = {
  content: string;
  input_tokens: number;
  output_tokens: number;
  model: string;
  provider: string;
};

export type AIAdapter = {
  sendMessage(
    messages: AIMessage[],
    model: string,
    apiKey: string,
    maxTokens?: number
  ): Promise<AIResponse>;
};

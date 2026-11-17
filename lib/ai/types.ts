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
    maxTokens?: number,
    /** Cancela la petición HTTP (tiempo máximo del gateway): sin esto, la llamada seguía viva y se cobraba igual. */
    signal?: AbortSignal
  ): Promise<AIResponse>;
};

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
    signal?: AbortSignal,
    /** Opciones que no todos los proveedores entienden (los demás las ignoran). */
    opts?: { effort?: string }
  ): Promise<AIResponse>;
};

/**
 * Fallo de una llamada que el proveedor SÍ cobró (respuesta vacía, cortada o rechazada): lleva los tokens para que
 * el gateway guarde su coste en ai_jobs aunque el job quede como fallido (I3). Sin esto, el vigía de gasto y los
 * topes no veían ese dinero.
 */
export class AIBilledError extends Error {
  constructor(
    message: string,
    readonly usage: { input_tokens: number; output_tokens: number; model: string; provider: string }
  ) {
    super(message);
    this.name = 'AIBilledError';
  }
}

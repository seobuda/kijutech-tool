// Reglas comunes de los adaptadores de IA (I5 + I6, revisión del 17 nov 2026): una respuesta vacía, cortada por el
// límite de tokens o rechazada NO es una respuesta válida. Se lanza AIBilledError con los tokens, para que quien
// llama vea el motivo real (no «JSON no válido») y el gateway guarde lo que el proveedor cobró.
import { AIBilledError, type AIResponse } from '@/lib/ai/types';

export type StopKind = 'ok' | 'cut' | 'refusal' | 'other';

const PROVIDER_NAME: Record<string, string> = { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Gemini', deepseek: 'DeepSeek' };

/** Devuelve la respuesta si es útil; si no, lanza AIBilledError con el motivo. */
export function finishResponse(r: AIResponse, stop: StopKind, rawStop: string | null | undefined): AIResponse {
  const name = PROVIDER_NAME[r.provider] ?? r.provider;
  const usage = { input_tokens: r.input_tokens, output_tokens: r.output_tokens, model: r.model, provider: r.provider };
  if (stop === 'refusal') throw new AIBilledError(`${name} rechazó la petición (${rawStop ?? 'sin motivo'}).`, usage);
  if (!r.content.trim()) {
    const why = stop === 'cut' ? 'se agotó el límite de tokens antes de escribir la respuesta (todo se fue en pensar)' : `sin texto (motivo de parada: ${rawStop ?? 'desconocido'})`;
    throw new AIBilledError(`${name} devolvió una respuesta vacía: ${why}.`, usage);
  }
  if (stop === 'cut') throw new AIBilledError(`${name} cortó la respuesta por el límite de tokens (${r.output_tokens} tokens de salida): hay que pedir más tokens o una respuesta más corta.`, usage);
  return r;
}

import { AsyncLocalStorage } from 'node:async_hooks';

// Marca de «esta llamada a la IA es de un examen de prompt» (22 nov 2026). El gateway la copia en ai_jobs.input.evalRunId
// para sumar el coste exacto de cada examen sin mezclarlo con el uso normal que ocurra a la vez. En globalThis para que
// el gateway y el examen compartan la misma instancia aunque el empaquetador duplique el módulo.
const G = globalThis as unknown as { __kijuEvalTag?: AsyncLocalStorage<string> };
const store = (G.__kijuEvalTag ??= new AsyncLocalStorage<string>());

export function currentEvalRunId(): string | null {
  return store.getStore() ?? null;
}

export function withEvalRunId<T>(runId: string, fn: () => Promise<T>): Promise<T> {
  return store.run(runId, fn);
}

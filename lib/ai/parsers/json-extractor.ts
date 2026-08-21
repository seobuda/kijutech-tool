// Los modelos a veces envuelven el JSON en markdown o añaden texto antes
// o después pese a que el prompt lo prohíba explícitamente. Se intentan
// varias estrategias de extracción en orden, de la más estricta a la más
// permisiva, y se usa la primera que produzca JSON parseable.
//
// Lanza un Error genérico si ninguna estrategia funciona — cada parser
// que use esta función (ej. competitor-analysis.ts) se encarga de
// capturarlo y envolverlo en su propio tipo de error con la respuesta
// cruda adjunta, para poder mostrarla en un panel de diagnóstico cuando
// el parseo falla.
export function extractJsonFromLLMResponse(text: string): unknown {
  const trimmed = text.trim();

  // 1. La respuesta ya es JSON válido tal cual.
  try {
    return JSON.parse(trimmed);
  } catch {
    // sigue con la siguiente estrategia
  }

  // 2. Extrae desde la primera "{" hasta la última "}" del string,
  // por si el modelo añadió texto antes/después del objeto JSON.
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      // sigue con la siguiente estrategia
    }
  }

  // 3. Extrae el contenido de un bloque ```json ... ``` o ``` ... ```.
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]);
    } catch {
      // sigue con la siguiente estrategia
    }
  }

  // 4. Ninguna estrategia funcionó.
  throw new Error('La respuesta de la IA no es JSON válido');
}

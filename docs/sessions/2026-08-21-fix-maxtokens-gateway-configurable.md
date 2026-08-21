# Fix: max_tokens configurable en el Gateway + límite dinámico en clustering
**Fecha:** 2026-08-21
**Rama:** feature/fase-d-competitors
**Commit:** 7b37d62d

## Qué se construyó
- `lib/ai/types.ts`: `AIAdapter.sendMessage()` acepta un 4º parámetro opcional `maxTokens`.
- `lib/ai/adapters/anthropic.ts`, `openai.ts`, `gemini.ts`, `deepseek.ts`: cada adapter usa `maxTokens` si se especifica; Anthropic lo necesita como campo obligatorio de su API (fallback `DEFAULT_MAX_TOKENS = 4096` sin cambios), los otros tres lo añaden condicionalmente (antes no lo enviaban en absoluto).
- `lib/ai/gateway.ts`: `CallAIParams` acepta `maxTokens` y `callAI()` lo propaga al adapter.
- `lib/ai/clustering/layers/4-strategic-classifier.ts`: nueva función `computeMaxTokens(groupCount)` — `Math.min(Math.max(groupCount * 300, 2000), 12000)` — sustituye al valor fijo que antes se usaba en la llamada al LLM de la Capa 4 (clasificación estratégica).
- Eliminado `lib/ai/parsers/cluster-keywords.ts` (código muerto — verificado con `grep -rn "cluster-keywords" lib/ app/` que nada lo importaba; el único otro resultado apunta a `lib/ai/prompts/cluster-keywords.ts`, archivo distinto en otra carpeta). Limpiadas las 3 referencias en comentarios de `json-extractor.ts`, `competitor-analysis.ts` y `4-strategic-classifier.ts` que apuntaban al archivo borrado.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **El bug reportado no era del refactor del json-extractor.** Diagnóstico con logging temporal (añadido y retirado en esta sesión) confirmó que `lib/ai/parsers/cluster-keywords.ts` —el archivo refactorizado la sesión anterior— es código muerto, nunca estuvo en la ruta de ejecución del clustering real. La causa real: `lib/ai/clustering/layers/4-strategic-classifier.ts` (nunca tocado por el refactor) tiene su propia extracción de JSON independiente, y la respuesta del LLM llegaba truncada por el límite fijo de `max_tokens` de cada adapter (4096 en Anthropic) cuando el pipeline genera muchos grupos.
- Antes de fijar el valor definitivo, probé 8192 (insuficiente con 30+ grupos) y verifiqué por web search que Claude Sonnet 4.6 soporta hasta 128.000 tokens de salida en la API síncrona estándar sin beta header — descartando que el límite real del modelo fuera el problema.
- La fórmula `groupCount * 300` pedida deja un margen ajustado en el caso real verificado: 38 grupos → tope de 11400, uso real 11123 (~277 tokens de margen). Si en el futuro un proyecto con muchos grupos y `strategy_note` largos vuelve a truncarse, el primer sitio a revisar es este margen, no asumir que es otro bug distinto.

## Qué verificar manualmente
- El proyecto Abando quedó con **38 clusters generados** en el paso "3. Clustering con IA" (estado "pendiente de confirmar", no confirmados en el mapa de clusters) — resultado de las pruebas de reproducción de este fix con datos reales. Revisar o descartar desde la UI según convenga.
- Si en producción se usan alguna vez OpenAI/Gemini/DeepSeek (no solo Anthropic) para clustering, confirmar que el `maxTokens` calculado también evita truncamientos en esos proveedores — solo se verificó con Anthropic en esta sesión.

## Pendientes detectados
- El margen de la fórmula (`groupCount * 300`) es ajustado para grupos con `strategy_note` muy largos — vale la pena monitorear si vuelve a aparecer el mismo error con proyectos de muchas más keywords.
- El límite superior de 12000 tokens es un techo duro — un proyecto con, por ejemplo, 60+ grupos igualmente podría truncarse ahí. No se ha explorado paginar/batchear la clasificación en múltiples llamadas como alternativa a subir el techo indefinidamente.

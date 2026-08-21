# Panel del Cerebro: métricas de tokens y costes
**Fecha:** 2026-08-21
**Rama:** feature/fase-d-competitors
**Commit:** 2d23f2b7

## Qué se construyó
- `lib/ai/brain-queries.ts`: 3 funciones nuevas de solo lectura sobre `ai_jobs`.
  - `getTokenUsageByFunction(tenantId)`: totales de tokens/coste/llamadas/errores agrupados por `function`, ordenado por coste descendente.
  - `getTokenUsageThisMonth(tenantId)`: reutiliza `getAiJobsMonthlyTotals()` de `lib/ai/queries.ts` (ya usada por el monitor de "IA & Modelos") en vez de duplicar la query — solo renombra `count` a `totalCalls`.
  - `getRecentAIJobs(tenantId, limit=10)`: últimas N llamadas con tokens de entrada/salida, coste y estado.
- `app/(dashboard)/dashboard/ai/brain/page.tsx`: nueva sección "Uso de IA" al final de la página, con 3 bloques — resumen del mes (tokens/coste en 2 decimales/llamadas), tabla de desglose por función, tabla de últimas 10 llamadas con badge de estado (mismo estilo que `UsageMonitor` de la pantalla de IA & Modelos). Estado vacío si el tenant no tiene ninguna llamada registrada.

## Migraciones aplicadas
Ninguna — todo es lectura sobre `ai_jobs`, tabla ya existente.

## Decisiones técnicas tomadas en auto mode
- **Mapeo de nombres de función**: solo `cluster_strategic` → "Clustering estratégico" y `competitor_analysis` → "Análisis de competidores" tienen traducción, tal como pedía el pedido. En la BD real aparecen además `test_prompt` y `cluster_keywords`, que se muestran tal cual (sin inventar una traducción) — confirmado en el navegador con datos reales.
- `getRecentAIJobs` incluye `id` en el `SELECT` (no estaba en la query del pedido) para usarlo como `key` de React en la tabla, en vez de el índice del array.
- Formato de fecha `dd/mm/yyyy HH:mm` implementado como helper local en `page.tsx` (no había ningún formateador existente con ese formato exacto — `formatCompletedAt` de `lib/seo/format.ts` usa un formato de texto distinto).

## Qué verificar manualmente
- Los 4 nombres de función reales vistos en el navegador: `cluster_strategic`, `competitor_analysis`, `cluster_keywords`, `test_prompt` — confirmar si `cluster_keywords` y `test_prompt` deberían tener también un nombre legible en una futura iteración.
- Las 3 llamadas "Fallido" que aparecen en la tabla de últimas 10 son del bug de `max_tokens` diagnosticado en la sesión anterior (ya arreglado) — quedan como registro histórico, no requieren ninguna acción.

## Pendientes detectados
Ninguno.

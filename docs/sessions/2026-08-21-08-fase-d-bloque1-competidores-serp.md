# Fase D — Bloque 1: Competidores SERP (scraping + análisis IA)
**Fecha:** 2026-08-21
**Rama:** feature/fase-d-competitors
**Commit:** 98cc8463

## Qué se construyó

### Parte 1 — Scraping y guardado de URLs
- `lib/db/schema.ts`: tablas `seo_cluster_competitors` (hasta 5 URLs top-SERP por cluster, con `CHECK position BETWEEN 1 AND 5`) y `seo_competitor_analysis` (resultado del análisis IA). Migración `0020_seo_competitor_analysis.sql`.
- `lib/seo/competitor-scraper.ts` (nuevo): `scrapeUrl()` con `fetch` nativo + parsing por regex (sin cheerio/jsdom, no había ninguna en el proyecto). Extrae estructura de contenido, señales de intención, E-E-A-T y datos técnicos. Detección de FAQ en 4 capas por prioridad: JSON-LD `FAQPage` → contenedor semántico (heading o class/id) → acordeón (`details`/`summary` nativo o clases `accordion`/`collapse`/`faq-item`/`faq-list`/`expandable`) → 3+ headings consecutivos del mismo nivel terminados en "?".
- `lib/seo/competitor-queries.ts` (nuevo): acceso a datos de solo lectura/escritura sobre las dos tablas nuevas.
- `lib/seo/competitor-actions.ts` (nuevo): `saveCompetitorUrls`, `triggerScraping`, `deleteCompetitor`, `refreshAnalysis` — scraping en background con el patrón `void promise.catch()` que ya usa `kw-ai-actions.ts` (no hay sistema de colas en el proyecto).
- Ruta nueva `clusters/[clusterId]/competitors` (no existía página de detalle por cluster — se enlaza desde el menú de `cluster-card.tsx`) + endpoint de polling `app/api/.../competitors/route.ts` (mismo patrón que `seo/progress`). Polling de 3s mientras haya URLs en `pending`/`scraping`.

### Parte 2 — Análisis IA
- `lib/seo/competitor-analysis-builder.ts` (nuevo): `buildAnalysisContext()` reúne proyecto + kickoff answers + cluster + keywords (máx. 10) + competidores con `scrape_status = 'done'` (mín. 3, si no error explícito), truncando `faqs`/`h2s`/`ctaTexts` para controlar el tamaño del prompt.
- `lib/seo/competitor-analysis-prompt.ts` (nuevo): system prompt fijo (lenguaje de negocio, sin jerga SEO) + user prompt con contexto de negocio, cluster y bloque por competidor.
- `lib/ai/parsers/competitor-analysis.ts` (nuevo): parseo tipado y defensivo del JSON de salida (recomendaciones, estructura sugerida, resumen), con su propio tipo de error (`CompetitorAnalysisParseError`) con la respuesta cruda adjunta.
- `competitor-actions.ts`: nueva action `generateCompetitorAnalysis()` — llama al AI Gateway, parsea, guarda en `seo_competitor_analysis` (o guarda `{error}` si el parseo falla).
- UI: estados de carga (skeleton + "Analizando N competidores..."), error (mensaje + Reintentar) y análisis generado (resumen + fecha + "Regenerar análisis", tarjetas de recomendación coloreadas por prioridad 🔴/🟡/🟢, estructura sugerida numerada).

### Corrección posterior — keys de kickoff answers
Las keys asumidas originalmente (`business_type`, `main_services`...) no existen en ningún proyecto real. Se reemplazaron en `competitor-analysis-builder.ts` por las 7 keys reales de `seo_kickoff_answers` (confirmadas con `SELECT DISTINCT question_key`), con sus etiquetas en español. Verificado contra la BD real del proyecto Abando: los 7 valores llegan correctamente al contexto.

### Refactor final — parser de JSON compartido
`lib/ai/parsers/json-extractor.ts` (nuevo): extrae la lógica de 3 estrategias de extracción de JSON (duplicada entre `cluster-keywords.ts` y `competitor-analysis.ts`) a `extractJsonFromLLMResponse()`. Ambos parsers la importan y mantienen su propio tipo de error (`ClusterParseError`/`CompetitorAnalysisParseError`) envolviendo el error genérico.

## Migraciones aplicadas
`0020_seo_competitor_analysis.sql` — crea `seo_cluster_competitors` y `seo_competitor_analysis`, con sus FKs a `seo_kw_clusters`/`tenants` y el `CHECK` de posición. Backup previo en `backups/backup_pre_fase-d-competitors_20260821.sql`. SQL aprobado explícitamente por Enric antes de aplicar (dos confirmaciones separadas: la migración generada y la aplicación).

## Decisiones técnicas tomadas en auto mode
- **No existe columna `strategy_badge`** en `seo_kw_clusters` — se usó `content_type` como "Tipo estratégico" en el prompt, por ser el campo más cercano a un badge de cluster.
- **El AI Gateway no soporta `max_tokens` configurable** (cada adapter trae su límite fijo — 4096 en Anthropic). No se tocó `gateway.ts` para añadirlo, ya que afectaría a todos los llamadores existentes (pipeline de clustering incluido); 4096 es más generoso que los 2000 pedidos originalmente y no truncó el análisis en la prueba real.
- **Ruta corregida**: el pedido asumía `seo/[projectId]/...`; la convención real del proyecto es `projects/[projectId]/seo/...`.
- **`seo_kw_competitors`** ya existía (nivel proyecto, sin scraping, paso 2 del wizard) — nombre parecido a la nueva `seo_cluster_competitors` (nivel cluster, con scraping) pero función distinta, sin conflicto.
- Botón "Regenerar análisis" encadena `refreshAnalysis()` + `generateCompetitorAnalysis()` en un solo clic.
- El bloque de kickoff answers en el prompt final sigue bajo la línea `Sector y servicios:` (no bajo un header propio "Contexto del negocio:" con bullets) porque la corrección de keys se limitó a `competitor-analysis-builder.ts`, sin tocar `competitor-analysis-prompt.ts`, tal como se pidió explícitamente.

## Qué verificar manualmente
- Revisar el cluster de prueba "Pilates Sant Cugat" (proyecto Abando) — tiene 3 URLs de Wikipedia como competidores de prueba y un análisis IA real generado dos veces (generación + regeneración). Se puede borrar desde la UI si no se quiere conservar.
- Probar el flujo completo con URLs de competidores reales (no Wikipedia) para evaluar la calidad de las recomendaciones en un caso real.
- Decidir si vale la pena remapear el bloque de kickoff answers al formato exacto "Contexto del negocio:" con bullets (pendiente, ver decisión técnica de arriba).

## Pendientes detectados
- La limitación de la Capa 2b/3 del scraper (ventana de caracteres en vez de cierre exacto de tag, ver comentario en `competitor-scraper.ts`) sigue ahí — es una limitación conocida y documentada, no un bug.
- No hay forma de configurar `max_tokens` por llamada en el AI Gateway — si en el futuro se necesita un límite más ajustado (costes, latencia), habría que añadir el parámetro a `CallAIParams` y a cada adapter.
- El "Regenerar análisis" no tiene confirmación previa (borra el análisis anterior sin preguntar) — podría valer la pena un `window.confirm()` si Enric lo usa a menudo por error.

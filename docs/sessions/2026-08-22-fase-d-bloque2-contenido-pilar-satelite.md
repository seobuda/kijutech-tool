# Fase D — Bloque 2: Estrategia de contenido pilar-satélite
**Fecha:** 2026-08-22
**Rama:** feature/fase-d-bloque2-contenido
**Commit:** 13be2ae6c8016b8d8fb512133e6d0408caacb65c

## Qué se construyó

- `lib/db/schema.ts` — tabla nueva `seo_cluster_content_plan`: un plan por
  cluster (`UNIQUE(cluster_id)`, se regenera, no acumula histórico),
  `manual_questions`/`analysis_json` jsonb, `model_used`/`tokens_used`/
  `cost_estimate`, `created_at`/`updated_at` con zona horaria (`timestamptz`,
  siguiendo el SQL literal aprobado).
- `lib/seo/content-plan-queries.ts` (nuevo) — `getContentPlan`,
  `saveManualQuestions`/`saveContentPlanAnalysis` (upsert sobre el
  `UNIQUE(cluster_id)`), `getUnusedInformationalKeywords` (Fuente A),
  `getCompetitorContentGap` (Fuente C, reutiliza `raw_scraped_data` de
  Bloque 1 sin scraping nuevo).
- `lib/seo/content-plan-prompt.ts` (nuevo) — `buildContentPlanPrompt()`,
  system prompt fijo + user prompt con las 3 fuentes y la instrucción de
  output (hasta 8 ideas, JSON con `priority`/`source`/`what`/`why`/`how`).
- `lib/seo/content-plan-actions.ts` (nuevo) — `updateManualQuestions()`,
  `generateContentPlan()`: reúne las 3 fuentes, llama al AI Gateway
  (`maxTokens: 4096`), parsea con `extractJsonFromLLMResponse` (compartido
  con Bloque 1), corrige atribución de fuente falsa (`correctSourceAttribution`)
  y guarda.
- Layout compartido `clusters/[clusterId]/layout.tsx` + `cluster-tabs.tsx`
  (cliente, marca la pestaña activa) — pestañas "Competidores SERP" /
  "Estrategia de contenido" en la vista de detalle del cluster.
  `competitors/page.tsx` simplificado (la cabecera ahora vive en el layout).
- `clusters/[clusterId]/content-plan/page.tsx` + `content-plan-panel.tsx`
  (nuevo) — textarea de preguntas de Google, botón "Generar ideas de
  contenido con IA", tarjetas de ideas (mismo formato visual QUÉ ES / POR
  QUÉ IMPORTA / CÓMO EJECUTARLO que Bloque 1), badge de prioridad y badge
  de origen.
- `cluster-card.tsx` — enlace "Estrategia de contenido" en el menú del
  cluster, visible solo si `searchIntent` es `transaccional` o `local`.

## Migraciones aplicadas

**0021_worthless_ezekiel_stane.sql** (generada por `drizzle-kit generate`,
verificada contra el SQL literal aprobado antes de aplicar):
```sql
CREATE TABLE "seo_cluster_content_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cluster_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"manual_questions" jsonb DEFAULT '[]'::jsonb,
	"analysis_json" jsonb,
	"model_used" text,
	"tokens_used" integer,
	"cost_estimate" numeric(10, 6),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "unique_cluster_content_plan" UNIQUE("cluster_id")
);
--> statement-breakpoint
ALTER TABLE "seo_cluster_content_plan" ADD CONSTRAINT "seo_cluster_content_plan_cluster_id_seo_kw_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."seo_kw_clusters"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "seo_cluster_content_plan" ADD CONSTRAINT "seo_cluster_content_plan_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
```
Backup previo en `backups/backup_pre_fase-d-bloque2-contenido_20260822.sql`.
Aprobación explícita de Enric antes de aplicar (SQL mostrado y confirmado).

## Decisiones técnicas tomadas en auto mode

- **`getUnusedInformationalKeywords` sin pasar por `seo_kw_raw`**:
  `seo_kw_raw` no tiene columna `search_intent` propia — esa clasificación
  solo existe en `seo_kw_clusters.search_intent`, a nivel de cluster
  confirmado. Una primera versión hacía JOIN contra `seo_kw_raw` para
  traer solo keywords "reales"; se descartó tras probar con datos reales
  del proyecto Abando: los clusters informacionales están compuestos por
  keywords **sugeridas por la Capa 4** del clustering, que nunca pasaron
  por `seo_kw_raw` (se crean directo en `seo_kw_cluster_keywords` con
  `monthly_volume` nulo). El JOIN devolvía 0 filas siempre en ese caso —
  el escenario más común para contenido informacional en un negocio
  local. La query final lee directo de `seo_kw_cluster_keywords` JOIN
  `seo_kw_clusters`, sin pasar por `seo_kw_raw`.
- **Corrección de atribución de fuente (`correctSourceAttribution`)**:
  verificado con un caso real que el LLM etiqueta ideas con `source:
  "gap_competidor"` sin que existiera ningún dato de competidor
  (`seo_cluster_competitors` vacío para ese cluster) — el prompt sí
  indicaba correctamente que no había análisis de competidores, pero el
  modelo no respetó el campo `source` con fidelidad. Se corrige la
  etiqueta a `sugerencia_ia` tras el parseo, comparando `source` contra
  qué fuentes tenían datos reales de entrada, sin descartar la idea (el
  contenido puede seguir siendo útil, lo que no puede ser falso es de
  dónde dice venir).
- **`hasCompetitorData` (validación de atribución) ≠ `hasCompetitorGap`
  (mensaje del prompt)**: la primera es `competitorGap.competitorCount > 0`
  (existe al menos un competidor con scraping completado); la segunda es
  `h2s.length > 0 || faqQuestions.length > 0`. Un competidor con scraping
  completado pero cuya página no tuviera H2s ni FAQs extraíbles haría que
  `hasCompetitorGap` fuera `false` sin que eso signifique "no hay datos
  reales" — se mantienen como dos señales distintas para no generar un
  falso negativo en la corrección de atribución.
- **Layout + tabs nuevos para `[clusterId]/`**: la pestaña "Estrategia de
  contenido" necesitaba convivir con "Competidores SERP" en la misma
  vista, que antes era una página standalone sin tabs. La marca de
  pestaña activa requiere `usePathname()` (cliente), así que la barra de
  tabs es un componente cliente aparte mientras el layout sigue siendo
  Server Component para el fetch de datos (cluster + guard 404).
- **`saveManualQuestions`/`saveContentPlanAnalysis` llevan `tenantId`
  explícito**: el pedido original solo mencionaba `clusterId` en la
  firma de `saveManualQuestions`; `tenant_id` es `NOT NULL` en la tabla y
  no hay forma de derivarlo sin él.

## Qué verificar manualmente

Ya verificado en esta sesión con datos reales del proyecto Abando:
- Cluster "Pilates Sant Cugat - Landing Principal" (con 1 competidor de
  prueba scrapeado + 4 preguntas manuales): generó 8 ideas combinando
  Fuente B (preguntas de Google) y Fuente C (gap de competidor); Fuente A
  llegó al prompt pero el modelo no la usó en ese top-8 (comportamiento
  válido).
- Cluster "Pilates Reformer Sant Cugat" (sin ningún competidor
  scrapeado): antes del fix de atribución, 5 de 8 ideas se etiquetaban
  `gap_competidor` sin datos reales — tras el fix, 0 ideas etiquetadas
  `gap_competidor`, las mismas 5 pasaron a `sugerencia_ia` (verificado en
  BD y en pantalla, badge "Sugerencia de la IA").
- `analysis_json` completo en BD en ambos casos, con `model_used`/
  `tokens_used`/`cost_estimate` poblados.
- `tsc --noEmit` limpio tras cada cambio.

Pendiente de verificar por Enric: el texto de `why` de una idea
reetiquetada como `sugerencia_ia` puede seguir mencionando el contexto
falso original (ej. "ningún competidor lo cubre bien") — el fix solo
corrige la etiqueta `source`, no reescribe `what`/`why`/`how`, tal como
se pidió explícitamente ("no descartes la idea — solo corrige su
etiqueta de origen").

## Pendientes detectados

- El texto `why` de una idea corregida a `sugerencia_ia` puede quedar
  desalineado con la nueva etiqueta (ver arriba) — si esto resulta
  confuso en uso real, valdría la pena que el prompt o un paso de
  post-procesado ajustara también el texto, no solo el campo `source`.
- No hay ningún mecanismo que valide automáticamente si el `*_PROCESS_MAP`
  del Mapa Visual del Sistema necesita actualizarse tras este bloque —
  este proceso (generación de plan de contenido) no se añadió como nodo
  nuevo al mapa porque no se pidió en esta tarea; queda pendiente decidir
  si amerita su propio nodo en `lib/architecture-map/registry.ts` en una
  sesión futura, siguiendo la regla de CLAUDE.md.

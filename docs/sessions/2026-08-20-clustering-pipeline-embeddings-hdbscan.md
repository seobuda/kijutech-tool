# Fase C.1 — Pipeline de clustering con embeddings + HDBSCAN
**Fecha:** 2026-08-20
**Rama:** feature/clustering-pipeline
**Commit:** 0f6412b9

## Qué se construyó

**pgvector**: imagen de Postgres cambiada a `pgvector/pgvector:pg16` en
`docker-compose.yml` (mismo formato de datos que `postgres:16`, el
volumen existente sobrevivió intacto — verificado, 12 clusters previos
siguen ahí). Extensión `vector` 0.8.6 activa.

Migración 0016: `CREATE EXTENSION vector` + columna `embedding
vector(1536)` en `seo_kw_raw` y `seo_kw_clusters` + 2 índices `ivfflat`.
Migración 0017: tabla `ai_clustering_examples` (feedback vectorizado
para RAG) + su índice `ivfflat`. Ambas aplicadas sin error.

**Dependencia nueva**: `hdbscan-ts` 1.0.17 (única implementación de
HDBSCAN mantenida activamente que encontré en el ecosistema Node —
investigado con búsquedas web antes de proponerla, no de memoria). Sin
SDK de embeddings — Capa 1 usa `fetch()` directo, mismo patrón que los
4 adaptadores de chat ya existentes.

**Estructura completa en `lib/ai/clustering/`** tal como se pidió:
`pipeline.ts`, `types.ts`, `layers/1-embeddings.ts` (Voyage/OpenAI/
Gemini vía fetch, batches de 100, padding a 1536 dimensiones),
`layers/2-hdbscan.ts`, `layers/3-serp-signals.ts` (sin IA, análisis
matemático puro), `layers/4-strategic-classifier.ts` (el LLM corto con
grupos ya formados), `feedback/capture.ts`, `feedback/retrieval.ts`
(RAG vía `embedding <=> $1` de pgvector).

Prompt `cluster_strategic` sembrado en `ai_prompts` con el texto
literal del pedido.

**Integración**: `analyzeKeywordsWithAI` ahora llama a
`clusterKeywords()` en vez de al gateway directamente.
`confirmAIClusters` dispara `captureClusteringFeedback` en background
(sin `await`) tras guardar los clusters.

**Refactor en `lib/ai/gateway.ts`** (necesario para que el pipeline
reutilizara la resolución de proveedor sin duplicarla): se extrajo
`resolveActiveProvider(tenantId, preferredProvider?)` de la lógica que
ya tenía `callAI()` inline, y se exportaron `getAdapter()`,
`getModelPricing()` y `withTimeout()`/`CALL_TIMEOUT_MS`. `callAI()` se
reescribió para usar `resolveActiveProvider()` internamente —
comportamiento idéntico, verificado con `tsc` y sin tocar su firma
pública.

## Migraciones aplicadas

**0016_quiet_darwin.sql:**
```sql
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
ALTER TABLE "seo_kw_clusters" ADD COLUMN "embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "seo_kw_raw" ADD COLUMN "embedding" vector(1536);--> statement-breakpoint
CREATE INDEX "seo_kw_raw_embedding_idx" ON "seo_kw_raw" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);--> statement-breakpoint
CREATE INDEX "seo_kw_clusters_embedding_idx" ON "seo_kw_clusters" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);
```

**0017_loose_mongoose.sql:**
```sql
CREATE TABLE "ai_clustering_examples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"keywords" jsonb NOT NULL,
	"serp_signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cluster_title" varchar NOT NULL,
	"target_url" varchar,
	"search_intent" varchar,
	"content_type" varchar,
	"destination" varchar,
	"url_type" varchar,
	"embedding" vector(1536),
	"feedback_type" varchar DEFAULT 'confirmed' NOT NULL,
	"source_job_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_clustering_examples" ADD CONSTRAINT "ai_clustering_examples_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_clustering_examples" ADD CONSTRAINT "ai_clustering_examples_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_clustering_examples" ADD CONSTRAINT "ai_clustering_examples_source_job_id_ai_jobs_id_fk" FOREIGN KEY ("source_job_id") REFERENCES "public"."ai_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_clustering_examples_embedding_idx" ON "ai_clustering_examples" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);
```

Ambas coinciden con el SQL pedido (confirmado por Enric antes de
aplicar). `drizzle-kit` no genera índices `ivfflat` de forma nativa —
se añadieron a mano al SQL, así que `schema.ts`/los snapshots no los
"conocen": quedan como objetos físicos en Postgres pero futuros
`db:generate` no intentarán tocarlos.

## ⚠️ Hallazgo crítico — Capa 1 no funciona con proveedor Anthropic

**Esto bloquea el uso real del pipeline ahora mismo.** El pedido decía:
"Si provider = 'anthropic' → usa Voyage AI ... auth: Authorization:
Bearer {apiKey}" — asumiendo que la misma API key de Anthropic sirve
para autenticar contra Voyage AI. **Lo comprobé con la key real y
activa de Enric (Anthropic) contra el endpoint real de Voyage AI:**

```
Voyage AI embeddings error (401): {"detail":"Provided API key is invalid."}
```

Voyage AI es una empresa distinta de Anthropic, con su propio sistema
de keys — no hay ninguna relación de autenticación compartida entre
ambas, a pesar de la relación comercial/inversión entre las dos
empresas. **El único proveedor activo en este tenant es Anthropic**
(verificado en `ai_provider_settings`), así que con la configuración
actual la Capa 1 fallará siempre con este 401 en cuanto se intente un
análisis real.

Esto no es un bug de mi implementación — implementé exactamente lo que
pedía el prompt (mismo `apiKey` de `ClusteringInput` reenviado a
Voyage). Es un gap real de diseño: no existe en este esquema ningún
sitio para guardar una key de Voyage AI *separada* de la key de chat
de Anthropic — `ai_provider_settings` tiene una fila por
`(tenant, provider)`, y `'anthropic'` ya está ocupado por la key de
chat de Claude.

**Lo que sí funcionaría sin cambios de esquema**: activar OpenAI como
proveedor (con su propia key) — para `provider = 'openai'` la Capa 1
llama a la API de embeddings de OpenAI con la misma key de OpenAI, que
es una relación de auth legítima (mismo proveedor, mismo tipo de key).
Gemini también sería coherente (Google embeddings con key de Google).
Anthropic es el único de los tres con esta inconsistencia, porque
Anthropic no tiene API de embeddings propia y el pedido eligió Voyage
como sustituto sin prever que necesitaría su propia credencial.

No tomé ninguna decisión unilateral aquí (como inventar un campo nuevo
para "voyage_api_key") — lo dejo señalado para que decidas cómo
resolverlo: ¿añadir un campo de key de Voyage separado, ¿usar OpenAI
como proveedor de embeddings por defecto independientemente del
proveedor de chat activo, o algo distinto?

## Decisiones técnicas tomadas en auto mode

- **`resolveActiveProvider()` extraído y exportado de `gateway.ts`**
  (no pedido explícitamente, pero necesario): el snippet de integración
  del pedido (`provider: activeProvider.provider, apiKey: decryptedKey`)
  asume que quien llama a `clusterKeywords()` ya resolvió el proveedor
  y descifró la key — antes esa lógica vivía enteramente dentro de
  `callAI()`, sin forma de reutilizarla. Extraerla evita duplicar la
  resolución de proveedor/key en dos sitios; `callAI()` quedó
  funcionalmente idéntica (verificado con `tsc`), solo delega en la
  función nueva.
- **`groupByHdbscan()` devuelve `{ groups, noise }` en vez de
  `Promise<ClusterGroup[]>`** como decía la firma literal del pedido —
  `ClusterGroup` no tiene ningún campo para marcar "esto es ruido", y
  el propio pedido dice que las keywords noise deben llegar al array
  `unassigned` del pipeline. Sin este cambio no había forma de que esas
  keywords llegaran a ningún sitio.
- **Capa 4 devuelve también `matchedGroupIndexes`** (no pedido) — red
  de seguridad para que un grupo que la IA no clasifique ni marque como
  irrelevante no desaparezca en silencio; el pipeline lo enruta a
  `unassigned` con el motivo "La IA no clasificó este grupo".
- **`pipeline.ts` crea su propio `ai_job`** (function:
  `cluster_strategic`) en vez de pasar por `callAI()` — la Capa 4 recibe
  `provider/model/apiKey` ya resueltos, no `tenantId`, así que no puede
  usar el mecanismo de tracking de `callAI()`. Se replicó el mismo
  patrón (insert → processing, update → completed/failed) para que el
  monitor de uso de `/dashboard/ai/settings` siga viendo estas llamadas.
- **`analyzeKeywordsWithAI` fusiona `result.clusters` +
  `result.suggested` en un único array** antes de devolverlo — el
  pipeline los separa, pero la pantalla de revisión (Bloque 3/Fase C)
  ya espera un solo array con `is_ai_suggested` distinguiendo ambos
  tipos. Cumple literalmente "la pantalla de revisión no cambia": el
  reshape ocurre en la capa de integración, no en la UI.
- **`feedbackType` ('confirmed'/'edited') se calcula en el cliente**
  (`cluster-review.tsx`), comparando cada cluster contra un snapshot
  inmutable de lo que propuso la IA (título, URL, dificultad, badges,
  nº de keywords activas) — necesario porque `captureClusteringFeedback`
  pide distinguir ambos casos pero el pedido no explicaba de dónde
  saldría ese dato. El caso `'deleted'` de `captureClusteringFeedback`
  no se dispara nunca desde este flujo: un cluster propuesto que el
  usuario elimina con "Eliminar cluster" simplemente no llega al
  payload de confirmación, no se envía como "borrado" — no hay señal
  negativa capturada para el RAG todavía.
- **`captureClusteringFeedback` recibe el mismo objeto como `original`
  y `confirmado`** — el parámetro `originalCluster` está marcado como
  reservado/sin usar en la implementación actual de `capture.ts` (no
  hacía falta mantener dos copias completas del cluster en el flujo de
  confirmación solo para un parámetro que la función no consulta
  todavía).
- **La captura de feedback en background asume hosting no-serverless**
  (`void promise.then(...)` sin `await`, sin `waitUntil()`) — funciona
  porque este proyecto corre en un contenedor Docker persistente
  (`next start`), no en una función serverless donde el proceso se
  congela nada más responder. Si el hosting cambiara algún día, esto
  dejaría de ser fiable.
- **`ai_clustering_examples.keywords` se guarda sin
  `position`/`difficulty`/`serp_features`** (quedan `null`) —
  `ClusterProposal.keywords` (lo único que recibe `captureClusteringFeedback`)
  no lleva esos campos, viven en `seo_kw_raw`. Enriquecerlo requeriría
  una consulta adicional no pedida explícitamente.
- **`embeddings_cost` sale en 0 salvo que alguien añada precios para
  los modelos de embeddings** (`voyage-3`, `text-embedding-3-small`,
  `text-embedding-004`) en la pestaña "Precios por modelo" de
  `IA & Modelos` (ya soporta añadir cualquier proveedor+modelo desde el
  Bloque 2) — no se sembró ningún precio de embeddings porque no se
  pidió explícitamente.

## Verificación interna

1. **pgvector activo**: `CREATE EXTENSION IF NOT EXISTS vector` sin
   error, `SELECT extname, extversion` confirma `vector 0.8.6`
2. **Migraciones**: ambas aplicadas sin error sobre la BD real
3. **`tsc --noEmit`**: limpio en todo el proyecto tras la integración
   completa (pipeline + refactor de gateway.ts + UI)
4. **Capa 1 (embeddings) con key real**: probada contra Voyage AI con
   la key activa de Enric — **falla con 401** (ver hallazgo crítico
   arriba). No pude probar el camino que sí funciona (OpenAI/Gemini)
   por no haber ninguna key de esos proveedores activa en este tenant
5. **Capa 2 (HDBSCAN) con 10 keywords sintéticas**: agrupa
   correctamente por tema (3 grupos: pilates/yoga/nutrición, sin mezcla
   entre temas) pero con recall parcial — 4 de las 10 keywords quedaron
   como noise pese a estar muy próximas en el espacio de embeddings
   sintético. No es un error de integración (los grupos que sí se
   formaron son correctos); es un comportamiento observado de
   `hdbscan-ts` con `min_samples: 1` que conviene vigilar con datos
   reales — puede que `min_cluster_size`/`min_samples` necesiten ajuste
   una vez se pruebe con embeddings de verdad

## Qué verificar manualmente

**No pude probar el pipeline de extremo a extremo** — bloqueado por el
hallazgo crítico de arriba (Capa 1 falla con el único proveedor activo,
Anthropic). Antes de poder verificar nada más con datos reales, hace
falta resolver de algún modo el acceso a embeddings:
- Opción rápida para probar hoy mismo: activa OpenAI como proveedor en
  `IA & Modelos` (con una key de OpenAI real) y márcalo como
  proveedor por defecto — la Capa 1 debería funcionar correctamente
  con `provider = 'openai'`
- Alternativa: decide cómo quieres resolver el caso Anthropic+Voyage a
  largo plazo (ver hallazgo arriba) antes de intentar usarlo con ese
  proveedor

Una vez haya un proveedor con embeddings funcionando, esto es lo que
conviene comprobar con un análisis real desde el paso 3 de un
proyecto:
1. Que "Analizar con IA" complete sin error (Capa 1 → 2 → 3 → 4)
2. Que los clusters devueltos tengan sentido (agrupación semántica
   razonable, no solo por coincidencia de palabras)
3. Que el monitor de uso en `/dashboard/ai/settings` muestre la
   llamada `cluster_strategic` (no `cluster_keywords`, que ya no se usa
   desde este cambio) con su coste
4. Confirmar un cluster, verificar en BD que apareció una fila en
   `ai_clustering_examples` con su embedding
5. Analizar un segundo proyecto (o el mismo de nuevo) con ≥5 ejemplos
   ya en `ai_clustering_examples` — el log/comportamiento debería
   reflejar que se usó RAG (`layers_used` incluye `'rag_feedback'`,
   visible si se inspecciona `ai_jobs.input` del job de
   `cluster_strategic`)

## Pendientes detectados

- **El hallazgo crítico de arriba** es el pendiente principal — sin
  resolverlo, el pipeline no es utilizable con la configuración actual
  del tenant.
- **DeepSeek sigue sin fallback de embeddings real** (ya anotado en el
  propio pedido como limitación conocida) — la función lanza un error
  descriptivo en vez de usar OpenAI como respaldo, porque
  `embedKeywords()` solo recibe una key (la del proveedor activo), no
  una segunda key de respaldo.
- **`min_cluster_size`/`min_samples` por defecto (2/1) pueden necesitar
  ajuste** una vez se pruebe con embeddings reales, a la vista del
  recall parcial observado en la verificación con datos sintéticos.
- **`ai_clustering_examples.serp_signals` siempre se guarda como
  `[]`** — el campo existe en el esquema con el formato que pedía el
  ticket original (`["Resultados locales", "GBP", ...]`) pero
  `captureClusteringFeedback` no tiene acceso a esos datos desde
  `ClusterProposal`.
- El resto de pendientes de sesiones anteriores (rollback de versiones
  de prompts, reintentos automáticos) siguen fuera de alcance.

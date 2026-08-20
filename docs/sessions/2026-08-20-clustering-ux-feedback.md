# Feedback UX del clustering: modificadores de intención, mover keywords y captura de feedback
**Fecha:** 2026-08-20
**Rama:** feature/clustering-ux-feedback (fusionada a `main`, rama borrada)
**Commit:** a7fce7bf (merge commit en `main`)

## Qué se construyó

- `lib/db/schema.ts` — dos tablas nuevas: `ai_intent_modifiers` (catálogo de modificadores con su efecto sobre la intención de búsqueda) y `ai_clustering_feedback` (log de acciones del usuario sobre clusters/keywords, para un futuro "panel del cerebro").
- `lib/db/migrations/0019_misty_roughhouse.sql` — `CREATE TABLE` de ambas + el `INSERT` de los 38 modificadores semilla (29 `same_intent`, 9 `different_intent`).
- `lib/ai/clustering/layers/0-intent-normalizer.ts` (nuevo) — Capa 0 del pipeline: agrupa keywords que comparten raíz + un modificador que no cambia la intención de búsqueda, y separa las que sí la cambian. Consulta `ai_intent_modifiers`; lo que no encuentra en tabla lo manda en una única llamada a la IA y lo guarda para la próxima vez.
- `lib/ai/clustering/types.ts` — tipos `ModifierDecision` y `NormalizedGroup`.
- `lib/ai/clustering/pipeline.ts` — `normalizeByIntent()` se ejecuta antes de la Capa 1 (embeddings); tras embeder, las keywords que Capa 0 agrupó bajo una raíz reciben literalmente el embedding de esa raíz, para que HDBSCAN las una siempre. `'intent_normalizer'` añadido a `layers_used`.
- `lib/seo/kw-actions.ts` — `moveKeywordBetweenClusters(keywordId, newClusterId)`: mueve la keyword, valida que el cluster destino sea del mismo proyecto, y si la keyword movida era la principal, promociona a la siguiente por volumen en el cluster de origen.
- `lib/seo/kw-feedback-actions.ts` (nuevo) — `recordClusterFeedback()`, best-effort/silenciosa, escribe en `ai_clustering_feedback`; si el feedback es `intent_changed`, intenta corregir en `ai_intent_modifiers` el modificador que distinguía las keywords del cluster (si venía de IA sin confirmar).
- `app/.../clustering/cluster-review.tsx` (paso 3) — botón "Mover →" por keyword con select a otro cluster propuesto (recalcula principal si aplica); captura feedback en: eliminar cluster, confirmar sin cambios, cambiar intención/tipo de contenido, mover keyword, desmarcar keyword.
- `app/.../clusters/cluster-card.tsx` y `clusters-board.tsx` (paso 4) — mismo botón "Mover →" contra la BD real (`moveKeywordBetweenClusters`); captura feedback en cambios de badge de intención/tipo de contenido y en mover keyword.
- **Ampliación del catálogo de `ai_intent_modifiers`**: se inyectaron 104 modificadores adicionales (`human_confirmed`, confidence 100) organizados en 11 categorías — precio/valor, calidad/reputación, contacto/localización, disponibilidad/tiempo, público específico, modalidad, contenido informacional, comparativa/decisión, sector legal/admin, urgencia específica, ecommerce/producto. Total en tabla: **142 modificadores** (38 de la semilla original + 104 nuevos). Aplicado directamente contra la BD vía `psql`, fuera del flujo de migraciones versionadas (es contenido de catálogo, no esquema).
- `CLAUDE.md` — se añadió como primera línea del archivo: `# IDIOMA: Responde siempre en español, sin excepciones.`

### Ya estaba construido — verificado, sin cambios

El pedido incluía un "bug fix" (campos estratégicos no se guardan al confirmar) y hacer los badges del paso 4 editables inline. Al revisar el código, ambas cosas **ya estaban implementadas correctamente** de una sesión anterior (rama `feature/cluster-strategy`, ya en `main`):
- `confirmAIClusters` (`lib/seo/kw-ai-actions.ts`) ya inserta los 8 campos (`destination`, `contentType`, `searchIntent`, `urlType`, `reasoning`, `strategyNote`, `isAiSuggested`, `lowVolume`) para clusters normales y sugeridos.
- `StrategyBadges` + `updateClusterStrategy` ya muestran "Sin definir" como `<select>` editable y actualizan el campo correcto por badge.

No se tocó nada de esto — solo se confirma aquí para que quede constancia de que se verificó, no que se pasó por alto.

## Migraciones aplicadas

`lib/db/migrations/0019_misty_roughhouse.sql` — `ai_intent_modifiers`, `ai_clustering_feedback` (con FKs a `tenants`, `projects`, `ai_jobs`, `seo_kw_clusters`) + el `INSERT` de los 38 modificadores semilla. SQL completo mostrado y confirmado por Enric antes de aplicar con `pnpm db:migrate`.

Nota técnica: el archivo de migración se generó con `drizzle-kit generate` (solo el DDL) y el `INSERT` se añadió a mano después — como el contenedor no tiene bind mount al repo, ese `INSERT` no llegó a ejecutarse vía `db:migrate` (drizzle solo vio la copia sin editar, ya horneada en la imagen). Se aplicó el `INSERT` directamente con `psql` para que el estado de la BD coincidiera con el archivo de migración ya corregido en el repo — si alguien re-ejecuta esta migración desde cero (BD nueva), el archivo en el repo ya es correcto y no hará falta este paso manual.

**Ampliación de 104 modificadores (fuera de archivo de migración)**: aplicada directamente con `psql` a petición de Enric, con confirmación del resultado (`SELECT COUNT(*)`). El lote incluía `'certificado'` dos veces con efectos contradictorios (`same_intent` en la categoría de calidad, `different_intent` en la de sector legal) — por `ON CONFLICT (modifier, language) DO NOTHING`, solo se insertó la primera ocurrencia (`same_intent`); la segunda se descartó en silencio. Se avisó a Enric antes de ejecutar y confirmó dejarlo así. Resultado: 104 de 105 filas insertadas, total 142 en la tabla.

## Decisiones técnicas tomadas en auto mode

- **`normalizeByIntent()` recibe `provider`/`model`/`apiKey`**, que no estaban en la firma del pedido original. Sin ellos no puede hacer la llamada a la IA que ella misma especifica para modificadores desconocidos. Usa el proveedor de CHAT (no el de embeddings) — es una clasificación de texto, mismo patrón que la Capa 4.
- **La frase de búsqueda en `ai_intent_modifiers` no se stripea de stopwords**, aunque el pedido decía "elimina stopwords ES... las palabras restantes son los modificadores". Si se aplicara literalmente, modificadores semilla como `"para ninos"` o `"cerca de mi"` nunca podrían encontrarse (quedarían reducidos a `"ninos"` o `"cerca"`, que son entradas *distintas* en la tabla). Las stopwords se usan solo para decidir si la diferencia entre dos keywords es *trivial* (todo relleno gramatical, ningún modificador real) — la frase que se busca en la tabla conserva las palabras originales, así coincide con las entradas semilla multi-palabra.
- **`recordClusterFeedback()` no acepta `tenantId` del cliente** aunque el pedido lo incluía en la firma — se deriva de forma seguro con `assertUserInProjectTenant(projectId)`, igual que el resto de Server Actions del módulo SEO. Aceptar un `tenantId` que manda el cliente sin validar habría sido confiar en un dato no fiable.
- **La corrección de `ai_intent_modifiers` al recibir `intent_changed`** no puede saber con certeza qué modificador causó el cambio (los `ai_jobs` no guardan las decisiones de la Capa 0). Se reconstruye comparando cada keyword del cluster contra su keyword principal con la misma lógica de extracción de modificadores, y se corrige cualquier modificador `ai_classified` encontrado así. Es una aproximación razonable, no una traza exacta — documentado en el código.
- **`'cluster_confirmed'` se dispara desde el cliente** (`cluster-review.tsx`, antes de llamar a `confirmAIClusters`) en vez de desde el servidor, para poder comparar contra el snapshot original (`computeFeedbackType`) sin duplicar esa lógica de comparación en el servidor.

## Qué verificar manualmente

- **Capa 0 con datos reales**: no se ha corrido un análisis de clustering de principio a fin con esta sesión (habría consumido créditos de una API real). Verificado por separado: build limpio, y el flujo de "mover keyword" + captura de feedback probado en vivo contra un proyecto con clusters ya existentes (ver abajo). Falta confirmar que la Capa 0 agrupa/separa correctamente con keywords reales y que la llamada a la IA para modificadores desconocidos devuelve JSON parseable.
- **Paso 3 (pantalla de revisión)**: el botón "Mover →" y la captura de feedback ahí (eliminar cluster, cambiar badges, desmarcar keyword) se implementaron y compilan, pero no se probaron en vivo — requiere generar una propuesta de clustering primero (llamada a IA real).
- **Paso 4 (mapa de clusters)**: probado en vivo contra el proyecto "Abando" — mover una keyword entre clusters funcionó (BD actualizada, keyword reasignada, principal no tocada porque no era la keyword principal), cambiar el badge de intención registró el feedback correctamente. Los datos de prueba se revirtieron a su estado original al terminar.
- **Corrección de `ai_intent_modifiers` vía `intent_changed`**: no se ha probado un caso donde realmente exista un modificador `ai_classified` en la tabla para corregir (la tabla solo tiene modificadores `human_confirmed` de la semilla por ahora) — la lógica está implementada pero sin caso de prueba real todavía.

## Pendientes detectados

- La Capa 0 no registra un `ai_jobs` para su llamada de clasificación de modificadores desconocidos (a diferencia de la Capa 4) — no se pidió, pero significa que ese coste no aparece en el monitor de uso de IA & Modelos.
- No hay validación de que el JSON de respuesta de `classifyUnknownModifiers` tenga exactamente las claves esperadas más allá de filtrar valores no válidos — si la IA devuelve un modificador con typos distinto al que se le pidió, ese modificador original queda sin resolver y cae en el fallback `same_intent` (documentado en el código, pero vale la pena vigilarlo si se ve mucho en producción).
- La corrección de `ai_intent_modifiers` al recibir `intent_changed` corrige TODOS los modificadores `ai_classified` que encuentre en el cluster, no solo el que realmente causó el cambio — ver la decisión técnica de arriba.

# Fix estructural del pipeline de clustering: marcas + fusión de intención
**Fecha:** 2026-08-21
**Rama:** feature/fase-d-competitors
**Commit:** 3b42c45805d0a2bd2e15ddeb05a55ce8c4321609

## Qué se construyó

- `lib/ai/clustering/layers/0b-brand-detection.ts` (nuevo) — Capa 0b del pipeline.
  Detecta keywords que son búsquedas de marca de un competidor conocido del
  proyecto (`seo_kw_competitors`), usando matching por substring sobre texto
  normalizado (sin acentos, sin espacios/guiones, mínimo 4 caracteres). Cuando
  varios competidores matchean, gana el nombre más largo. Convierte cada grupo
  detectado en un `ClusterProposal` de tipo fijo (`content_type:
  'competencia_detectada'`, `search_intent: 'navegacional'`), sin llamar al LLM.
- `lib/ai/clustering/pipeline.ts` — invoca la Capa 0b antes que cualquier otra
  capa; las keywords de marca (`brandGroups`) se sacan del flujo (`Capa 0`,
  embeddings, HDBSCAN, Capa 4) y se devuelven en un array separado
  (`ClusteringOutput.brandGroups`). `total_keywords` en el registro de
  `ai_jobs` sigue representando el lote original completo, no el que pasa por
  las capas 0-4.
- `lib/ai/clustering/layers/4-strategic-classifier.ts` — la Capa 4 gana
  autoridad de fusión: el JSON de salida usa `group_indexes: number[]` en vez
  de `group_index: number`. Nueva función `toProposalFromGroups()` combina
  keywords de varios grupos de HDBSCAN en un único cluster cuando el LLM los
  marca como la misma intención real; `low_volume` se recalcula por AND sobre
  los grupos fusionados y `primary_keyword` es la de mayor volumen mensual
  entre todas las keywords combinadas. Se mantienen intactos los límites de
  longitud (`reasoning` ≤12 palabras, `strategy_note` ≤15 palabras) del fix de
  la mañana.
- `lib/ai/clustering/types.ts` — `ClusterProposal.is_competitor_brand?`
  (marcador solo en memoria), `ClusteringInput.competitors`,
  `ClusteringOutput.brandGroups`.
- `lib/seo/kw-ai-actions.ts` — pasa `competitors` (de `getKwCompetitors`) al
  pipeline; fusiona `clusters + suggested + brandGroups` en el array que
  espera la pantalla de revisión.
- `cluster-review.tsx` (paso 3) y `clusters-board.tsx` (paso 4) — los clusters
  con `content_type === 'competencia_detectada'` se filtran fuera del grid
  principal y se muestran en una sección colapsada aparte ("Demanda de
  competidores detectada"), con solo nombre del competidor + volumen total +
  lista de keywords — sin URL destino, sin badge "Web propia", sin selector de
  dificultad, no editable ni movible entre clusters.

## Migraciones aplicadas

Ninguna migración de schema. Dos `UPDATE` sobre el prompt ya existente en
`ai_prompts` (key = `cluster_strategic`), aplicados y confirmados en la sesión
anterior (límites de longitud) y en esta sesión (`group_index` →
`group_indexes`, instrucción "FUSIÓN DE GRUPOS"). El SQL completo ya quedó
documentado en el doc de sesión del fix de max_tokens; en esta sesión solo se
verificó su efecto, no se volvió a modificar.

## Decisiones técnicas tomadas en auto mode

- **`content_type: 'competencia_detectada'` como marcador persistente**: en vez
  de añadir una columna nueva a `seo_kw_clusters`, se reutiliza `content_type`
  (varchar(30) sin CHECK constraint) como el único campo que sobrevive al
  guardado en BD para distinguir clusters de marca de clusters accionables.
  `is_competitor_brand` en `ClusterProposal` es solo un marcador en memoria
  para antes de persistir.
- **`low_volume` recalculado, no confiado al LLM**: al fusionar grupos en la
  Capa 4, `low_volume` se computa por AND sobre la señal SERP de cada grupo
  combinado en vez de pedirle al LLM que lo decida sobre el cluster fusionado
  — consistente con el patrón ya existente en el pipeline de no confiar en el
  LLM para campos derivables matemáticamente de datos reales.

## Qué verificar manualmente

- Ya verificado en esta sesión con datos reales del proyecto Abando (33
  keywords, competidores reales `Pilat3s`/`PilatesOnmove`/`BIM Pilates`):
  - 1 `brandGroup` detectado (`PilatesOnmove`), con "pilates on move" y
    "pilates onmove" en el mismo grupo (410 búsq./mes combinadas).
  - `groups_count` pasó de 33 a 31 antes de la Capa 4 (confirma que la Capa 0b
    sí retira las keywords de marca del flujo principal).
  - Fusión de las 3 keywords casi idénticas de Sant Cugat ("pilates en sant
    cugat", "pilates sant cugat", "pilates sant cugat del valles") en un único
    cluster de 1210 búsq./mes total.
  - `output_tokens = 4826`, muy por debajo del cap dinámico (9300 para 31
    grupos), sin truncamiento.
  - Sección "Demanda de competidores detectada" renderizada correctamente,
    separada del grid principal, en el paso 3.
- Pendiente de verificar por Enric: revisar el paso 4 (board) tras confirmar
  estos clusters, para confirmar que la sección de marca también se ve bien
  ahí con datos ya persistidos en BD (se verificó el componente por código,
  no en pantalla tras un guardado real).

## Pendientes detectados

- La detección de marca (Capa 0.5) solo cubre competidores registrados
  manualmente en `seo_kw_competitors` — marcas competidoras que aparecen
  orgánicamente en las keywords pero no fueron registradas (ej. "Baum
  Pilates" en este dataset) siguen clasificándose como clusters accionables
  normales en vez de informativos.

# Noise Recovery en el pipeline de clustering
**Fecha:** 2026-08-20
**Rama:** main
**Commit:** c26928a8

## Qué se construyó
- `CLAUDE.md`: aclarada la regla de nombrado de docs de sesión — ahora incluye la hora de cierre (`YYYY-MM-DD-HH-descripcion.md`), no solo la fecha.
- `lib/ai/clustering/types.ts`: `min_cluster_size` baja de `2` a `1` en `DEFAULT_PIPELINE_CONFIG`. `min_samples` sin tocar.
- `lib/ai/clustering/layers/2b-orphan-assignment.ts` (nuevo): función `assignOrphans()` — para cada keyword marcada como noise por HDBSCAN, calcula la distancia coseno a los centroides de los grupos ya formados; si la mínima es ≤ `ORPHAN_SIMILARITY_THRESHOLD` (0.35), la keyword se asigna a ese grupo. Sin IA, sin dependencias nuevas.
- `lib/ai/clustering/pipeline.ts`: integra la Capa 2b entre la Capa 2 (HDBSCAN) y la Capa 3 (señales SERP). `orphanUnassigned` sustituye a `noise` en el array final de `unassigned` del output del pipeline.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- Reparación de `.git/refs/heads/main` (corte de luz a mitad de sesión anterior dejó el puntero de la rama en ceros mientras el commit ya estaba escrito e íntegro en `.git/objects`): se restauró el ref directamente al hash registrado en el reflog (`1a950152...`), en vez de usar `git reset`/`checkout`, para no arriesgar ningún commit existente. Verificado con `git fsck --full` antes y después.
- El pedido de Noise Recovery especificaba un tipo `NormalizedKeyword` con campo `.text`; el codebase real usa `KeywordInput` con campo `.keyword` (el mismo que ya devuelve `groupByHdbscan`). Se adaptó la firma de `assignOrphans()` a los tipos reales del proyecto en vez de crear un tipo nuevo redundante.
- `ClusterGroup` ya trae `centroid_embedding` precalculado desde la Capa 2 (helper `centroid()` en `2-hdbscan.ts`). `assignOrphans()` reutiliza ese valor en vez de recalcular el centroide desde los embeddings de cada grupo, evitando duplicar lógica sin cambiar el resultado.

## Qué verificar manualmente
- Correr un análisis de clustering real sobre el proyecto de prueba (idealmente con keywords tipo "pilatistic", "bo3 sant cugat", "pilam pilates", "centre pilates laura català") y confirmar que baja el número de keywords "sin clasificar" frente al comportamiento anterior.
- Revisar visualmente los grupos rescatados por la Capa 2b — confirmar que el umbral 0.35 no está metiendo keywords irrelevantes en clusters equivocados.
- Confirmar en GitHub que `main` sigue sincronizado con `origin/main` tras el push ya realizado en esta sesión (previo a este trabajo de clustering).

## Pendientes detectados
- `ORPHAN_SIMILARITY_THRESHOLD` (0.35) es un valor inicial razonado pero no calibrado con datos reales de producción — puede necesitar ajuste tras ver resultados con clustering real.
- Los docs de sesión ya existentes en `/docs/sessions/` no llevan hora en el nombre — la regla nueva aplica solo hacia adelante, no se renombraron los archivos previos.

# Propagar la dificultad de SE Ranking a clusters y a la vista del cliente
**Fecha:** 2026-08-19
**Rama:** feature/fase-c-keyword-research
**Commit:** 7c1227b8

## Qué se construyó

Enric preguntó qué datos del CSV de SE Ranking se usan y cuáles llegan al
cliente en su área. Al revisar el código junto con él se detectó que
ninguno llegaba: los campos importados (posición, dificultad, URL,
funciones SERP) solo se mostraban en el paso 2, y se perdían al añadir la
keyword a un cluster en el paso 4 — la tabla de cluster keywords ya tenía
una columna `difficulty` en el esquema, pero nunca se rellenaba desde
ningún sitio. Enric decidió (pregunta con opciones) que de todos los
campos, solo la **dificultad** debía llegar a la vista del cliente — ni
la posición del competidor ni la URL de origen, que son datos de
investigación interna. Un único commit sustantivo (7c1227b8), en la
misma rama de Fase C.

- `lib/seo/kw-actions.ts`: `addClusterKeyword` y `updateClusterKeyword`
  ahora buscan la fila correspondiente en `seo_kw_raw` (por
  `projectId` + `keyword`, mismo criterio de coincidencia que ya usaba
  `markRawKeywordAssigned`, ahora renombrada `findRawKeywordMatch` y
  reutilizada) y copian su `seranking_difficulty` al campo `difficulty`
  ya existente en `seo_kw_cluster_keywords`
- `lib/seo/format.ts`: `keywordDifficultyLabel()` extraído como helper
  compartido (mismo criterio 0-3/4-6/7-10 → verde/amarillo/rojo que ya
  se usaba en el paso 2), para no duplicar la lógica de color en las 3
  pantallas que ahora la necesitan
- `cluster-card.tsx` (paso 4, interno): cada keyword del cluster muestra
  su badge de dificultad junto al nombre, si la tiene
- `public-cluster-card.tsx` (vista pública del cliente): la keyword
  principal (★) del cluster muestra su badge de dificultad, si la tiene

## Migraciones aplicadas

Ninguna — la columna `difficulty` de `seo_kw_cluster_keywords` ya
existía en el esquema desde antes de esta sesión, simplemente no se
usaba en ningún flujo hasta ahora.

## Decisiones técnicas tomadas en auto mode

- **Se muestra la dificultad solo en la keyword principal del cluster en
  la vista del cliente**, no en todas sus keywords: la vista pública ya
  solo mostraba la keyword principal (`★ {primary.keyword}`), no una
  lista completa como el paso 4 interno — añadir el badge ahí fue
  cambio mínimo y coherente con el diseño existente. Restructurar la
  vista pública para listar todas las keywords del cluster (y su
  dificultad individual) habría sido un cambio de diseño más grande no
  pedido.
- **No se tocó el campo de dificultad manual del cluster** (el
  desplegable fácil/media/difícil que Enric rellena a mano al crear un
  cluster, ya visible en la vista del cliente como "Dificultad: Media").
  Es una valoración cualitativa suya, distinta de la dificultad numérica
  0-10 que viene de SE Ranking por keyword — se añadió el badge nuevo
  como complemento, sin sustituir ni fusionar con el campo existente,
  para no perder esa valoración manual ni generar confusión sobre cuál
  de los dos números manda.
- **`findRawKeywordMatch` es la misma función que ya usaba
  `markRawKeywordAssigned`, refactorizada para devolver la fila
  completa** en vez de solo comprobar su existencia: antes se hacía la
  consulta a `seo_kw_raw` únicamente para marcar `assigned = true`;
  ahora la misma consulta también sirve para leer `seranking_difficulty`,
  evitando una segunda consulta a la base de datos por cada
  añadir/editar keyword de cluster.

## Qué verificar manualmente

Ya verificado por mí en la app real (proyecto "Abando", que ya tenía 33
keywords reales importadas de SE Ranking por Enric entre sesiones):
añadí una keyword de prueba a un cluster existente, confirmé el badge
de dificultad en el paso 4 y en "Ver como cliente", y revertí todo
(keyword del cluster, estado del cluster) al terminar — no debería
quedar rastro en los datos reales del proyecto. Aun así, conviene que
confirmes tú:

1. En el paso 4 de un proyecto con keywords importadas por CSV, añade
   alguna de esas keywords a un cluster y confirma que aparece su badge
   de dificultad (color) junto al nombre.
2. Marca esa keyword como principal (★) y comprueba en "Ver como
   cliente" (o compartiendo el enlace) que el badge de dificultad
   también aparece ahí, junto a la keyword principal.
3. Añade una keyword que NO venga de SE Ranking (escrita a mano) a un
   cluster y confirma que no muestra ningún badge de dificultad — no
   tiene ese dato.
4. Confirma que el campo manual "Dificultad: Fácil/Media/Difícil" del
   cluster (el que rellenas tú al crear/editar el cluster) sigue
   funcionando exactamente igual que antes, sin mezclarse con el badge
   nuevo.

## Pendientes detectados

- La posición del competidor (`seranking_position`) y la URL de origen
  (`seranking_url`) siguen sin usarse en ningún sitio más allá del
  paso 2 — Enric decidió explícitamente no llevarlas a clusters ni al
  cliente por ahora. Quedan en la base de datos por si se quieren usar
  más adelante (por ejemplo, como referencia interna al decidir a qué
  cluster asignar una keyword).

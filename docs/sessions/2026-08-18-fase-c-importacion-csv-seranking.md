# Fase C — Mejora paso 2: importación de CSV de SE Ranking
**Fecha:** 2026-08-18
**Rama:** feature/fase-c-keyword-research
**Commit:** c0bf7ba6

## Qué se construyó

Petición de Enric: en el paso 2 de Keyword Research (Extracción de
keywords), permitir importar directamente el CSV que exporta SE Ranking
desde "Investigación de la Competencia", en vez de copiar/pegar las
keywords a mano. Un único commit sustantivo (c0bf7ba6), en la misma rama
de Fase C.

- **Migración `0011_curvy_mad_thinker.sql`**: añade a `seo_kw_raw` las
  columnas `seranking_position`, `seranking_prev_position`,
  `seranking_difficulty` (int), `seranking_url` (varchar 500),
  `seranking_serp_features` (text) y `source` (varchar 20, default
  `'manual'`), más una restricción `UNIQUE(project_id, keyword)`
- `lib/seo/csv-parse.ts` (nuevo): parser CSV escrito a mano (sin
  librerías externas) que procesa el texto carácter a carácter para
  manejar correctamente campos entre comillas con comas y saltos de
  línea dentro (la columna "Funciones SERP" de SE Ranking los tiene);
  detecta la cabecera exacta de SE Ranking y mapea las filas al shape
  que espera la acción del servidor
- `lib/seo/kw-actions.ts`: nueva `importKwRawFromCSV(projectId, rows)` —
  hace upsert de cada fila vía `ON CONFLICT (project_id, keyword) DO
  UPDATE`, marca `source = 'seranking_csv'`, ignora filas sin keyword
- `lib/seo/kw-instructions.ts`: nueva nota destacada ("selecciona el
  tipo 'URL exacta', no 'Dominio'") en las instrucciones que se generan
  al completar el paso 1; exportada como `SERANKING_EXACT_URL_NOTE` para
  reutilizarla también como texto de ayuda en el paso 2
- `keywords-panel.tsx` (paso 2): botón "Importar CSV de SE Ranking" con
  input de archivo oculto (`accept=".csv"`), preview de confirmación
  antes de guardar (keyword + volumen + posición de cada fila), mensaje
  de error si el CSV no coincide con el formato esperado, y en la lista
  de "Keywords importadas": badge "SE Ranking", posición del competidor
  ("Pos. X") y badge de dificultad con color (0-3 verde/Fácil, 4-6
  amarillo/Media, 7-10 rojo/Difícil) — solo para las keywords que vienen
  de CSV, las añadidas a mano no muestran estos campos porque no los
  tienen

## Migraciones aplicadas

**0011_curvy_mad_thinker.sql** (SQL mostrado a Enric antes de aplicar,
backup previo confirmado y aplicado tras su confirmación explícita):

```sql
ALTER TABLE "seo_kw_raw" ADD COLUMN "seranking_position" integer;
ALTER TABLE "seo_kw_raw" ADD COLUMN "seranking_prev_position" integer;
ALTER TABLE "seo_kw_raw" ADD COLUMN "seranking_difficulty" integer;
ALTER TABLE "seo_kw_raw" ADD COLUMN "seranking_url" varchar(500);
ALTER TABLE "seo_kw_raw" ADD COLUMN "seranking_serp_features" text;
ALTER TABLE "seo_kw_raw" ADD COLUMN "source" varchar(20) DEFAULT 'manual' NOT NULL;
ALTER TABLE "seo_kw_raw" ADD CONSTRAINT "seo_kw_raw_project_id_keyword_unique" UNIQUE("project_id","keyword");
```

Backup previo: `backups/backup_pre_seranking_csv_20260818.sql`.

## Decisiones técnicas tomadas en auto mode

- **Se añadió `UNIQUE(project_id, keyword)`, no pedido explícitamente**:
  el encargo pedía `ON CONFLICT (project_id, keyword) DO UPDATE`, pero
  Postgres exige un índice único real sobre esas columnas para que
  `ON CONFLICT` tenga algo sobre lo que actuar — sin él, la migración ni
  siquiera se podría aplicar tal como se pedía. Antes de añadirlo se
  comprobó que no había filas duplicadas por `(project_id, keyword)` en
  la tabla real, así que no había riesgo de que la migración fallara.
- **`importKwRawFromCSV` se añadió a `lib/seo/kw-actions.ts`, no a
  `lib/seo/actions.ts`** como decía literalmente el encargo: revisé
  ambos ficheros y `lib/seo/actions.ts` es el archivo de acciones
  genéricas del núcleo del módulo SEO (progreso de etapas, onboarding,
  kickoff, auditoría) — ninguna acción específica de Keyword Research
  vive ahí. Todas las demás acciones del paso 2 (`importKwRaw`,
  `addKwRawManual`, `deleteKwRaw`...) ya viven en `kw-actions.ts`, así
  que se siguió esa misma convención en vez de crear una inconsistencia
  o forzar un import cruzado innecesario.
- **El parser CSV procesa el texto completo carácter a carácter en vez
  de hacer `split('\n')` primero**: el encargo solo pedía manejar comas
  dentro de comillas, pero un CSV real también puede tener saltos de
  línea dentro de un campo entre comillas (aunque el ejemplo de SE
  Ranking dado no los tenía). Parsear carácter a carácter maneja ambos
  casos por el mismo precio, sin coste añadido de complejidad relevante.
- **El upsert por CSV se hace con un loop de upserts individuales** (uno
  por fila), no un único INSERT masivo con múltiples VALUES: es el mismo
  patrón que ya usaban `saveKickoffAnswers` y `saveAuditFindings` en
  este mismo módulo, y el volumen esperado (top 50 keywords por
  competidor, máximo 3 competidores ≈ 150 filas) hace que la diferencia
  de rendimiento sea irrelevante frente a la simplicidad de tener un
  `set` distinto por fila (un INSERT masivo con `ON CONFLICT DO UPDATE`
  aplicaría el mismo `set` a todas las filas en conflicto del lote, no
  el de cada fila individual, sin usar SQL crudo con `excluded`).
- **La nota nueva de "URL exacta, no Dominio" no aparece en proyectos
  que ya completaron el paso 1 antes de esta sesión**: el texto de
  instrucciones se genera una única vez al completar el paso 1 y se
  guarda en `seo_kw_progress.instructions_text` — no se regenera
  dinámicamente en cada visita. Verificado en el proyecto real "Abando"
  (que ya tenía el paso 1 completado de una sesión anterior): la nota
  no aparece ahí, pero sí aparecerá en cualquier proyecto nuevo o si se
  reinicia y vuelve a completar el paso 1. No se forzó una regeneración
  retroactiva del texto guardado porque no se pidió y podría pisar
  ediciones manuales que Enric no haya hecho pero que en teoría podrían
  existir.

## Qué verificar manualmente

Ya verificado por mí en la app real (proyecto "Abando", con un CSV de
prueba que incluía comillas y comas dentro de "Funciones SERP", y un CSV
con cabecera equivocada para probar el mensaje de error) — las keywords
de prueba se borraron de la base de datos después. Aun así, conviene que
confirmes tú:

1. Exporta un CSV real desde SE Ranking (Investigación de la
   Competencia) y confirma que el botón "Importar CSV de SE Ranking" en
   `/keyword-research/keywords` lo detecta y muestra el preview
   correctamente antes de guardar.
2. Confirma que, tras importar, las keywords muestran el badge
   "SE Ranking", la posición y el color de dificultad correctos.
3. Vuelve a importar el mismo CSV (o uno con alguna keyword repetida) y
   confirma que actualiza en vez de duplicar — debe seguir mostrando el
   mismo número total de keywords, no el doble.
4. Prueba a subir un archivo que no sea un CSV de SE Ranking (por
   ejemplo, cualquier otro .csv) y confirma que aparece el mensaje de
   error sin romper nada.
5. Completa el paso 1 en un proyecto nuevo (o reinícialo en uno
   existente) y confirma que la nota de "URL exacta, no Dominio"
   aparece tanto en las instrucciones del paso 1 como encima del botón
   de importar CSV en el paso 2.

## Pendientes detectados

- Los proyectos que ya completaron el paso 1 antes de esta sesión (como
  "Abando") no verán la nueva nota de "URL exacta" en sus instrucciones
  guardadas hasta que reinicien y vuelvan a completar ese paso — ver
  explicación en "Decisiones técnicas" arriba. No es un bug, es el
  comportamiento esperado dado cómo se genera y guarda ese texto.

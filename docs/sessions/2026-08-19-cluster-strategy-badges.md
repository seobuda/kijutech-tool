# Cluster Strategy — clasificación estratégica de clusters (destino, tipo de contenido, intención)
**Fecha:** 2026-08-19
**Rama:** feature/cluster-strategy
**Commit:** cb073e5d

## Qué se construyó

Migración 0015 (SQL confirmado por Enric antes de aplicar): `seo_kw_clusters`
gana `destination`, `content_type`, `search_intent`, `strategy_note`.

**Prompt de clustering** (fila `cluster_keywords` en `ai_prompts` + fallback
en `lib/ai/prompts/cluster-keywords.ts`): añadida la regla 7
"CLASIFICACIÓN ESTRATÉGICA" tras la regla de `url_type`, con las
definiciones completas de `destination`/`content_type`/`search_intent`
y las instrucciones para `strategy_note` (2-3 frases, tono didáctico).
Formato JSON de respuesta actualizado en `clusters` y `suggested_clusters`.

**Parser** (`lib/ai/parsers/cluster-keywords.ts`): extrae los 4 campos
nuevos por cluster, `null` si el modelo no los devuelve — no rompe el
parseo por campos opcionales, tal como se pidió.

**`confirmAIClusters`** (`lib/seo/kw-ai-actions.ts`): guarda
`destination`/`contentType`/`searchIntent`/`strategyNote` en
`seo_kw_clusters` al confirmar.

**`updateClusterStrategy(clusterId, field, value)`** (nueva, en
`lib/seo/kw-actions.ts`, no en `kw-ai-actions.ts` — ver decisión técnica):
actualiza un campo de clasificación directamente en BD para la edición
inline del paso 4.

**Componente compartido `StrategyBadges`**
(`.../keyword-research/strategy-badges.tsx`, usado desde paso 3 y paso 4):
- 3 "badges-select": un `<span>` con el color/texto corto sin emoji
  (regla explícita: "sin emojis" en los badges) superpuesto por un
  `<select>` nativo transparente con las mismas opciones en texto largo
  con emoji — el emoji solo aparece en la lista desplegable, nunca en el
  badge cerrado
- Icono ⓘ en CSS puro (círculo con borde, letra "i", sin emoji) que abre
  un modal (`components/ui/dialog.tsx`, nuevo — usa la primitiva `Dialog`
  de `radix-ui`, ya instalado, sin dependencia nueva) con el
  `strategy_note` y, si la combinación `destination`+`content_type` está
  en la lista de 6 explicaciones fijas, la sección "¿Qué significa esto?"
- Metadatos de las 3 taxonomías + las 6 explicaciones fijas centralizados
  en `lib/seo/cluster-strategy-meta.ts`

**Paso 3** (`cluster-review.tsx`): `StrategyBadges` bajo el badge de
`url_type`/`reasoning`, editable en estado local (no persiste hasta
confirmar, igual que el resto de la tarjeta propuesta).

**Paso 4** (`cluster-card.tsx`): `StrategyBadges` bajo el badge de
`url_type`, cada cambio llama a `updateClusterStrategy` y persiste al
instante.

**Vista pública**: sin cambios — `public-cluster-card.tsx` no importa
`StrategyBadges` ni ningún campo de clasificación estratégica.

## Migraciones aplicadas

`lib/db/migrations/0015_complete_trauma.sql`:

```sql
ALTER TABLE "seo_kw_clusters" ADD COLUMN "destination" varchar(20);
ALTER TABLE "seo_kw_clusters" ADD COLUMN "content_type" varchar(30);
ALTER TABLE "seo_kw_clusters" ADD COLUMN "search_intent" varchar(20);
ALTER TABLE "seo_kw_clusters" ADD COLUMN "strategy_note" text;
```

Coincidía exactamente con el SQL pedido, sin correcciones.

## Decisiones técnicas tomadas en auto mode

- **`updateClusterStrategy` vive en `lib/seo/kw-actions.ts`, no en
  `lib/ai/actions.ts`.** El pedido no especificaba el archivo, y esta
  acción no tiene nada de IA — es una actualización directa de
  `seo_kw_clusters` desde una edición manual en el paso 4. La puse junto
  a `updateKwClusterStatus`/`updateClientNote`, que hacen exactamente el
  mismo tipo de operación sobre la misma tabla. Coherente con la
  decisión ya tomada (y explicada) en la sesión de Bloque 3 sobre dónde
  vive cada acción según qué tabla toca.
- **`updateClusterStrategy` devuelve `{error}|{success}` en vez de
  lanzar**, a diferencia de casi todo el resto de `kw-actions.ts` (que sí
  lanza). Es la misma razón de siempre: Next.js sustituye el mensaje de
  los `throw` de Server Actions por un texto genérico en producción, y
  este badge se edita inline sin recargar — si falla, hace falta que el
  usuario vea por qué. No toqué las demás funciones del archivo (fuera
  de alcance), solo esta, nueva.
- **Separación short/full label por campo, no solo un color.** El primer
  mensaje de Enric decía "los badges son texto con color de fondo, sin
  emojis"; el pedido completo mostraba las opciones del `<select>` con
  emoji ("🏠 Web propia"). Un `<select>` nativo no puede mostrar un texto
  distinto cuando está cerrado (el badge) que cuando está abierto (las
  opciones) — el navegador siempre muestra el texto de la opción
  seleccionada. Resuelto con dos capas: un `<span>` visual con el texto
  corto sin emoji y el color de fondo (lo único que se ve normalmente),
  y un `<select>` nativo transparente superpuesto encima que captura el
  clic y muestra sus opciones (con emoji) al abrirse. El usuario nunca ve
  el propio texto del `<select>`, solo el badge de debajo.
- **Icono ⓘ como botón HTML+CSS puro** (círculo con `border`, letra "i"),
  tal como se pidió explícitamente ("sin emoji, estilo consistente con
  los badges") — no hay ningún carácter de emoji en su implementación.
- **Modal con `radix-ui` Dialog, no una librería de modales nueva** —
  mismo criterio que `Switch` (Bloque 2) y las pestañas (Bloque 3):
  `radix-ui` ya está instalado como dependencia única que agrupa todas
  las primitivas de Radix, así que añadir `components/ui/dialog.tsx` no
  es una dependencia nueva, solo un componente más siguiendo el patrón
  shadcn ya usado en el resto de `components/ui/`.
- **Interpretación del modal cuando falta `strategy_note` o la
  combinación no está cubierta**: el pedido nombra "Título" y "Cuerpo"
  por un lado, y luego habla de "sin la sección '¿Por qué esta
  clasificación?'" como si fuera una sección con nombre propio — lectura
  algo inconsistente entre los dos párrafos del pedido. Interpreté que
  el título del modal ("¿Por qué esta clasificación?") siempre se
  muestra; el párrafo con `strategy_note` debajo solo aparece si existe;
  la sección "¿Qué significa esto?" solo aparece si la combinación está
  en la lista de 6; y añadí un mensaje de reserva ("Sin información
  adicional para esta combinación todavía.") para el caso borde en que
  ninguna de las dos aplique, para que el modal nunca quede vacío.

## Qué verificar manualmente

**Ya verificado por mí en el navegador real**, y con una ventaja sobre
sesiones anteriores: mientras trabajaba, Enric ya había activado una API
key real de Anthropic y ejecutado "Analizar con IA" varias veces sobre
Abando (visible en `ai_jobs`: 3 llamadas `cluster_keywords` completadas
hoy). Eso me permitió probar con datos reales de verdad, no solo con el
camino de error:

1. Los 3 badges "Sin definir" (gris) + icono ⓘ aparecen correctamente en
   clusters ya existentes sin clasificar
2. El modal ⓘ abre con el mensaje de reserva cuando no hay `strategy_note`
   ni combinación cubierta
3. Cambiar "Destino" a "Web propia" y "Tipo de contenido" a "Landing
   local" en el paso 4 — los badges se recolorean al instante (gris
   oscuro / teal, tal como está especificado) y persisten tras recargar
   la página (confirmado también por consulta directa a la base de
   datos: `destination = 'own_site'`, `content_type = 'landing_local'`)
4. `tsc --noEmit` y build de Docker limpios

**Pendiente de tu verificación** (no lo probé yo, por no interferir con
tu sesión en curso sobre el mismo proyecto):
1. Que un nuevo "Analizar con IA" (ejecutado después de esta sesión, con
   el prompt ya actualizado) devuelva clusters con `destination`/
   `content_type`/`search_intent`/`strategy_note` rellenos — los 3
   análisis que ya corriste hoy son anteriores a que yo actualizara el
   prompt en BD con la regla de clasificación estratégica, así que sus
   clusters no tienen estos campos todavía (los vi vacíos al consultar
   la base de datos)
2. Que el modal ⓘ muestre correctamente el `strategy_note` real generado
   por la IA, y la sección "¿Qué significa esto?" para alguna de las 6
   combinaciones cubiertas (por ejemplo `own_site` + `articulo_pilar`)
3. Que los badges sean editables también en la pantalla de revisión del
   paso 3 (no solo en el paso 4), antes de confirmar los clusters
4. Vista pública ("Ver como cliente") con al menos un cluster en estado
   "Activo" o "Completado" — confirmar que no aparece ningún badge de
   clasificación ni el icono ⓘ (ahora mismo todos los clusters de Abando
   están "Pendiente", así que la vista pública no muestra ninguno todavía
   y no pude verlo con datos reales)

## Pendientes detectados

- Los 6 clusters ya marcados `is_ai_suggested = true` en Abando (de
  análisis anteriores a este cambio) no tienen `destination`/
  `content_type`/`search_intent` — quedarán como "Sin definir" hasta que
  se re-analicen o se editen a mano en el paso 4. No es un bug, es
  esperable dado que el prompt no pedía estos campos cuando se generaron.
- El resto de pendientes de sesiones anteriores (rollback de versiones de
  prompts, reintentos automáticos, timeout sin cancelar el `fetch`) sigue
  igual de fuera de alcance.

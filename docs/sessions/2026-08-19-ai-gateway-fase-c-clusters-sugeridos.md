# AI Gateway — Fase C: clusters sugeridos por IA + parser actualizado + UI diferenciada
**Fecha:** 2026-08-19
**Rama:** feature/ai-gateway
**Commit:** 7bab304e

## Qué se construyó

Migración 0014 (SQL confirmado por Enric antes de aplicar):
`seo_kw_clusters` gana `url_type`, `is_ai_suggested`, `reasoning`,
`low_volume`; `seo_kw_cluster_keywords` gana `pending_verification`.

**Parser (`lib/ai/parsers/cluster-keywords.ts`, reescrito):** ahora
espera `clusters` + `suggested_clusters` + `unassigned`/`irrelevant`
como objetos `{keyword, reason}`. Los `suggested_clusters` se
fusionan en el array `clusters` de salida marcados con
`is_ai_suggested: true`, forzando `monthly_volume: null` y
`pending_verification: true` en sus keywords independientemente de lo
que devuelva el modelo (no es algo que el modelo deba decidir). El
campo `unassigned` sigue aceptando strings sueltos por compatibilidad
con respuestas del prompt anterior (se convierten a
`{keyword, reason: ''}`); `irrelevant` es un campo nuevo sin ese
requisito de compatibilidad. Se mantiene la detección de fences
` ```json `.

**Prompt (`lib/ai/prompts/cluster-keywords.ts` + fila `ai_prompts`
en BD, ver más abajo):** ampliado para pedir `url_type`, `low_volume`,
`reasoning` por cluster, `suggested_clusters` y el nuevo formato de
objeto para `unassigned`/`irrelevant`.

**`analyzeKeywordsWithAI`** (`lib/seo/kw-ai-actions.ts`) devuelve
ahora también `irrelevant`. **`confirmAIClusters`** guarda
`urlType`/`isAiSuggested`/`reasoning`/`lowVolume` en
`seo_kw_clusters` y `pendingVerification` en
`seo_kw_cluster_keywords`.

**Pantalla de revisión (`cluster-review.tsx`):** clusters reales con
badge de `url_type` (5 colores) + badge amarillo "Volumen bajo" si
aplica + `reasoning` en texto gris; clusters sugeridos con fondo
`bg-yellow-50`/borde amarillo y badge "✨ Sugerido por IA · Verificar
volumen"; keywords con `pending_verification` muestran "—/mes" con
tooltip. Botón "Copiar keywords sugeridas para SE Ranking" (solo si
hay clusters sugeridos) con confirmación inline (no hay librería de
toasts en el proyecto — mismo patrón "texto que aparece y desaparece"
ya usado en `ClusteringPanel`/`ClustersBoard` para "Copiado"). Sección
"Keywords descartadas por la IA" colapsada por defecto, solo
informativa.

**Paso 4 (`cluster-card.tsx`) y vista pública
(`public-cluster-card.tsx`):** badge de `url_type` bajo el título en
ambas; badge "✨ IA" solo en la vista interna (junto al menú "⋮", no
superpuesto); keywords con `pending_verification` muestran "—/mes ⚠️"
con tooltip solo en la vista interna. La vista pública nunca muestra
el badge IA ni el aviso de verificación, tal como se pidió.

Helper compartido nuevo: `URL_TYPE_META`/`urlTypeLabel()` en
`lib/seo/format.ts`, reutilizado por revisión, paso 4 y vista pública
para que los 5 colores sean exactamente los mismos en las tres
pantallas.

## Migraciones aplicadas

`lib/db/migrations/0014_nice_slipstream.sql`:

```sql
ALTER TABLE "seo_kw_cluster_keywords" ADD COLUMN "pending_verification" boolean DEFAULT false NOT NULL;
ALTER TABLE "seo_kw_clusters" ADD COLUMN "url_type" varchar(50);
ALTER TABLE "seo_kw_clusters" ADD COLUMN "is_ai_suggested" boolean DEFAULT false NOT NULL;
ALTER TABLE "seo_kw_clusters" ADD COLUMN "reasoning" text;
ALTER TABLE "seo_kw_clusters" ADD COLUMN "low_volume" boolean DEFAULT false NOT NULL;
```

Coincidía exactamente con el SQL pedido, sin correcciones.

## Decisiones técnicas tomadas en auto mode

- **Actualicé el contenido real del prompt (fallback en código +
  fila `ai_prompts` en BD), sin que el pedido lo mencionara
  explícitamente.** El pedido solo hablaba de actualizar el parser,
  la action y la UI para *consumir* `suggested_clusters`/`irrelevant`/
  `url_type` — pero si el texto que se envía a la IA seguía pidiendo
  el formato antiguo, ningún modelo iba a devolver esos campos nunca,
  y toda la UI nueva (clusters sugeridos, sección de irrelevantes)
  se habría quedado sin datos que mostrar. Sin este cambio, la
  verificación en navegador pedida ("la pantalla de revisión muestra
  clusters reales y sugeridos con diseños distintos") habría sido
  imposible de cumplir con una key real. Actualicé:
  1. El fallback hardcodeado en `lib/ai/prompts/cluster-keywords.ts`
     (usado solo si no hay fila activa en `ai_prompts`)
  2. La fila `cluster_keywords` de `ai_prompts` en la base de datos
     real, vía `UPDATE` directo (no es una migración de esquema, es
     contenido — igual que el resto de columnas de esa tabla, se
     edita con SQL o desde el panel, no con `drizzle-kit`).
     Incrementé `version` manualmente al hacerlo, igual que hace
     `saveAiPrompt()`, para que el historial de versión sea coherente
     si alguien lo revisa desde el editor
- **`unassigned` acepta strings sueltos (compatibilidad), `irrelevant`
  no** — el pedido lo especifica así explícitamente para `unassigned`
  ("compatibilidad con respuestas del prompt anterior") y no lo pide
  para `irrelevant` (campo nuevo, sin prompt anterior con el que ser
  compatible). Lo respeté literal en vez de generalizar ambos por
  consistencia — no había ningún prompt viejo que devolviera
  `irrelevant` como strings.
- **El badge "✨ IA" del paso 4 no va en la esquina absoluta
  superior-derecha de la tarjeta** como decía el pedido literalmente,
  porque ahí ya vive el botón del menú "⋮" (`DropdownMenuTrigger`) —
  superponerlos habría hecho que ambos fueran difíciles de pulsar.
  Lo coloqué en el mismo grupo flex, inmediatamente a la izquierda del
  "⋮", visualmente en la misma zona superior-derecha sin taparlo.
- **La confirmación de "Copiar keywords sugeridas" es un texto que
  aparece 4s bajo el botón, no un toast real** — no hay ninguna
  librería de notificaciones instalada en el proyecto y añadir una
  nueva dependencia requiere aprobación explícita según CLAUDE.md.
  Reutilicé el patrón que ya existe en `ClusteringPanel.handleCopy`
  (botón que cambia a "Copiado" un momento) y `ClustersBoard`, así que
  es consistente con el resto de la app, no una solución nueva.

## Qué verificar manualmente

**Ya verificado por mí en el navegador real** (sin API key activa,
sigue siendo el mismo bloqueo que en el Bloque 3):
1. `tsc --noEmit` limpio y build de Docker limpio con todos los
   cambios
2. Paso 4 de Abando — la tarjeta del cluster manual existente
   ("Pilates en Sant Cugat") se sigue viendo exactamente igual que
   antes de este cambio (sin badge de `url_type` ni "✨ IA", como
   corresponde a un cluster sin esos campos) — confirma que el nuevo
   código no rompe clusters ya creados manualmente, antes de esta fase
3. Editor de prompt `cluster_keywords` — el contenido actualizado
   (con `url_type`, `suggested_clusters`, `irrelevant`) se ve
   correctamente en el textarea, versión incrementada a 5

**Pendiente de tu verificación — sigue bloqueado sin una API key
real** (mismo motivo que en el Bloque 3: no puedo introducir una key
yo mismo). En cuanto actives una, esto es lo nuevo de esta fase que
falta comprobar en el paso 3 de un proyecto con keywords reales:
1. "Analizar con IA" devuelve clusters reales (fondo azul claro, badge
   de `url_type`, badge amarillo si `low_volume`, `reasoning` en gris)
   y clusters sugeridos (fondo amarillo, badge "✨ Sugerido por IA ·
   Verificar volumen", keywords en "—/mes")
2. Botón "Copiar keywords sugeridas para SE Ranking" — solo aparece
   si hay clusters sugeridos, copia una keyword por línea, muestra el
   mensaje de confirmación
3. Sección "Keywords descartadas por la IA" al final — colapsada por
   defecto, se expande con el toggle, solo informativa
4. Confirmar los clusters (reales + algún sugerido) y comprobar en el
   paso 4: badge de `url_type` visible, badge "✨ IA" solo en los que
   eran sugeridos, keywords con volumen pendiente mostrando "—/mes ⚠️"
5. "Ver como cliente" — el cluster sugerido ya confirmado se ve igual
   que uno real (con su badge de `url_type`, eso sí visible), pero
   **sin** el badge "✨ IA" ni el aviso de volumen pendiente

## Pendientes detectados

- **Verificación end-to-end completa con una key real** (ver arriba)
  — sigue siendo, ahora por segunda vez, el pendiente principal de
  esta rama.
- El resto de pendientes ya señalados en las sesiones de Bloque 1-3
  (rollback de versiones de prompts, reintentos automáticos, timeout
  sin cancelar el `fetch`) siguen igual de fuera de alcance.

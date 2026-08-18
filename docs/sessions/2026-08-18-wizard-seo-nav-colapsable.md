# Mejoras de layout del wizard SEO — nav colapsable y sub-etapas anidadas
**Fecha:** 2026-08-18
**Rama:** feature/fase-c-keyword-research
**Commit:** c3725f46

## Qué se construyó

Petición de Enric: reducir el wizard SEO de 4 columnas a 2, eliminando la
columna propia de pasos de Keyword Research y fusionándola como sub-items
anidados en el nav principal de etapas; y añadir un botón para colapsar
ese nav a solo iconos. Cambio de UI puro, un único commit sustantivo
(c3725f46), en la misma rama de Fase C.

- `app/(dashboard)/dashboard/projects/[projectId]/seo/seo-wizard-nav.tsx`: reescrito.
  Añade estado colapsado (props `collapsed`/`onToggleCollapse`), modo icono-solo con
  tooltips por etapa, botón de colapsar/expandir (`ChevronLeft`/`ChevronRight`) al pie
  del nav, y un nuevo subcomponente `KwSubSteps` que renderiza los 4 pasos de Keyword
  Research anidados bajo esa etapa (con línea vertical, indentación, sin icono ⓘ,
  y el mismo bloqueo por requisitos que tenía antes)
- `app/(dashboard)/dashboard/projects/[projectId]/seo/seo-wizard-shell.tsx`: reescrito.
  Gestiona el estado `collapsed` y su persistencia en `localStorage`
  (`seo-wizard-nav-collapsed`); ya no oculta el asistente por ser Keyword Research
  (`hasOwnNestedAssistant` eliminado) sino que lo oculta cuando el nav está colapsado;
  ancho de la columna del nav ahora anima entre `lg:w-72` y `lg:w-12`
- `app/(dashboard)/dashboard/projects/[projectId]/seo/layout.tsx`: ahora también trae
  el progreso de Keyword Research y los conteos de competidores/keywords en bruto
  (antes solo se pedían dentro de `keyword-research/layout.tsx`), para que el nav
  principal pueda calcular qué sub-pasos están bloqueados
- Eliminados por completo: `keyword-research/kw-wizard-shell.tsx`,
  `keyword-research/kw-steps-nav.tsx`, `keyword-research/layout.tsx` — su
  funcionalidad quedó absorbida por el nav principal

## Migraciones aplicadas

Ninguna — cambio de UI puro, sin tocar `lib/db/schema.ts`.

## Decisiones técnicas tomadas en auto mode

- **Se conservó el bloqueo de sub-pasos por requisitos previos** (necesita 3
  competidores para desbloquear "Extracción de keywords", 10 keywords para
  "Clustering con IA", clustering completado para "Mapa de clusters"): el encargo
  decía "cambio de UI puro" y no mencionaba tocar esa lógica, así que se trasladó
  tal cual desde el antiguo `KwStepsNav` en vez de eliminarla al fusionar los
  sub-items en el nav principal.
- **Los datos de Keyword Research (progreso, nº de competidores, nº de keywords en
  bruto) se mueven al layout raíz del wizard SEO** (`seo/layout.tsx`), que antes solo
  los pedía `keyword-research/layout.tsx` cuando el usuario estaba dentro de esa
  etapa. Ahora se piden en todas las páginas del wizard SEO (onboarding, kickoff,
  etc.) porque el nav principal necesita saber si hay sub-pasos bloqueados
  independientemente de en qué etapa esté el usuario. Son consultas pequeñas
  (conteos), coste marginal aceptable frente a mantener el mecanismo simple sin
  rutas API nuevas.
- **Mecanismo de sub-etapas hecho a medida para Keyword Research**, no un sistema
  genérico de plugins: el encargo menciona que en el futuro habrá más etapas con
  sub-pasos (Estrategia, Ejecución), pero como hoy solo existe una, se dejó una
  constante `STAGES_WITH_SUBSTEPS` y un `if (stage.key === 'keyword_research')`
  explícito — fácil de extender cuando llegue la siguiente etapa, sin construir
  antes de tiempo una abstracción que no se necesita todavía.
- **El colapsado por defecto es expandido** y solo cambia tras leer `localStorage`
  en un `useEffect` (no en el render inicial, para evitar acceder a `window` durante
  el renderizado en servidor) — esto implica un pequeño parpadeo de expandido a
  colapsado en la primera carga si el usuario lo dejó colapsado en una sesión
  anterior; se aceptó como patrón estándar de persistencia en `localStorage` en vez
  de complicar el componente con lógica adicional para evitarlo.

## Qué verificar manualmente

1. Entra en un proyecto con progreso en varias etapas SEO y confirma que el nav
   con sub-items funciona en las etapas sin sub-pasos (onboarding, kickoff, audit)
   y que Keyword Research muestra sus 4 sub-pasos anidados solo cuando esa etapa
   está activa (al navegar a otra etapa, los sub-pasos deben colapsarse).
2. Pulsa el botón de colapsar (chevron, al pie del nav) → el contenido de la etapa
   debe expandirse para ocupar el ancho liberado, y el asistente Kijutech debe
   desaparecer.
3. Pulsa expandir → vuelve al estado anterior sin saltos raros, asistente visible
   de nuevo.
4. Con el nav colapsado, pasa el cursor sobre cada icono de etapa y confirma que
   aparece el tooltip con el nombre de la etapa.
5. Navega entre los pasos de Keyword Research haciendo click en los sub-items
   (1. Análisis de competidores, 2. Extracción de keywords, etc.) y confirma que
   los bloqueados (por no cumplir requisitos previos) siguen sin ser clicables.
6. Recarga la página con el nav colapsado → debe seguir colapsado
   (persistencia en `localStorage`).
7. Redimensiona la ventana a un ancho de móvil y confirma que el nav (colapsado o
   expandido) no rompe el layout ni provoca scroll horizontal.

## Pendientes detectados

- No se hizo una verificación visual en navegador real dentro de esta sesión
  (requiere sesión autenticada; Claude no tiene credenciales de Enric ni las debe
  generar tocando `lib/auth/`). Se verificó `docker compose up --build` con build
  limpio, `next build` sin errores de tipos, y grep de referencias rotas a los
  componentes eliminados — pero la lista de verificación manual de arriba queda
  pendiente de que Enric la revise en el navegador.

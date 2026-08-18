# Mover el asistente Kijutech a columna derecha fija con scroll sticky
**Fecha:** 2026-08-18
**Rama:** feature/fase-c-keyword-research
**Commit:** c4c6ff32

## Qué se construyó

Petición de Enric: el wizard SEO pasa de un layout de nav+contenido a
tres columnas, sacando el asistente Kijutech del nav de etapas y
poniéndolo en una columna derecha fija de 280px con `position: sticky`,
para que se mantenga visible al hacer scroll en formularios largos
(kickoff, radiografía). Cambio de CSS/layout puro, un único commit
sustantivo (c4c6ff32), en la misma rama de Fase C.

- `app/(dashboard)/dashboard/projects/[projectId]/seo/seo-wizard-shell.tsx`:
  el contenedor flex pasa de 2 a 3 hijos — nav de etapas (220px/48px,
  sin cambios), contenido (`flex-1 min-w-0`, sin cambios) y una nueva
  columna del asistente (`w-[280px] shrink-0`, `border-l` para
  separación visual, `hidden md:block` para ocultarse en móvil,
  `lg:sticky lg:top-6 lg:h-fit lg:max-h-[calc(100vh-48px)]
  lg:overflow-y-auto` para el scroll sticky). El asistente ya no se
  oculta cuando el nav de etapas está colapsado — antes vivía dentro de
  esa columna y desaparecía con ella
- `app/(dashboard)/dashboard/projects/[projectId]/seo/seo-assistant-panel.tsx`:
  se quitó el `border-t pt-4` del contenedor raíz — ese borde superior
  tenía sentido cuando el asistente aparecía justo debajo del nav de
  etapas en la misma columna; ahora vive en su propia columna con
  separación por `border-l`, así que ese borde interno sobraba

## Migraciones aplicadas

Ninguna — cambio de CSS/layout puro.

## Decisiones técnicas tomadas en auto mode

- **La visibilidad del asistente usa el breakpoint `md` (768px) tal como
  pedía el encargo, pero el cambio a layout de fila (nav+contenido+
  asistente en horizontal) sigue ocurriendo en `lg` (1024px)**, igual que
  ya hacía el nav de etapas antes de esta sesión. Esto significa que
  entre 768px y 1023px el asistente es visible pero apilado a ancho
  completo (no en columna lateral, porque el contenedor entero sigue en
  `flex-col` hasta `lg`), y el `sticky` tampoco se activa hasta `lg`
  (sería incoherente tenerlo sticky en mitad de una pila vertical). Se
  mantuvo así por consistencia con el nav de etapas, que ya usaba `lg`
  como único punto de corte a ancho completo/columnas — cambiar solo el
  breakpoint del asistente a `md` habría creado una columna sin nav a su
  lado (el nav seguiría apilado arriba), un layout roto a medio camino.
- **Se quitó el `border-t pt-4` interno del `SeoAssistantPanel`** en vez
  de dejarlo: antes de este cambio, el asistente compartía columna con
  el nav (`SeoWizardNav`) y ese borde superior lo separaba visualmente
  del nav justo encima. Ahora el asistente vive solo en su propia
  columna (separada del contenido por el `border-l` del contenedor
  nuevo), así que ese borde interno ya no tenía nada que separar y
  habría dejado una línea horizontal huérfana en la parte superior de la
  columna.

## Qué verificar manualmente

1. Entra en cualquier etapa del wizard SEO (Onboarding, Kickoff,
   Radiografía, Keyword Research) y confirma que el asistente aparece
   en una columna fija a la derecha, separada por una línea vertical
   sutil del contenido.
2. En una etapa con contenido largo (Kickoff con sus preguntas, o
   Radiografía con los 26 checkpoints), haz scroll hacia abajo y
   confirma que el asistente se queda visible en pantalla (sticky) en
   vez de desaparecer hacia arriba.
3. Colapsa el nav de etapas SEO (botón de chevron) y confirma que el
   asistente sigue visible en su columna derecha — ya no depende de que
   el nav esté expandido.
4. En el Paso 4 de Keyword Research (mapa de clusters), confirma que el
   grid de tarjetas usa el ancho de la columna central y el asistente
   queda a la derecha sin solaparse.
5. Reduce el ancho de la ventana por debajo de 768px y confirma que el
   asistente desaparece (no hay dos columnas en móvil).
6. Entre 768px y 1023px (una tablet, por ejemplo), el asistente será
   visible pero apilado debajo del contenido a ancho completo, no en
   columna lateral — es el comportamiento esperado según la decisión
   documentada arriba; avísame si prefieres que desaparezca también en
   ese rango en vez de apilarse.

## Pendientes detectados

Ninguno nuevo.

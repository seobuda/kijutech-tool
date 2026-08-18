# Fix: el asistente Kijutech no seguía el scroll (sticky roto)
**Fecha:** 2026-08-18
**Rama:** feature/fase-c-keyword-research
**Commit:** 11e59d5e

## Qué se construyó

Enric reportó que, tras la sesión anterior (asistente movido a columna
derecha con `position: sticky`), al hacer scroll en una sección larga el
asistente no seguía — se quedaba atrás y desaparecía de la pantalla. Un
único commit sustantivo (11e59d5e), en la misma rama de Fase C.

- `app/(dashboard)/dashboard/layout.tsx`: quitado `overflow-hidden` del
  `<div>` que envuelve el sidebar y el `<main>`, y quitado `overflow-y-auto`
  del propio `<main>`

## Migraciones aplicadas

Ninguna — fix de CSS puro.

## Decisiones técnicas tomadas en auto mode

- **Diagnóstico con repro aislado en vez de prueba-y-error sobre la app
  real**: antes de tocar código, se construyó un HTML mínimo (Tailwind vía
  CDN, fuera del repo, en el scratchpad) replicando exactamente la
  estructura de `dashboard/layout.tsx` + `seo-wizard-shell.tsx`, servido en
  `http://127.0.0.1:8917` y abierto con la herramienta de automatización de
  Chrome. Se fue quitando una clase de overflow cada vez y comprobando con
  scroll real si el sticky empezaba a funcionar, hasta aislar que hacían
  falta AMBOS cambios (el `overflow-hidden` del wrapper Y el
  `overflow-y-auto` de `main`) — quitar solo uno de los dos no bastaba.
  Esto evitó tocar el layout de todo el dashboard a ciegas.
- **Causa raíz — un problema de CSS bastante no obvio**: `dashboard/layout.tsx`
  tenía `overflow-hidden` en el wrapper de sidebar+main y `overflow-y-auto`
  en `main`, con la intención (típica de un "app shell") de que `main`
  hiciera scroll interno mientras el sidebar quedaba fijo. Pero `<body>`
  solo tiene `min-h-[100dvh]` (un mínimo, no una altura fija), así que en la
  práctica el documento entero crece con el contenido y es la **ventana**
  la que hace scroll, no `main` (confirmado con JS: `main.scrollTop` se
  queda siempre en 0). El problema es que, por especificación CSS, cualquier
  valor de `overflow` distinto de `visible` — aunque nunca llegue a activar
  un scroll interno real — convierte igualmente a ese elemento en un
  "contenedor de scroll" formal, y `position: sticky` calcula su posición
  relativa a ese contenedor (que nunca se mueve) en vez de relativa a la
  ventana (que es la que realmente se desplaza). Resultado: los elementos
  sticky quedaban visualmente estáticos, atrapados en un contenedor de
  referencia que nunca se movía, mientras la ventana los arrastraba fuera
  de la pantalla al hacer scroll. Esto no solo afectaba al asistente —
  también rompía el nav de etapas SEO, que Enric no había reportado
  probablemente porque su contenido es corto y no invita a hacer scroll
  para notarlo.
- **Se probó una alternativa más conservadora antes de esta** (mantener el
  recorte horizontal del sidebar móvil con `overflow-x-hidden` en vez de
  quitar el overflow del todo) **y se descartó**: por otra regla de la spec
  CSS, si un eje (`overflow-x`) es distinto de `visible` y el otro
  (`overflow-y`) se deja en `visible`, el navegador convierte
  automáticamente ese segundo eje a `auto` — así que `overflow-x-hidden`
  solo habría vuelto a crear el mismo contenedor de scroll fantasma en el
  eje vertical. Se comprobó en el repro que el problema persistía con ese
  approach, así que se descartó a favor de quitar el overflow por completo.
- **Se verificó que quitar `overflow-hidden` no introduce scroll horizontal
  en móvil**: el `<aside>` del sidebar usa `display:none` (clase `hidden`)
  cuando está cerrado en pantallas pequeñas, no una posición fuera de
  pantalla vía `transform` con el elemento aún en el flujo — así que no
  hay contenido "invisible pero presente" que pueda generar overflow
  horizontal. Se confirmó con el navegador redimensionado a 390px de ancho,
  tanto con el menú cerrado como abierto, sin scroll horizontal en ningún
  caso.
- **Verificación final en la app real, no solo en el repro aislado**: como
  ya había una sesión de Enric activa en su Chrome, se pudo entrar
  directamente a `/dashboard/projects/.../seo/audit` (Radiografía Inicial,
  formulario largo con ~26 checkpoints) y confirmar haciendo scroll real
  que tanto el nav de etapas como el asistente ahora se quedan fijos en
  pantalla correctamente.

## Qué verificar manualmente

1. Entra en cualquier proyecto → Radiografía Inicial (o Kickoff) y haz
   scroll hacia abajo — el asistente Kijutech y el nav de etapas SEO deben
   quedarse visibles en pantalla en vez de desaparecer hacia arriba (ya
   verificado por mí en este mismo entorno, pero conviene que lo confirmes
   tú también).
2. Repite la prueba en el mapa de clusters (Paso 4 de Keyword Research) con
   varios clusters, para confirmar que el sticky también funciona ahí.
3. Redimensiona la ventana a un ancho de móvil (~390px), abre y cierra el
   menú hamburguesa del sidebar principal, y confirma que no aparece scroll
   horizontal ni un salto raro en el layout (ya verificado por mí, pero
   agradezco una segunda confirmación tuya con el dispositivo/navegador
   real que uses).
4. Revisa alguna pantalla larga fuera del wizard SEO (por ejemplo, si
   `/dashboard/activity` tiene muchas entradas) para confirmar que quitar
   `overflow-y-auto` de `main` no rompe nada allí — no debería, porque el
   scroll de la ventana sustituye exactamente al scroll interno que tenía
   `main` (que, como se explica arriba, nunca llegaba a activarse de
   todas formas).

## Pendientes detectados

Ninguno nuevo — el bug reportado por Enric queda resuelto, y de paso se
corrigió el mismo problema (no reportado) en el nav de etapas SEO.

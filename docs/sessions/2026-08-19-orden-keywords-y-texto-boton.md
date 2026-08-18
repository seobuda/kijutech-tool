# Dos ajustes rápidos en Keyword Research — paso 2
**Fecha:** 2026-08-19
**Rama:** feature/fase-c-keyword-research
**Commit:** 1762f10e

## Qué se construyó

Dos ajustes menores de UI pedidos por Enric en el paso 2 de Keyword
Research. Un único commit sustantivo (1762f10e), en la misma rama de
Fase C.

- `keywords-panel.tsx` (paso 2): la lista de "Keywords importadas" ahora
  se ordena por volumen de búsqueda descendente; en empate, por
  posición del competidor ascendente; las keywords sin volumen van al
  final. Se implementó como un `useMemo` que ordena una copia del
  array para pintar (`sortedKeywords`), sin tocar el orden real de
  `rawKeywords` en el estado (el que usan `assignedCount`, el merge de
  CSV, etc.)
- `keywords-panel.tsx`, `competitors-panel.tsx`, `clustering-panel.tsx`,
  `clusters-board.tsx`: el botón naranja de completar paso mostraba
  "Paso completado" una vez marcado como hecho, en vez de mantener
  "Marcar paso como completado" — se corrigió en los 4 pasos de
  Keyword Research (el encargo solo mencionaba el paso 2, pero pedía
  comprobar los otros tres; el mismo texto inconsistente aparecía en
  los 4, así que se corrigieron todos a la vez)

## Migraciones aplicadas

Ninguna.

## Decisiones técnicas tomadas en auto mode

- **El botón ahora dice siempre "Marcar paso como completado", incluso
  ya completado** (solo cambia el icono, que pasa a check): el encargo
  pedía literalmente cambiar el texto "Paso completado" por "Marcar
  paso como completado" para que coincida con "el texto que usan los
  botones equivalentes en las otras etapas". Al revisar Onboarding,
  Kickoff y Radiografía, esos botones en realidad siguen el mismo
  patrón de dos estados que Keyword Research (muestran "Etapa
  completada" una vez hecho, "Marcar etapa como completada" antes) —
  la única diferencia real era la palabra "etapa" vs. "paso", ya
  correcta y con sentido (Keyword Research tiene sub-pasos, las otras
  son etapas completas). Aun así, se siguió la instrucción tal cual se
  pidió — texto único "Marcar paso como completado" en las 4 variantes
  de Keyword Research — priorizando la petición explícita del literal
  del texto sobre mi lectura de cuál era la intención subyacente.
- **El orden es solo de presentación**, no reordena el array en el
  estado de React ni en la base de datos: mantener el orden de
  inserción original en `rawKeywords` evita romper otras lógicas que
  dependen de ese array (conteo de asignadas, el merge tras importar
  CSV) — ordenar solo afecta a qué se pinta en pantalla.

## Qué verificar manualmente

Ya verificado por mí en la app real (proyecto "Abando", con sus 33
keywords reales importadas de SE Ranking): confirmé visualmente el
orden por volumen descendente con empates resueltos por posición
ascendente, y que el botón de completar paso 2 (ya completado) muestra
"Marcar paso como completado" con el icono de check. Aun así, conviene
que confirmes tú:

1. En el paso 2, añade a mano una keyword sin volumen y comprueba que
   queda al final de la lista, después de todas las que sí tienen
   volumen.
2. Revisa los pasos 1, 3 y 4 de Keyword Research y confirma que el
   botón naranja de completar, una vez marcado, dice "Marcar paso como
   completado" (con el check) en los cuatro.

## Pendientes detectados

Ninguno nuevo.

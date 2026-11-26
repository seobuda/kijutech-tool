# SEO parte 1, tanda 1: técnico completo
**Fecha:** 2026-11-26  
**Rama:** feature/seo-parte1  
**Commit:** 395929bd

## Qué se construyó
- `lib/seo/salud/audit-rules-tecnico.ts` (nuevo), con reglas puras:
  - `redirectLoops`: bucles de redirección;
  - `genericAnchors`: páginas enlazadas casi siempre con «leer más» o «aquí», en español, catalán e inglés;
  - `hreflangIssues`: código no válido, sin vuelta o hacia una página rota;
  - `langMissing`: páginas sin idioma declarado;
  - `pageRegressions`: páginas que antes eran indexables y ahora dan error o noindex. Es un estado y solo se juzgan las páginas que se han vuelto a pedir.
- `lib/seo/salud/audit.ts`: conecta esas reglas, con los enlaces agrupados por destino y texto, y el rastreo anterior (solo las columnas necesarias).
- `lib/core/capabilities.ts`: `SpeedSource.lab` y el tipo `SpeedLab`.
- `lib/agentes/integrations.ts` y `register.ts`: `pageSpeedLab` (PageSpeed Insights, móvil) y `summarizeLighthouse`, que lee las auditorías antiguas y los «insights» nuevos.
- `lib/seo/vigilancia/rules.ts` y `vigilancia.ts`: laboratorio de hasta 5 páginas representativas dentro de `seo.velocidad`, con `labFindings`, `representativeUrls` y `labSyncSet`. El tiempo máximo pasa a 10 min, con latido.
- `lib/seo/salud/kinds.ts`: 11 tipos nuevos:
  - 7 en `SALUD_KINDS`;
  - 4 de laboratorio en `VIGILANCIA_KINDS`.
- `lib/core/techniques.ts` y `lib/seo/plan/rules.ts`: técnicas nuevas `idiomas_corregidos`, `adaptar_movil` e `imagenes_optimizadas`, con sus instrucciones.
- `tests/seo-tecnico.test.ts`: 11 pruebas de reglas.
- Mapa Visual (`lib/seo/salud/process-map.ts`), `docs/ESTADO.md` §6.45, `docs/DISENO-SEO-PARTE1.md` y `docs/LISTA-CERRADA-SEO.md`.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **Protocolo de decisión con auditoría de Opus.** Encontró 3 fallos graves:
  - la comparación entre rastreos era un evento y se habría cerrado sola;
  - daba falsos «página desaparecida»;
  - los enlaces externos oscilarían entre resueltos y abiertos.
  
  La comparación se rehízo como regresión (estado y solo páginas vueltas a pedir), y los enlaces externos pasan a la tanda 2.
- **Lighthouse en Google en vez de HEAD a terceros y de una columna `facts`** para el viewport, el contenido mixto y las imágenes, como propuso la auditoría. No hace peticiones desde nuestro servidor a webs ajenas y da menos falsos positivos.
- **CrUX «por plantilla» descartado:** en pymes casi siempre cae a los datos del dominio.
- **Lo que el revisor de código bloqueó y se corrigió:**
  - los tipos nuevos estaban en `LOCAL_KINDS` y no se habrían resuelto nunca;
  - un 403 o 429 (cortafuegos) contaba como regresión;
  - el laboratorio resolvía hallazgos de páginas que no había podido medir;
  - las auditorías de imágenes podrían no existir en Lighthouse nuevo: se leen las dos versiones y, si no viene ninguna, no se juzgan;
  - hreflang «sin vuelta» cuando la otra versión no declara hreflang en el HTML.

## Qué verificar manualmente
- En producción, Proyectos → CM Ibérica → Salud → «Velocidad real de los usuarios» → **Comprobar ahora** (necesita la clave que ya está pegada). Tras 2-5 minutos, el resumen debe decir «Laboratorio: N de 5 página(s) medida(s)» y no «no trajo las auditorías de imágenes».
- Tras la próxima auditoría: hallazgos de hreflang o lang si los hay, y que no salgan regresiones falsas.

## Pendientes detectados
- **Tanda 2:**
  - blindar `fetchPublic` contra el DNS rebinding;
  - columna `facts`;
  - enlaces rotos hacia fuera con fuente propia;
  - recursos bloqueados por robots.txt, evaluados contra Googlebot.
- **Render de JavaScript:** necesita Chromium (línea roja). Pregunta abierta a Enric.
- Los nombres de las auditorías de Lighthouse no están verificados con una respuesta real (no hay clave en local).

# SEO: análisis inicial con etapas y puertas (Jefe SEO, fase D0)
**Fecha:** 2026-11-27
**Rama:** feature/seo-arranque
**Commit:** 8c918485

## Qué se construyó
Enric replanteó la fase D: IA desde el día 1 (Jefe SEO) en vez de esperar a 2-3 estrategias manuales. Fable 5.2 escribió `docs/PLAN-SEO-JEFE.md` y Enric aprobó sus recomendaciones:
- bloquear solo lo imprescindible;
- una semana en modo sombra;
- el plan maestro lo aprueba un admin y los ciclos se gradúan;
- 30-40 $/mes de presupuesto.

La auditoría Opus encontró 4 fallos graves en D0 (orden imposible de etapas, sin estados de error ni de espera, orquestador doble y evidencias inestables para D2). D0 se rehízo con ellos antes de migrar.
- `lib/seo/arranque/rules.ts` (puro):
  - 8 etapas con **dependencias reales**;
  - estados `pendiente | bloqueado | en_curso | esperando_persona | error | hecho | sin_datos | omitido`;
  - clase de Search Console (descarga del histórico terminada, primer día con impresiones, una propiedad por web);
  - conexiones: bloquean solo web, Search Console y horas;
  - qué empujar en cada momento.
- `lib/seo/arranque/arranque.ts`:
  - hechos solo de tablas propias (91 ms en local);
  - `startAnalysis`, `skipItem` (admin), `advance` con `pg_try_advisory_xact_lock` y empujes con la clave del planificador y una espera de 6-24 h entre empujes;
  - no vuelve a rastrear si el rastreo tiene menos de 30 días;
  - se completa cuando el diagnóstico está resuelto.
- `lib/seo/arranque-actions.ts`, la pasada cada 10 min en `lib/seo/register.ts` y el bloque «Análisis inicial» arriba del Resumen (`projects/[projectId]/analisis-inicial.tsx`).
- `tests/seo-arranque.test.ts` (10) y el paso «Análisis inicial» en el Mapa Visual.

## Migraciones aplicadas
`0079_seo_arranque.sql`, aditiva: `seo_setup_runs` (una ejecución abierta por proyecto; lo saltado, los últimos empujes y el error).

## Decisiones técnicas tomadas en auto mode
- El estado no se guarda, se calcula. Así no hay relleno para los proyectos existentes y no se queda viejo.
- Revisor de código: aprobó con cambios. Arreglado: tope de 3 intentos por acción (después la etapa espera a una persona); con la web omitida, el negocio no se atasca; la zona solo se exige si hay propuesta; vista barata en el Resumen con el análisis completado; etiquetas accesibles; lista cerrada de lo que se puede saltar. Queda pendiente: marcar error si la descarga de Search Console no termina en N días.
- El diagnóstico se calcula con código en cuanto lo anterior está resuelto. El plan de servicio queda pendiente hasta D2.

## Qué verificar manualmente
- En un proyecto de producción: el Resumen muestra el análisis inicial. Se prueba «Empezar análisis» y se comprueba que se para donde falta algo con su motivo. Un admin prueba «Continuar sin esto».

## Pendientes detectados
- D1 (expediente con claves estables y pronóstico), D2 (plan maestro en sombra), D3 (Jefe SEO y debate), D4-D6.
- La sección «Expediente y puesta en marcha» sigue teniendo su propio botón «Ponerlo en marcha»: hay que unificarlo con «Empezar análisis».

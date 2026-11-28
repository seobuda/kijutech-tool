# SEO: pendientes de D0 (un solo botón de análisis y descarga de Search Console atascada)
**Fecha:** 2026-11-28  
**Rama:** fix/seo-d0-pendientes  
**Commit:** 49344467

## Qué se construyó
- `app/(dashboard)/dashboard/projects/[projectId]/expediente/puesta-en-marcha.tsx`: «Ponerlo en marcha» pasa a «Empezar análisis» y llama a `startAnalysisAction` (la misma acción que el Resumen).
- `lib/seo/expediente-actions.ts`: se quita `startProjectSetupAction` (ya no la usaba nadie).
- `lib/seo/arranque/rules.ts`: `gscStuck` y la etapa «datos» en error si la descarga no termina. `lib/seo/arranque/arranque.ts`: lo calcula con la fecha de alta de la propiedad y su última sincronización.
- `lib/seo/alta/rules.ts`, Mapa Visual: textos del botón. Comprobación del mapa pasada.
- `tests/seo-d0-pendientes.test.ts` (nueva, 2 pruebas).

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **Un solo camino:** el análisis inicial ya rastrea y encadena todo por etapas con sus puertas; el botón del Expediente lanzaba solo el rastreo por otro camino. Se unifica en el del análisis.
- **Cuándo es «atascada»:** 5 días o más desde que se asignó y sin avanzar en 2 (la fecha es la del alta de la propiedad; una antigua reasignada que avanza no cuenta) (una descarga normal tarda horas). Pasa a error con «espera a un administrador», sin reintentar nada por su cuenta.

## Qué verificar manualmente
- Expediente de un proyecto sin auditar: el botón dice «Empezar análisis» y el progreso aparece arriba del Resumen.

## Pendientes detectados
- Ninguno nuevo.

## Revisor de código
Aprobar con cambios. Arreglados: el mensaje del botón ya no promete un rastreo (si falta Search Console o las horas al mes, el análisis queda bloqueado en «conexiones» hasta que se resuelva o un admin lo salte, y lo dice el Resumen); la regla de «atascada» exige siempre 2 días sin avanzar (una propiedad antigua reasignada que avanza ya no salta); imports sin uso quitados.

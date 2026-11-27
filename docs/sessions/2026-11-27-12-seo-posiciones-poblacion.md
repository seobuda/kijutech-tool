# SEO: posiciones por población
**Fecha:** 2026-11-27  
**Rama:** feature/seo-posiciones-poblacion  
**Commit:** ver la fusión en main

## Qué se construyó
- **`lib/seo/posiciones/rules.ts`, `keywordLocation`:** cada búsqueda que nombra una población de la zona se consulta desde esa población, si DataForSEO la tiene como ciudad. Los nombres se comparan sin artículos ni preposiciones («Sant Cugat del Vallès» = «sant cugat»; «L'Hospitalet de Llobregat»). El coste no cambia.
- **`lib/seo/posiciones/posiciones.ts`:**
  - ubicación por búsqueda al crear cada ejecución;
  - las caídas solo se comparan con mediciones desde la misma ubicación.
- **`lib/seo/posiciones/view.ts`:** la tendencia y el historial de cada búsqueda usan solo su misma ubicación. Si hay varias, la cabecera dice «varias (cada búsqueda desde su población)».
- Mapa Visual (paso Posiciones), `docs/ESTADO.md` §6.64 y `docs/SIMULACION-SEO-CLIENTE.md` (atasco 4, parte 1).
- **Pruebas:** `tests/seo-atascos.test.ts`, con poblaciones compuestas. Pasan las 838.

## Migraciones aplicadas
Ninguna (`seo_rank_checks.location_name` ya existía).

## Decisiones técnicas tomadas en auto mode
- **El volumen de Google Ads sigue pidiéndose con la ubicación del proyecto:** pedirlo por población multiplicaría las llamadas de pago.
- **Una búsqueda que cambia de ubicación empieza un historial nuevo:** tarda unas 3 mediciones en poder avisar de una caída. Los avisos abiertos no se pierden.

## Revisor de código
Aprobar con cambios. Arreglado:
- los nombres compuestos de población;
- la vista ya no mezcla ubicaciones.

Apuntado como pendiente:
- el volumen por población;
- no enviar la ejecución si la lista de ubicaciones falla.

## Qué verificar manualmente
- Posiciones de un proyecto con varias poblaciones en la zona: tras la próxima consulta semanal, la cabecera dice «varias…» y las búsquedas con población salen desde ella.

## Pendientes detectados
- Una cuadrícula del mapa (geo-grid) por población.
- Volumen por población.

# Jefe SEO D4: estrategia del trimestre desde el plan de servicio
**Fecha:** 2026-11-27  
**Rama:** feature/seo-jefe-d4  
**Commit:** bc0d57bb

## Qué se construyó
- `lib/seo/jefe/ciclo-rules.ts` (nuevo, puro): trimestre del plan para una fecha, lunes de inicio del ciclo siguiente, cuándo proponerlo (21 días antes del final) y `deriveCycle` (frentes vivos del trimestre por prioridad, una línea por tipo, elegibles, como mucho 3, dentro de las horas; lo demás con su motivo).
- `lib/seo/jefe/ciclos.ts` (nuevo): propuesta (`seo_jefe_proposals` tipo «ciclo»), aprobar o descartar, creación con `createCycle` enlazada al plan y a cada frente (o en espera si hay una estrategia activa) y la pasada diaria `jefeCyclePass`.
- `lib/seo/estrategia/ciclos.ts`: `createCycle` acepta `masterPlanId` y `masterItemIds` (opcionales; nada cambia para la creación a mano).
- `lib/seo/jefe/cambios.ts`: `expireStaleChanges` caduca también las propuestas de ciclo pendientes al aprobarse otra versión del plan.
- `lib/seo/register.ts`: la pasada del Jefe va dentro del proceso diario de estrategias, antes de encargar.
- `lib/seo/jefe-actions.ts`: `proposeCycleAction`, `decideCycleAction` (admin).
- `app/(dashboard)/dashboard/projects/[projectId]/servicio/ciclo-propuesta.tsx` (nuevo), `page.tsx`, `servicio-panel.tsx`: «Estrategia del trimestre (desde el plan)».
- Mapa Visual: paso `jefe-ciclos` en el mapa SEO; comprobación pasada.
- `tests/seo-jefe-d4.test.ts` (nueva, 7 pruebas).

## Migraciones aplicadas
Ninguna. Las columnas `seo_cycles.master_plan_id` y `seo_cycle_lines.master_item_id` y el tipo «ciclo» de `seo_jefe_proposals` ya existían (0080).

## Decisiones técnicas tomadas en auto mode
- **Sin IA (desvío del plan, por la directiva de optimización de IA de CLAUDE.md):** `docs/PLAN-SEO-JEFE.md` preveía un prompt `seo_jefe_ciclo`. Pero el plan aprobado ya trae, por trimestre, los frentes con su línea, parámetros y prioridad: pasar eso a un ciclo es ordenar, filtrar y comprobar horas, sin razonamiento nuevo. Una llamada a Opus por trimestre costaría dinero sin añadir criterio. Si más adelante hace falta ajustar ritmos con criterio, el Jefe puede proponerlo por el chat (cambio al plan).
- **Se reutiliza `createCycle`** (validación, horas, aprobación por lotes de los dos primeros ciclos) en vez de crear ciclos «propuestos» en `seo_cycles`: la propuesta vive en `seo_jefe_proposals`, que ya guarda decisiones y motivos.
- **Si hay una estrategia activa**, la siguiente se aprueba antes y se crea al cerrarse aquella (los ciclos se cierran solos al terminar sus huecos; no se toca la activa).
- **La pasada no repite** una fecha de inicio ya decidida para la misma versión del plan; a mano sí se puede volver a proponer.
- Protocolo completo no aplicado: decisión dentro del módulo SEO, sin núcleo ni integraciones nuevas, reversible y sin coste; el desvío de la IA queda explicado arriba.

## Qué verificar manualmente
- Un proyecto con plan aprobado → Plan de servicio: «Estrategia del trimestre (desde el plan)» con las líneas del trimestre 1 y lo que no entra; aprobarla y ver la estrategia en Trabajo → Estrategia (con el lote del primer mes por aprobar).
- Al día siguiente, que no aparezca otra propuesta mientras la estrategia esté lejos de terminar.

## Pendientes detectados
- Los frentes sin línea (trabajo puntual) solo se apuntan: falta llevarlos solos al Plan de mejora como propuesta.
- El estratega del módulo Estrategia sigue hablando si hay plan aprobado pero aún no hay ciclo activo.
- Una propuesta aprobada en espera que nunca se puede crear (p. ej. sin horas) se queda en espera sin aviso; se ve en la pantalla.

## Revisor de código
Aprobar con cambios. Arreglado el hallazgo grave: una estrategia aprobada que esperaba a crearse ya no se crea si mientras tanto se aprobó otra versión del plan (caduca, también al aprobar el plan; prueba añadida). Medios arreglados: si la pasada y el admin la crean a la vez, no se revierte la propuesta; el error de creación se guarda y se ve en la pantalla, con botón «Cancelar» para una aprobada en espera. Menor: clave de lista en la UI. Apuntado sin arreglar: si el proceso muere justo después de crear el ciclo y antes de guardar su id en la propuesta (muy raro); el trimestre se calcula por meses (un día de diferencia en la frontera con meses de 31 días).

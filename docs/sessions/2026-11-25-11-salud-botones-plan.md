# Salud técnica: botones claros y en qué propuesta del plan va cada hallazgo
**Fecha:** 2026-11-25  
**Rama:** fix/salud-botones-plan  
**Commit:** 87bc1374

## Qué se construyó
- **`app/(dashboard)/dashboard/projects/[projectId]/salud/salud-panel.tsx`**:
  - los botones «Aceptar» y «Descartar» pasan a llamarse «Dejar así» y «No es un problema»; el texto de ayuda deja claro que no crean tareas;
  - la descripción de los hallazgos explica que lo que hay que arreglar pasa solo al Plan de mejora, con un enlace;
  - cada tipo de hallazgo dice en qué propuestas del plan va y con qué estado: por aprobar, encargo creado o hecho. También cuántos casos quedan para el siguiente lote, o si es solo informativo;
  - cada caso muestra su propuesta, y el enlace al encargo si ya existe.
- **`lib/seo/salud/view.ts`**: cada hallazgo lleva `plan` (la propuesta en la que va, leída de `seo_plan_items.finding_ids`) y `plannable` (si su tipo genera propuestas, según `KIND_TECHNIQUE`).
- **`tests/avisos-solo-hoy.test.ts`** y **`tests/clickup-cambios.test.ts`**:
  - sus fechas pasan de noviembre de 2026 a noviembre de 2037, un año en que el 23 de noviembre también es lunes;
  - fallaban desde hoy porque la cola compara con la hora real de la base de datos, y el «otro día» de la prueba (25 nov 2026) ya había llegado.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **Pruebas con fechas lejanas.** Una prueba que mezcla una hora simulada con la hora real de la base de datos solo es estable si las fechas quedan siempre en el futuro.
- **Ningún cambio en cómo se decide.** Solo cambian los nombres y la información: los estados internos siguen siendo `aceptado` y `descartado`.

## Qué verificar manualmente
- Proyectos → cm-iberica → Salud técnica:
  - cada tipo de hallazgo dice «En el plan, por aprobar: …»;
  - los botones se llaman «Dejar así» y «No es un problema».
- Tras aprobar una propuesta en el Plan de mejora, sus hallazgos en Salud deben decir «Encargo creado», con el enlace a la tarea.

## Pendientes detectados
- Hay más pruebas con fechas fijas de 2026 que podrían caducar igual. Conviene revisarlas.

# Plan de mejora A+B: vista previa, meses, porqué, motivos y estado real
**Fecha:** 2026-11-26  
**Rama:** feature/plan-mejora-ab  
**Commit:** 38cbb28b

## Qué se construyó
Diseño y revisión desde varios enfoques: `docs/DISENO-PLAN-MEJORA-AB.md`. ESTADO §6.42.

**Contrato con Operaciones:**
- **`lib/core/capabilities.ts`**:
  - `NewTaskInput` acepta lista, responsable, fecha, prioridad y origen;
  - funciones nuevas `TaskOptions`, `RequestStatus` y `taskOptions`.
- **`lib/operaciones/work-source.ts`**:
  - `taskOptions` (de la caché, sin llamar a ClickUp);
  - `createChosenTask`: el encargo con la lista elegida, sin IA;
  - `requestStatus` devuelve también el estado, el responsable y la fecha.

**Plan de mejora:**
- **`lib/seo/plan/rules.ts`**: el esfuerzo en la prioridad, `gainPerMonth`, `scheduleMonths`, `whyLine` y los títulos en singular o plural.
- **`lib/seo/plan/plan.ts`**: aprobar con opciones, `approveThisMonth`, descartar con motivo que actúa, `planSchedule`, `monthName` y el aviso mensual (tarea del planificador).
- **`lib/seo/plan-actions.ts`**: `approvePlanItemAction` con opciones, `discardPlanItemAction` con motivo y `approveThisMonthAction`.

**Pantallas:**
- **Plan de mejora** (`page.tsx` y `plan-panel.tsx`): resumen del mes, secciones por mes, porqué, vista previa, descarte con motivo y estado real.
- **`components/ui/markdown-lite.tsx`**: texto con formato, sin HTML.

**Mapa Visual:** `lib/seo/salud/process-map.ts`, paso del plan. La comprobación pasa.

**Pruebas:**
- `tests/seo-plan-ab.test.ts`: 9 pruebas.
- `tests/seguridad.test.ts`: la acción nueva.
- `tests/seo-hito1.test.ts`: título en plural.
- Resultado: 691 pruebas pasan.

## Migraciones aplicadas
Ninguna.

## Decisiones técnicas tomadas en auto mode
- **El reparto por meses se calcula, no se guarda.** Mover una propuesta de mes a mano necesitaría una columna (migración). Queda pendiente, con aprobación.
- **Sin lista elegida, el encargo se crea como antes** (la IA elige). Con lista elegida, no se usa IA: es más rápido, gratis y hace lo que se ve.
- **Prioridad del encargo:** la del plan traducida a ClickUp (alta → 2, media → 3, baja → 4).
- **El aviso mensual** solo va la primera semana del mes y en horario de trabajo: así no salta al desplegar a mitad de mes. Va un mensaje por cuenta.
- **Al revisar la pantalla en el navegador local** (proyecto temporal, borrado; sin aprobar nada para no crear encargos reales):
  - responsable y fecha se desactivan si no hay lista elegida;
  - títulos sin «página(s)»;
  - la técnica se ve en el detalle, no repetida en la tarjeta.

## Qué verificar manualmente
- **Proyectos → cm-iberica → Plan de mejora:**
  - las secciones por mes y el resumen de horas;
  - el porqué de cada propuesta.
- **«Aprobar» en una propuesta:**
  - el responsable y la lista que salen por defecto (de la ficha del cliente: servicios → responsable de SEO, Operaciones → listas habituales);
  - crear un encargo y comprobarlo en ClickUp.
- **«Descartar» con «El cliente no lo quiere»:** aparece en la memoria del cliente.
- **Primera semana de diciembre:** llega el aviso del plan por Telegram.

## Pendientes detectados
- Mover una propuesta de mes o fijarla (necesita migración).
- Aprobación automática de lo que cabe, como ajuste por proyecto.
- El resultado de la medición (parte 7).

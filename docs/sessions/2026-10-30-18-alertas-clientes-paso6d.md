# Paso 6D · Alertas de clientes
**Fecha:** 2026-10-30  
**Rama:** operaciones  
**Commit:** a5207461

## Qué se construyó
- `lib/operaciones/client-activity.ts` — pasada diaria (03:00 Madrid) con UNA consulta agrupada de workspace (por el cliente con contador): última actividad, completadas del mes, abiertas con fecha en el horizonte del cliente y horas del mes (tiempo laboral entre Empezar y Hecho de los encargos). Botón manual, reintento cada 30 min si falla, marca de «alerta ya avisada» que se borra cuando la condición desaparece, alertas para el resumen (nuevas + recordatorio cada 7 días) y `getMonthWork` («Trabajo de este mes», caché de 2 min, mes actual o anterior).
- `lib/operaciones/clients.ts` — `evaluateClient`, `alertEligibility` (solo clientes activos, vinculados, con servicio u horas al mes y el interruptor encendido; si no, gris con el motivo), umbrales por nivel o por cliente.
- `lib/operaciones/client-actions.ts` — campos `inactivityDays`, `planningDays`, `alertsEnabled` en la ficha y en los niveles; acciones `recalcClientActivity` y `getClientMonthWork`.
- `app/(dashboard)/dashboard/operaciones/clientes/{page,clientes-view}.tsx` — semáforo por cliente (rojo = sin actividad, ámbar = sin trabajo planificado, verde, gris), «última actividad hace X días», horas ≈ del mes frente a las comprometidas, completadas del mes, botón «Recalcular actividad», campos de alertas en la ficha y en «Niveles y servicios», botón «Trabajo de este mes» con selector de mes actual/anterior y «Copiar».
- `lib/operaciones/digest.ts` — sección «📉 Clientes en alerta» solo en el último resumen del día (y en el resumen manual).
- `lib/operaciones/clickup.ts` (`closedMs` en las tareas), `telegram-worker.ts` (planificador), `process-map.ts` (Mapa Visual).

## Migraciones aplicadas
Backup previo: `backups/backup_pre_operaciones_alertas_20261030.sql`.
`lib/db/migrations/0034_ops_client_alerts.sql`: `ops_client_levels.inactivity_days` y `planning_days` (top 7/7, estándar 14/14, mantenimiento 30/0); `ops_clients.inactivity_days`, `planning_days` (null = el del nivel; 0 = desactivado) y `alerts_enabled` (Kijutech apagado); tabla `ops_client_activity`. Respecto al plan: se añadió `planning_days` (horizonte por nivel, pedido al aprobar) y `horizon_days` / `upcoming_tasks` en la tabla de actividad en lugar de `upcoming_7d`.

## Decisiones técnicas tomadas en auto mode
- «Trabajo de este mes» no usa el filtro de fecha de hecho de ClickUp (no distingue bien estados «cerrada» y «hecha»): trae las tareas actualizadas desde el inicio del mes anterior y filtra en el código las cerradas por cliente y fecha de cierre.
- Las horas cuentan solo encargos con Empezar y Hecho en el mes y se muestran con «≈».
- Una tarea abierta ya vencida no cuenta como «trabajo planificado» (solo fechas entre hoy y el horizonte).
- Un cliente sin tareas en el periodo consultado (≥62 días) sale rojo con «más de N días».
- Si falla la pasada nocturna se reintenta cada 30 min y el error se ve en la cabecera de Clientes.

## Qué verificar manualmente
- Clientes: casi todas las fichas salen en gris «Ficha sin completar» hasta que les pongas un servicio u horas al mes; al completarlas empiezan a vigilarse.
- Ajusta en «Niveles y servicios» los umbrales de cada nivel si los de por defecto no te encajan.
- Resumen de las 18:00 del día siguiente a completar fichas: debe traer solo las alertas nuevas.
- «Trabajo de este mes» con el mes anterior, a principios de mes, para el informe.

## Pendientes detectados
- Los festivos no cuentan al calcular horas laborables ni plazos.
- Si las horas de un cliente salen siempre ≈0, es que su trabajo no pasa por los botones Empezar/Hecho (hoy solo cuentan los encargos de la herramienta).
- La ficha de «san bernardo» se completó un momento para probar el rojo y se revirtió.
- Tareas de prueba «[PRUEBA …]» en Pruebas Kiju y el usuario de pruebas siguen pendientes de borrar antes de servidor.

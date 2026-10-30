# Paso 6C · Tareas de ClickUp en el circuito y botones por fases
**Fecha:** 2026-10-30  
**Rama:** operaciones  
**Commit:** 07750bef

## Qué se construyó
- `lib/operaciones/notifications.ts` — nuevo `noticeKeyboard` por fases: «▶️ Empezar ahora» / «🕐 Más tarde» (sustituye a «Visto»); tras Empezar, «🚫 Bloqueado», «✅ Hecho», «👀 Hecho, ¿lo revisas?». `refreshNotice` edita ahora todos los avisos del encargo (uno por responsable) y quita los botones a quien ya no lo lleva. `enqueueNewRequestNotification` acepta destinatario, etiqueta («creada/asignada/reasignada en ClickUp») y sufijo de clave.
- `lib/operaciones/workflow.ts`, `telegram-handler.ts` — `laterWork` (Más tarde = visto), `startWork` con responsable principal (quien pulsa Empezar entre varios avisados), botones con el id de la persona (`st:ID:USUARIO`) cuando hay varios responsables.
- `lib/operaciones/reminders.ts` — recordatorios con el horario de la ficha del Equipo: un único recordatorio a las 2 horas laborables sin pulsar nada; quien pulsó «Más tarde» recibe uno solo si vence hoy y pasa la mitad de su jornada; `getUnanswered` alimenta el resumen.
- `lib/operaciones/digest.ts` — sección «⏳ Sin respuesta» en el primer resumen disponible tras terminar la jornada de la persona.
- `lib/operaciones/watch.ts`, `watch-actions.ts`, `clickup.ts` (`fetchWatchTasks`) — vigilancia de ClickUp: una consulta agrupada de workspace cada ~2,5 min (`date_updated_gt`), encargos espejo (origen ClickUp, cliente copiado del campo Cliente), sincronización de cierres y de reasignaciones (también en tareas creadas por la herramienta), aviso a todos los responsables vinculados salvo el creador.
- `app/(dashboard)/dashboard/operaciones/ajustes/vigilancia-ajustes.tsx`, `page.tsx` — interruptor «Vigilar ClickUp», estado, último error y aviso de miembros sin Telegram vinculado con tareas recientes.
- `telegram-worker.ts` (planificador), `events.ts` (eventos `later`, `clickup_closed`, `reassigned`, `mirror_created`, `reminder_sent`), `process-map.ts` (Mapa Visual).

## Migraciones aplicadas
Backup previo: `backups/backup_pre_operaciones_watch_20261030.sql`.
- `0032_ops_clickup_watch.sql`: tablas `ops_clickup_watch` y `ops_clickup_task_snapshots`; columnas de `ops_requests`: `origin` (con CHECK `herramienta`/`clickup`), `candidate_ids`, `reminded_at`, `unanswered_listed_at`. `candidate_ids` no estaba en el SQL presentado: lo exige la respuesta 5 (avisar a varios responsables).
- `0033_ops_notifications_reminder.sql`: amplía el CHECK `ops_notifications_kind_check` con el tipo `reminder` (olvidado en el SQL del plan; lo detectó el planificador al intentar insertar).

## Decisiones técnicas tomadas en auto mode
- Tarea nueva: no avisa si la creó el propio responsable; en una reasignación se avisa siempre (aunque sea el creador), para poder probar «la creo y me la asigno».
- Reasignación solo si ninguno de los responsables conocidos del encargo sigue en la tarea y entra alguien vinculado nuevo (si se añade un segundo asignado sin quitar al actual, no cambia nada).
- Instantánea de todas las tareas abiertas al activar (lectura inicial, sin avisos) para detectar reasignaciones posteriores.
- Los recordatorios solo cuentan para avisos enviados tras el despliegue del 6C y de hace menos de 3 días, para no resucitar encargos antiguos de pruebas.
- Cierre en ClickUp (estado de tipo cerrado o hecho) completa el encargo; los demás cambios de estado no se reflejan.
- En modo pruebas basta ser miembro de ClickUp (todo llega al dueño); fuera de él se exige Telegram vinculado.

## Qué verificar manualmente
- Ajustes ClickUp → «Vigilar ClickUp»: activar y comprobar última consulta y peticiones por hora.
- Crear en ClickUp (Pruebas Kiju) una tarea sin responsable, esperar un ciclo (~3 min) y asignártela: debe llegar el aviso con Empezar / Más tarde; al pulsar Empezar cambia a Bloqueado / Hecho / Hecho, ¿lo revisas?; al cerrarla en ClickUp, el encargo queda completado.
- Reasignar a otra persona una tarea creada por la herramienta y ver el aviso nuevo y el viejo sin botones.

## Pendientes detectados
- Los festivos no cuentan en los plazos ni en las horas laborables.
- Un cambio de estado en ClickUp distinto de cerrar no se refleja; reabrir una tarea cerrada tampoco.
- Una tarea con varios responsables crea un único encargo; si luego se quita al principal y queda otro, no se re-asigna.
- Tareas de prueba «[PRUEBA PASO 5]» y «[PRUEBA 6C]» en Pruebas Kiju y el usuario de pruebas siguen pendientes de borrar antes de subir a servidor.

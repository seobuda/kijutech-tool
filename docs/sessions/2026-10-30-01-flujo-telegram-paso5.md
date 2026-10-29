# Paso 5 · El equipo responde desde Telegram (con cortafuegos para el dueño)
**Fecha:** 2026-10-30  
**Rama:** operaciones  
**Commit:** (ver historial de la rama)

## Qué se construyó
- `lib/operaciones/workflow.ts` — máquina de estados atómica: asignado → en_curso → (bloqueado) → en_revision → completado («devuelto» vuelve a en curso). Acciones `startWork`, `finishWork`, `acceptWork`, `returnWork`; cada cambio de ClickUp va a la bandeja de salida y cada acción a eventos.
- `lib/operaciones/outbox.ts` — bandeja de salida a ClickUp (`ops_clickup_outbox`): estado y comentario, clave única, reclamo con candado de 90 s, 6 reintentos con espera creciente, siempre por el cliente con contador (`clickup.ts`: `updateTaskStatus`, `addTaskComment`, `getTaskContext`, `getListStatuses`).
- `lib/operaciones/status-map.ts` — propuesta de correspondencia de estados por nombre (con el tipo done/closed de ClickUp como respaldo), agrupada por listas con los mismos estados; editable en Ajustes. Los estados salen de la consulta de listas (sin peticiones extra) salvo 21 listas que se leen una vez con `/list/{id}`.
- `lib/operaciones/reviewers.ts` — interfaz `Reviewer` con `requestReview()`; hoy `owner`. Un revisor automático futuro solo debe llamar a `acceptWork()` / `returnWork()`.
- `lib/operaciones/blockers.ts` — bloqueos: la IA (`ops_blocker_triage`) lee tarea, descripción, nota original y comentarios; responde sola solo si devuelve respuesta Y fuente; si no, escala resumido (opciones y recomendación). Responder del dueño → persona + comentario en ClickUp.
- `lib/operaciones/digest.ts`, `inbox.ts` — cortafuegos: solo bloqueos y revisiones urgentes (prioridad 1) llegan al instante; resúmenes a las 13:00 y 18:00 (Madrid, configurables); «Mi bandeja» calculada del estado actual.
- `lib/operaciones/events.ts` — `ops_request_events`: Visto, Empezar, Bloqueado, Hecho, revisiones, respuestas del agente y del dueño, y botones rechazados.
- `lib/operaciones/telegram-handler.ts` — botones del aviso (st, bl, dn, dr, sk, ok, rt, rp) con comprobación de quién pulsa; conversación pendiente (`ops_telegram_pending`) para enlace/comentario, pregunta (texto o captura), motivo y respuesta.
- `lib/operaciones/notifications.ts` — avisos nuevos (`review_request`, `block_alert`, `reply`, `returned`, `digest`), botones por estado (`noticeKeyboard`) y `refreshNotice` (el aviso original se reescribe con el estado y los botones vigentes).
- `lib/operaciones/work-types.ts`, `flow-actions.ts` — tipos de trabajo editables, estados, horas de resumen y acciones de «Mi bandeja».
- UI: pestaña «Mi bandeja» (`bandeja/`), «Estados de ClickUp» y «Tipos de trabajo» en Ajustes (`ajustes/flujo-ajustes.tsx`), horas de los resúmenes y «Enviar resumen de la bandeja ahora» en la pestaña Telegram, tipo de trabajo y «Requiere mi revisión» en la revisión de notas y en Nuevo encargo, columna «Flujo» en Encargos.
- `scripts/ops-prompts-paso5.sql` — prompt `ops_note_to_requests` v4 (tipo de trabajo) y nuevo `ops_blocker_triage`.
- `lib/operaciones/process-map.ts` — Mapa Visual actualizado.

## Migraciones aplicadas
Backup previo: `backups/backup_pre_operaciones_paso5_20261030.sql`.
`lib/db/migrations/0029_ops_paso5_flujo.sql`: tablas `ops_work_types` (sembrada con 6 tipos), `ops_status_map`, `ops_blockers`, `ops_request_events`, `ops_clickup_outbox`, `ops_telegram_pending`; columnas `statuses` (listas), `work_status`, `work_status_at`, `work_type_key`, `reviewer_key`, `done_note` (encargos), `digest_times`, `digest_timezone` (config de Telegram); nuevo CHECK de tipos de aviso. SQL aprobado antes de aplicar.

## Decisiones técnicas tomadas en auto mode
- «Urgente» = prioridad 1 (no se añadió un campo nuevo).
- Lo que la persona debe recibir al momento (respuesta del agente, tu respuesta, devolución, aprobación) no espera a los resúmenes.
- El «Hecho» con revisión sin comentario se resuelve con un botón «Sin comentario» o `/no`; la conversación pendiente caduca a los 30 min y se cancela con `/cancelar`.
- Con revisor `none` y la casilla marcada en el botón «Hecho, ¿lo revisas?», el encargo adopta el revisor `owner`.
- El triaje usa el modelo activo de la pasarela de IA (no hay modelo por función).
- La captura de un bloqueo se guarda como `file_id` de Telegram; sin texto va directa al dueño (no se razona sobre imágenes).
- `ops_telegram_pending` no lleva columna extra: «Hecho» y «Hecho, ¿lo revisas?» son dos tipos (`done_note`, `done_review`).

## Qué verificar manualmente
- En Telegram, pulsar los botones de un aviso real de «Pruebas Kiju» (el script de pruebas usó un Telegram simulado).
- Ajustes: revisar la correspondencia de estados propuesta y los tipos de trabajo.
- Mi bandeja: aceptar, devolver y responder desde la web.
- Que el resumen de las 13:00 / 18:00 llega (o «Enviar resumen de la bandeja ahora»).

## Pendientes detectados
- Probado con Telegram simulado y ClickUp/IA reales; no con pulsaciones reales en el móvil.
- Las tareas «[PRUEBA PASO 5]» de «Pruebas Kiju» se pueden borrar a mano en ClickUp.
- La IA no analiza capturas (solo texto).
- Un mismo estado de ClickUp como «en curso» se aplica aunque la tarea esté ya en él (no se comprueba el estado actual).
- Caché de estados: se refresca con la sincronización de estructura (cada hora); una lista nueva sin estados se lee una vez.

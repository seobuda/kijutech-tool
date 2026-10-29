# Tareas propias siempre a Enric y verificación de «Enviar todo»
**Fecha:** 2026-10-29  
**Rama:** operaciones  
**Commit:** (ver historial de la rama)

## Qué se construyó
- **Prompt `ops_note_to_requests` v2** (actualizado en `ai_prompts`, versión 2; el SQL está en `scripts/ops-note-to-requests-prompt-v2.sql`): las tareas propias de quien escribe la nota (llamar o escribir al cliente, decidir, aprobar, pedir datos o accesos al cliente, reunirse con el cliente) van SIEMPRE a esa persona, aunque el responsable seleccionado sea otra; los trabajos de ejecución van al responsable seleccionado. Nuevo marcador `{yo}` en la plantilla de usuario.
- `lib/operaciones/note-actions.ts` — pasa `{yo}` (nombre del dueño del token, de la caché) al prompt y aplica una red de seguridad: si el título del encargo es una tarea propia, se asigna a Enric aunque el modelo proponga otra persona.
- `lib/operaciones/format.ts` — `isOwnTask(título)`: reglas por verbo (llamar, decidir, aprobar, validar, reunirse…) y por «verbo de contacto + al cliente» (escribir, enviar, pedir, preguntar, confirmar…). Probado con 12 casos (incluidos falsos positivos: «Escribir los textos de la página de inicio» y «Redactar un artículo» NO son tareas propias).

## Migraciones aplicadas
Ninguna (el cambio del prompt es un dato, no de esquema).

## Decisiones técnicas tomadas en auto mode
- «Yo» = el dueño del token de ClickUp (Enric Tabilo), no el usuario de la sesión de la herramienta, para que el usuario de pruebas se comporte igual que el real.
- El prompt se actualizó con un `UPDATE` directo en lugar de editar la migración 0024 ya aplicada.

## Qué verificar manualmente
- En el Bloc, elegir a otra persona como responsable y escribir una nota con un trabajo de ejecución y tareas del tipo «llamar al cliente», «pedir accesos», «aprobar…»: en la revisión, el trabajo va a la persona elegida y las tareas propias a Enric.

## Pendientes detectados
- Prueba hecha: con Mayelin seleccionada, 5 encargos propuestos; los 2 de ejecución a Mayelin y los 3 propios (llamar, pedir accesos, aprobar) a Enric Tabilo. El modelo lo cumplió por sí solo; la red de seguridad no tuvo que intervenir.
- Verificado con permiso expreso: «Enviar todo» crea la tarea real en «Pruebas Kiju» (asignada a Enric Tabilo) y la pantalla se queda en la nota con «Encargos creados desde esta nota» y el enlace a ClickUp.
- Una instalación nueva sembraría el prompt v1 (migración 0024): hay que aplicar después `scripts/ops-note-to-requests-prompt-v2.sql`.
- Al esperar mucho tiempo con la revisión abierta, la pestaña llegó a mostrar `?nueva=1` con una nota en blanco (la nota sigue guardada en el historial). Se está vigilando; no se ha reproducido tras el envío.

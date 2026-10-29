# Operaciones: Bloc de notas con audio → encargos en ClickUp
**Fecha:** 2026-10-29  
**Rama:** operaciones  
**Commit:** 9ca6ab22

## Qué se construyó
- **Corrección de la fecha de entrega:** `madridMidnightMs` pasa a `madridNoonMs` (`lib/operaciones/clickup.ts`): se envía a las 12:00 de Madrid, para que caiga en el mismo día en España y en República Dominicana. Mantiene la gestión de los cambios de hora (CET/CEST) calculando el desfase en el propio instante.
- `lib/db/schema.ts` — tablas `ops_notes`, `ops_note_audios`, `ops_settings`; columnas `note_id` y `audio_attached_at` en `ops_requests`.
- `lib/operaciones/sync.ts` — el envío fiable del paso 3 (`syncToClickUp`) movido a un módulo compartido por encargos sueltos y de notas; ahora también adjunta el audio y añade la transcripción a la descripción.
- `lib/operaciones/note-actions.ts` — `saveNote` (autoguardado), `deleteNote`, `discardProposal`, `convertNote` (IA) y `sendNoteRequests` (envía todo).
- `lib/operaciones/transcribe.ts` — transcripción con Gemini (audio en línea), con registro en `ai_jobs` como `ops_transcribe_audio`.
- `lib/operaciones/settings.ts` — modelo de transcripción configurable (`ops_settings`), editable en Operaciones → Ajustes.
- `lib/operaciones/format.ts`, `note-types.ts` — formato de descripción compartido con `ops_prepare_request` y tipos de la propuesta.
- `lib/operaciones/clickup.ts` — `getSpaceLists`, `attachFileToTask` (multipart nativo).
- `app/api/operaciones/audio/route.ts` — recibe el audio (ruta y no acción de servidor, por el límite de 1 MB de las acciones), lo guarda SIEMPRE antes de transcribir y devuelve la transcripción o el motivo del fallo.
- `app/(dashboard)/dashboard/operaciones/page.tsx` + `bloc-notas.tsx` — pantalla principal: selectores de espacio y responsable, área de texto con autoguardado, grabación de audio, historial con estado, pantalla de revisión con tarjetas editables y bloque «No convertido».
- «Equipo hoy» pasa a `/dashboard/operaciones/equipo-hoy`; «Nuevo encargo» se mantiene como opción secundaria.
- `lib/operaciones/process-map.ts` y `lib/architecture-map/registry.ts` — Mapa Visual con los pasos de nota y conversión.

## Migraciones aplicadas
`lib/db/migrations/0024_ops_notes.sql`:
- Crea `ops_notes` (id, tenant_id, created_by, content, clickup_space_id/name, assignee_clickup_id/name, status borrador|convertida, proposal jsonb, created_at, updated_at, converted_at), `ops_note_audios` (note_id, tenant_id, mime_type, size_bytes, data bytea, transcript, created_at) y `ops_settings` (tenant_id, key, value, unique por cuenta y clave).
- Añade `note_id` (FK a `ops_notes`, ON DELETE SET NULL) y `audio_attached_at` a `ops_requests`, más sus índices.
- Siembra el precio aproximado de `gemini-2.5-flash` en `ai_model_pricing` y el prompt `ops_note_to_requests` en `ai_prompts` (devuelve `encargos` y `no_convertido`).

Backup previo: `backups/backup_pre_operaciones_notas_20261029_1105.sql` (876 KB, 36 tablas).

## Decisiones técnicas tomadas en auto mode
- **Tres añadidos al SQL aprobado:** tabla `ops_settings` (para el modelo configurable, dentro del módulo, sin tocar las tablas de IA), columna `proposal` en `ops_notes` (para que la pantalla de revisión sobreviva a una recarga sin otra llamada a la IA) y `audio_attached_at` en `ops_requests` (para no volver a adjuntar el audio al reintentar).
- **Modelo de transcripción por defecto: `gemini-flash-latest`, no `gemini-2.5-flash`.** Google responde 404 («ya no está disponible para usuarios nuevos») a esta clave con `gemini-2.5-flash` y `gemini-2.5-flash-lite`. Se eligió el alias por no fijar una versión que se retire.
- **La clave de Gemini no tiene créditos** (error 402, «prepayment credits are depleted») con todos los modelos 3.x probados. Hasta recargar en AI Studio, la transcripción falla; el audio se guarda y se adjunta igualmente, y se puede reintentar.
- Modelos de Gemini disponibles para esta clave (`generateContent`): `gemini-2.5-pro`, `gemini-flash-latest`, `gemini-flash-lite-latest`, `gemini-pro-latest`, `gemini-3.1-flash-lite`, `gemini-3.5-flash`, `gemini-3.5-flash-lite`, `gemini-3.6-flash`, `gemini-3.7-flash`, `gemini-3.8-flash`, entre otros.
- **Audio en base de datos** (columna `bytea`): el contenedor se recrea en cada despliegue y un archivo en disco se perdería; el volumen de Postgres no.
- **`thinkingConfig` solo para `2.5-flash`**, porque el pensamiento gastaría tokens de salida al transcribir; no se envía a otros modelos por si no lo aceptan.
- **Responsable por defecto de una nota nueva:** el usuario de ClickUp dueño del token.
- **Nota convertida:** se marca como tal al guardar todos los encargos como pendientes (antes de enviarlos), para impedir duplicados con un doble clic; los fallos se reintentan desde la propia pantalla o desde Encargos.
- Los audios se adjuntan uno a uno a cada tarea; la transcripción va en la sección «Transcripción del audio» de la descripción.

## Qué verificar manualmente
- Escribir en el Bloc de notas, esperar unos segundos («Guardado»), cerrar el navegador y volver: la nota sigue ahí.
- Nota con 2 trabajos → «Convertir en encargos» → tarjetas con listas del espacio elegido (solo listas reales). Quitar, editar y cambiar lista o persona; «No convertido» aparece debajo.
- «Enviar todo» (asignados a ti): las tareas aparecen en ClickUp con la descripción y la marca `[kiju:...]`. La nota pasa a «Convertida» y sus encargos se ven en Encargos.
- Fecha de entrega: en ClickUp debe salir el día elegido, no el anterior.
- Audio: pulsar «Grabar audio», hablar, «Parar y transcribir». **Requiere recargar créditos de Gemini**; mientras tanto debe aparecer el aviso con el motivo, el audio listado como «Sin transcribir» y el botón «Transcribir de nuevo».
- Con o sin transcripción, el audio debe aparecer adjunto en cada tarea creada desde esa nota.
- Operaciones → Ajustes → «Transcripción de audio»: cambiar el modelo y guardar.
- Fallo simulado: `docker exec kijutech_app sh -c "echo after > /tmp/ops-simulate-failure"` y reintentar desde una tarjeta: no debe duplicar la tarea.

## Pendientes detectados
- **ClickUp, audio y transcripción no se han probado de extremo a extremo** en esta sesión (sin sesión de navegador, sin token y sin créditos de Gemini). Sí se probó la IA de conversión con una nota real de 3 asuntos (2 trabajos + «llamar al cliente»), dando listas válidas y lo no convertido aparte.
- **Gemini y el formato del audio:** Chrome graba en `audio/webm` y no está en la lista oficial de formatos de audio de Gemini (wav, mp3, aac, ogg, flac, aiff). Puede requerir convertir a WAV en el navegador si Gemini lo rechaza.
- Si falla el adjunto a mitad de varios audios, al reintentar se vuelven a adjuntar los primeros.
- La fila de precio de `gemini-2.5-flash` ya no sirve; no hay precio del modelo por defecto, así que el coste de la transcripción saldrá vacío.
- Una nota convertida no se puede reabrir para editar (solo lectura).
- Seguridad, roles y limpieza de la plantilla siguen aplazados.

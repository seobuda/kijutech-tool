# Operaciones: crear encargos desde la herramienta hacia ClickUp
**Fecha:** 2026-10-29  
**Rama:** operaciones  
**Commit:** f53f6eb2

## Qué se construyó
- `lib/db/schema.ts` — tabla `ops_requests` (con checks de estado y prioridad, índice por cuenta y fecha, e índice único parcial sobre `clickup_task_id` cuando no es nulo).
- `lib/operaciones/clickup.ts` — nuevas funciones: `getMe`, `getListMembers`, `createTask` (fecha sin hora, `due_date_time=false`), `findTaskByMarker` (busca la marca en la lista, abiertas y cerradas) y `madridMidnightMs` (fecha → medianoche de Madrid, corregida para los días de cambio de hora).
- `lib/operaciones/request-actions.ts` — `prepareRequestWithAI`, `createRequest`, `retryRequest`, `getListMembersAction` y el envío fiable `syncToClickUp`.
- `lib/operaciones/process-map.ts` — `OPS_REQUEST_PROCESS_MAP` (mapa visual del proceso; está aparte porque un archivo `'use server'` solo puede exportar funciones async).
- `app/(dashboard)/dashboard/operaciones/nuevo/` — formulario "Nuevo encargo".
- `app/(dashboard)/dashboard/operaciones/encargos/` — lista de encargos con estado, enlace a ClickUp y botón Reintentar.
- `operaciones-tabs.tsx` — pestañas Encargos y Nuevo encargo.
- `lib/architecture-map/registry.ts` — el nodo Operaciones abre ahora el detalle del proceso `ops_requests`.

## Migraciones aplicadas
`lib/db/migrations/0023_ops_requests.sql`: crea `ops_requests` (columnas: id, tenant_id, created_by, clickup_list_id, clickup_list_name, title, original_request, prepared_description, assignee_clickup_id, assignee_name, due_date, priority, status, clickup_task_id, clickup_task_url, error_message, created_at, updated_at, synced_at), sus dos claves foráneas, el índice `ops_requests_tenant_created_idx` y el índice único parcial `ops_requests_clickup_task_id_unique ... WHERE clickup_task_id IS NOT NULL`. Al final añade un `INSERT ... ON CONFLICT DO NOTHING` que siembra el prompt `ops_prepare_request` en `ai_prompts` con el texto exacto indicado.

Backup previo: `backups/backup_pre_operaciones_encargos_20261029_1044.sql` (862 KB, 35 tablas).

## Decisiones técnicas tomadas en auto mode
- **Simulación de fallo sin tocar `docker-compose.yml`:** se activa con la variable `OPS_SIMULATE_FAILURE` o, sin tocar la configuración, creando dentro del contenedor el archivo `/tmp/ops-simulate-failure` con el valor `before` o `after`. `before` falla antes de llamar a ClickUp; `after` deja que ClickUp cree la tarea y pierde la confirmación, que es el caso real que el reintento debe resolver sin duplicar.
- **Búsqueda previa solo en reintentos:** el primer envío no busca la marca (ahorra llamadas a ClickUp); los reintentos sí.
- **Descripción en markdown:** se envía como `markdown_description`; la búsqueda de la marca mira `description`, `text_content` y `markdown_description`.
- **Prueba de la IA fuera de la interfaz:** se hizo una llamada real a Anthropic desde un script temporal en el contenedor (452 entrada / 409 salida tokens); dejó un registro `ops_prepare_request` en `ai_jobs`.
- **Fecha de entrega:** se envía como medianoche de Europe/Madrid.
- **Responsable por defecto:** el usuario de ClickUp dueño del token, si pertenece a la lista elegida.

## Qué verificar manualmente
- En `/dashboard/operaciones/nuevo`, elegir "Pruebas Kiju": el responsable debe venir preseleccionado como tú.
- "Preparar con IA" rellena título y descripción (y avisa de datos que faltan); todo es editable.
- Crear el encargo: la tarea aparece en ClickUp con la descripción y la marca `[kiju:...]` al final, tu usuario asignado, fecha y prioridad.
- En `/dashboard/operaciones/encargos` aparece como "Creado" con enlace.
- Simular fallo: `docker exec kijutech_app sh -c "echo after > /tmp/ops-simulate-failure"`, crear otro encargo → queda en "Error de sincronización" con el motivo; quitar el fallo con `docker exec kijutech_app rm /tmp/ops-simulate-failure` y pulsar Reintentar → se enlaza la tarea ya existente y en ClickUp hay UNA sola.
- Sin pulsar "Preparar con IA", la descripción de la tarea es la petición original.

## Pendientes detectados
- **ClickUp no se ha probado con un token real** en esta sesión (sin sesión de navegador ni token); sí se probó la llamada de IA y el cálculo de fechas.
- Un encargo no se puede editar ni eliminar una vez guardado.
- La búsqueda de la marca recorre hasta 30 páginas de 100 tareas; en listas enormes puede ser lenta.
- `/tmp/ops-simulate-failure` se pierde si se recrea el contenedor (es lo esperado).
- Seguridad, roles y limpieza de la plantilla siguen aplazados.

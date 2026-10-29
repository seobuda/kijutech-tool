# Campo personalizado «Cliente» de ClickUp
**Fecha:** 2026-10-29  
**Rama:** operaciones  
**Commit:** (ver historial de la rama)

## Investigación (solo lectura)
Se consultó `GET /list/{id}/field` en las 193 listas de los 12 espacios seleccionados:
- **Todas** las listas tienen un desplegable «Cliente» (tipo `drop_down`), **el mismo campo** (id `6c35a3bf-…`) en todos los espacios, con **52 opciones** (dominios: «Spid2005.com», «FornsHobersal.com»…).
- Excepción: en el espacio «Redes Sociales», la lista «Programadas Semanal» tiene además otro campo, «Cliente Redes Sociales» (11 opciones, otro id). Se ignora: se usa el campo llamado exactamente «Cliente».
- «Pruebas Kiju» tiene el campo «Cliente» (52 opciones).

## Qué se construyó
- `lib/operaciones/clickup.ts` — `getListFields()` (1 petición por lista, por el cliente con límite) y `custom_fields` en `createTask`.
- `lib/operaciones/structure.ts` — caché de campos: `syncClientFields()` (segundo plano; solo listas nuevas o con más de 7 días, más 1 lista representante por campo para refrescar opciones), `pickClientField`, `clientFieldForList`, `matchClientOption`, `validClient`; `replaceLists` conserva el campo al reescribir las listas; `getStructure` devuelve `clientFields`.
- `lib/operaciones/note-actions.ts` — el prompt recibe `{clientes}` (opciones reales; un solo bloque si el campo es el mismo en todas las listas); la respuesta `cliente` se valida contra las opciones de la lista elegida (si no coincide exactamente, queda vacío); «Enviar todo» guarda el cliente validado en cada encargo.
- `lib/operaciones/request-actions.ts` — «Preparar con IA» propone el cliente de la lista elegida; `createRequest` lo guarda.
- `lib/operaciones/sync.ts` — al crear la tarea rellena el campo «Cliente» si la lista lo tiene y la opción es real; si no, crea la tarea sin él.
- `bloc-notas.tsx`, `nuevo/nuevo-encargo-form.tsx` (+ páginas) — desplegable «Cliente» editable; vacío con aviso ámbar si la IA no lo ve claro; mensaje si la lista no tiene el campo.
- `scripts/ops-prompts-cliente.js/.sql` — prompts `ops_note_to_requests` v3 y `ops_prepare_request` v2 (aplicados a la BD).
- `lib/operaciones/process-map.ts` — mapa visual actualizado.

## Migraciones aplicadas
Backup previo: `backups/backup_pre_operaciones_cliente_20261029.sql`.
- `0027_ops_cliente_fields.sql`: tabla `ops_clickup_fields` (tenant_id, clickup_field_id, name, type, options jsonb, synced_at; única por tenant+campo) y columnas `client_field_id` y `fields_synced_at` en `ops_clickup_lists`.
- `0028_ops_requests_cliente.sql`: columnas `client_option_id` y `client_name` en `ops_requests`.
(SQL aprobado antes de aplicar.)

## Decisiones técnicas tomadas en auto mode
- Las opciones se guardan una vez por campo (no por lista) porque el mismo campo vale para ~190 listas.
- ClickUp no tiene consulta agrupada de campos: 1 petición por lista, solo la primera vez (unos 2,5 min en segundo plano, respetando el límite); luego solo listas nuevas.
- Directiva de IA: elegir cliente es clasificación con 52 opciones; va en la misma llamada de la conversión (sin coste extra) y se valida con coincidencia exacta; no se hace una llamada aparte.

## Qué verificar manualmente
- Bloc: convertir una nota que mencione un cliente; la tarjeta muestra el desplegable relleno; una nota sin cliente claro lo deja vacío con aviso.
- En ClickUp, la tarea creada tiene el campo «Cliente» con la opción correcta.

## Pendientes detectados
- Si se añaden clientes en ClickUp, las opciones se refrescan en la próxima sincronización de estructura (cada hora).
- «Cliente Redes Sociales» (11 opciones) no se usa.

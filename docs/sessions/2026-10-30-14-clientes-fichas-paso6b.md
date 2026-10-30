# Paso 6B · Sección «Clientes» (fichas por cliente)
**Fecha:** 2026-10-30  
**Rama:** operaciones  
**Commit:** dfb5939b

## Qué se construyó
- `app/(dashboard)/dashboard/operaciones/clientes/page.tsx`, `clientes-view.tsx` — pestaña «Clientes»: lista con buscador y filtros (nivel, estado), crear, editar, desactivar/reactivar y eliminar (solo sin encargos, con confirmación), estado vacío, aviso de cambios sin guardar, aviso de opciones de ClickUp sin ficha («Crear fichas»), aviso de posibles duplicados, panel «Niveles y servicios» (catálogos editables) y «Rellenar con IA» (texto o audio).
- `lib/operaciones/clients.ts` — consultas y lógica determinista: fichas, niveles, servicios, búsqueda de cliente por nombre/alias, posibles duplicados y cálculo de fecha en días laborables.
- `lib/operaciones/client-actions.ts` — acciones: `saveClient` (valida nivel, plazo, opción de ClickUp única, espacio/listas reales, servicios, responsables; rechaza contraseñas en herramientas), `setClientActive`, `deleteClient`, `importMissingClients`, `saveLevel/deleteLevel`, `saveService/deleteService`, `aiFillClient`.
- `lib/operaciones/note-actions.ts`, `note-types.ts`, `bloc-notas.tsx` — al convertir una nota: reconoce el cliente por alias, propone lista habitual, responsable habitual del servicio y fecha según el plazo del cliente; aviso ámbar si el cliente está desactivado; se muestra el motivo de la fecha.
- Cambio previo: las notas nuevas del Bloc arrancan con responsable «Sin asignar» (`bloc-notas.tsx`).
- `scripts/ops-prompts-clientes.sql` — prompt `ops_note_to_requests` v6 (`{alias_clientes}`, `{servicios}`, campo `servicio`) y nuevo `ops_client_fill`.
- `lib/operaciones/process-map.ts` — Mapa Visual actualizado. `operaciones-tabs.tsx` — pestaña nueva.

## Migraciones aplicadas
Backup previo: `backups/backup_pre_operaciones_clientes_20261030.sql`.
`lib/db/migrations/0031_ops_clients.sql` (aprobada con los cambios pedidos: sin CHECK de valores fijos en niveles):
- Crea `ops_client_levels`, `ops_services`, `ops_clients`, `ops_client_services`.
- Siembra niveles (top 2, estándar 3, mantenimiento 5 días), servicios (SEO, Google Ads, Web, Mantenimiento, GoHighLevel) y una ficha por cada una de las 52 opciones del campo «Cliente».
- Nota «Cliente interno: tareas propias de Kijutech» en la ficha Kijutech (sigue activa).

## Decisiones técnicas tomadas en auto mode
- Cliente por alias: la IA identifica en la misma llamada; si no acierta, el código busca nombres/alias en el encargo y luego en la nota (solo si sale uno).
- Prioridad del responsable: tarea propia → elegido o nombrado en la nota → habitual del cliente para el servicio → propuesta por fichas del Equipo.
- Las tareas propias no reciben fecha por plazo del cliente.
- La fecha cuenta días laborables desde hoy (L–V o los días de trabajo del cliente); festivos no contemplados.
- Lista habitual: la IA recibe las listas habituales del cliente; si no devuelve lista, el código usa la primera habitual.
- El audio de «Rellenar con IA» reutiliza la ruta `/api/operaciones/equipo-audio`.
- No se guardan contraseñas: se rechaza un texto del tipo «contraseña: …» en herramientas.

## Qué verificar manualmente
- Clientes: revisar los posibles duplicados (`sih`/`Sihbou.com`) y resolverlos con alias o desactivando.
- Rellenar con IA la ficha de otros clientes y ajustar nivel, servicios y responsables.
- Bloc: convertir una nota sobre un cliente con servicio y responsable habitual, sin fecha: debe salir el responsable y la fecha del plazo.
- Desactivar un cliente y convertir una nota suya: aviso ámbar en la tarjeta.
- Audio de «Rellenar con IA» (necesita Gemini con créditos; sin probar).

## Pendientes detectados
- Festivos no contemplados en el cálculo de fechas.
- Posibles duplicados sin resolver: `sih`/`Sihbou.com`; «clubpilatesindautxu.es» vs familia «CP …» y `PilatesClubSpain.com`; `Spid2005.com`/`SonidoFundamental`.
- La ficha RF Serveis (renombrada por la IA) quedó rellenada como prueba: revisar sus datos.
- Migración pendiente (6A): borrar columnas obsoletas de Telegram.
- Usuario de pruebas `ops-test@kijutech.test` y tareas «[PRUEBA PASO 5]» siguen pendientes de borrar antes de servidor.

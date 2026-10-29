# Avisos por Telegram (paso 4)
**Fecha:** 2026-10-29  
**Rama:** operaciones  
**Commit:** (ver historial de la rama)

## Qué se construyó
- `instrumentation.ts` (raíz) — Next.js lo ejecuta al arrancar el servidor y lanza, dentro del propio contenedor `kijutech_app`, los procesos de fondo de Telegram. No se tocó `docker-compose.yml` ni se añadieron servicios ni dependencias.
- `lib/operaciones/telegram-worker.ts` — tres bucles: elección de líder con un candado de PostgreSQL (advisory lock), escucha por consulta periódica larga (`getUpdates`, 50 s) y planificador (cada 30 s: enviar pendientes, reintentar fallidos y comprobar los resúmenes diarios).
- `lib/operaciones/telegram.ts` — cliente mínimo de la API de Bots (fetch; el token nunca se escribe en errores ni logs).
- `lib/operaciones/telegram-handler.ts` — procesa mensajes y botones (usado por el sondeo y por el webhook).
- `lib/operaciones/notifications.ts` — cola de avisos con estado (`ops_notifications`), aviso de encargo nuevo, resumen diario y «Enviar resumen ahora».
- `lib/operaciones/telegram-config.ts`, `telegram-actions.ts` — configuración (token cifrado con el mismo cifrado que ClickUp), miembros, enlaces de vinculación, modo pruebas, webhook.
- `app/api/telegram/webhook/route.ts` — recepción por webhook preparada para un servidor (secreto derivado de `AUTH_SECRET`); en local no se usa.
- `ajustes/telegram-ajustes.tsx` + `ajustes/page.tsx` — Ajustes → Telegram: token y «Probar» (muestra el nombre del bot), interruptor de Modo pruebas (activado por defecto), estado de la escucha y aviso de conflicto, fila por miembro (enlace personal, estado vinculado/sin vincular, zona horaria, hora de entrada, resumen diario, «Generar enlace nuevo», «Desvincular»), mensaje de prueba, «Enviar resumen ahora», cambio a webhook y registro de los últimos avisos con «Reintentar».
- `encargos/page.tsx` — nueva columna «Visto (Telegram)» con cuándo y quién lo pulsó.
- `lib/operaciones/sync.ts` — el aviso se encola SOLO cuando ClickUp confirma la tarea (estado «creado»).
- `lib/operaciones/process-map.ts` — paso «Aviso por Telegram» en el Mapa Visual.

## Migraciones aplicadas
`lib/db/migrations/0026_ops_telegram.sql`: tablas `ops_telegram_config`, `ops_telegram_members`, `ops_notifications` (con clave única por aviso, índice por estado y comprobaciones de estado y tipo) y columnas `seen_at` y `seen_by` en `ops_requests`. Respecto al SQL enseñado: `link_code` es anulable (se borra al usarse) y la configuración guarda `last_error` y `last_error_at` (para mostrar el conflicto).

Backup previo: `backups/backup_pre_operaciones_telegram_20261029_1233.sql` (992 KB, 43 tablas).

## Decisiones técnicas tomadas en auto mode
- **Seguridad:** (1) los chats no vinculados se ignoran sin respuesta, salvo `/start <código válido>`; (2) cada código se consume con un `UPDATE` atómico y queda anulado, y Ajustes permite generar uno nuevo por persona; (3) «Visto» solo cuenta si lo pulsa el chat del responsable (o el del dueño en modo pruebas), comprobado contra el chat al que se envió el aviso; (4) un solo oyente: candado de PostgreSQL + si Telegram devuelve 409, Ajustes muestra «Conflicto».
- **Fiabilidad:** `dedupe_key` único (`new_request:<id>`, `daily:<persona>:<fecha local>`); se inserta primero y se envía después; «reclamar» un aviso suma un intento y mueve `next_attempt_at` 90 s (hace de candado ante caídas); reintentos con espera creciente, máximo 6; el destino se resuelve al enviar.
- **Resumen diario:** a la hora de entrada de cada persona vinculada, en su zona, de lunes a viernes, con ventana de 3 h para recuperarse de un reinicio. Sin tareas → no se envía y se anota «omitido (sin tareas)».
- **Modo pruebas:** todo va al chat del dueño (el miembro del token de ClickUp) con «🧪 Modo pruebas · iba dirigido a: X». El responsable de cada aviso se fija al encolar.
- El destino de los avisos de prueba y de modo pruebas se toma del dueño, no del usuario de la sesión.

## Qué verificar manualmente
- Crear el bot con @BotFather, pegar el token en Ajustes → Telegram, «Guardar token» y «Probar» (debe mostrar el nombre del bot).
- Copiar tu enlace personal, abrirlo en Telegram y pulsar «Iniciar»: el bot responde «Conectado, hola <tu nombre>» y Ajustes muestra «vinculado».
- «Enviar mensaje de prueba» y «Enviar resumen ahora».
- Crear en «Pruebas Kiju» un encargo asignado a ti: llega el aviso con «✅ Visto»; al pulsarlo, la columna «Visto (Telegram)» de Encargos lo muestra.
- En modo pruebas, un encargo asignado a otra persona te llega a ti indicando para quién era.

## Pendientes detectados
- **Probado con un Telegram simulado** (fetch interceptado) y la base de datos real: 33 comprobaciones, entre ellas chats no vinculados, código de un solo uso, rechazo de «Visto» desde el chat equivocado, no duplicar avisos, fallo y reintento, y resumen diario (no duplicado, fines de semana, fuera de ventana, sin tareas). **No se ha probado contra un bot real**: falta crearlo y pegar el token.
- Se probó contra el Telegram real solo con un token falso: la escucha contacta y anota «token no válido (401)», y el aviso de conflicto (simulado) se muestra en Ajustes. Un 409 real no se ha provocado.
- Un duplicado teórico es posible si el servidor se cae exactamente entre enviar el mensaje y anotarlo (Telegram no tiene clave de idempotencia).
- Con varios servidores, el candado hace que solo uno escuche, pero la caché de 2 min de Equipo hoy sigue siendo por proceso.
- Los avisos de un encargo que se creó antes de configurar Telegram no se envían retroactivamente.

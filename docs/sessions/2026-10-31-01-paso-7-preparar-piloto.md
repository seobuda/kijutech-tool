# Paso 7: preparar el piloto del lunes
**Fecha:** 2026-10-31  
**Rama:** feature/paso-7-piloto  
**Commit:** 470294e6

## Qué se construyó
- `lib/operaciones/cleanup.ts` · limpieza asistida de vencidas: tandas por persona, envío de una tarea cada vez, botones (Ya está hecha, Nueva fecha, Ya no aplica, Parar), fechas escritas, cierre con gracias y evento para el resumen; simulación en modo pruebas para tareas de otras personas; `getCleanupTouched` para informes.
- `lib/operaciones/cleanup-actions.ts` y `app/(dashboard)/dashboard/operaciones/cleanup-panel.tsx` · botones «Enviar limpieza de vencidas» (Equipo y Automatizaciones), a una persona o a todas.
- `lib/operaciones/telegram-handler.ts` · botones `cl:*`, `/sugerencia`, `/ayuda`, espera de fecha escrita.
- `lib/operaciones/digest.ts` · secciones «Limpiezas de vencidas» y «Sugerencias del equipo» (esta última en el último resumen del día).
- `lib/operaciones/client-activity.ts`, `client-actions.ts`, `clientes-view.tsx` · lo cerrado/descartado en limpieza no cuenta como trabajo del mes (sale en «Cerradas en limpieza» sin sumar) y los cambios de limpieza no cuentan como actividad del cliente el día en que se tocaron.
- `lib/operaciones/pilot.ts`, `pilot-actions.ts`, pestaña `piloto/` · métricas por semana y persona, fecha de inicio configurable, sugerencias; `app/api/operaciones/suggestion-photo/[id]/route.ts` sirve las capturas pidiéndolas al bot.
- `lib/operaciones/startup.ts`, `telegram-worker.ts` · «Sistema en marcha», latido y tiempo apagado en horario laboral.
- `lib/operaciones/outbox.ts`, `clickup.ts` · acción `set_due`, `updateTaskDue`, `listId` en las tareas.
- `lib/operaciones/automations.ts` · automatizaciones `cleanup` y `startup`.
- `docker-compose.yml` · `restart: unless-stopped` en `postgres` y `app`.
- Mapa Visual (`process-map.ts`, `map-live.ts`) y `docs/ESTADO.md` actualizados; `node scripts/check-architecture-map.js` pasa (13 automatizaciones, 7 tareas, 6 prompts, 33 tablas, 77 pasos en 13 mapas).

## Migraciones aplicadas
`lib/db/migrations/0036_ops_piloto.sql` (backup previo `backups/backup_pre_piloto_20261031.sql`): crea `ops_cleanup_runs` (con índice único parcial de una tanda activa por persona), `ops_cleanup_items`, `ops_suggestions`; añade `ops_telegram_pending.cleanup_item_id`; amplía las comprobaciones `ops_notifications_kind_check` (`cleanup`, `cleanup_summary`, `startup`) y `ops_outbox_action_check` (`set_due`). SQL completo en el archivo, aprobado por Enric antes de aplicarlo.

## Decisiones técnicas tomadas en auto mode
- «Nueva fecha» abre un submenú (mañana, en 3 días, lunes de la semana que viene, escribir fecha) en el mismo mensaje.
- Añadido el botón «Parar limpieza»; lo no revisado queda como está.
- Si una persona tenía una tanda a medias, al relanzar se da por parada y se empieza de nuevo.
- Las tareas reprogramadas no se excluyen de «completadas»; solo las cerradas o descartadas. Un cambio de limpieza solo se ignora como actividad el mismo día en que se tocó.
- El latido se escribe después del aviso de arranque, para que un fallo no pierda la medida.
- Cada reconstrucción de Docker envía también «Sistema en marcha» (se puede apagar en el panel).
- Fecha de inicio del piloto por defecto: el próximo lunes (2026-11-02), guardada al primer uso.
- Tiempos del piloto en minutos laborables según la ficha de Equipo.

## Qué verificar manualmente
- En Telegram: la limpieza de tus vencidas (30 tareas + 1 para otra tanda) ya está enviada; prueba ✅ Ya está hecha, 📅 Nueva fecha (los 3 atajos y escribir `24/11`), 🗑 Ya no aplica y ⏹ Parar. Comprueba en ClickUp el estado, la fecha y el comentario. Ojo: son tareas reales tuyas.
- `/sugerencia` (texto y con captura) y `/ayuda`; la sugerencia debe salir en el resumen de las 18:00 y en Piloto → Sugerencias.
- Pestaña Piloto: métricas y fecha de inicio (2 nov).
- Equipo: lanzar la limpieza a otra persona en modo pruebas y comprobar que dice «simulado» y no toca ClickUp.
- Reiniciar los contenedores (o Windows) y comprobar «Sistema en marcha». Configurar Docker Desktop y Windows según `docs/ESTADO.md` §2.

## Pendientes detectados
- Borrado de datos de prueba (encargos, eventos, avisos, notas): recuento mostrado, falta tu OK.
- El texto de `/ayuda` y los textos de gracias de la limpieza están fijos en el código.
- La exclusión de limpiezas en informes no está probada con datos reales.
- Las limpiezas simuladas también cuentan en las métricas «tareas revisadas».
- Roles de Operaciones siguen sin control (condición obligatoria antes de dar acceso al equipo o subir a servidor).

# Paso 6E · Panel de Automatizaciones
**Fecha:** 2026-10-30  
**Rama:** operaciones  
**Commit:** COMMIT_CODE

## Qué se construyó
- `lib/operaciones/automations.ts` — registro de las 10 automatizaciones con sus valores por defecto (los que estaban fijos en el código), validación de campos y de textos (huecos conocidos, obligatorios, etiquetas de Telegram bien cerradas), render de plantillas (una línea con un hueco opcional vacío desaparece), lectura con caché de 10 s, guardado con registro de cambios y restauración.
- `lib/operaciones/automation-actions.ts` — acciones: guardar, restaurar, vista previa, «Enviarme una prueba» (llega siempre al Telegram del dueño con datos de ejemplo) y interruptor de vigilancia (mantiene su lectura inicial sin avisar).
- `lib/operaciones/quiet.ts` — comida y silencio por persona (huecos que cruzan medianoche): retrasar al final del hueco o adelantar/retrasar al minuto permitido más cercano.
- `lib/operaciones/upcoming.ts` — «Próximos envíos» de 24 h calculados al vuelo (resumen diario, resumen de bandeja, recordatorios previstos, avisos en cola o retrasados).
- `app/(dashboard)/dashboard/operaciones/automatizaciones/{page,automatizaciones-view}.tsx` — pestaña con tarjetas, próximos envíos y registro de cambios.
- Consumidores que ahora leen del panel: `notifications.ts` (aviso de encargo nuevo, resumen diario, reintentos, silencio al enviar), `reminders.ts`, `digest.ts` (horas, margen, «Sin respuesta», alertas), `client-activity.ts` (hora, reintento, recordatorio semanal), `watch.ts` (intervalo), `blockers.ts` / `reviewers.ts` (urgentes), `telegram-handler.ts` (tiempo para contestar al bot).
- Equipo: la ficha tiene comida, silencio y la casilla «Los urgentes pueden saltarse el silencio» (`profile-actions.ts`, `equipo-view.tsx`, `equipo/page.tsx`, `team-profiles.ts`).
- Pestaña Telegram: se quitó el campo de horas del resumen (ahora solo se muestran, con enlace al panel); `saveDigestSettings` eliminada.
- `process-map.ts` — entrada del Mapa Visual.

## Migraciones aplicadas
Backup previo: `backups/backup_pre_operaciones_automatizaciones_20261030.sql`.
`lib/db/migrations/0035_ops_automations.sql`: tablas `ops_automations` (solo guarda lo cambiado) y `ops_automation_changes` (registro), columnas `lunch_start`, `lunch_end`, `quiet_start`, `quiet_end` y `urgent_bypass_quiet` (boolean, falso por defecto) en `ops_team_profiles`, y copia de `ops_telegram_config.digest_times` a `ops_automations` (clave `digest`). Respecto al plan: se añadió `urgent_bypass_quiet` por petición del usuario.

## Decisiones técnicas tomadas en auto mode
- Los valores por defecto viven en el código y la fila solo existe si algo se cambia; restaurar = borrar la fila.
- Los urgentes que se consideran para el silencio son los avisos de bloqueo y de revisión urgentes.
- En modo pruebas no se aplica el silencio (todo va al dueño).
- Las horas del resumen de bandeja pasan a `ops_automations`; `ops_telegram_config.digest_times` queda sin uso. La vigilancia sigue guardando su encendido en `ops_clickup_watch`.
- Tarjetas sin texto editable (actividad, vigilancia, envío): la prueba confirma estado y valores.
- Las tarjetas «Aviso urgente…» editan solo el encabezado; los datos del bloqueo o la revisión siguen siendo del código (hueco `{detalle}`).

## Qué verificar manualmente
- Automatizaciones: cambia un tiempo, guarda y comprueba «Próximos envíos» y el registro.
- Edita un texto, guarda, pulsa «Enviarme una prueba» y mira Telegram.
- Equipo: pon comida o silencio a alguien y comprueba, con el modo pruebas desactivado, que los avisos esperan al final del hueco (en modo pruebas no se aplica).
- Mañana es sábado: no hay resúmenes programados hasta el lunes.

## Pendientes detectados
- Columnas obsoletas: `ops_telegram_config.digest_times` (además de las de la lista anterior).
- El silencio se probó con la lógica pura (cálculo de huecos, adelantar/retrasar, urgentes) pero no con envíos reales fuera del modo pruebas.
- Los textos de «Respuesta» y «Devolución» al responsable siguen fijos en el código.
- Los festivos siguen sin contar; los cambios del panel se aplican por proceso (caché de 10 s, un solo servidor).
- Usuario de pruebas y tareas «[PRUEBA …]» de Pruebas Kiju, pendientes de borrar antes de servidor.

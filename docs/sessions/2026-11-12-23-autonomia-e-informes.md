# Autonomía e informes (fases 1–4 de la revisión de autonomía)
**Fecha:** 2026-11-12  
**Rama:** feature/autonomia  
**Commit:** 26e32868

## Qué se construyó
- **5B desplegado** antes de empezar: `main` `75481a59`, migración 0045, 46 migraciones, web 200, Telegram sin errores.
- `docs/REVISION-AUTONOMIA.md`: diagnóstico y plan (rama `docs/revision-autonomia`, traído aquí con su estado actualizado).
- `lib/operaciones/calendar.ts` + `calendar-actions.ts` + `app/(dashboard)/dashboard/operaciones/calendario/`:
  - festivos (de toda la agencia o de algunas personas) y vacaciones o ausencias por rango;
  - pestaña Equipo → Calendario, solo admin.
- `lib/operaciones/team-profiles.ts`: `Schedule.daysOff` (lo rellena `getScheduleMap`) y `worksOn()`.
  - Lo usan `isWorkDay` (jornada), `isWorkMoment`, `jornadaEndedBetween` y los recordatorios «más tarde» (`reminders.ts`), además del resumen diario (`notifications.ts`).
- `lib/operaciones/jornada.ts`: sin haber empezado en un día libre, los avisos se retienen hasta el siguiente día laborable.
- `lib/operaciones/clients.ts` + `request-proposer.ts`: los plazos en días laborables saltan los festivos de la agencia.
- `lib/operaciones/owner-queue.ts`:
  - respuestas a correos pendientes;
  - plazos por tipo con un recordatorio (`runOwnerSla`).
  - Integrado en `digest.ts` («Necesita de ti») y en Mi bandeja (`bandeja/page.tsx`).
- `lib/operaciones/reports.ts` + `app/(dashboard)/dashboard/operaciones/informes/`:
  - parte de la mañana;
  - informe semanal (Telegram, página y correo);
  - borradores del trabajo del mes por cliente.
- `lib/operaciones/autopilot.ts`:
  - botón «Mover a mañana» (`ap:due`);
  - limpieza semanal;
  - propuesta de subir la autonomía (`ap:up`);
  - bajada automática.
- `lib/operaciones/health.ts`: gasto de IA frente al tope, disco y antigüedad de la copia diaria.
- `scripts/backup.sh` (nuevo): copia diaria comprobada que anota `backup_last_at`, con subida opcional con `rclone`.
- `lib/operaciones/automations.ts`: tarjetas nuevas `owner_sla`, `reports`, `autopilot` y `ai_budget`.
  - En `automation-actions.ts`, «Enviarme una prueba» con datos reales para Informes y Piloto automático.
- `telegram-worker.ts` (tres pasos nuevos del planificador) y `telegram-handler.ts` (botones `ap:`). `events.ts`: eventos `calendario` y `autonomia`.
- `components/app-shell/nav.ts`: pestañas Informes (Operaciones) y Calendario (Equipo), las dos solo para admin.
- Mapa Visual:
  - nodo y mapa «Autonomía e informes» (4 pasos);
  - proveedor en directo `reports`;
  - Salud con `ai_budget`.
  - **La comprobación pasó** (19 automatizaciones, 14 tareas del planificador, 7 prompts, 40 tablas, 102 pasos, 16 mapas).
- Documentación:
  - `docs/ESTADO.md`: §6.20 nueva, tabla del §7, y partes desfasadas corregidas (cabecera, migraciones, tablas, seguridad, mapa, comprobaciones);
  - `docs/GUIA-EQUIPO-JORNADA.md`: vacaciones y festivos;
  - `docs/PRUEBAS-EN-VIVO.md` (nuevo): guía de activación del viernes y del lunes.
- Pruebas:
  - `tests/autonomia.test.ts` (16): cálculo puro e integración con la base de datos;
  - 2 acciones nuevas en `tests/seguridad.test.ts`.

## Migraciones aplicadas
Ninguna. El calendario y la última copia van en `ops_settings` (claves `calendar` y `backup_last_at`). Los avisos nuevos reutilizan el tipo `digest`, con claves `report:`, `sla:` y `ap:`.

## Decisiones técnicas tomadas en auto mode
- **Sin tablas nuevas, para no bloquear la activación de mañana con una aprobación de esquema.**
  - El calendario cabe en un JSON de `ops_settings`: pocas entradas al año que se leen enteras.
  - El informe semanal se calcula al vuelo de los datos guardados, que nunca se borran.
- **El calendario se aplica en un solo sitio** (`getScheduleMap` → `daysOff`): todo lo que ya miraba el horario lo respeta sin tocarlo uno a uno.
- **Reasignar no se automatiza.** La bandeja de salida no tiene la acción y añadirla necesita una migración. El parte propone quién puede cubrir y ofrece «Mover a mañana» (`set_due`, que ya existía). La reasignación en ClickUp la recoge la vigilancia y avisa a la nueva persona.
- **Los plazos solo recuerdan, una vez.** Decidir por defecto (por ejemplo, aceptar una revisión pasado el plazo) queda para cuando haya datos.
- **El tope de IA es una incidencia de Salud y no corta las llamadas.** Cortar exige tocar la pasarela del núcleo (`lib/ai/gateway.ts`).
- **La autonomía solo baja sola; subir siempre necesita el botón de Enric.** Responder correos sigue sin poder ser autónomo.
- **Parte de la mañana:** si la jornada está encendida, espera a que pasen 45 min de la entrada de todos, porque el equipo trabaja en otra zona horaria. Si no hay nada que contar, no se envía.
- **La limpieza semanal viene apagada:** manda mensajes al equipo y conviene encenderla cuando esté acostumbrado.
- **El disco se mide con `statfs('/')` desde el contenedor**, que comparte disco con la base de datos en el servidor. Esto no se ha verificado en el droplet.

## Qué verificar manualmente
- Seguir `docs/PRUEBAS-EN-VIVO.md` §0–§2 (viernes) y §3 (lunes).
- **Con tu cuenta de admin**, tras desplegar:
  - Equipo → Calendario (añadir y quitar un festivo);
  - Operaciones → Informes (las tres vistas);
  - Sistema → Automatizaciones (cuatro tarjetas nuevas y «Enviarme una prueba» en Informes);
  - Sistema → Salud (comprobaciones nuevas: gasto de IA y disco; la de copia aparece al instalar `backup.sh`).
- Instalar `scripts/backup.sh` en el cron del servidor (§0.5 de la guía).
- Revisado en local con el usuario de pruebas (editor):
  - no ve Informes ni Calendario, y las direcciones le redirigen;
  - Equipo muestra Hoy, Fichas y Mi panel;
  - sin errores en los logs.

## Pendientes detectados
- **D4**: IA de reserva en la pasarela del núcleo, si falla el proveedor principal.
- **Aviso de cuota de Resend** (100 correos al día). Hoy no se registran los envíos en una tabla.
- **Prueba de restauración automática mensual** de la copia.
- **Copia fuera de DigitalOcean:** `rclone` + acceso a Drive o al NAS de Enric.
- **Acción «reasignar» en la bandeja de salida** (migración del CHECK de `ops_clickup_outbox.action`), para reasignar desde el parte con un botón.
- **Mi bandeja muestra «nada pendiente»** en la lista de revisiones y bloqueos aunque haya correos arriba. Es cosmético.
- **«Mover a mañana» en modo pruebas** cambia de verdad la fecha en ClickUp (la limpieza, en cambio, simula las tareas de otras personas).
- **Informe semanal:** «a tiempo» solo cuenta encargos con fecha. Las tareas que no pasan por Empezar/Hecho no cuentan como entrega.

# Jornada real (paso 5A) y secciones Equipo / Sistema
**Fecha:** 2026-11-12  
**Rama:** feature/jornada  
**Commit:** 103b4c6b

## Qué se construyó
El paso 5 («jornada real») se amplió, a petición de Enric, a un **sistema de rendimiento del equipo en tres fases**: 5A jornada (esta sesión) → 5B tiempos por tarea con horquilla por tipo de trabajo → 5C puntos, niveles, bonus y «Mi panel» de cada empleado.

Archivos nuevos:
- `lib/operaciones/jornada-core.ts`: cálculo puro del estado del día (`computeDay`), transiciones permitidas, etiquetas y duración de la comida según la ficha.
- `lib/operaciones/jornada.ts`: registros en base de datos (`recordWorkEvent`, `addCorrection`, `voidWorkEvent`), estado actual de cada persona (`getCurrentDays`), avisos retenidos (`jornadaHoldUntil`, `releaseHeldNotices`), tramos trabajados para los recordatorios y la sección de jornada del resumen del dueño.
- `lib/operaciones/jornada-bot.ts`: comandos `/empiezo`, `/descanso N`, `/comida`, `/salir`, `/vuelvo`, `/termino`, `/ausente`, `/jornada`; botones `jw:…` (con el usuario dentro, para que el modo pruebas apunte la acción a quien iba dirigido); respuestas escritas (motivo de salida o ausencia, con qué empieza, hora real de salida); mensaje de buenos días con un botón por tarea.
- `lib/operaciones/jornada-worker.ts`: planificador: buenos días, reintentos por Telegram y correo, «¿Has vuelto?», comida sin marcar, «¿Terminas?», cierre automático y pregunta de corrección al día siguiente.
- `lib/operaciones/jornada-overview.ts` y `lib/operaciones/jornada-actions.ts`: datos de la pestaña y correcciones (solo `admin`).
- `app/(dashboard)/dashboard/operaciones/jornada/`: pestaña **Equipo → Jornada** (día con navegación, cifras, tabla por persona con línea de tiempo, anular con motivo, añadir registro, últimos 7 días).
- `lib/db/migrations/0044_ops_jornada.sql`: tabla `ops_work_events` y tipo de aviso `jornada`.
- `tests/jornada.test.ts`: 23 pruebas (cálculo, transiciones, horas locales, minutos reales, botones e integración con la base de datos).

Archivos modificados:
- `components/app-shell/nav.ts`, `app/(dashboard)/dashboard/operaciones/layout.tsx` y `operaciones-tabs.tsx`: el módulo se muestra en tres secciones (**Operaciones**, **Equipo**, **Sistema**) con su cabecera y pestañas; las rutas no cambian.
- `equipo-hoy/page.tsx` y `team-grid.tsx`: estado de jornada de cada persona.
- `lib/operaciones/notifications.ts`: tipo `jornada`, envío programado (`notBefore`), retención por jornada; el resumen diario no sale si la jornada está encendida (la sustituye).
- `lib/operaciones/reminders.ts`: minutos realmente trabajados en los días fichados; la comida de la ficha ya no cuenta como minuto laborable.
- `lib/operaciones/digest.ts`: sección «🕘 Jornada del último día laborable» en el primer resumen del día.
- `lib/operaciones/telegram-handler.ts`: enlaza comandos, botones y respuestas de la jornada; ayuda ampliada.
- `lib/operaciones/telegram-worker.ts`: paso `runJornada` del planificador.
- `lib/operaciones/automations.ts`: automatización `jornada` (apagada por defecto, `defaultEnabled`).
- `lib/operaciones/automation-actions.ts`: «Enviarme una prueba» de la jornada (buenos días reales del dueño).
- `lib/operaciones/resend.ts`: `sendInternalEmail` (correo interno sin «Re:» ni copia oculta).
- `lib/operaciones/events.ts`: tipo de evento `jornada`.
- `lib/db/schema.ts`: `opsWorkEvents` y el tipo `jornada` en el CHECK de avisos.
- Mapa Visual: `process-map.ts` (proceso «Jornada real» con 8 pasos), `map-live.ts` (proveedor `jornada`), `registry.ts` (nodo «Jornada real» construido y «Tiempos por tarea» pendiente). **La comprobación pasó** (14 automatizaciones, 11 tareas, 7 prompts, 39 tablas, 90 pasos).
- `docs/ESTADO.md`: §6.18, §7, §10, §17, §18, §19 y cabecera.

## Migraciones aplicadas
`0044_ops_jornada.sql` (aplicada en **local**; en producción, pendiente de aprobación):

```sql
CREATE TABLE IF NOT EXISTS "ops_work_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "profile_id" uuid REFERENCES "ops_team_profiles"("id") ON DELETE SET NULL,
  "clickup_user_id" varchar(50) NOT NULL,
  "person_name" varchar(255) NOT NULL,
  "work_date" date NOT NULL,
  "kind" varchar(20) NOT NULL,
  "at" timestamp NOT NULL,
  "planned_minutes" integer,
  "reason" text,
  "task" jsonb,
  "source" varchar(15) DEFAULT 'telegram' NOT NULL,
  "created_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_by_name" varchar(255),
  "voided_at" timestamp,
  "voided_by_name" varchar(255),
  "void_reason" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ops_work_events_kind_check" CHECK ("kind" IN ('entrada', 'descanso', 'comida', 'salida_urgente', 'vuelta', 'salida', 'ausencia')),
  CONSTRAINT "ops_work_events_source_check" CHECK ("source" IN ('telegram', 'web', 'auto', 'correccion'))
);
CREATE INDEX IF NOT EXISTS "ops_work_events_person_day_idx" ON "ops_work_events" USING btree ("tenant_id", "clickup_user_id", "work_date");
CREATE INDEX IF NOT EXISTS "ops_work_events_day_idx" ON "ops_work_events" USING btree ("tenant_id", "work_date");

ALTER TABLE "ops_notifications" DROP CONSTRAINT IF EXISTS "ops_notifications_kind_check";
ALTER TABLE "ops_notifications" ADD CONSTRAINT "ops_notifications_kind_check" CHECK ("kind" IN ('new_request','daily_summary','test','review_request','block_alert','reply','returned','digest','reminder','cleanup','cleanup_summary','startup','email_proposal','health','jornada'));
```

Backup local previo: `backups/backup_pre_jornada_20261112.sql`.

## Decisiones técnicas tomadas en auto mode
- **Automatización apagada por defecto** (`defaultEnabled: false`, campo nuevo en `AutomationDef`): si viniera encendida, al desplegar el bot empezaría a escribir al equipo sin que Enric se lo haya explicado.
- **Quien lleva las operaciones no ficha:** el dueño del token de ClickUp queda fuera de los buenos días, del resumen y de la pestaña. Tampoco fichan quienes no tienen Telegram vinculado (salvo en modo pruebas), para no llenar la cola de avisos fallidos.
- **Los buenos días sustituyen al resumen diario** cuando la jornada está encendida (mismas tareas, más los botones), para no mandar dos mensajes a la misma hora.
- **El nombre de la tarea viaja en el aviso** (`payload.jwTasks`): al pulsar «▶️ tarea» no se pregunta a ClickUp (regla de caché).
- **Columna `work_date`** con el día laboral en la zona de la persona: simplifica todas las consultas por día y cubre a quien trabaja pasada la medianoche (el día «abierto» sigue siendo el de la entrada).
- **Comida no marcada → se pregunta**, no se supone (como pidió Enric con la entrada). «Ya comí» la apunta en el hueco de la ficha solo si no hay registros en medio.
- **«5 min más» de descanso no cambia lo previsto:** el exceso cuenta frente al cupo.
- **Cierre automático:** al inicio de la pausa en curso o al fin del horario (o en su último registro si fue más tarde).
- **Excluir la comida de los minutos laborables** en todos los cálculos (recordatorios, piloto, actividad de clientes, arranque): era un fallo confirmado en la revisión del 11 nov y la jornada real lo hacía evidente.
- **Tipo de aviso `jornada` añadido al CHECK de `ops_notifications`** dentro de la misma migración aprobada (mismo patrón que `health` en la 0043): la regla obliga a que todo aviso pase por esa tabla.
- **Las rutas no cambian** al crear las secciones Equipo y Sistema: los enlaces de los avisos de Telegram siguen funcionando.
- **Verificación sin reconstruir el contenedor:** el permiso de la sesión bloqueó `docker compose up --build`. Los tipos, la compilación de producción y las pruebas se ejecutaron en un contenedor temporal en la misma red (sin tocar los que están en marcha). En ese contenedor fallan 9 pruebas que dependen del entorno (8 de HTTP necesitan la app en el puerto 3000; la auditoría de secretos encuentra el `.env` porque se montó el repositorio entero) y pasan las 168 restantes, incluidas las 23 de jornada y las 37 de seguridad.

## Qué verificar manualmente
- Reconstruir el contenedor local (`docker compose up --build -d`) y abrir `http://127.0.0.1:3000`: el menú tiene «Operaciones», «Equipo» y (administración) «Sistema»; cada sección muestra solo sus pestañas y las migas dicen «Equipo › Jornada».
- **Equipo → Jornada** con la jornada apagada: aviso amarillo con enlace a Automatizaciones; navegación de días; tabla vacía de registros.
- **Sistema → Automatizaciones → Jornada real**: «Enviarme una prueba» manda tus buenos días con botones (los botones registran TU jornada: anúlala después en la pestaña Jornada).
- Tras activar en producción (en modo pruebas primero): buenos días a la hora de entrada, botón de una tarea → «Entrada registrada», `/descanso 5` → a los 5 min «¿Has vuelto?», `/salir médico`, `/vuelvo`, `/termino`; que «Equipo → Hoy» muestre el estado y que la pestaña Jornada lo refleje; anular un registro con motivo y añadir otro.
- Que los avisos de encargos esperen mientras alguien está en descanso y salgan al pulsar «He vuelto» (fuera del modo pruebas).

## Pendientes detectados
- **Despliegue:** fusionar `feature/jornada` en `main` y desplegar con `bash scripts/deploy.sh --migrate` (0044), con la aprobación de Enric. Después, activar la automatización **solo tras explicar el sistema al equipo**.
- **Registro de jornada y ley:** si alguien tiene contrato español, el registro es obligatorio y se conserva 4 años; hay que informar al equipo de que se le mide. No verificado si os aplica.
- **Presencia real:** ningún sistema prueba que alguien está trabajando; la señal es el resultado (la 1.ª actividad sale en el resumen). En 5B los tiempos por tarea darán la medida de verdad.
- **Tareas sin tipo de trabajo** (las creadas directamente en ClickUp): en 5B el bot deberá preguntar el tipo al empezar.
- **«Mi panel» y usuarios del equipo:** para el 5C cada persona necesita un usuario web enlazado a su ficha (`ops_team_profiles.user_id` ya existe).
- **Exclusión por persona:** hoy solo se excluye al dueño; si alguien más no debe fichar (p. ej. un colaborador externo), hará falta un ajuste en su ficha (cambio de esquema).
- **`docs/ESTADO.md` §10:** los conteos de filas por tabla son del 30 oct; conviene regenerarlos en una pasada aparte.

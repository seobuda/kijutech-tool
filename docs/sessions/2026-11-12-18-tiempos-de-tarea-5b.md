# Tiempos de tarea (paso 5B) y rediseño de 5B+5C con psicología
**Fecha:** 2026-11-12  
**Rama:** feature/tiempos-tarea (y diseno/rendimiento-equipo para el documento de diseño)  
**Commit:** 0cd5b1aa

## Qué se construyó
- `docs/DISENO-RENDIMIENTO-EQUIPO.md`: rediseño de 5B y 5C tras el rechazo del primer diseño, que era solo técnico. Investigación de motivación y gamificación (vigilancia, Goodhart, rankings, umbrales de bonus, rachas, progreso, estimación). Enfoque aprobado por Enric:
  - los puntos salen del resultado y el tiempo queda como información;
  - estimación propia de un toque;
  - bonus progresivo por trimestres;
  - sin ranking.
- `lib/db/migrations/0045_ops_tiempos.sql` y `lib/db/schema.ts`: tabla `ops_task_times`, margen mín–máx en `ops_work_types` y registro `tarea` en `ops_work_events`.
- `lib/operaciones/jornada-core.ts`: registro «tarea» (cambio de tarea activa), `activeTask` y `taskPieces` (lo trabajado repartido por tarea, sin pausas).
- `lib/operaciones/tiempos-core.ts` (nuevo, puro): minutos por tarea, resultado frente al margen, precisión por los dos lados, opciones de estimación, margen propuesto y texto de feedback.
- `lib/operaciones/tiempos.ts` (nuevo):
  - `onTaskStarted`: entrada o cambio de tarea; abre la fila y pregunta el tipo y la estimación.
  - `onTaskFinished`: cierra la fila, da el feedback, pide motivo y URL si se pasa, y pregunta «¿con qué sigues?».
  - Respuestas de la persona y lecturas.
- `lib/operaciones/tiempos-bot.ts` (nuevo): botones `tt:` (estimación, tipo y motivo) y la URL escrita.
- `lib/operaciones/jornada-bot.ts`: «🔄 Cambiar tarea» en el panel, `buildSwitchPrompt`, códigos `cw`/`sw`/`so` y la tarea activa en `/jornada`. La entrada abre también el tiempo de la tarea.
- `lib/operaciones/workflow.ts` (`startWork`, `finishWork`) y `watch.ts` (cerrada en ClickUp): ganchos de tiempos con import dinámico, porque `jornada-bot` importa `workflow`.
- `lib/operaciones/telegram-handler.ts`: enruta `tt:` y `ttu:`; ayuda del bot.
- `lib/operaciones/automations.ts`: automatización `tiempos`, apagada por defecto (`askEstimate`, `askJustify`, `precisionPct`, `minSamples`).
- `lib/operaciones/tiempos-overview.ts` y `tiempos-actions.ts` (nuevos): datos de la pestaña y de Mi panel. Acciones admin `saveBandAction`, `voidTaskTimeAction` y `correctTaskTimeAction`.
- `app/(dashboard)/dashboard/operaciones/tiempos/` (nueva, admin): márgenes con propuesta real, por persona, fuera de margen, en curso y correcciones.
- `app/(dashboard)/dashboard/operaciones/mi-panel/` (nueva, todos): solo los datos propios.
- `lib/operaciones/profile-actions.ts` (`setProfileWebUser`, admin) y la pantalla de Fichas: enlazar la ficha con el usuario web.
- Pantalla Jornada: el registro «Cambio de tarea» con su tarea y la tarea activa en la tabla. No se puede añadir a mano.
- `components/app-shell/nav.ts`: pestañas Tiempos (admin) y Mi panel.
- Mapa Visual: nodo y mapa «Tiempos de tarea» (5 pasos), proveedor `live` `tiempos`, `future-tiempos` construido y `future-juego` (5C) pendiente. **La comprobación pasó** (15 automatizaciones, 40 tablas, 96 pasos, 15 mapas).
- `docs/ESTADO.md` (§6.19, §7, §10, §17, §18, §19 y cabecera), `docs/GUIA-EQUIPO-JORNADA.md` (tareas y tiempos, preguntas frecuentes) y `docs/PRUEBAS-JORNADA.md` (§8, unos 10 min).
- Pruebas: `tests/tiempos.test.ts` (7 de cálculo puro y un circuito de 12 pasos con la base de datos) y 4 acciones nuevas en `tests/seguridad.test.ts`.

## Migraciones aplicadas
Solo en local, con backup previo `backups/backup_pre_tiempos_20261112.sql`. `0045_ops_tiempos.sql`:

```sql
ALTER TABLE "ops_work_types" ADD COLUMN IF NOT EXISTS "min_minutes" integer;
ALTER TABLE "ops_work_types" ADD COLUMN IF NOT EXISTS "max_minutes" integer;
ALTER TABLE "ops_work_types" DROP CONSTRAINT IF EXISTS "ops_work_types_band_check";
ALTER TABLE "ops_work_types" ADD CONSTRAINT "ops_work_types_band_check" CHECK (
  ("min_minutes" IS NULL OR "min_minutes" >= 0) AND ("max_minutes" IS NULL OR "max_minutes" > 0)
  AND ("min_minutes" IS NULL OR "max_minutes" IS NULL OR "min_minutes" <= "max_minutes")
);
ALTER TABLE "ops_work_events" DROP CONSTRAINT IF EXISTS "ops_work_events_kind_check";
ALTER TABLE "ops_work_events" ADD CONSTRAINT "ops_work_events_kind_check" CHECK ("kind" IN ('entrada', 'descanso', 'comida', 'salida_urgente', 'vuelta', 'salida', 'ausencia', 'tarea'));
CREATE TABLE IF NOT EXISTS "ops_task_times" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "clickup_task_id" varchar(50) NOT NULL,
  "request_id" uuid REFERENCES "ops_requests"("id") ON DELETE SET NULL,
  "clickup_user_id" varchar(50) NOT NULL,
  "person_name" varchar(255) NOT NULL,
  "task_name" varchar(500) NOT NULL,
  "work_type_key" varchar(40),
  "status" varchar(20) DEFAULT 'abierta' NOT NULL,
  "started_at" timestamp NOT NULL,
  "done_at" timestamp,
  "worked_minutes" integer,
  "estimate_minutes" integer,
  "band_min" integer,
  "band_max" integer,
  "verdict" varchar(20),
  "precision_hit" boolean,
  "justify_status" varchar(20) DEFAULT 'no_necesaria' NOT NULL,
  "evidence_url" text,
  "over_reason" varchar(30),
  "over_note" text,
  "source" varchar(20) DEFAULT 'bot' NOT NULL,
  "voided_at" timestamp,
  "voided_by_name" varchar(255),
  "void_reason" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ops_task_times_status_check" CHECK ("status" IN ('abierta', 'cerrada')),
  CONSTRAINT "ops_task_times_verdict_check" CHECK ("verdict" IS NULL OR "verdict" IN ('dentro', 'rapido', 'pasado', 'sin_margen')),
  CONSTRAINT "ops_task_times_justify_check" CHECK ("justify_status" IN ('no_necesaria', 'pendiente', 'enviada')),
  CONSTRAINT "ops_task_times_source_check" CHECK ("source" IN ('bot', 'web', 'clickup', 'correccion'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "ops_task_times_open_unique" ON "ops_task_times" USING btree ("tenant_id", "clickup_task_id", "clickup_user_id") WHERE "status" = 'abierta' AND "voided_at" IS NULL;
CREATE INDEX IF NOT EXISTS "ops_task_times_done_idx" ON "ops_task_times" USING btree ("tenant_id", "done_at");
CREATE INDEX IF NOT EXISTS "ops_task_times_person_idx" ON "ops_task_times" USING btree ("tenant_id", "clickup_user_id", "done_at");
```

## Decisiones técnicas tomadas en auto mode
- **El cambio de tarea es parte de la jornada; medirlo, de «Tiempos».** Con la jornada encendida y los tiempos apagados se puede cambiar de tarea (sirve para ver con qué está cada uno), pero no se abren filas ni se pregunta nada.
- **«Empezar» en un aviso sin haber empezado el día registra la entrada con esa tarea**, coherente con «la entrada va siempre con una tarea». Tras terminar o con el día marcado como ausente no reabre la jornada, para evitar falsos positivos. Para eso está «Vuelvo a empezar».
- **Feedback y preguntas por la cola de avisos** (tipo `jornada`): llegan desde cualquier camino (bot, web, ClickUp), con clave única por fila (una sola pregunta aunque empezar pase por dos sitios) y sin esperar al hueco de comida.
- **El margen propuesto se calcula al abrir la pestaña** (percentiles 25–75 de 120 días) en lugar de guardarse en una columna: menos piezas y siempre al día.
- **Al terminar no se bloquea el «Hecho» esperando la URL:** la tarea se cierra en ClickUp y el motivo y la URL se piden después, con la fila «esperando motivo» hasta que responde. Así el flujo existente no cambia.
- **La URL del comentario de «Hecho»** se guarda como prueba si lo llevaba.
- **Precisión por los dos lados** (tolerancia del % de lo estimado, mínimo 5 min), para que inflar la estimación no sirva.
- **El tipo lo hereda el encargo** cuando lo elige la persona y el encargo no lo tenía.
- **Enlazar la ficha con el usuario web solo lo puede hacer el admin**, porque da acceso a datos de jornada. La lista de usuarios se pasa sin `password_hash`.

## Qué verificar manualmente
- Revisado en local con el usuario de pruebas (editor):
  - Equipo muestra Hoy, Fichas y Mi panel (sin Jornada ni Tiempos).
  - Mi panel enseña el estado vacío («Tu usuario aún no está enlazado a tu ficha»).
  - Fichas no muestra el selector «Mi panel:».
  - Sin errores en los logs.
- **No revisado en el navegador (el usuario de pruebas no es admin):** la pantalla Equipo → Tiempos y el selector «Mi panel:» de Fichas. Revisarlos con la cuenta de Enric tras desplegar.
- Seguir `docs/PRUEBAS-JORNADA.md` §8 en producción tras desplegar con `--migrate`, con «Tiempos de tarea» encendida.
- Producción: la migración 0045 se aplica con `bash scripts/deploy.sh --migrate`, que hace backup antes.

## Pendientes detectados
- **5C** (temporadas, niveles, misiones, bonus): diseño aprobado, sin construir. Necesita su aprobación de esquema.
- Recordatorio de «esperando motivo»: hoy se pregunta una vez; si no responde, solo queda marcado en la pestaña y en Mi panel.
- Las tareas «Otra cosa» (texto libre, sin tarea de ClickUp) cuentan como tarea activa, pero no se miden.
- El tiempo trabajado entre terminar una tarea y elegir la siguiente no se atribuye a ninguna. Podría mostrarse como «sin tarea» en 5C.
- El cambio de tarea solo ofrece encargos abiertos y tareas con fecha de hoy o vencidas. Para el resto está «Otra cosa».

-- Tiempos de tarea (paso 5B). Ver docs/DISENO-RENDIMIENTO-EQUIPO.md.
-- 1) Margen de minutos por tipo de trabajo (lo edita el admin; el sistema propone uno con los datos reales).
ALTER TABLE "ops_work_types" ADD COLUMN IF NOT EXISTS "min_minutes" integer;
ALTER TABLE "ops_work_types" ADD COLUMN IF NOT EXISTS "max_minutes" integer;
ALTER TABLE "ops_work_types" DROP CONSTRAINT IF EXISTS "ops_work_types_band_check";
ALTER TABLE "ops_work_types" ADD CONSTRAINT "ops_work_types_band_check" CHECK (
  ("min_minutes" IS NULL OR "min_minutes" >= 0) AND ("max_minutes" IS NULL OR "max_minutes" > 0)
  AND ("min_minutes" IS NULL OR "max_minutes" IS NULL OR "min_minutes" <= "max_minutes")
);

-- 2) Nuevo registro de la jornada: «tarea» = cambio de tarea activa (el tiempo trabajado se atribuye a ella).
ALTER TABLE "ops_work_events" DROP CONSTRAINT IF EXISTS "ops_work_events_kind_check";
ALTER TABLE "ops_work_events" ADD CONSTRAINT "ops_work_events_kind_check" CHECK ("kind" IN ('entrada', 'descanso', 'comida', 'salida_urgente', 'vuelta', 'salida', 'ausencia', 'tarea'));

-- 3) Una fila por tarea y persona: se abre al empezarla y se cierra al terminarla (bot, web o ClickUp).
--    Guarda el margen vigente en ese momento para que cambiarlo después no altere el histórico.
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

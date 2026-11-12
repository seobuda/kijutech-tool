-- Jornada real (paso 5A): registros de la jornada de cada persona (entrada, descansos, comida, salidas
-- urgentes con motivo, vuelta, salida y ausencias). Nunca se borran: una corrección anula y añade otro.
-- Y el tipo de aviso «jornada» (buenos días, reintentos, fin de descanso, cierre…).
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

-- Registro central de errores (núcleo, 17 nov 2026). Tres tablas nuevas, sin tocar las existentes:
--   sys_error_groups    un error agrupado por «huella» (módulo + zona + mensaje normalizado): cuántas veces, cuándo,
--                       estado (nuevo, investigando, resuelto, ignorado), nota y diagnóstico del Técnico de mantenimiento
--   sys_error_events    cada vez que pasó (las últimas por grupo): mensaje, traza, lo que vio el usuario, contexto
--   sys_error_settings  avisos por Telegram, diagnóstico automático y días que se guardan (por cuenta)
-- tenant_id nulo = error del sistema sin cuenta conocida.

CREATE TABLE IF NOT EXISTS "sys_error_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE CASCADE,
  "fingerprint" varchar(64) NOT NULL,
  "source" varchar(40) NOT NULL,
  "area" varchar(120) DEFAULT '' NOT NULL,
  "title" varchar(300) NOT NULL,
  "severity" varchar(10) DEFAULT 'error' NOT NULL,
  "status" varchar(14) DEFAULT 'nuevo' NOT NULL,
  "occurrences" integer DEFAULT 0 NOT NULL,
  "reopened_count" integer DEFAULT 0 NOT NULL,
  "first_seen" timestamp DEFAULT now() NOT NULL,
  "last_seen" timestamp DEFAULT now() NOT NULL,
  "resolved_at" timestamp,
  "resolved_by" varchar(160),
  "note" text,
  "diagnosis" jsonb,
  "diagnosis_at" timestamp,
  "diagnosis_job_id" uuid,
  "diagnosis_requested_at" timestamp,
  "notified_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "sys_error_groups_severity_check" CHECK ("severity" IN ('aviso', 'error', 'critico')),
  CONSTRAINT "sys_error_groups_status_check" CHECK ("status" IN ('nuevo', 'investigando', 'resuelto', 'ignorado'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "sys_error_groups_fingerprint_unique" ON "sys_error_groups" ("fingerprint");
CREATE INDEX IF NOT EXISTS "sys_error_groups_tenant_idx" ON "sys_error_groups" ("tenant_id", "status", "last_seen");
CREATE INDEX IF NOT EXISTS "sys_error_groups_last_seen_idx" ON "sys_error_groups" ("last_seen");

CREATE TABLE IF NOT EXISTS "sys_error_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "group_id" uuid NOT NULL REFERENCES "sys_error_groups"("id") ON DELETE CASCADE,
  "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE CASCADE,
  "message" text DEFAULT '' NOT NULL,
  "stack" text,
  "user_message" text,
  "context" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "actor" varchar(160),
  "channel" varchar(20),
  "path" varchar(300),
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "sys_error_events_group_idx" ON "sys_error_events" ("group_id", "created_at");
CREATE INDEX IF NOT EXISTS "sys_error_events_created_idx" ON "sys_error_events" ("created_at");

CREATE TABLE IF NOT EXISTS "sys_error_settings" (
  "tenant_id" uuid PRIMARY KEY REFERENCES "tenants"("id") ON DELETE CASCADE,
  "alerts" boolean DEFAULT true NOT NULL,
  "alert_min_severity" varchar(10) DEFAULT 'error' NOT NULL,
  "auto_diagnose" boolean DEFAULT true NOT NULL,
  "max_diagnoses_per_day" integer DEFAULT 2 NOT NULL,
  "retention_days" integer DEFAULT 60 NOT NULL,
  "state" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

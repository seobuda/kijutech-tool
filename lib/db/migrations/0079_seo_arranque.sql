-- SEO · Análisis inicial con etapas y puertas (27 nov 2026; docs/PLAN-SEO-JEFE.md D0, con la auditoría Opus). Aditiva:
-- una ejecución abierta por proyecto, lo que se decidió saltar y el último empujón de cada acción. El estado de las etapas
-- se calcula siempre con los datos actuales (no se guarda).
CREATE TABLE IF NOT EXISTS "seo_setup_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "status" varchar(12) DEFAULT 'abierta' NOT NULL,
  "started_by" varchar(120),
  "skipped" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "last_actions" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_error" text,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "finished_at" timestamp,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "seo_setup_runs_status_check" CHECK ("status" IN ('abierta', 'completada', 'cancelada'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "seo_setup_runs_one_open" ON "seo_setup_runs" ("project_id") WHERE "status" = 'abierta';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seo_setup_runs_project_idx" ON "seo_setup_runs" ("project_id", "started_at");

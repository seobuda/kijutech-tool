-- SEO · Estrategias por ciclos (27 nov 2026; docs/PLAN-SEO-CICLOS.md aprobado por Enric, con la auditoría Opus §11).
-- Aditiva: ciclos (uno activo por proyecto), líneas del catálogo y huecos semanales; y de qué ciclo sale cada propuesta y brief.
CREATE TABLE IF NOT EXISTS "seo_cycles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "seq" integer NOT NULL,
  "kind" varchar(12) DEFAULT 'estrategia' NOT NULL,
  "name" varchar(160) NOT NULL,
  "period_months" smallint DEFAULT 3 NOT NULL,
  "starts_on" date NOT NULL,
  "ends_on" date NOT NULL,
  "status" varchar(12) DEFAULT 'propuesto' NOT NULL,
  "monthly_hours" numeric(5, 1),
  "reserve_pct" smallint DEFAULT 30 NOT NULL,
  "approval_mode" varchar(12) DEFAULT 'lote_admin' NOT NULL,
  "thesis" text,
  "baseline" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "options" jsonb,
  "business_type" varchar(40),
  "created_by" varchar(120),
  "approved_by" varchar(120),
  "approved_at" timestamp,
  "closed_at" timestamp,
  "close_report" jsonb,
  "read_due_on" date,
  "read_report" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "seo_cycles_seq_unique" UNIQUE ("project_id", "seq"),
  CONSTRAINT "seo_cycles_kind_check" CHECK ("kind" IN ('cimientos', 'estrategia')),
  CONSTRAINT "seo_cycles_status_check" CHECK ("status" IN ('propuesto', 'activo', 'cerrado', 'leido', 'cancelado')),
  CONSTRAINT "seo_cycles_approval_check" CHECK ("approval_mode" IN ('lote_admin', 'automatico'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "seo_cycles_one_active" ON "seo_cycles" ("project_id") WHERE "status" = 'activo';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "seo_cycle_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "cycle_id" uuid NOT NULL REFERENCES "seo_cycles"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "playbook" varchar(40) NOT NULL,
  "playbook_version" smallint DEFAULT 1 NOT NULL,
  "params" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "technique" varchar(40) NOT NULL,
  "hours_budget" numeric(6, 1) DEFAULT '0' NOT NULL,
  "goal" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" varchar(12) DEFAULT 'activa' NOT NULL,
  "sort" smallint DEFAULT 0 NOT NULL,
  "scorecard" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "seo_cycle_lines_status_check" CHECK ("status" IN ('activa', 'cancelada'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seo_cycle_lines_cycle_idx" ON "seo_cycle_lines" ("cycle_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "seo_cycle_slots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "cycle_id" uuid NOT NULL REFERENCES "seo_cycles"("id") ON DELETE CASCADE,
  "line_id" uuid NOT NULL REFERENCES "seo_cycle_lines"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "due_week" date NOT NULL,
  "n" smallint DEFAULT 1 NOT NULL,
  "title" varchar(300) NOT NULL,
  "role" varchar(12) NOT NULL,
  "est_hours" numeric(5, 1) DEFAULT '0' NOT NULL,
  "topic_key" varchar(80),
  "keyword" varchar(200),
  "target_url" text,
  "finding_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "status" varchar(12) DEFAULT 'previsto' NOT NULL,
  "skip_reason" text,
  "approved_by" varchar(120),
  "approved_at" timestamp,
  "plan_item_id" uuid REFERENCES "seo_plan_items"("id") ON DELETE SET NULL,
  "brief_id" uuid REFERENCES "seo_briefs"("id") ON DELETE SET NULL,
  "intervention_source" varchar(40),
  "intervention_ref" varchar(80),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "seo_cycle_slots_unique" UNIQUE ("line_id", "due_week", "n"),
  CONSTRAINT "seo_cycle_slots_status_check" CHECK ("status" IN ('previsto', 'aprobado', 'encargado', 'hecho', 'saltado')),
  CONSTRAINT "seo_cycle_slots_role_check" CHECK ("role" IN ('tecnico', 'redactor', 'agente'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seo_cycle_slots_project_idx" ON "seo_cycle_slots" ("project_id", "status", "due_week");
--> statement-breakpoint
ALTER TABLE "seo_plan_items" ADD COLUMN IF NOT EXISTS "cycle_id" uuid REFERENCES "seo_cycles"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "seo_plan_items" ADD COLUMN IF NOT EXISTS "cycle_line_id" uuid REFERENCES "seo_cycle_lines"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "seo_briefs" ADD COLUMN IF NOT EXISTS "cycle_line_id" uuid REFERENCES "seo_cycle_lines"("id") ON DELETE SET NULL;

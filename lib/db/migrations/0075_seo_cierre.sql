-- Cierre del módulo SEO (27 nov 2026; docs/DISENO-SEO-CIERRE.md con la auditoría Opus). Aditiva: conexiones del cliente
-- (WordPress, GoHighLevel) y sus leads en el núcleo; panel de IA mensual y Autoridad en SEO; borrador de WordPress en el brief.
CREATE TABLE IF NOT EXISTS "client_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "kind" varchar(20) NOT NULL,
  "base_url" text,
  "external_id" varchar(120),
  "username" varchar(120),
  "secret_encrypted" text NOT NULL,
  "secret_iv" varchar(64) NOT NULL,
  "status" varchar(10) DEFAULT 'ok' NOT NULL,
  "detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_ok_at" timestamp,
  "last_error" text,
  "last_sync_at" timestamp,
  "created_by" varchar(120),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "client_connections_unique" UNIQUE ("tenant_id", "client_id", "kind"),
  CONSTRAINT "client_connections_kind_check" CHECK ("kind" IN ('wordpress', 'gohighlevel')),
  CONSTRAINT "client_connections_status_check" CHECK ("status" IN ('ok', 'error'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "client_leads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "provider" varchar(20) NOT NULL,
  "external_id" varchar(100) NOT NULL,
  "form_id" varchar(100),
  "form_name" varchar(200),
  "page_url" varchar(500),
  "referrer" varchar(500),
  "channel" varchar(10) DEFAULT 'otros' NOT NULL,
  "utm" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "has_gclid" boolean DEFAULT false NOT NULL,
  "submitted_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "client_leads_unique" UNIQUE ("tenant_id", "provider", "external_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_leads_client_idx" ON "client_leads" ("client_id", "submitted_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "seo_ai_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "question" varchar(300) NOT NULL,
  "question_key" varchar(150) NOT NULL,
  "origin" varchar(10) NOT NULL,
  "status" varchar(10) DEFAULT 'propuesta' NOT NULL,
  "created_by" varchar(120),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "seo_ai_questions_unique" UNIQUE ("project_id", "question_key"),
  CONSTRAINT "seo_ai_questions_status_check" CHECK ("status" IN ('propuesta', 'activa', 'quitada'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "seo_ai_checks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "question_id" uuid NOT NULL REFERENCES "seo_ai_questions"("id") ON DELETE CASCADE,
  "run_month" date NOT NULL,
  "sample" smallint DEFAULT 1 NOT NULL,
  "assistant" varchar(12) NOT NULL,
  "status" varchar(10) DEFAULT 'pendiente' NOT NULL,
  "client_cited" boolean,
  "client_named" boolean,
  "competitors" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "excerpt" varchar(700),
  "cost_usd" numeric(8, 4),
  "error" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "seo_ai_checks_unique" UNIQUE ("question_id", "run_month", "sample", "assistant"),
  CONSTRAINT "seo_ai_checks_status_check" CHECK ("status" IN ('pendiente', 'enviando', 'hecha', 'fallida')),
  CONSTRAINT "seo_ai_checks_assistant_check" CHECK ("assistant" IN ('chatgpt', 'gemini', 'google_ai', 'perplexity'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seo_ai_checks_project_idx" ON "seo_ai_checks" ("project_id", "run_month");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "seo_link_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "domain" varchar(255) NOT NULL,
  "is_client" boolean DEFAULT false NOT NULL,
  "month" date NOT NULL,
  "summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "gap" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "new_lost" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "cost_usd" numeric(8, 4),
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "seo_link_snapshots_unique" UNIQUE ("project_id", "domain", "month")
);
--> statement-breakpoint
ALTER TABLE "seo_briefs" ADD COLUMN IF NOT EXISTS "wp_post_id" integer;
--> statement-breakpoint
ALTER TABLE "seo_briefs" ADD COLUMN IF NOT EXISTS "wp_edit_url" text;

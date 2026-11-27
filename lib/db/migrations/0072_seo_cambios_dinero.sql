-- SEO parte 6, tanda 6b (27 nov 2026; docs/DISENO-SEO-TECNICO-2BC.md con dos auditorías Opus). Aditiva:
-- registro de cambios de la web (desde cada rastreo y desde la vigilancia de las páginas de dinero) y la lista de páginas
-- de dinero con su foto de referencia (baseline), la última y lo pendiente de confirmar.
CREATE TABLE IF NOT EXISTS "seo_change_log" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "url" text NOT NULL,
  "url_hash" varchar(40) NOT NULL,
  "field" varchar(30) NOT NULL,
  "before" text,
  "after" text,
  "extra" jsonb,
  "source" varchar(10) NOT NULL,
  "batch" varchar(64) NOT NULL,
  "prev_observed_at" timestamp,
  "detected_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "seo_change_log_source_check" CHECK ("source" IN ('rastreo', 'dinero'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "seo_change_log_unique" ON "seo_change_log" ("project_id", "batch", "url_hash", "field");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seo_change_log_project_idx" ON "seo_change_log" ("project_id", "detected_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seo_change_log_url_idx" ON "seo_change_log" ("project_id", "url_hash", "detected_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "seo_money_pages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "url" text NOT NULL,
  "url_hash" varchar(40) NOT NULL,
  "reasons" text[] DEFAULT '{}'::text[] NOT NULL,
  "expires_at" timestamp,
  "out_since" timestamp,
  "active" boolean DEFAULT true NOT NULL,
  "baseline" jsonb,
  "baseline_version" integer DEFAULT 1 NOT NULL,
  "last" jsonb,
  "stable" jsonb,
  "last_checked_at" timestamp,
  "pending_kind" varchar(40),
  "pending_since" timestamp,
  "fail_streak" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "seo_money_pages_unique" ON "seo_money_pages" ("project_id", "url_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seo_money_pages_active_idx" ON "seo_money_pages" ("project_id", "active");

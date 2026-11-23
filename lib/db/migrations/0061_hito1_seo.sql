-- Hito 1 SEO (23 nov 2026; docs/DISENO-TECNICO-HITO1.md con la revisión del §9). Aprobado por Enric.
-- Solo añade: una columna con valor nulo y cinco tablas nuevas. No toca datos existentes.

-- 1. Ficha del cliente (núcleo): tipo de negocio de schema.org ------------------------------------------------------
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "business_type" varchar(60);--> statement-breakpoint

-- 2. Registro de intervenciones (núcleo) ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "interventions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "domain" varchar(20) NOT NULL,
  "technique" varchar(40) NOT NULL,
  "taxonomy_version" smallint NOT NULL DEFAULT 1,
  "business_type" varchar(60),
  "urls" text[] NOT NULL DEFAULT '{}'::text[],
  "queries" text[] NOT NULL DEFAULT '{}'::text[],
  "hypothesis" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "source" varchar(40) NOT NULL,
  "source_ref" varchar(60) NOT NULL,
  "request_ref" varchar(60),
  "status" varchar(12) NOT NULL DEFAULT 'prevista',
  "done_at" timestamp,
  "outcome" jsonb,
  "measured_at" timestamp,
  "created_by" varchar(120),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "interventions_source_unique" UNIQUE ("tenant_id", "source", "source_ref"),
  CONSTRAINT "interventions_domain_check" CHECK ("domain" IN ('seo', 'ads', 'web', 'otro')),
  CONSTRAINT "interventions_status_check" CHECK ("status" IN ('prevista', 'hecha', 'cancelada'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interventions_request_idx" ON "interventions" ("tenant_id", "request_ref");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interventions_technique_idx" ON "interventions" ("tenant_id", "domain", "technique", "done_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "interventions_client_idx" ON "interventions" ("client_id", "done_at");--> statement-breakpoint

-- 3. Bitácora de I+D (núcleo, familia de la base de conocimiento) --------------------------------------------------
CREATE TABLE IF NOT EXISTS "kb_feed_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "domain" varchar(20) NOT NULL,
  "source_key" varchar(40) NOT NULL,
  "hash" varchar(64) NOT NULL,
  "url" text,
  "title" varchar(500) NOT NULL,
  "summary" text,
  "published_at" timestamp,
  "kind" varchar(20) NOT NULL DEFAULT 'novedad',
  "starts_at" timestamp,
  "ends_at" timestamp,
  "notified_at" timestamp,
  "digest_week" date,
  "article_id" uuid REFERENCES "kb_articles"("id") ON DELETE SET NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "kb_feed_items_unique" UNIQUE ("tenant_id", "source_key", "hash"),
  CONSTRAINT "kb_feed_items_kind_check" CHECK ("kind" IN ('core_update', 'incidencia', 'documentacion', 'novedad'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kb_feed_items_recent_idx" ON "kb_feed_items" ("tenant_id", "domain", "published_at");--> statement-breakpoint

-- 4. SEO: expediente provisional ----------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "seo_dossier_facts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "field" varchar(40) NOT NULL,
  "value" jsonb NOT NULL,
  "source" varchar(20) NOT NULL,
  "source_ref" text,
  "confidence" smallint NOT NULL DEFAULT 50,
  "status" varchar(12) NOT NULL DEFAULT 'provisional',
  "decided_by" varchar(120),
  "decided_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "seo_dossier_facts_unique" UNIQUE ("project_id", "field", "source"),
  CONSTRAINT "seo_dossier_facts_source_check" CHECK ("source" IN ('ficha', 'web', 'places', 'wayback', 'gsc', 'busqueda', 'persona', 'ia')),
  CONSTRAINT "seo_dossier_facts_status_check" CHECK ("status" IN ('provisional', 'confirmado', 'descartado')),
  CONSTRAINT "seo_dossier_facts_confidence_check" CHECK ("confidence" BETWEEN 0 AND 100)
);--> statement-breakpoint

-- 5. SEO: plan de mejora --------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "seo_plan_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "plan_key" varchar(120) NOT NULL,
  "title" varchar(300) NOT NULL,
  "description" text NOT NULL,
  "technique" varchar(40) NOT NULL,
  "finding_ids" uuid[] NOT NULL DEFAULT '{}'::uuid[],
  "urls" text[] NOT NULL DEFAULT '{}'::text[],
  "priority" smallint NOT NULL DEFAULT 2,
  "score" double precision NOT NULL DEFAULT 0,
  "est_hours" numeric(5,1) NOT NULL,
  "hypothesis" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" varchar(12) NOT NULL DEFAULT 'pendiente',
  "request_ref" varchar(60),
  "request_url" text,
  "request_error" text,
  "decided_by" varchar(120),
  "decided_at" timestamp,
  "reject_note" text,
  "origin" varchar(10) NOT NULL DEFAULT 'reglas',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "seo_plan_items_key_unique" UNIQUE ("project_id", "plan_key"),
  CONSTRAINT "seo_plan_items_status_check" CHECK ("status" IN ('pendiente', 'aprobada', 'descartada', 'hecha', 'caducada')),
  CONSTRAINT "seo_plan_items_priority_check" CHECK ("priority" BETWEEN 1 AND 3),
  CONSTRAINT "seo_plan_items_origin_check" CHECK ("origin" IN ('reglas', 'ia', 'persona'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seo_plan_items_project_idx" ON "seo_plan_items" ("project_id", "status", "priority");--> statement-breakpoint

-- 6. SEO: reseñas de la ficha de Google ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "seo_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "client_asset_id" uuid NOT NULL REFERENCES "client_assets"("id") ON DELETE CASCADE,
  "external_id" varchar(300) NOT NULL,
  "author" varchar(200),
  "rating" smallint,
  "text" text,
  "published_at" timestamp,
  "reply_text" text,
  "reply_at" timestamp,
  "draft" text,
  "draft_status" varchar(12) NOT NULL DEFAULT 'sin_borrador',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "seo_reviews_unique" UNIQUE ("client_asset_id", "external_id"),
  CONSTRAINT "seo_reviews_draft_check" CHECK ("draft_status" IN ('sin_borrador', 'pendiente', 'aprobado', 'publicado', 'descartado')),
  CONSTRAINT "seo_reviews_rating_check" CHECK ("rating" IS NULL OR "rating" BETWEEN 1 AND 5)
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seo_reviews_client_idx" ON "seo_reviews" ("client_id", "published_at");

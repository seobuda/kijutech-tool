-- Cimientos de la plataforma (núcleo, 23 nov 2026; docs/DISENO-TECNICO-CIMIENTOS.md). Aprobado por Enric.
-- Proyecto con cliente y alcance, comunicaciones con clientes, cola de trabajos, Search Console en detalle, rastreador
-- y hallazgos tipados. No toca datos existentes (solo añade columnas con valor por defecto y tablas nuevas).

-- 1. Proyecto -------------------------------------------------------------------------------------------------------
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "service" varchar(20) NOT NULL DEFAULT 'seo';--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "monthly_hours" numeric(6,1);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "brief" jsonb;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "updated_at" timestamp NOT NULL DEFAULT now();--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_service_check" CHECK ("service" IN ('seo', 'ads', 'web', 'otro'));--> statement-breakpoint
-- Obligatorio en los proyectos nuevos. Los que existan al migrar sin cliente quedan marcados como «legacy» y pueden
-- seguir así (archivarlos o editarlos no falla): un CHECK se comprueba en cada UPDATE, aunque se cree NOT VALID.
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "legacy" boolean NOT NULL DEFAULT false;--> statement-breakpoint
UPDATE "projects" SET "legacy" = true WHERE "client_id" IS NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_required" CHECK ("client_id" IS NOT NULL OR "legacy");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_client_idx" ON "projects" ("client_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "project_assets" (
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "client_asset_id" uuid NOT NULL REFERENCES "client_assets"("id") ON DELETE CASCADE,
  "role" varchar(12) NOT NULL DEFAULT 'principal',
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "project_assets_pk" PRIMARY KEY ("project_id", "client_asset_id"),
  CONSTRAINT "project_assets_role_check" CHECK ("role" IN ('principal', 'secundario'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_assets_asset_idx" ON "project_assets" ("client_asset_id");--> statement-breakpoint

ALTER TABLE "ops_requests" ADD COLUMN IF NOT EXISTS "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ops_requests_project_idx" ON "ops_requests" ("project_id") WHERE "project_id" IS NOT NULL;--> statement-breakpoint

-- 2. Comunicaciones con clientes --------------------------------------------------------------------------------------
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "comms_approval_default" varchar(10) NOT NULL DEFAULT 'siempre';--> statement-breakpoint
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_comms_approval_check" CHECK ("comms_approval_default" IN ('siempre', 'nunca'));--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "comms_approval" varchar(10) NOT NULL DEFAULT 'heredar';--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_comms_approval_check" CHECK ("comms_approval" IN ('heredar', 'siempre', 'nunca'));--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "client_contact_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "contact_id" uuid NOT NULL REFERENCES "client_contacts"("id") ON DELETE CASCADE,
  "kind" varchar(16) NOT NULL,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE CASCADE,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "client_contact_subs_kind_check" CHECK ("kind" IN ('informes', 'preguntas', 'avisos', 'aprobaciones', 'facturacion', 'todo'))
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "client_contact_subs_unique" ON "client_contact_subscriptions" ("contact_id", "kind", coalesce("project_id", '00000000-0000-0000-0000-000000000000'::uuid));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_contact_subs_tenant_idx" ON "client_contact_subscriptions" ("tenant_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "client_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
  "kind" varchar(16) NOT NULL,
  "subject" varchar(300) NOT NULL,
  "body_text" text NOT NULL,
  "to_contact_ids" uuid[] NOT NULL,
  "cc_contact_ids" uuid[] NOT NULL DEFAULT '{}'::uuid[],
  "author_kind" varchar(10) NOT NULL,
  "author_name" varchar(255) NOT NULL,
  "author_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "author_agent_key" varchar(60),
  "status" varchar(22) NOT NULL,
  "approval_required" boolean NOT NULL,
  "decided_by" varchar(255),
  "decided_at" timestamp,
  "reject_reason" text,
  "sent_at" timestamp,
  "provider_message_id" varchar(300),
  "last_error" text,
  "thread_key" varchar(300) NOT NULL,
  "reply_to_inbound_id" uuid,
  "dedupe_key" varchar(200) NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "client_messages_dedupe_unique" UNIQUE ("tenant_id", "dedupe_key"),
  CONSTRAINT "client_messages_kind_check" CHECK ("kind" IN ('informes', 'preguntas', 'avisos', 'aprobaciones', 'facturacion')),
  CONSTRAINT "client_messages_author_check" CHECK ("author_kind" IN ('persona', 'agente', 'sistema')),
  CONSTRAINT "client_messages_status_check" CHECK ("status" IN ('borrador', 'pendiente_aprobacion', 'aprobado', 'enviado', 'rechazado', 'fallido'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_messages_status_idx" ON "client_messages" ("tenant_id", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_messages_client_idx" ON "client_messages" ("client_id", "created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_messages_thread_idx" ON "client_messages" ("thread_key");--> statement-breakpoint

-- 3. Cola de trabajos ----------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "kind" varchar(60) NOT NULL,
  "scope_type" varchar(10) NOT NULL DEFAULT 'cuenta',
  "scope_id" varchar(64),
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "priority" smallint NOT NULL DEFAULT 5,
  "run_at" timestamp NOT NULL DEFAULT now(),
  "status" varchar(10) NOT NULL DEFAULT 'pendiente',
  "attempts" integer NOT NULL DEFAULT 0,
  "max_attempts" integer NOT NULL DEFAULT 3,
  "locked_by" varchar(60),
  "locked_at" timestamp,
  "heartbeat_at" timestamp,
  "timeout_s" integer NOT NULL DEFAULT 300,
  "last_error" text,
  "result" jsonb,
  "dedupe_key" varchar(200),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "finished_at" timestamp,
  CONSTRAINT "jobs_status_check" CHECK ("status" IN ('pendiente', 'en_curso', 'hecho', 'fallido', 'cancelado')),
  CONSTRAINT "jobs_scope_check" CHECK ("scope_type" IN ('proyecto', 'cliente', 'cuenta'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_ready_idx" ON "jobs" ("run_at", "priority") WHERE "status" = 'pendiente';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_running_idx" ON "jobs" ("kind") WHERE "status" = 'en_curso';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_tenant_kind_idx" ON "jobs" ("tenant_id", "kind", "created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "jobs_dedupe_open_unique" ON "jobs" ("tenant_id", "dedupe_key") WHERE "dedupe_key" IS NOT NULL AND "status" IN ('pendiente', 'en_curso');--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "job_schedules" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "process_key" varchar(60) NOT NULL,
  "scope_type" varchar(10) NOT NULL DEFAULT 'cuenta',
  "scope_id" varchar(64) NOT NULL DEFAULT '',
  "every_minutes" integer NOT NULL,
  "next_run_at" timestamp NOT NULL DEFAULT now(),
  "last_run_at" timestamp,
  "last_status" varchar(10),
  "last_error" text,
  "consecutive_failures" integer NOT NULL DEFAULT 0,
  "enabled" boolean NOT NULL DEFAULT true,
  "paused_until" timestamp,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "job_schedules_pk" PRIMARY KEY ("tenant_id", "process_key", "scope_id")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "job_schedules_due_idx" ON "job_schedules" ("next_run_at") WHERE "enabled";--> statement-breakpoint

-- 4. Search Console en detalle --------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "gsc_properties" (
  "id" serial PRIMARY KEY,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "client_asset_id" uuid REFERENCES "client_assets"("id") ON DELETE SET NULL,
  "site_url" varchar(300) NOT NULL,
  "kind" varchar(12) NOT NULL,
  "first_date" date,
  "last_date" date,
  "sync_state" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" varchar(10) NOT NULL DEFAULT 'activa',
  "last_error" text,
  "last_sync_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "gsc_properties_site_unique" UNIQUE ("tenant_id", "site_url"),
  CONSTRAINT "gsc_properties_kind_check" CHECK ("kind" IN ('dominio', 'prefijo', 'plataforma'))
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "gsc_queries" (
  "id" bigserial PRIMARY KEY,
  "property_id" integer NOT NULL REFERENCES "gsc_properties"("id") ON DELETE CASCADE,
  "query" text NOT NULL,
  "query_hash" varchar(40) NOT NULL,
  "branded" boolean,
  "first_seen" date NOT NULL,
  CONSTRAINT "gsc_queries_hash_unique" UNIQUE ("property_id", "query_hash")
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "gsc_pages" (
  "id" bigserial PRIMARY KEY,
  "property_id" integer NOT NULL REFERENCES "gsc_properties"("id") ON DELETE CASCADE,
  "url" text NOT NULL,
  "url_hash" varchar(40) NOT NULL,
  "first_seen" date NOT NULL,
  CONSTRAINT "gsc_pages_hash_unique" UNIQUE ("property_id", "url_hash")
);--> statement-breakpoint

-- Detalle diario particionado por mes. Las particiones las crea el código (ensureGscPartition) antes de escribir, y
-- se borran enteras pasados 24 meses (retención). Sin claves foráneas en la tabla particionada para escribir rápido;
-- al borrar una propiedad se limpia por código.
CREATE TABLE IF NOT EXISTS "gsc_daily" (
  "property_id" integer NOT NULL,
  "date" date NOT NULL,
  "search_type" smallint NOT NULL,
  "device" smallint NOT NULL,
  "query_id" bigint NOT NULL,
  "page_id" bigint NOT NULL,
  "clicks" integer NOT NULL,
  "impressions" integer NOT NULL,
  "pos_sum" double precision NOT NULL,
  CONSTRAINT "gsc_daily_pk" PRIMARY KEY ("property_id", "date", "search_type", "device", "query_id", "page_id")
) PARTITION BY RANGE ("date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gsc_daily_query_idx" ON "gsc_daily" ("property_id", "query_id", "date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gsc_daily_page_idx" ON "gsc_daily" ("property_id", "page_id", "date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gsc_daily_date_brin" ON "gsc_daily" USING brin ("date");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "gsc_daily_totals" (
  "property_id" integer NOT NULL REFERENCES "gsc_properties"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "search_type" smallint NOT NULL,
  "clicks" integer NOT NULL,
  "impressions" integer NOT NULL,
  "pos_sum" double precision NOT NULL,
  "query_clicks" integer NOT NULL DEFAULT 0,
  "truncated" boolean NOT NULL DEFAULT false,
  CONSTRAINT "gsc_daily_totals_pk" PRIMARY KEY ("property_id", "date", "search_type")
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "gsc_daily_country" (
  "property_id" integer NOT NULL REFERENCES "gsc_properties"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "country" varchar(3) NOT NULL,
  "clicks" integer NOT NULL,
  "impressions" integer NOT NULL,
  "pos_sum" double precision NOT NULL,
  CONSTRAINT "gsc_daily_country_pk" PRIMARY KEY ("property_id", "date", "country")
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "gsc_monthly" (
  "property_id" integer NOT NULL REFERENCES "gsc_properties"("id") ON DELETE CASCADE,
  "month" date NOT NULL,
  "query_id" bigint NOT NULL,
  "page_id" bigint NOT NULL,
  "clicks" integer NOT NULL,
  "impressions" integer NOT NULL,
  "pos_sum" double precision NOT NULL,
  CONSTRAINT "gsc_monthly_pk" PRIMARY KEY ("property_id", "month", "query_id", "page_id")
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "gsc_monthly_page_idx" ON "gsc_monthly" ("property_id", "page_id");--> statement-breakpoint

-- 5. Rastreador ----------------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "crawl_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "project_id" uuid REFERENCES "projects"("id") ON DELETE CASCADE,
  "target" varchar(12) NOT NULL DEFAULT 'propio',
  "root_url" text NOT NULL,
  "status" varchar(10) NOT NULL DEFAULT 'pendiente',
  "max_pages" integer NOT NULL DEFAULT 500,
  "pages_done" integer NOT NULL DEFAULT 0,
  "robots_txt" text,
  "sitemaps" text[],
  "state" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "started_at" timestamp,
  "finished_at" timestamp,
  "error" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "crawl_runs_target_check" CHECK ("target" IN ('propio', 'competidor')),
  CONSTRAINT "crawl_runs_status_check" CHECK ("status" IN ('pendiente', 'en_curso', 'hecho', 'error'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawl_runs_project_idx" ON "crawl_runs" ("project_id", "target", "created_at");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "crawl_pages" (
  "run_id" uuid NOT NULL REFERENCES "crawl_runs"("id") ON DELETE CASCADE,
  "url" text NOT NULL,
  "url_hash" varchar(40) NOT NULL,
  "status_code" integer,
  "redirect_to" text,
  "content_type" varchar(120),
  "title" text,
  "meta_description" text,
  "h1" text[],
  "headings" jsonb,
  "canonical" text,
  "robots_meta" varchar(200),
  "x_robots" varchar(200),
  "lang" varchar(20),
  "hreflang" jsonb,
  "word_count" integer,
  "content_hash" varchar(40),
  "simhash" varchar(16),
  "links_internal" integer,
  "links_external" integer,
  "depth" integer,
  "in_sitemap" boolean NOT NULL DEFAULT false,
  "jsonld" jsonb,
  "schema_types" text[],
  "images_without_alt" integer,
  "bytes" integer,
  "fetch_ms" integer,
  "error" text,
  "fetched_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "crawl_pages_pk" PRIMARY KEY ("run_id", "url_hash")
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "crawl_links" (
  "run_id" uuid NOT NULL REFERENCES "crawl_runs"("id") ON DELETE CASCADE,
  "from_hash" varchar(40) NOT NULL,
  "to_hash" varchar(40) NOT NULL,
  "anchor" varchar(200),
  "nofollow" boolean NOT NULL DEFAULT false
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawl_links_to_idx" ON "crawl_links" ("run_id", "to_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crawl_links_from_idx" ON "crawl_links" ("run_id", "from_hash");--> statement-breakpoint

-- 6. Hallazgos tipados ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "findings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "kind" varchar(60) NOT NULL,
  "rule_version" integer NOT NULL DEFAULT 1,
  "severity" varchar(10) NOT NULL,
  "status" varchar(10) NOT NULL DEFAULT 'abierto',
  "dedupe_key" varchar(300) NOT NULL,
  "url" text,
  "query" text,
  "metric" varchar(40),
  "value" double precision,
  "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "source" varchar(80) NOT NULL,
  "request_id" uuid,
  "first_seen" timestamp NOT NULL DEFAULT now(),
  "last_seen" timestamp NOT NULL DEFAULT now(),
  "resolved_at" timestamp,
  "dismissed_by" varchar(255),
  "dismiss_reason" text,
  CONSTRAINT "findings_dedupe_unique" UNIQUE ("project_id", "dedupe_key"),
  CONSTRAINT "findings_severity_check" CHECK ("severity" IN ('info', 'aviso', 'importante', 'critico')),
  CONSTRAINT "findings_status_check" CHECK ("status" IN ('abierto', 'resuelto', 'descartado', 'aceptado'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "findings_project_status_idx" ON "findings" ("project_id", "status", "severity");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "findings_project_kind_idx" ON "findings" ("project_id", "kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "findings_project_url_idx" ON "findings" ("project_id", "url");

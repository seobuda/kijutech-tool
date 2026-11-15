-- Módulo «Rendimiento» (15 nov 2026, aprobado por Enric; diseño en docs/DISENO-RENDIMIENTO-CLIENTE.md).
-- Guarda cada día los números de Search Console, Analytics 4 y Business Profile de cada cliente para no perder el
-- histórico (Google solo guarda 16-18 meses) y medir la estrategia.
--   perf_daily        una fila por cliente, fuente, propiedad, día, métrica y desglose (formato largo)
--   perf_gsc_monthly  las 1.000 consultas y las 1.000 páginas con más clics de cada mes (Search Console)
--   perf_sync         estado de la descarga de cada propiedad (histórico, al día, error)
--   perf_annotations  hitos de la estrategia (se ven en las gráficas y sirven para comparar antes y después)
--   perf_settings     avisos de caídas y subidas, informe mensual y sección del informe semanal
-- Los datos se borran solo si se borra el cliente (cascada). Quitar una cuenta de la ficha NO borra su histórico.

CREATE TABLE IF NOT EXISTS "perf_daily" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "source" varchar(10) NOT NULL,
  "property" varchar(200) NOT NULL,
  "date" date NOT NULL,
  "metric" varchar(40) NOT NULL,
  "dim_type" varchar(20) DEFAULT '' NOT NULL,
  "dim_value" varchar(120) DEFAULT '' NOT NULL,
  "value" double precision NOT NULL,
  CONSTRAINT "perf_daily_pk" PRIMARY KEY ("client_id", "source", "property", "date", "metric", "dim_type", "dim_value"),
  CONSTRAINT "perf_daily_source_check" CHECK ("source" IN ('gsc', 'ga4', 'gbp'))
);
CREATE INDEX IF NOT EXISTS "perf_daily_tenant_idx" ON "perf_daily" USING btree ("tenant_id", "source", "metric", "date");

CREATE TABLE IF NOT EXISTS "perf_gsc_monthly" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "property" varchar(200) NOT NULL,
  "month" date NOT NULL,
  "kind" varchar(10) NOT NULL,
  "key" text NOT NULL,
  "clicks" integer DEFAULT 0 NOT NULL,
  "impressions" integer DEFAULT 0 NOT NULL,
  "ctr" double precision DEFAULT 0 NOT NULL,
  "position" double precision DEFAULT 0 NOT NULL,
  CONSTRAINT "perf_gsc_monthly_pk" PRIMARY KEY ("client_id", "property", "month", "kind", "key"),
  CONSTRAINT "perf_gsc_monthly_kind_check" CHECK ("kind" IN ('query', 'page'))
);

CREATE TABLE IF NOT EXISTS "perf_sync" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "source" varchar(10) NOT NULL,
  "property" varchar(200) NOT NULL,
  "status" varchar(20) DEFAULT 'pendiente' NOT NULL,
  "history_from" date,
  "synced_until" date,
  "backfill_done" boolean DEFAULT false NOT NULL,
  "state" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_daily_on" date,
  "last_run_at" timestamp,
  "next_attempt_at" timestamp,
  "last_error" text,
  "error_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "perf_sync_property_unique" UNIQUE ("client_id", "source", "property"),
  CONSTRAINT "perf_sync_source_check" CHECK ("source" IN ('gsc', 'ga4', 'gbp')),
  CONSTRAINT "perf_sync_status_check" CHECK ("status" IN ('pendiente', 'descargando', 'al_dia', 'error', 'inactiva'))
);
CREATE INDEX IF NOT EXISTS "perf_sync_tenant_idx" ON "perf_sync" USING btree ("tenant_id", "status");

CREATE TABLE IF NOT EXISTS "perf_annotations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "date" date NOT NULL,
  "kind" varchar(20) DEFAULT 'otro' NOT NULL,
  "title" varchar(200) NOT NULL,
  "notes" text,
  "source" varchar(10) DEFAULT 'manual' NOT NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "perf_annotations_kind_check" CHECK ("kind" IN ('servicio', 'web', 'contenido', 'campana', 'google', 'otro')),
  CONSTRAINT "perf_annotations_source_check" CHECK ("source" IN ('manual', 'agente', 'sistema'))
);
CREATE INDEX IF NOT EXISTS "perf_annotations_client_idx" ON "perf_annotations" USING btree ("client_id", "date");

CREATE TABLE IF NOT EXISTS "perf_settings" (
  "tenant_id" uuid PRIMARY KEY NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "alerts_enabled" boolean DEFAULT true NOT NULL,
  "alert_pct" integer DEFAULT 30 NOT NULL,
  "alert_rises" boolean DEFAULT true NOT NULL,
  "alert_min_volume" integer DEFAULT 20 NOT NULL,
  "monthly_report" boolean DEFAULT true NOT NULL,
  "weekly_section" boolean DEFAULT true NOT NULL,
  "state" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

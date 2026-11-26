-- SEO parte 4, posiciones (26 nov 2026; docs/DISENO-SEO-POSICIONES.md). Aditiva: búsquedas que se siguen por proyecto y
-- su posición real cada semana en Google (DataForSEO, cola asíncrona), en filas compactas con el estado de cada tarea.
CREATE TABLE IF NOT EXISTS "seo_rank_keywords" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "keyword" varchar(150) NOT NULL,
  "keyword_key" varchar(150) NOT NULL,
  "origin" varchar(16) NOT NULL,
  "language" varchar(5) DEFAULT 'es' NOT NULL,
  "device" varchar(8) DEFAULT 'mobile' NOT NULL,
  "status" varchar(10) DEFAULT 'activa' NOT NULL,
  "impressions" integer,
  "volume" integer,
  "volume_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "seo_rank_keywords_origin_check" CHECK ("origin" IN ('gsc', 'servicio_zona', 'marca', 'manual')),
  CONSTRAINT "seo_rank_keywords_status_check" CHECK ("status" IN ('activa', 'pausada', 'quitada')),
  CONSTRAINT "seo_rank_keywords_device_check" CHECK ("device" IN ('mobile', 'desktop'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "seo_rank_keywords_unique" ON "seo_rank_keywords" ("project_id", "keyword_key", "device");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "seo_rank_checks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "keyword_id" uuid NOT NULL REFERENCES "seo_rank_keywords"("id") ON DELETE CASCADE,
  "run_id" uuid NOT NULL,
  "task_id" varchar(64),
  "status" varchar(10) DEFAULT 'pendiente' NOT NULL,
  "location_name" varchar(120),
  "language" varchar(5),
  "device" varchar(8),
  "position" integer,
  "url" text,
  "client_urls" text[],
  "local_pack" boolean,
  "local_rank" integer,
  "aio" boolean,
  "aio_cites" boolean,
  "features" text[],
  "top10" text[],
  "cost_usd" numeric(10, 5),
  "error" text,
  "posted_at" timestamp,
  "checked_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "seo_rank_checks_status_check" CHECK ("status" IN ('pendiente', 'enviada', 'hecha', 'fallida', 'caducada'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "seo_rank_checks_unique" ON "seo_rank_checks" ("keyword_id", "run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seo_rank_checks_project_idx" ON "seo_rank_checks" ("project_id", "checked_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seo_rank_checks_open_idx" ON "seo_rank_checks" ("status") WHERE "status" IN ('pendiente', 'enviada');

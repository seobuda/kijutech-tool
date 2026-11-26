-- SEO parte 5, local, tanda 5b (27 nov 2026; docs/DISENO-SEO-GEOGRID.md con la auditoría Opus). Aditiva: geo-grid del
-- mapa de Google (DataForSEO Maps en cola): una ejecución por búsqueda (centro, paso, zoom) y una fila por punto con el
-- puesto del cliente y los 20 primeros (compacto).
CREATE TABLE IF NOT EXISTS "seo_geogrid_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "place_row_id" uuid NOT NULL REFERENCES "seo_local_places"("id") ON DELETE CASCADE,
  "batch_id" uuid NOT NULL,
  "keyword" varchar(150) NOT NULL,
  "lat" double precision NOT NULL,
  "lng" double precision NOT NULL,
  "step_km" real NOT NULL,
  "zoom" integer NOT NULL,
  "size" integer DEFAULT 5 NOT NULL,
  "language" varchar(5) DEFAULT 'es' NOT NULL,
  "summary" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seo_geogrid_runs_project_idx" ON "seo_geogrid_runs" ("project_id", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "seo_geogrid_points" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "run_id" uuid NOT NULL REFERENCES "seo_geogrid_runs"("id") ON DELETE CASCADE,
  "row" integer NOT NULL,
  "col" integer NOT NULL,
  "lat" double precision NOT NULL,
  "lng" double precision NOT NULL,
  "task_id" varchar(64),
  "status" varchar(10) DEFAULT 'pendiente' NOT NULL,
  "rank" integer,
  "results" jsonb,
  "cost_usd" numeric(10, 5),
  "error" text,
  "posted_at" timestamp,
  "checked_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "seo_geogrid_points_status_check" CHECK ("status" IN ('pendiente', 'enviada', 'hecha', 'fallida', 'caducada'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "seo_geogrid_points_unique" ON "seo_geogrid_points" ("run_id", "row", "col");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seo_geogrid_points_open_idx" ON "seo_geogrid_points" ("status") WHERE "status" IN ('pendiente', 'enviada');

-- SEO parte 7, demanda (27 nov 2026; docs/DISENO-SEO-DEMANDA.md con la auditoría Opus). Aditiva: demanda por búsqueda
-- (volumen, intención por la SERP real, ideas de palabras y su estado) y las URLs del top 10 en las posiciones.
CREATE TABLE IF NOT EXISTS "seo_demand" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "keyword" varchar(200) NOT NULL,
  "keyword_key" varchar(200) NOT NULL,
  "language" varchar(5) DEFAULT 'es' NOT NULL,
  "volume" integer,
  "cpc" real,
  "competition" varchar(10),
  "monthly" jsonb,
  "volume_at" timestamp,
  "origin" varchar(10) NOT NULL,
  "status" varchar(12) DEFAULT 'auto' NOT NULL,
  "seed" varchar(200),
  "topic_key" varchar(80),
  "rank_keyword_id" uuid REFERENCES "seo_rank_keywords"("id") ON DELETE SET NULL,
  "intent" varchar(15),
  "page_type" varchar(15),
  "top10_urls" text[],
  "serp_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "seo_demand_origin_check" CHECK ("origin" IN ('mapa', 'idea')),
  CONSTRAINT "seo_demand_status_check" CHECK ("status" IN ('auto', 'nueva', 'seguida', 'descartada'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "seo_demand_unique" ON "seo_demand" ("project_id", "keyword_key", "language");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seo_demand_project_idx" ON "seo_demand" ("project_id", "origin", "status");
--> statement-breakpoint
ALTER TABLE "seo_rank_checks" ADD COLUMN IF NOT EXISTS "top10_urls" text[];

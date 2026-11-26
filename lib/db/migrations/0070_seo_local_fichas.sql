-- SEO parte 5, local, tanda 5a (26 nov 2026; docs/DISENO-SEO-LOCAL.md con la auditoría Opus). Aditiva: fichas de Google
-- del cliente y de sus competidores (POR CLIENTE, no por proyecto) y sus fotos periódicas, con datos de DataForSEO
-- (my_business_info), que sí permite guardarlos (Google Places no, salvo el place_id).
CREATE TABLE IF NOT EXISTS "seo_local_places" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "role" varchar(12) NOT NULL,
  "client_competitor_id" uuid REFERENCES "client_competitors"("id") ON DELETE SET NULL,
  "cid" varchar(40) NOT NULL,
  "place_id" varchar(120),
  "title" varchar(255) NOT NULL,
  "status" varchar(12) DEFAULT 'propuesta' NOT NULL,
  "baseline" jsonb,
  "decided_by" varchar(120),
  "decided_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "seo_local_places_role_check" CHECK ("role" IN ('cliente', 'competidor')),
  CONSTRAINT "seo_local_places_status_check" CHECK ("status" IN ('propuesta', 'confirmada', 'descartada'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "seo_local_places_unique" ON "seo_local_places" ("client_id", "cid");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "seo_local_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "place_row_id" uuid NOT NULL REFERENCES "seo_local_places"("id") ON DELETE CASCADE,
  "title" varchar(255),
  "category" varchar(160),
  "additional_categories" text[],
  "phone" varchar(40),
  "domain" varchar(255),
  "status" varchar(20),
  "rating" real,
  "votes" integer,
  "distribution" jsonb,
  "hours" jsonb,
  "is_claimed" boolean,
  "lat" double precision,
  "lng" double precision,
  "cost_usd" numeric(10, 5),
  "taken_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seo_local_snapshots_place_idx" ON "seo_local_snapshots" ("place_row_id", "taken_at");

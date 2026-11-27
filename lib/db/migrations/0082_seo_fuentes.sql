-- SEO · Fuentes de novedades editables (27 nov 2026, petición de Enric). Aditiva: una tabla. Cada cuenta tiene sus fuentes
-- (RSS o Atom, webs cuyo RSS se detecta solo, canales de YouTube y el panel de incidencias de Google) con su nivel
-- (oficial, reputada o comunidad). Las de serie se crean solas desde el código la primera vez; las claves de las dos
-- fuentes que ya se leían (search_status, search_central_blog) se mantienen para no repetir lo ya guardado.
CREATE TABLE IF NOT EXISTS "seo_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "key" varchar(40) NOT NULL,
  "label" varchar(160) NOT NULL,
  "kind" varchar(16) NOT NULL,
  "input_url" text NOT NULL,
  "feed_url" text NOT NULL,
  "level" varchar(12) DEFAULT 'reputada' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "builtin" boolean DEFAULT false NOT NULL,
  "last_checked_at" timestamp,
  "last_ok_at" timestamp,
  "last_error" text,
  "items_total" integer DEFAULT 0 NOT NULL,
  "created_by" varchar(120),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "seo_sources_key_unique" UNIQUE ("tenant_id", "key"),
  CONSTRAINT "seo_sources_kind_check" CHECK ("kind" IN ('google_status', 'rss', 'youtube')),
  CONSTRAINT "seo_sources_level_check" CHECK ("level" IN ('oficial', 'reputada', 'comunidad'))
);
CREATE INDEX IF NOT EXISTS "seo_sources_tenant_idx" ON "seo_sources" ("tenant_id", "active");

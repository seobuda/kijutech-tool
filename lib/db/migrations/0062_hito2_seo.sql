-- Hito 2 SEO (24 nov 2026; docs/DISENO-TECNICO-HITO2.md). Aprobado por Enric.
-- Solo añade columnas (con valor por defecto o nulas) y tablas nuevas; amplía dos CHECK. No toca datos existentes:
-- los competidores que ya hay quedan «confirmado» y «directo» (los puso una persona o el agente).

-- 1. Competencia por proyecto (núcleo: client_competitors) ---------------------------------------------------------
ALTER TABLE "client_competitors" ADD COLUMN IF NOT EXISTS "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "client_competitors" ADD COLUMN IF NOT EXISTS "status" varchar(12) NOT NULL DEFAULT 'confirmado';--> statement-breakpoint
ALTER TABLE "client_competitors" ADD COLUMN IF NOT EXISTS "kind" varchar(12) NOT NULL DEFAULT 'directo';--> statement-breakpoint
ALTER TABLE "client_competitors" ADD COLUMN IF NOT EXISTS "evidence" jsonb NOT NULL DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "client_competitors" ADD COLUMN IF NOT EXISTS "last_seen" timestamp;--> statement-breakpoint
ALTER TABLE "client_competitors" DROP CONSTRAINT IF EXISTS "client_competitors_source_check";--> statement-breakpoint
ALTER TABLE "client_competitors" ADD CONSTRAINT "client_competitors_source_check" CHECK ("source" IN ('manual', 'agente', 'serp', 'local'));--> statement-breakpoint
ALTER TABLE "client_competitors" ADD CONSTRAINT "client_competitors_status_check" CHECK ("status" IN ('propuesto', 'confirmado', 'descartado'));--> statement-breakpoint
ALTER TABLE "client_competitors" ADD CONSTRAINT "client_competitors_kind_check" CHECK ("kind" IN ('directo', 'agregador', 'medio'));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_competitors_project_idx" ON "client_competitors" ("project_id", "status");--> statement-breakpoint

-- 2. Estrategia por proyecto (módulo Estrategia) -------------------------------------------------------------------
ALTER TABLE "est_analyses" ADD COLUMN IF NOT EXISTS "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "est_suggestions" ADD COLUMN IF NOT EXISTS "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL;--> statement-breakpoint

-- 3. Expediente: respuestas del cliente (correo de 3 preguntas) ----------------------------------------------------
ALTER TABLE "seo_dossier_facts" DROP CONSTRAINT IF EXISTS "seo_dossier_facts_source_check";--> statement-breakpoint
ALTER TABLE "seo_dossier_facts" ADD CONSTRAINT "seo_dossier_facts_source_check" CHECK ("source" IN ('ficha', 'web', 'places', 'wayback', 'gsc', 'busqueda', 'persona', 'ia', 'cliente'));--> statement-breakpoint

-- 4. Mapa de palabras (módulo SEO) ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "seo_topics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "topic_key" varchar(80) NOT NULL,
  "name" varchar(200) NOT NULL,
  "url" text,
  "origin" varchar(12) NOT NULL,
  "metrics" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" varchar(12) NOT NULL DEFAULT 'activo',
  "named_by" varchar(10) NOT NULL DEFAULT 'reglas',
  "run_at" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "seo_topics_key_unique" UNIQUE ("project_id", "topic_key"),
  CONSTRAINT "seo_topics_origin_check" CHECK ("origin" IN ('pagina', 'parecido', 'competencia')),
  CONSTRAINT "seo_topics_status_check" CHECK ("status" IN ('activo', 'descartado')),
  CONSTRAINT "seo_topics_named_check" CHECK ("named_by" IN ('reglas', 'ia', 'persona'))
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seo_topics_project_idx" ON "seo_topics" ("project_id", "status");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "seo_topic_queries" (
  "topic_id" uuid NOT NULL REFERENCES "seo_topics"("id") ON DELETE CASCADE,
  "query_hash" varchar(40) NOT NULL,
  "query" text NOT NULL,
  "source" varchar(12) NOT NULL DEFAULT 'gsc',
  "clicks" integer NOT NULL DEFAULT 0,
  "impressions" integer NOT NULL DEFAULT 0,
  "position" double precision,
  "volume" integer,
  CONSTRAINT "seo_topic_queries_pk" PRIMARY KEY ("topic_id", "query_hash"),
  CONSTRAINT "seo_topic_queries_source_check" CHECK ("source" IN ('gsc', 'competencia', 'manual'))
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "seo_text_embeddings" (
  "text_hash" varchar(40) NOT NULL,
  "model" varchar(80) NOT NULL,
  "embedding" vector(1536) NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "seo_text_embeddings_pk" PRIMARY KEY ("text_hash", "model")
);

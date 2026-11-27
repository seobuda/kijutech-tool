-- SEO parte 9a, contenido (27 nov 2026; docs/DISENO-SEO-CONTENIDO.md con la auditoría Opus). Aditiva: briefs de contenido
-- hechos con la SERP real (subtemas, preguntas, palabras, enlazado sugerido) y su nota frente a la página de destino.
CREATE TABLE IF NOT EXISTS "seo_briefs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "keyword" varchar(200) NOT NULL,
  "topic_key" varchar(80),
  "target_url" text,
  "status" varchar(12) DEFAULT 'preparando' NOT NULL,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "published_url" text,
  "error" text,
  "created_by" varchar(120),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "seo_briefs_status_check" CHECK ("status" IN ('preparando', 'borrador', 'listo', 'usado', 'fallido', 'archivado'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seo_briefs_project_idx" ON "seo_briefs" ("project_id", "status", "created_at");

-- SEO · Velocidad visible (26 nov 2026). Aditiva: cada medición de velocidad de un proyecto (datos reales del Chrome UX
-- Report y prueba de laboratorio de Lighthouse) se guarda por página, para enseñarla en Salud como en PageSpeed y ver su
-- evolución. Antes solo se creaban hallazgos cuando algo iba mal.
CREATE TABLE IF NOT EXISTS "seo_speed_checks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "run_id" uuid NOT NULL,
  "url" text NOT NULL,
  "kind" varchar(12) NOT NULL,
  "scope" varchar(10),
  "category" varchar(10),
  "score" integer,
  "lcp_ms" integer,
  "inp_ms" integer,
  "cls" real,
  "fcp_ms" integer,
  "tbt_ms" integer,
  "si_ms" integer,
  "data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "measured_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "seo_speed_checks_kind_check" CHECK ("kind" IN ('campo', 'laboratorio'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seo_speed_checks_project_idx" ON "seo_speed_checks" ("project_id", "measured_at");

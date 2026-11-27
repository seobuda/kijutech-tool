-- Núcleo · uso de las pantallas (plan de UX del SEO v2, fase 0, 27 nov 2026; aprobado por Enric). Aditiva: qué vista se
-- abre, quién y de qué proyecto (sin contenido), para medir si el rediseño funciona. Retención 180 días.
CREATE TABLE IF NOT EXISTS "app_usage_events" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" integer,
  "area" varchar(30) NOT NULL,
  "view" varchar(40) NOT NULL,
  "scope_id" uuid,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_usage_events_idx" ON "app_usage_events" ("tenant_id", "area", "created_at");

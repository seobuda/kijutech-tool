-- SEO parte 0 (26 nov 2026; docs/DISENO-SEO-PARTE0.md). Aditiva: gasto en datos de pago por proyecto (DataForSEO, Places…)
-- para el tope mensual de 5 $ por proyecto que decidió Enric. Tabla del módulo SEO (no del núcleo): la apunta SEO, que es
-- quien sabe de qué proyecto es cada llamada. Más el ajuste del tope en seo_settings.
CREATE TABLE IF NOT EXISTS "seo_data_spend" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "provider" varchar(30) NOT NULL,
  "operation" varchar(60) NOT NULL,
  "cost_usd" numeric(10, 4) NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "seo_data_spend_project_idx" ON "seo_data_spend" ("project_id", "created_at");
--> statement-breakpoint
INSERT INTO "seo_settings" ("key", "value", "label", "description")
VALUES ('data_budget_usd', '5', 'Tope de gasto en datos de pago por proyecto y mes (USD)', 'DataForSEO, Places y otros proveedores de pago. Al llegar al tope, lo automático se para hasta el mes siguiente y lo que se pide a mano pide confirmación.')
ON CONFLICT ("key") DO NOTHING;

-- Google Ads · paso 3: auditoría de higiene de entrada por cuenta y su vigilancia (28 nov 2026;
-- docs/ads/DISENO-TECNICO-ADS.md §13). Aditiva: solo tablas nuevas con prefijo ads_. Datos de la auditoría pedidos aparte
-- (consultas aisladas), la auditoría con su fecha, el resultado de cada control con la respuesta del gestor y la
-- predicción previa (APR-01), y la fecha de confirmación de los datos de la ficha que usa Ads (NEG-07). Todo es lectura de
-- Google Ads: nada escribe en las cuentas.
CREATE TABLE IF NOT EXISTS "ads_audit_data" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "account_id" uuid NOT NULL REFERENCES "ads_accounts"("id") ON DELETE CASCADE,
  "kind" varchar(24) NOT NULL,
  "ok" boolean DEFAULT false NOT NULL,
  "error" text,
  "synced_at" timestamp DEFAULT now() NOT NULL,
  "data_from" date,
  "data_to" date,
  "data" jsonb DEFAULT '[]'::jsonb NOT NULL,
  CONSTRAINT "ads_audit_data_unique" UNIQUE ("account_id", "kind")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ads_audit_data_tenant_idx" ON "ads_audit_data" ("tenant_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ads_audits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "account_id" uuid NOT NULL REFERENCES "ads_accounts"("id") ON DELETE CASCADE,
  "kind" varchar(12) DEFAULT 'entrada' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "data_through" date,
  "baseline" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "read_at" timestamp,
  "read_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "superseded_at" timestamp,
  CONSTRAINT "ads_audits_kind_check" CHECK ("kind" IN ('entrada'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ads_audits_account_idx" ON "ads_audits" ("tenant_id", "account_id", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ads_audit_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "audit_id" uuid NOT NULL REFERENCES "ads_audits"("id") ON DELETE CASCADE,
  "account_id" uuid NOT NULL REFERENCES "ads_accounts"("id") ON DELETE CASCADE,
  "control" varchar(32) NOT NULL,
  "tanda" integer NOT NULL,
  "risk" varchar(4) DEFAULT 'R1' NOT NULL,
  "initial_status" varchar(14) NOT NULL,
  "status" varchar(14) NOT NULL,
  "needs_confirmation" boolean DEFAULT false NOT NULL,
  "title" varchar(300) NOT NULL,
  "evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "exposure" numeric(14, 2),
  "currency" varchar(3),
  "prediction" jsonb,
  "checked_at" timestamp DEFAULT now() NOT NULL,
  "fixed_at" timestamp,
  "regressed_at" timestamp,
  "regression_count" integer DEFAULT 0 NOT NULL,
  "regression_cause" text,
  "response" varchar(20),
  "response_reason" text,
  "responded_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "responded_at" timestamp,
  "history" jsonb DEFAULT '[]'::jsonb NOT NULL,
  CONSTRAINT "ads_audit_items_unique" UNIQUE ("audit_id", "control"),
  CONSTRAINT "ads_audit_items_status_check" CHECK ("status" IN ('bien', 'mal', 'no_comprobado') AND "initial_status" IN ('bien', 'mal', 'no_comprobado')),
  CONSTRAINT "ads_audit_items_response_check" CHECK ("response" IS NULL OR "response" IN ('hecho', 'cliente_lo_quiere', 'no_aplica', 'mas_tarde'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ads_audit_items_account_idx" ON "ads_audit_items" ("tenant_id", "account_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ads_client_facts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "fact" varchar(20) NOT NULL,
  "confirmed_at" timestamp DEFAULT now() NOT NULL,
  "confirmed_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "value_snapshot" text,
  CONSTRAINT "ads_client_facts_unique" UNIQUE ("client_id", "fact"),
  CONSTRAINT "ads_client_facts_fact_check" CHECK ("fact" IN ('marca', 'zona', 'telefono', 'horario', 'competidores', 'sector', 'servicios'))
);

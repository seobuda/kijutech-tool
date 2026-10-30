CREATE TABLE "ops_client_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
	"key" varchar(30) NOT NULL,
	"label" varchar(60) NOT NULL,
	"default_days" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ops_client_levels_tenant_key_unique" UNIQUE("tenant_id","key"),
	CONSTRAINT "ops_client_levels_days_check" CHECK ("default_days" BETWEEN 0 AND 60)
);
--> statement-breakpoint
CREATE TABLE "ops_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
	"key" varchar(40) NOT NULL,
	"label" varchar(100) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "ops_services_tenant_key_unique" UNIQUE("tenant_id","key")
);
--> statement-breakpoint
CREATE TABLE "ops_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
	"name" varchar(255) NOT NULL,
	"aliases" jsonb DEFAULT '[]' NOT NULL,
	"clickup_option_id" varchar(50),
	"clickup_option_label" varchar(255),
	"usual_space_id" varchar(50),
	"usual_list_ids" jsonb DEFAULT '[]' NOT NULL,
	"level" varchar(30) DEFAULT 'standard' NOT NULL,
	"delivery_days" integer,
	"monthly_hours" numeric(6, 1),
	"work_days" varchar(20),
	"tools" jsonb DEFAULT '[]' NOT NULL,
	"business" text,
	"offerings" text,
	"area" varchar(255),
	"audience" text,
	"goals" text,
	"strategy" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ops_clients_tenant_option_unique" UNIQUE("tenant_id","clickup_option_id"),
	CONSTRAINT "ops_clients_days_check" CHECK ("delivery_days" IS NULL OR "delivery_days" BETWEEN 0 AND 60)
);
--> statement-breakpoint
CREATE TABLE "ops_client_services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL REFERENCES "ops_clients"("id") ON DELETE CASCADE,
	"service_key" varchar(40) NOT NULL,
	"responsible_clickup_id" varchar(50),
	CONSTRAINT "ops_client_services_unique" UNIQUE("client_id","service_key")
);
--> statement-breakpoint
INSERT INTO "ops_client_levels" ("tenant_id", "key", "label", "default_days", "sort_order")
SELECT t.id, v.key, v.label, v.days, v.ord FROM "tenants" t,
  (VALUES ('top', 'Top', 2, 1), ('standard', 'Estándar', 3, 2), ('maintenance', 'Mantenimiento', 5, 3)) AS v(key, label, days, ord);
--> statement-breakpoint
INSERT INTO "ops_services" ("tenant_id", "key", "label", "sort_order")
SELECT t.id, v.key, v.label, v.ord FROM "tenants" t,
  (VALUES ('seo', 'SEO', 1), ('google_ads', 'Google Ads', 2), ('web', 'Web', 3),
          ('mantenimiento', 'Mantenimiento', 4), ('gohighlevel', 'GoHighLevel', 5)) AS v(key, label, ord);
--> statement-breakpoint
INSERT INTO "ops_clients" ("tenant_id", "name", "clickup_option_id", "clickup_option_label")
SELECT f.tenant_id, o->>'label', o->>'id', o->>'label'
FROM "ops_clickup_fields" f, jsonb_array_elements(f.options) o
WHERE f.name = 'Cliente';
--> statement-breakpoint
UPDATE "ops_clients" SET "notes" = 'Cliente interno: tareas propias de Kijutech' WHERE "name" = 'Kijutech';

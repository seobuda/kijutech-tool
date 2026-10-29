CREATE TABLE "ops_clickup_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"clickup_field_id" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"type" varchar(30) NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ops_clickup_fields_tenant_field_unique" UNIQUE("tenant_id","clickup_field_id")
);
--> statement-breakpoint
ALTER TABLE "ops_clickup_lists" ADD COLUMN "client_field_id" varchar(50);--> statement-breakpoint
ALTER TABLE "ops_clickup_lists" ADD COLUMN "fields_synced_at" timestamp;--> statement-breakpoint
ALTER TABLE "ops_clickup_fields" ADD CONSTRAINT "ops_clickup_fields_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
CREATE TABLE "ops_clickup_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"api_key_encrypted" text NOT NULL,
	"api_key_iv" text NOT NULL,
	"workspace_id" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ops_clickup_connections_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
ALTER TABLE "ops_clickup_connections" ADD CONSTRAINT "ops_clickup_connections_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
CREATE TABLE "ops_clickup_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"clickup_list_id" varchar(50) NOT NULL,
	"clickup_space_id" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"folder_name" varchar(255),
	"synced_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ops_clickup_lists_tenant_list_unique" UNIQUE("tenant_id","clickup_list_id")
);
--> statement-breakpoint
CREATE TABLE "ops_clickup_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"clickup_user_id" varchar(50) NOT NULL,
	"username" varchar(255) NOT NULL,
	"email" varchar(255),
	"synced_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ops_clickup_members_tenant_user_unique" UNIQUE("tenant_id","clickup_user_id")
);
--> statement-breakpoint
CREATE TABLE "ops_clickup_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"method" varchar(10) NOT NULL,
	"endpoint" varchar(200) NOT NULL,
	"status" integer NOT NULL,
	"duration_ms" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops_clickup_spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"clickup_space_id" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"selected" boolean DEFAULT false NOT NULL,
	"synced_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ops_clickup_spaces_tenant_space_unique" UNIQUE("tenant_id","clickup_space_id")
);
--> statement-breakpoint
ALTER TABLE "ops_clickup_connections" ADD COLUMN "workspace_name" varchar(255);--> statement-breakpoint
ALTER TABLE "ops_clickup_connections" ADD COLUMN "me_clickup_id" varchar(50);--> statement-breakpoint
ALTER TABLE "ops_clickup_connections" ADD COLUMN "me_username" varchar(255);--> statement-breakpoint
ALTER TABLE "ops_clickup_connections" ADD COLUMN "structure_synced_at" timestamp;--> statement-breakpoint
ALTER TABLE "ops_clickup_lists" ADD CONSTRAINT "ops_clickup_lists_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_clickup_members" ADD CONSTRAINT "ops_clickup_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_clickup_requests" ADD CONSTRAINT "ops_clickup_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_clickup_spaces" ADD CONSTRAINT "ops_clickup_spaces_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ops_clickup_lists_tenant_space_idx" ON "ops_clickup_lists" USING btree ("tenant_id","clickup_space_id");--> statement-breakpoint
CREATE INDEX "ops_clickup_requests_tenant_time_idx" ON "ops_clickup_requests" USING btree ("tenant_id","requested_at");
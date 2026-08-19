CREATE TABLE "ai_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid,
	"function" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'processing' NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"error" text,
	"provider" varchar(20),
	"model" varchar(100),
	"key_mode_used" varchar(20),
	"input_tokens" integer,
	"output_tokens" integer,
	"estimated_cost" numeric(10, 6),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "ai_model_pricing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(20) NOT NULL,
	"model" varchar(100) NOT NULL,
	"input_cost_per_1k" numeric(10, 6) DEFAULT '0' NOT NULL,
	"output_cost_per_1k" numeric(10, 6) DEFAULT '0' NOT NULL,
	"effective_from" date DEFAULT now() NOT NULL,
	"effective_to" date,
	CONSTRAINT "ai_model_pricing_provider_model_effective_from_unique" UNIQUE("provider","model","effective_from")
);
--> statement-breakpoint
CREATE TABLE "ai_provider_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" varchar(20) NOT NULL,
	"api_key_encrypted" text,
	"api_key_iv" text,
	"model" varchar(100) NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"key_mode" varchar(20) DEFAULT 'platform' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_provider_settings_tenant_id_provider_unique" UNIQUE("tenant_id","provider")
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "ai_key_mode_allowed" varchar(20) DEFAULT 'platform_only' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_provider_settings" ADD CONSTRAINT "ai_provider_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
CREATE TABLE "seo_cluster_content_plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cluster_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"manual_questions" jsonb DEFAULT '[]'::jsonb,
	"analysis_json" jsonb,
	"model_used" text,
	"tokens_used" integer,
	"cost_estimate" numeric(10, 6),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "unique_cluster_content_plan" UNIQUE("cluster_id")
);
--> statement-breakpoint
ALTER TABLE "seo_cluster_content_plan" ADD CONSTRAINT "seo_cluster_content_plan_cluster_id_seo_kw_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."seo_kw_clusters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_cluster_content_plan" ADD CONSTRAINT "seo_cluster_content_plan_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
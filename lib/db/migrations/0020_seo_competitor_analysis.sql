CREATE TABLE "seo_cluster_competitors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cluster_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"url" text NOT NULL,
	"position" integer NOT NULL,
	"scraped_at" timestamp,
	"scrape_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"raw_scraped_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "position_range" CHECK ("seo_cluster_competitors"."position" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "seo_competitor_analysis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cluster_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"analysis_json" jsonb NOT NULL,
	"model_used" varchar(100),
	"tokens_used" integer,
	"cost_estimate" numeric(10, 6),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "seo_cluster_competitors" ADD CONSTRAINT "seo_cluster_competitors_cluster_id_seo_kw_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."seo_kw_clusters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_cluster_competitors" ADD CONSTRAINT "seo_cluster_competitors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_competitor_analysis" ADD CONSTRAINT "seo_competitor_analysis_cluster_id_seo_kw_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."seo_kw_clusters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_competitor_analysis" ADD CONSTRAINT "seo_competitor_analysis_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
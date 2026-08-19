ALTER TABLE "seo_kw_cluster_keywords" ADD COLUMN "pending_verification" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "seo_kw_clusters" ADD COLUMN "url_type" varchar(50);--> statement-breakpoint
ALTER TABLE "seo_kw_clusters" ADD COLUMN "is_ai_suggested" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "seo_kw_clusters" ADD COLUMN "reasoning" text;--> statement-breakpoint
ALTER TABLE "seo_kw_clusters" ADD COLUMN "low_volume" boolean DEFAULT false NOT NULL;
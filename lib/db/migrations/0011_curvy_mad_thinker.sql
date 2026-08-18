ALTER TABLE "seo_kw_raw" ADD COLUMN "seranking_position" integer;--> statement-breakpoint
ALTER TABLE "seo_kw_raw" ADD COLUMN "seranking_prev_position" integer;--> statement-breakpoint
ALTER TABLE "seo_kw_raw" ADD COLUMN "seranking_difficulty" integer;--> statement-breakpoint
ALTER TABLE "seo_kw_raw" ADD COLUMN "seranking_url" varchar(500);--> statement-breakpoint
ALTER TABLE "seo_kw_raw" ADD COLUMN "seranking_serp_features" text;--> statement-breakpoint
ALTER TABLE "seo_kw_raw" ADD COLUMN "source" varchar(20) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "seo_kw_raw" ADD CONSTRAINT "seo_kw_raw_project_id_keyword_unique" UNIQUE("project_id","keyword");
ALTER TABLE "seo_kw_clusters" ADD COLUMN "destination" varchar(20);--> statement-breakpoint
ALTER TABLE "seo_kw_clusters" ADD COLUMN "content_type" varchar(30);--> statement-breakpoint
ALTER TABLE "seo_kw_clusters" ADD COLUMN "search_intent" varchar(20);--> statement-breakpoint
ALTER TABLE "seo_kw_clusters" ADD COLUMN "strategy_note" text;
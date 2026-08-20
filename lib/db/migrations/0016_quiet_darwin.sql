CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
ALTER TABLE "seo_kw_clusters" ADD COLUMN "embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "seo_kw_raw" ADD COLUMN "embedding" vector(1536);--> statement-breakpoint
CREATE INDEX "seo_kw_raw_embedding_idx" ON "seo_kw_raw" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);--> statement-breakpoint
CREATE INDEX "seo_kw_clusters_embedding_idx" ON "seo_kw_clusters" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);

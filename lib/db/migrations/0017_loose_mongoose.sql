CREATE TABLE "ai_clustering_examples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"keywords" jsonb NOT NULL,
	"serp_signals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cluster_title" varchar NOT NULL,
	"target_url" varchar,
	"search_intent" varchar,
	"content_type" varchar,
	"destination" varchar,
	"url_type" varchar,
	"embedding" vector(1536),
	"feedback_type" varchar DEFAULT 'confirmed' NOT NULL,
	"source_job_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_clustering_examples" ADD CONSTRAINT "ai_clustering_examples_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_clustering_examples" ADD CONSTRAINT "ai_clustering_examples_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_clustering_examples" ADD CONSTRAINT "ai_clustering_examples_source_job_id_ai_jobs_id_fk" FOREIGN KEY ("source_job_id") REFERENCES "public"."ai_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_clustering_examples_embedding_idx" ON "ai_clustering_examples" USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);

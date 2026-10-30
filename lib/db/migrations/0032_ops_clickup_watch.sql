CREATE TABLE "ops_clickup_watch" (
	"tenant_id" uuid PRIMARY KEY NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
	"enabled" boolean DEFAULT false NOT NULL,
	"activated_at" timestamp,
	"cursor_ms" bigint,
	"last_run_at" timestamp,
	"last_error" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops_clickup_task_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
	"clickup_task_id" varchar(50) NOT NULL,
	"assignee_ids" jsonb DEFAULT '[]' NOT NULL,
	"status" varchar(100),
	"status_type" varchar(30),
	"date_updated_ms" bigint,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ops_clickup_task_snapshots_unique" UNIQUE("tenant_id","clickup_task_id")
);
--> statement-breakpoint
ALTER TABLE "ops_requests" ADD COLUMN "origin" varchar(20) DEFAULT 'herramienta' NOT NULL;
--> statement-breakpoint
ALTER TABLE "ops_requests" ADD CONSTRAINT "ops_requests_origin_check" CHECK ("origin" IN ('herramienta', 'clickup'));
--> statement-breakpoint
ALTER TABLE "ops_requests" ADD COLUMN "candidate_ids" jsonb DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE "ops_requests" ADD COLUMN "reminded_at" timestamp;
--> statement-breakpoint
ALTER TABLE "ops_requests" ADD COLUMN "unanswered_listed_at" timestamp;

CREATE TABLE "ops_cleanup_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "clickup_user_id" varchar(50) NOT NULL,
  "person_name" varchar(255) NOT NULL,
  "started_by" varchar(255),
  "status" varchar(12) DEFAULT 'en_curso' NOT NULL,
  "total" integer DEFAULT 0 NOT NULL,
  "closed" integer DEFAULT 0 NOT NULL,
  "rescheduled" integer DEFAULT 0 NOT NULL,
  "discarded" integer DEFAULT 0 NOT NULL,
  "skipped" integer DEFAULT 0 NOT NULL,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "finished_at" timestamp,
  CONSTRAINT "ops_cleanup_runs_status_check" CHECK ("status" IN ('en_curso','completada','parada'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ops_cleanup_runs_active_unique" ON "ops_cleanup_runs" ("tenant_id", "clickup_user_id") WHERE "status" = 'en_curso';
--> statement-breakpoint
CREATE TABLE "ops_cleanup_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "ops_cleanup_runs"("id") ON DELETE CASCADE,
  "position" integer NOT NULL,
  "clickup_task_id" varchar(50) NOT NULL,
  "task_name" varchar(500) NOT NULL,
  "task_url" text,
  "list_id" varchar(50),
  "list_name" varchar(255),
  "due_ms" bigint,
  "status" varchar(14) DEFAULT 'pendiente' NOT NULL,
  "new_due" date,
  "answered_at" timestamp,
  CONSTRAINT "ops_cleanup_items_status_check" CHECK ("status" IN ('pendiente','enviada','cerrada','reprogramada','descartada','omitida'))
);
--> statement-breakpoint
CREATE INDEX "ops_cleanup_items_run_idx" ON "ops_cleanup_items" ("run_id", "position");
--> statement-breakpoint
ALTER TABLE "ops_telegram_pending" ADD COLUMN "cleanup_item_id" uuid REFERENCES "ops_cleanup_items"("id") ON DELETE CASCADE;
--> statement-breakpoint
CREATE TABLE "ops_suggestions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "person_clickup_user_id" varchar(50),
  "person_name" varchar(255) NOT NULL,
  "text" text NOT NULL,
  "photo_file_id" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "digest_shown_at" timestamp
);
--> statement-breakpoint
CREATE INDEX "ops_suggestions_tenant_idx" ON "ops_suggestions" ("tenant_id", "created_at");
--> statement-breakpoint
ALTER TABLE "ops_notifications" DROP CONSTRAINT "ops_notifications_kind_check";
--> statement-breakpoint
ALTER TABLE "ops_notifications" ADD CONSTRAINT "ops_notifications_kind_check" CHECK ("kind" IN ('new_request','daily_summary','test','review_request','block_alert','reply','returned','digest','reminder','cleanup','cleanup_summary','startup'));
--> statement-breakpoint
ALTER TABLE "ops_clickup_outbox" DROP CONSTRAINT "ops_outbox_action_check";
--> statement-breakpoint
ALTER TABLE "ops_clickup_outbox" ADD CONSTRAINT "ops_outbox_action_check" CHECK ("action" IN ('set_status','comment','set_due'));

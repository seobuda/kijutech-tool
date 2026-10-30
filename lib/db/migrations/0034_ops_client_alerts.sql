ALTER TABLE "ops_client_levels" ADD COLUMN "inactivity_days" integer DEFAULT 14 NOT NULL;
--> statement-breakpoint
ALTER TABLE "ops_client_levels" ADD COLUMN "planning_days" integer DEFAULT 14 NOT NULL;
--> statement-breakpoint
UPDATE "ops_client_levels" SET "inactivity_days" = 7, "planning_days" = 7 WHERE "key" = 'top';
--> statement-breakpoint
UPDATE "ops_client_levels" SET "inactivity_days" = 14, "planning_days" = 14 WHERE "key" = 'standard';
--> statement-breakpoint
UPDATE "ops_client_levels" SET "inactivity_days" = 30, "planning_days" = 0 WHERE "key" = 'maintenance';
--> statement-breakpoint
ALTER TABLE "ops_client_levels" ADD CONSTRAINT "ops_client_levels_inactivity_check" CHECK ("inactivity_days" BETWEEN 1 AND 90);
--> statement-breakpoint
ALTER TABLE "ops_client_levels" ADD CONSTRAINT "ops_client_levels_planning_check" CHECK ("planning_days" BETWEEN 0 AND 60);
--> statement-breakpoint
ALTER TABLE "ops_clients" ADD COLUMN "inactivity_days" integer;
--> statement-breakpoint
ALTER TABLE "ops_clients" ADD COLUMN "planning_days" integer;
--> statement-breakpoint
ALTER TABLE "ops_clients" ADD COLUMN "alerts_enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "ops_clients" ADD CONSTRAINT "ops_clients_inactivity_check" CHECK ("inactivity_days" IS NULL OR "inactivity_days" BETWEEN 1 AND 90);
--> statement-breakpoint
ALTER TABLE "ops_clients" ADD CONSTRAINT "ops_clients_planning_check" CHECK ("planning_days" IS NULL OR "planning_days" BETWEEN 0 AND 60);
--> statement-breakpoint
UPDATE "ops_clients" SET "alerts_enabled" = false WHERE "name" = 'Kijutech';
--> statement-breakpoint
CREATE TABLE "ops_client_activity" (
	"client_id" uuid PRIMARY KEY NOT NULL REFERENCES "ops_clients"("id") ON DELETE CASCADE,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
	"last_activity_ms" bigint,
	"window_days" integer NOT NULL,
	"completed_month" integer DEFAULT 0 NOT NULL,
	"upcoming_tasks" integer DEFAULT 0 NOT NULL,
	"horizon_days" integer DEFAULT 0 NOT NULL,
	"hours_month" numeric(7, 1) DEFAULT '0' NOT NULL,
	"inactive_notified_at" timestamp,
	"unplanned_notified_at" timestamp,
	"computed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ops_client_activity_tenant_idx" ON "ops_client_activity" ("tenant_id");

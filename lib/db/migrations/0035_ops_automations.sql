CREATE TABLE "ops_automations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "key" varchar(60) NOT NULL,
  "enabled" boolean,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "template" text,
  "updated_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ops_automations_tenant_key_unique" UNIQUE ("tenant_id", "key")
);
--> statement-breakpoint
CREATE TABLE "ops_automation_changes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "automation_key" varchar(60) NOT NULL,
  "field" varchar(60) NOT NULL,
  "old_value" text,
  "new_value" text,
  "changed_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ops_automation_changes_tenant_at_idx" ON "ops_automation_changes" ("tenant_id", "changed_at" DESC);
--> statement-breakpoint
ALTER TABLE "ops_team_profiles" ADD COLUMN "lunch_start" varchar(5);
--> statement-breakpoint
ALTER TABLE "ops_team_profiles" ADD COLUMN "lunch_end" varchar(5);
--> statement-breakpoint
ALTER TABLE "ops_team_profiles" ADD COLUMN "quiet_start" varchar(5);
--> statement-breakpoint
ALTER TABLE "ops_team_profiles" ADD COLUMN "quiet_end" varchar(5);
--> statement-breakpoint
ALTER TABLE "ops_team_profiles" ADD COLUMN "urgent_bypass_quiet" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
INSERT INTO "ops_automations" ("tenant_id", "key", "config")
SELECT "tenant_id", 'digest', jsonb_build_object('times', "digest_times") FROM "ops_telegram_config"
ON CONFLICT DO NOTHING;

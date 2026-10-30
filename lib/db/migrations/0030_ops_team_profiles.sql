CREATE TABLE "ops_team_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"clickup_user_id" varchar(50),
	"user_id" integer,
	"name" varchar(255) NOT NULL,
	"job_title" varchar(150),
	"description" text,
	"notes" text,
	"work_days" varchar(20) DEFAULT '1,2,3,4,5' NOT NULL,
	"work_start" varchar(5) DEFAULT '09:00' NOT NULL,
	"hours_per_day" numeric(4, 2) DEFAULT '8' NOT NULL,
	"timezone" varchar(60) DEFAULT 'America/Santo_Domingo' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ops_team_profiles_tenant_clickup_unique" UNIQUE("tenant_id","clickup_user_id")
);
--> statement-breakpoint
CREATE TABLE "ops_team_profile_work_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"work_type_key" varchar(40) NOT NULL,
	"role" varchar(10) NOT NULL,
	CONSTRAINT "ops_team_profile_work_types_unique" UNIQUE("profile_id","work_type_key"),
	CONSTRAINT "ops_team_profile_work_types_role_check" CHECK ("ops_team_profile_work_types"."role" IN ('primary', 'support'))
);
--> statement-breakpoint
ALTER TABLE "ops_team_profiles" ADD CONSTRAINT "ops_team_profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_team_profiles" ADD CONSTRAINT "ops_team_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_team_profile_work_types" ADD CONSTRAINT "ops_team_profile_work_types_profile_id_ops_team_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."ops_team_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "ops_team_profiles" ("tenant_id", "clickup_user_id", "name", "work_start", "timezone")
SELECT "tenant_id", "clickup_user_id", "username", "work_start", "timezone" FROM "ops_telegram_members";

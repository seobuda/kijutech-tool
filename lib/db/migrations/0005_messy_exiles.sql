CREATE TABLE "seo_onboarding_checklist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"item_key" varchar(50) NOT NULL,
	"checked" boolean DEFAULT false NOT NULL,
	"checked_at" timestamp,
	CONSTRAINT "seo_onboarding_checklist_project_id_item_key_unique" UNIQUE("project_id","item_key")
);
--> statement-breakpoint
ALTER TABLE "seo_onboarding_checklist" ADD CONSTRAINT "seo_onboarding_checklist_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
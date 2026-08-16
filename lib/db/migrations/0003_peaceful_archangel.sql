CREATE TABLE "seo_audit_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"area" varchar(100) NOT NULL,
	"check_point" varchar(100) NOT NULL,
	"status" varchar(20) NOT NULL,
	"finding" text,
	"priority" varchar(20),
	"recommended_action" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_kickoff_answers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"question_key" varchar(100) NOT NULL,
	"answer" text,
	"answered_at" timestamp,
	CONSTRAINT "seo_kickoff_answers_project_id_question_key_unique" UNIQUE("project_id","question_key")
);
--> statement-breakpoint
CREATE TABLE "seo_knowledge_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stage_key" varchar(50) NOT NULL,
	"order" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"content" text NOT NULL,
	"card_type" varchar(30) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seo_stage_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"stage_key" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "seo_stage_progress_project_id_stage_key_unique" UNIQUE("project_id","stage_key")
);
--> statement-breakpoint
ALTER TABLE "seo_audit_findings" ADD CONSTRAINT "seo_audit_findings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_kickoff_answers" ADD CONSTRAINT "seo_kickoff_answers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seo_stage_progress" ADD CONSTRAINT "seo_stage_progress_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
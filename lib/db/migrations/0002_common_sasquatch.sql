CREATE TABLE "modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"version" varchar(20),
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "modules_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "project_modules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"module_key" varchar(50) NOT NULL,
	"activated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_modules_project_id_module_key_unique" UNIQUE("project_id","module_key")
);
--> statement-breakpoint
ALTER TABLE "project_modules" ADD CONSTRAINT "project_modules_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_modules" ADD CONSTRAINT "project_modules_module_key_modules_key_fk" FOREIGN KEY ("module_key") REFERENCES "public"."modules"("key") ON DELETE no action ON UPDATE no action;
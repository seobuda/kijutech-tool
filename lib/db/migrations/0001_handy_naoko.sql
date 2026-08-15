CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"client_name" varchar(200),
	"domain" varchar(255),
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(50) NOT NULL,
	"description" text,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"plan" varchar(20) DEFAULT 'internal' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"role_id" uuid NOT NULL,
	"project_id" uuid
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Seed: tenant Kijutech
INSERT INTO "tenants" ("name", "slug", "plan", "status")
VALUES ('Kijutech', 'kijutech', 'internal', 'active');
--> statement-breakpoint

-- Seed: roles fijos del sistema
INSERT INTO "roles" ("name", "description") VALUES
  ('super_admin', 'Acceso transversal a todos los tenants'),
  ('admin', 'Administración a nivel de tenant'),
  ('editor', 'Edición de proyectos dentro de su tenant'),
  ('lector', 'Solo lectura');
--> statement-breakpoint

-- Backfill: todos los usuarios existentes pertenecen a Kijutech (fase single-tenant)
UPDATE "users" SET "tenant_id" = (SELECT "id" FROM "tenants" WHERE "slug" = 'kijutech');
--> statement-breakpoint

ALTER TABLE "users" ALTER COLUMN "tenant_id" SET NOT NULL;
--> statement-breakpoint

-- Migrar team_members -> user_roles, mapeando el rol antiguo al nuevo
INSERT INTO "user_roles" ("user_id", "role_id", "project_id")
SELECT
  tm."user_id",
  r."id",
  NULL
FROM "team_members" tm
JOIN "users" u ON u."id" = tm."user_id"
JOIN "roles" r ON r."name" = CASE
  WHEN u."email" = 'hola@enriquetabilo.com' THEN 'super_admin'
  WHEN tm."role" = 'owner' THEN 'admin'
  ELSE 'editor'
END;
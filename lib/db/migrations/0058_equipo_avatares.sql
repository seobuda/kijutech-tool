-- Equipo humano + IA (fase 3 de la reorganización UX, 21 nov 2026). Esquema aprobado por Enric el 21 nov.
-- 1) Departamento de cada persona (organigrama): misma forma que agt_agents.department_key; null = sin departamento.
-- 2) Fotos o avatares de personas y agentes, en tablas aparte para no cargar la imagen en cada consulta de las fichas.
ALTER TABLE "ops_team_profiles" ADD COLUMN IF NOT EXISTS "department_key" varchar(40);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ops_team_avatars" (
	"profile_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"mime" varchar(30) NOT NULL,
	"data" bytea NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ops_team_avatars_mime_check" CHECK ("ops_team_avatars"."mime" IN ('image/webp', 'image/png', 'image/jpeg'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agt_agent_avatars" (
	"agent_id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"mime" varchar(30) NOT NULL,
	"data" bytea NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agt_agent_avatars_mime_check" CHECK ("agt_agent_avatars"."mime" IN ('image/webp', 'image/png', 'image/jpeg'))
);
--> statement-breakpoint
ALTER TABLE "ops_team_avatars" ADD CONSTRAINT "ops_team_avatars_profile_id_ops_team_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."ops_team_profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ops_team_avatars" ADD CONSTRAINT "ops_team_avatars_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agt_agent_avatars" ADD CONSTRAINT "agt_agent_avatars_agent_id_agt_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agt_agents"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agt_agent_avatars" ADD CONSTRAINT "agt_agent_avatars_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;

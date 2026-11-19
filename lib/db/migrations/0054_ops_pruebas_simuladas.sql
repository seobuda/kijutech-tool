-- Pruebas simuladas (Operaciones, 19 nov 2026, esquema aprobado por Enric). Tres tablas nuevas, sin tocar las existentes:
--   ops_sim_environments  qué cuenta de pruebas (tenant aislado) tiene cada cuenta real
--   ops_sim_runs          cada ejecución de un escenario: estado, pasos comprobados, error, quién la lanzó
--   ops_sim_messages      la conversación de Telegram simulada (lo que manda el bot y lo que hace la persona simulada)
-- El entorno de pruebas usa el modo de recepción «simulado» en ops_telegram_config (columna de texto existente): la
-- escucha del bot, el webhook y el planificador lo ignoran.
CREATE TABLE IF NOT EXISTS "ops_sim_environments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sim_tenant_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ops_sim_environments_tenant_id_unique" UNIQUE("tenant_id"),
	CONSTRAINT "ops_sim_environments_sim_tenant_id_unique" UNIQUE("sim_tenant_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ops_sim_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"scenario_key" varchar(60) NOT NULL,
	"status" varchar(10) DEFAULT 'en_curso' NOT NULL,
	"trigger" varchar(12) DEFAULT 'manual' NOT NULL,
	"triggered_by" varchar(255),
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"error" text,
	"commit" varchar(20),
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	CONSTRAINT "ops_sim_runs_status_check" CHECK ("ops_sim_runs"."status" IN ('en_curso', 'ok', 'fallo')),
	CONSTRAINT "ops_sim_runs_trigger_check" CHECK ("ops_sim_runs"."trigger" IN ('claude', 'manual', 'despliegue'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ops_sim_messages" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"chat_id" bigint NOT NULL,
	"direction" varchar(8) NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"buttons" jsonb,
	"run_id" uuid,
	"edited_at" timestamp,
	"deleted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ops_sim_messages_direction_check" CHECK ("ops_sim_messages"."direction" IN ('bot', 'persona', 'aviso'))
);
--> statement-breakpoint
ALTER TABLE "ops_sim_environments" ADD CONSTRAINT "ops_sim_environments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ops_sim_environments" ADD CONSTRAINT "ops_sim_environments_sim_tenant_id_tenants_id_fk" FOREIGN KEY ("sim_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ops_sim_runs" ADD CONSTRAINT "ops_sim_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ops_sim_messages" ADD CONSTRAINT "ops_sim_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ops_sim_messages" ADD CONSTRAINT "ops_sim_messages_run_id_ops_sim_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."ops_sim_runs"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ops_sim_runs_tenant_scenario_idx" ON "ops_sim_runs" USING btree ("tenant_id","scenario_key","started_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ops_sim_messages_chat_idx" ON "ops_sim_messages" USING btree ("tenant_id","chat_id","id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ops_sim_messages_run_idx" ON "ops_sim_messages" USING btree ("run_id");

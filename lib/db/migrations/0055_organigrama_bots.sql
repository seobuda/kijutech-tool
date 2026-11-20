-- Organigrama y bots de departamento (20 nov 2026, aprobado por Enric). Aditiva: dos tablas nuevas, una columna nula y
-- el tipo de agente «jefe». No toca datos existentes.
CREATE TABLE IF NOT EXISTS "ops_telegram_bots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" varchar(40) NOT NULL,
	"bot_token_encrypted" text NOT NULL,
	"bot_token_iv" text NOT NULL,
	"bot_username" varchar(100),
	"bot_name" varchar(255),
	"ready_at" timestamp,
	"webhook_set_at" timestamp,
	"last_error" text,
	"last_error_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ops_telegram_bots_tenant_key_unique" UNIQUE("tenant_id","key")
);
--> statement-breakpoint
ALTER TABLE "ops_telegram_bots" ADD CONSTRAINT "ops_telegram_bots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agt_departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"head_agent_key" varchar(40),
	"reports_to" varchar(20) DEFAULT 'direccion' NOT NULL,
	"bot_key" varchar(40),
	"sort" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agt_departments_tenant_key_unique" UNIQUE("tenant_id","key"),
	CONSTRAINT "agt_departments_reports_check" CHECK ("agt_departments"."reports_to" IN ('direccion', 'gabinete'))
);
--> statement-breakpoint
ALTER TABLE "agt_departments" ADD CONSTRAINT "agt_departments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agt_agents" ADD COLUMN IF NOT EXISTS "department_key" varchar(40);
--> statement-breakpoint
ALTER TABLE "agt_agents" DROP CONSTRAINT IF EXISTS "agt_agents_kind_check";
--> statement-breakpoint
ALTER TABLE "agt_agents" ADD CONSTRAINT "agt_agents_kind_check" CHECK ("agt_agents"."kind" IN ('principal', 'jefe', 'subagente'));

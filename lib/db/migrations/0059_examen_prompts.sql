-- Exámenes de prompts desde el panel (22 nov 2026). Esquema aprobado por Enric el 22 nov (opción A: con historial).
-- Solo añade una tabla: no toca datos existentes.
CREATE TABLE IF NOT EXISTS "ai_prompt_evals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt_key" varchar(100) NOT NULL,
	"prompt_version" integer,
	"draft" boolean DEFAULT false NOT NULL,
	"tenant_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'en_curso' NOT NULL,
	"passed_checks" integer DEFAULT 0 NOT NULL,
	"total_checks" integer DEFAULT 0 NOT NULL,
	"min_score_pct" integer DEFAULT 100 NOT NULL,
	"passed" boolean,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"cost_usd" numeric(10, 6),
	"started_by" integer,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	CONSTRAINT "ai_prompt_evals_status_check" CHECK ("ai_prompt_evals"."status" IN ('en_curso', 'ok', 'error'))
);
--> statement-breakpoint
ALTER TABLE "ai_prompt_evals" ADD CONSTRAINT "ai_prompt_evals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_prompt_evals" ADD CONSTRAINT "ai_prompt_evals_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_prompt_evals_key_started_idx" ON "ai_prompt_evals" USING btree ("prompt_key","started_at");

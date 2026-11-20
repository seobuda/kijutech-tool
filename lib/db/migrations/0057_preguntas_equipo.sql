-- Preguntas del equipo al jefe de Operaciones (módulo Agentes, 20 nov 2026). Fase 2 de docs/DISENO-JEFE-OPERACIONES.md.
-- Esquema aprobado por Enric el 20 nov (agente libre con garantías en código; Opus 5.5 para los jefes).
CREATE TABLE IF NOT EXISTS "agt_team_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"asked_by_clickup_id" varchar(50),
	"asked_by_name" varchar(255) NOT NULL,
	"chat_id" varchar(40) NOT NULL,
	"request_id" uuid,
	"client_id" uuid,
	"question" text NOT NULL,
	"followups" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(22) DEFAULT 'respondida' NOT NULL,
	"tier" varchar(10),
	"topic_key" varchar(60),
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_first_answer" text,
	"ai_answer" text,
	"revisions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"final_answer" text,
	"answered_by" varchar(8),
	"feedback" varchar(10),
	"feedback_note" text,
	"escalation_reason" varchar(16),
	"escalated_at" timestamp,
	"awaiting_chat_id" varchar(40),
	"awaiting_kind" varchar(12),
	"kb_article_id" uuid,
	"embedding" vector(1536),
	"embedding_model" varchar(80),
	"cost_usd" numeric(10, 6),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"answered_at" timestamp,
	"closed_at" timestamp,
	CONSTRAINT "agt_team_questions_status_check" CHECK ("agt_team_questions"."status" IN ('respondida', 'pendiente_aprobacion', 'escalada', 'resuelta', 'cerrada', 'descartada')),
	CONSTRAINT "agt_team_questions_tier_check" CHECK ("agt_team_questions"."tier" IS NULL OR "agt_team_questions"."tier" IN ('ficha', 'base', 'casos', 'general', 'enric'))
);
--> statement-breakpoint
ALTER TABLE "agt_team_questions" ADD CONSTRAINT "agt_team_questions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agt_team_questions" ADD CONSTRAINT "agt_team_questions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agt_team_questions" ADD CONSTRAINT "agt_team_questions_kb_article_id_kb_articles_id_fk" FOREIGN KEY ("kb_article_id") REFERENCES "public"."kb_articles"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agt_team_questions_status_idx" ON "agt_team_questions" USING btree ("tenant_id","status","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agt_team_questions_person_idx" ON "agt_team_questions" USING btree ("tenant_id","chat_id","created_at");

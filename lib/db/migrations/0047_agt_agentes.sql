-- Módulo «Agentes» (13 nov 2026, aprobado por Enric): agentes con rol, conversaciones por Telegram y correo,
-- trabajos de subagentes e integraciones externas. Tablas con prefijo agt_. Además, el motor de acciones de
-- Operaciones acepta el tipo «agent_tool» (acciones que un agente propone desde una conversación).
CREATE TABLE IF NOT EXISTS "agt_agents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "key" varchar(40) NOT NULL,
  "name" varchar(120) NOT NULL,
  "kind" varchar(20) DEFAULT 'subagente' NOT NULL,
  "role" text DEFAULT '' NOT NULL,
  "instructions" text DEFAULT '' NOT NULL,
  "tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "model" varchar(80),
  "voice" varchar(30),
  "monthly_budget_usd" numeric(10, 2),
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "agt_agents_tenant_key_unique" UNIQUE ("tenant_id", "key"),
  CONSTRAINT "agt_agents_kind_check" CHECK ("kind" IN ('principal', 'subagente'))
);
CREATE TABLE IF NOT EXISTS "agt_conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "agent_id" uuid NOT NULL REFERENCES "agt_agents"("id") ON DELETE CASCADE,
  "channel" varchar(20) NOT NULL,
  "peer" varchar(200) NOT NULL,
  "peer_name" varchar(255),
  "summary" text,
  "last_message_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "agt_conversations_peer_unique" UNIQUE ("tenant_id", "agent_id", "channel", "peer"),
  CONSTRAINT "agt_conversations_channel_check" CHECK ("channel" IN ('telegram', 'email', 'web'))
);
CREATE TABLE IF NOT EXISTS "agt_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "conversation_id" uuid NOT NULL REFERENCES "agt_conversations"("id") ON DELETE CASCADE,
  "role" varchar(12) NOT NULL,
  "content" text DEFAULT '' NOT NULL,
  "audio" jsonb,
  "tool_calls" jsonb,
  "cost_usd" numeric(10, 6),
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "agt_messages_role_check" CHECK ("role" IN ('user', 'assistant'))
);
CREATE INDEX IF NOT EXISTS "agt_messages_conversation_idx" ON "agt_messages" USING btree ("conversation_id", "created_at");
CREATE TABLE IF NOT EXISTS "agt_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "agent_id" uuid NOT NULL REFERENCES "agt_agents"("id") ON DELETE CASCADE,
  "conversation_id" uuid REFERENCES "agt_conversations"("id") ON DELETE SET NULL,
  "requested_by" varchar(255) NOT NULL,
  "title" varchar(300) NOT NULL,
  "instruction" text NOT NULL,
  "input" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" varchar(20) DEFAULT 'en_cola' NOT NULL,
  "result" text,
  "error" text,
  "cost_usd" numeric(10, 6),
  "attempts" integer DEFAULT 0 NOT NULL,
  "claimed_at" timestamp,
  "finished_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "agt_jobs_status_check" CHECK ("status" IN ('en_cola', 'trabajando', 'hecho', 'fallido', 'cancelado'))
);
CREATE INDEX IF NOT EXISTS "agt_jobs_status_idx" ON "agt_jobs" USING btree ("tenant_id", "status", "created_at");
CREATE TABLE IF NOT EXISTS "agt_integrations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "provider" varchar(40) NOT NULL,
  "status" varchar(20) DEFAULT 'conectada' NOT NULL,
  "credentials" text,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_ok_at" timestamp,
  "last_error" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "agt_integrations_provider_unique" UNIQUE ("tenant_id", "provider"),
  CONSTRAINT "agt_integrations_status_check" CHECK ("status" IN ('conectada', 'error', 'pendiente'))
);
ALTER TABLE "ops_agent_actions" DROP CONSTRAINT IF EXISTS "ops_agent_actions_kind_check";
ALTER TABLE "ops_agent_actions" ADD CONSTRAINT "ops_agent_actions_kind_check" CHECK ("kind" IN ('blocker_answer', 'note_conversion', 'email_reply', 'agent_tool'));

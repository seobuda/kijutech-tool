CREATE TABLE IF NOT EXISTS "ops_client_senders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "client_id" uuid NOT NULL REFERENCES "ops_clients"("id") ON DELETE CASCADE,
  "kind" varchar(10) NOT NULL,
  "value" varchar(255) NOT NULL,
  "name" varchar(255),
  "role" varchar(120),
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ops_client_senders_unique" UNIQUE("tenant_id", "kind", "value"),
  CONSTRAINT "ops_client_senders_kind_check" CHECK ("kind" IN ('email', 'domain'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ops_client_senders_client_idx" ON "ops_client_senders" USING btree ("client_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ops_client_memory" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "client_id" uuid NOT NULL REFERENCES "ops_clients"("id") ON DELETE CASCADE,
  "kind" varchar(20) NOT NULL,
  "text" text NOT NULL,
  "status" varchar(12) DEFAULT 'aceptado' NOT NULL,
  "source_type" varchar(12) DEFAULT 'manual' NOT NULL,
  "source_id" varchar(100),
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ops_client_memory_kind_check" CHECK ("kind" IN ('preferencia', 'promesa', 'decision', 'contexto', 'restriccion')),
  CONSTRAINT "ops_client_memory_status_check" CHECK ("status" IN ('propuesto', 'aceptado', 'descartado')),
  CONSTRAINT "ops_client_memory_source_check" CHECK ("source_type" IN ('manual', 'email', 'nota', 'encargo'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ops_client_memory_client_idx" ON "ops_client_memory" USING btree ("client_id", "status");

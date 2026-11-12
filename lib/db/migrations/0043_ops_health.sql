-- Salud del sistema (paso 4): incidencias abiertas y resueltas (de las comprobaciones periódicas y de las
-- paradas detectadas al arrancar), y el tipo de aviso «health» para avisar a Enric al abrir y al resolver.
CREATE TABLE IF NOT EXISTS "ops_health_incidents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "check_key" varchar(40) NOT NULL,
  "severity" varchar(10) NOT NULL,
  "title" varchar(255) NOT NULL,
  "detail" text DEFAULT '' NOT NULL,
  "opened_at" timestamp DEFAULT now() NOT NULL,
  "resolved_at" timestamp,
  "notified_at" timestamp,
  "resolved_notified_at" timestamp,
  CONSTRAINT "ops_health_incidents_severity_check" CHECK ("severity" IN ('aviso', 'critico'))
);
CREATE INDEX IF NOT EXISTS "ops_health_incidents_tenant_idx" ON "ops_health_incidents" USING btree ("tenant_id", "opened_at");
-- Como mucho una incidencia ABIERTA por comprobación y cuenta.
CREATE UNIQUE INDEX IF NOT EXISTS "ops_health_incidents_open_unique" ON "ops_health_incidents" ("tenant_id", "check_key") WHERE "resolved_at" IS NULL;

ALTER TABLE "ops_notifications" DROP CONSTRAINT IF EXISTS "ops_notifications_kind_check";
ALTER TABLE "ops_notifications" ADD CONSTRAINT "ops_notifications_kind_check" CHECK ("kind" IN ('new_request','daily_summary','test','review_request','block_alert','reply','returned','digest','reminder','cleanup','cleanup_summary','startup','email_proposal','health'));

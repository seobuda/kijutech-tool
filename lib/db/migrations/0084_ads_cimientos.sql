-- Google Ads · cimientos del módulo (28 nov 2026; docs/ads/DISENO-TECNICO-ADS.md v2, con la auditoría R5). Aditiva: solo
-- tablas nuevas con prefijo ads_. Paso 1: ajustes y credenciales cifradas, cuentas de la MCC, estado de la descarga, cupo
-- de la API, estructura y configuración, métricas diarias y por hora, cobertura por día (cero frente a «sin dato»),
-- fotos de estado y políticas, URL de destino e historial de cambios. Paso 2 (se crean ya, vacías): objetivos, nivel del
-- cliente, hallazgos, respuestas, resultado de cada regla y revisiones. Todo es lectura de Google Ads: nada escribe en
-- las cuentas.
CREATE TABLE IF NOT EXISTS "ads_settings" (
  "tenant_id" uuid PRIMARY KEY NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "mcc_customer_id" varchar(10),
  "auth_mode" varchar(20) DEFAULT 'none' NOT NULL,
  "credentials_encrypted" text,
  "credentials_iv" varchar(64),
  "credentials_hint" varchar(200),
  "credentials_added_at" timestamp,
  "developer_token_encrypted" text,
  "developer_token_iv" varchar(64),
  "api_version" varchar(8) DEFAULT 'v26' NOT NULL,
  "api_version_sunset" date,
  "sync_enabled" boolean DEFAULT false NOT NULL,
  "daily_ops_budget" integer DEFAULT 2500 NOT NULL,
  "history_months" integer DEFAULT 37 NOT NULL,
  "ai_monthly_cap_usd" numeric(10, 2) DEFAULT 25 NOT NULL,
  "alerts_enabled" boolean DEFAULT false NOT NULL,
  "alert_hours" varchar(11) DEFAULT '09:00-19:00' NOT NULL,
  "alert_days" varchar(20) DEFAULT '1,2,3,4,5' NOT NULL,
  "max_interruptions_per_day" integer DEFAULT 2 NOT NULL,
  "agency_email_domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "agency_user_emails" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "state" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_by" varchar(120),
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ads_settings_auth_mode_check" CHECK ("auth_mode" IN ('none', 'service_account', 'sim'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ads_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "platform" varchar(10) DEFAULT 'google' NOT NULL,
  "customer_id" varchar(10) NOT NULL,
  "name" varchar(255),
  "currency" varchar(3),
  "time_zone" varchar(64),
  "status" varchar(20),
  "is_test" boolean DEFAULT false NOT NULL,
  "simulated" boolean DEFAULT false NOT NULL,
  "tracked" boolean DEFAULT true NOT NULL,
  "client_id" uuid REFERENCES "clients"("id") ON DELETE SET NULL,
  "linked_by" varchar(10),
  "link_note" text,
  "auto_tagging" boolean,
  "first_seen_at" timestamp DEFAULT now() NOT NULL,
  "last_seen_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ads_accounts_customer_unique" UNIQUE ("tenant_id", "platform", "customer_id"),
  CONSTRAINT "ads_accounts_linked_by_check" CHECK ("linked_by" IS NULL OR "linked_by" IN ('ficha', 'manual'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ads_accounts_tenant_idx" ON "ads_accounts" ("tenant_id", "tracked");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ads_accounts_client_idx" ON "ads_accounts" ("client_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ads_clients" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "level" varchar(1),
  "updated_by" varchar(120),
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ads_clients_pk" PRIMARY KEY ("tenant_id", "client_id"),
  CONSTRAINT "ads_clients_level_check" CHECK ("level" IS NULL OR "level" IN ('A', 'B', 'C'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ads_sync_state" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "scope_key" varchar(64) DEFAULT '' NOT NULL,
  "account_id" uuid REFERENCES "ads_accounts"("id") ON DELETE CASCADE,
  "source" varchar(20) NOT NULL,
  "last_ok_at" timestamp,
  "last_attempt_at" timestamp,
  "last_data_date" date,
  "cursor" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "expected_every_minutes" integer DEFAULT 360 NOT NULL,
  "consecutive_failures" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ads_sync_state_unique" UNIQUE ("tenant_id", "scope_key", "source"),
  CONSTRAINT "ads_sync_state_source_check" CHECK ("source" IN ('descubrir', 'estructura', 'metricas', 'historico', 'cambios', 'latido', 'landing'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ads_api_usage" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "day" date NOT NULL,
  "operations" integer DEFAULT 0 NOT NULL,
  "errors" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ads_api_usage_pk" PRIMARY KEY ("tenant_id", "day")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ads_budgets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "account_id" uuid NOT NULL REFERENCES "ads_accounts"("id") ON DELETE CASCADE,
  "native_id" varchar(24) NOT NULL,
  "name" varchar(255),
  "amount" numeric(14, 2),
  "period" varchar(20),
  "explicitly_shared" boolean DEFAULT false NOT NULL,
  "delivery_method" varchar(20),
  "status" varchar(20),
  "reference_count" integer,
  "first_seen_at" timestamp DEFAULT now() NOT NULL,
  "last_seen_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ads_budgets_unique" UNIQUE ("account_id", "native_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ads_campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "account_id" uuid NOT NULL REFERENCES "ads_accounts"("id") ON DELETE CASCADE,
  "platform" varchar(10) DEFAULT 'google' NOT NULL,
  "native_id" varchar(24) NOT NULL,
  "name" varchar(255),
  "channel_type" varchar(40),
  "channel_subtype" varchar(40),
  "status" varchar(20),
  "serving_status" varchar(20),
  "primary_status" varchar(30),
  "bidding_strategy_type" varchar(40),
  "bidding_strategy_native_id" varchar(24),
  "budget_native_id" varchar(24),
  "target_cpa" numeric(14, 2),
  "target_roas" numeric(10, 4),
  "start_date" date,
  "end_date" date,
  "ad_schedule" jsonb,
  "attrs" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "first_seen_at" timestamp DEFAULT now() NOT NULL,
  "last_seen_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ads_campaigns_unique" UNIQUE ("account_id", "native_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ads_campaigns_tenant_idx" ON "ads_campaigns" ("tenant_id", "account_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ads_config_versions" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "account_id" uuid NOT NULL REFERENCES "ads_accounts"("id") ON DELETE CASCADE,
  "entity_type" varchar(24) NOT NULL,
  "entity_native_id" varchar(200) NOT NULL,
  "valid_from" timestamp DEFAULT now() NOT NULL,
  "valid_to" timestamp,
  "snapshot" jsonb NOT NULL,
  "hash" varchar(64) NOT NULL,
  CONSTRAINT "ads_config_versions_type_check" CHECK ("entity_type" IN ('cuenta', 'campana', 'presupuesto', 'estrategia', 'accion_conversion'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ads_config_versions_current" ON "ads_config_versions" ("account_id", "entity_type", "entity_native_id") WHERE "valid_to" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ads_config_versions_entity_idx" ON "ads_config_versions" ("account_id", "entity_type", "entity_native_id", "valid_from");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ads_conversion_actions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "account_id" uuid NOT NULL REFERENCES "ads_accounts"("id") ON DELETE CASCADE,
  "resource_name" varchar(200) NOT NULL,
  "native_id" varchar(24),
  "owner_customer_id" varchar(10),
  "name" varchar(255),
  "category" varchar(40),
  "type" varchar(60),
  "status" varchar(20),
  "primary_for_goal" boolean,
  "include_in_conversions" boolean,
  "counting_type" varchar(30),
  "attrs" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "first_seen_at" timestamp DEFAULT now() NOT NULL,
  "last_seen_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ads_conversion_actions_unique" UNIQUE ("account_id", "resource_name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ads_daily_campaign" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "account_id" uuid NOT NULL REFERENCES "ads_accounts"("id") ON DELETE CASCADE,
  "campaign_id" uuid NOT NULL REFERENCES "ads_campaigns"("id") ON DELETE CASCADE,
  "platform" varchar(10) DEFAULT 'google' NOT NULL,
  "day" date NOT NULL,
  "cost" numeric(14, 2) NOT NULL,
  "impressions" bigint NOT NULL,
  "clicks" bigint NOT NULL,
  "conversions" numeric(14, 4),
  "conversions_value" numeric(14, 2),
  "all_conversions" numeric(14, 4),
  "conversions_by_conv_date" numeric(14, 4),
  "ext" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "synced_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ads_daily_campaign_unique" UNIQUE ("campaign_id", "day")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ads_daily_campaign_account_idx" ON "ads_daily_campaign" ("account_id", "day");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ads_daily_conversion" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "account_id" uuid NOT NULL REFERENCES "ads_accounts"("id") ON DELETE CASCADE,
  "campaign_id" uuid NOT NULL REFERENCES "ads_campaigns"("id") ON DELETE CASCADE,
  "conversion_action" varchar(200) NOT NULL,
  "day" date NOT NULL,
  "conversions" numeric(14, 4),
  "all_conversions" numeric(14, 4),
  "conversions_value" numeric(14, 2),
  "conversions_by_conv_date" numeric(14, 4),
  "all_conversions_by_conv_date" numeric(14, 4),
  "synced_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ads_daily_conversion_unique" UNIQUE ("campaign_id", "conversion_action", "day")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ads_daily_conversion_account_idx" ON "ads_daily_conversion" ("account_id", "day");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ads_daily_coverage" (
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "account_id" uuid NOT NULL REFERENCES "ads_accounts"("id") ON DELETE CASCADE,
  "day" date NOT NULL,
  "synced_at" timestamp DEFAULT now() NOT NULL,
  "complete" boolean DEFAULT false NOT NULL,
  "control_cost" numeric(14, 2),
  "control_impressions" bigint,
  "rows_cost" numeric(14, 2),
  "rows_impressions" bigint,
  "note" text,
  CONSTRAINT "ads_daily_coverage_pk" PRIMARY KEY ("account_id", "day")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ads_daily_coverage_tenant_idx" ON "ads_daily_coverage" ("tenant_id", "day");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ads_hourly_campaign" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "account_id" uuid NOT NULL REFERENCES "ads_accounts"("id") ON DELETE CASCADE,
  "campaign_id" uuid NOT NULL REFERENCES "ads_campaigns"("id") ON DELETE CASCADE,
  "day" date NOT NULL,
  "hour" smallint NOT NULL,
  "impressions" bigint NOT NULL,
  "clicks" bigint NOT NULL,
  "cost" numeric(14, 2) NOT NULL,
  "conversions" numeric(14, 4),
  "synced_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ads_hourly_campaign_unique" UNIQUE ("campaign_id", "day", "hour"),
  CONSTRAINT "ads_hourly_campaign_hour_check" CHECK ("hour" BETWEEN 0 AND 23)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ads_hourly_campaign_account_idx" ON "ads_hourly_campaign" ("account_id", "day");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ads_campaign_status_daily" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "account_id" uuid NOT NULL REFERENCES "ads_accounts"("id") ON DELETE CASCADE,
  "campaign_id" uuid NOT NULL REFERENCES "ads_campaigns"("id") ON DELETE CASCADE,
  "day" date NOT NULL,
  "status" varchar(20),
  "primary_status" varchar(30),
  "primary_status_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "serving_status" varchar(20),
  "bidding_status" varchar(40),
  "budget_amount" numeric(14, 2),
  "observations" integer DEFAULT 1 NOT NULL,
  "worst_primary_status" varchar(30),
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ads_campaign_status_daily_unique" UNIQUE ("campaign_id", "day")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ads_campaign_status_daily_account_idx" ON "ads_campaign_status_daily" ("account_id", "day");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ads_ad_group_policy_daily" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "account_id" uuid NOT NULL REFERENCES "ads_accounts"("id") ON DELETE CASCADE,
  "campaign_id" uuid REFERENCES "ads_campaigns"("id") ON DELETE CASCADE,
  "entity_kind" varchar(12) DEFAULT 'ad_group' NOT NULL,
  "ad_group_native_id" varchar(24) NOT NULL,
  "name" varchar(255),
  "ad_group_status" varchar(20),
  "day" date NOT NULL,
  "ads_total" integer DEFAULT 0 NOT NULL,
  "ads_approved" integer DEFAULT 0 NOT NULL,
  "ads_limited" integer DEFAULT 0 NOT NULL,
  "ads_disapproved" integer DEFAULT 0 NOT NULL,
  "keywords_disapproved" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ads_ad_group_policy_daily_unique" UNIQUE ("account_id", "entity_kind", "ad_group_native_id", "day"),
  CONSTRAINT "ads_ad_group_policy_daily_kind_check" CHECK ("entity_kind" IN ('ad_group', 'asset_group'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ads_change_events" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "account_id" uuid NOT NULL REFERENCES "ads_accounts"("id") ON DELETE CASCADE,
  "event_resource_name" varchar(300) NOT NULL,
  "change_at" timestamp with time zone NOT NULL,
  "change_at_local" varchar(32) NOT NULL,
  "user_email" varchar(255),
  "client_type" varchar(60),
  "actor_class" varchar(12) DEFAULT 'desconocido' NOT NULL,
  "resource_type" varchar(60),
  "changed_resource" varchar(300),
  "campaign_native_id" varchar(24),
  "operation" varchar(20),
  "changed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "old_value" jsonb,
  "new_value" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ads_change_events_unique" UNIQUE ("account_id", "event_resource_name"),
  CONSTRAINT "ads_change_events_actor_check" CHECK ("actor_class" IN ('agencia', 'cliente', 'google', 'herramienta', 'desconocido'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ads_change_events_account_idx" ON "ads_change_events" ("account_id", "change_at" DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ads_landing_urls" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "account_id" uuid NOT NULL REFERENCES "ads_accounts"("id") ON DELETE CASCADE,
  "url_normalized" text NOT NULL,
  "url" text NOT NULL,
  "origins" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "campaign_native_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "cost_7d" numeric(14, 2),
  "clicks_7d" bigint,
  "first_seen_at" timestamp DEFAULT now() NOT NULL,
  "last_seen_at" timestamp DEFAULT now() NOT NULL,
  "last_check_at" timestamp,
  "last_check_status" varchar(40),
  "last_check_ok" boolean,
  "consecutive_failures" integer DEFAULT 0 NOT NULL,
  CONSTRAINT "ads_landing_urls_unique" UNIQUE ("account_id", "url_normalized")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ads_goals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "kind" varchar(12) DEFAULT 'provisional' NOT NULL,
  "cpl_max" numeric(14, 2),
  "budget_min" numeric(14, 2),
  "budget_usual" numeric(14, 2),
  "budget_max" numeric(14, 2),
  "capacity_per_week" integer,
  "calendar" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "data_quality" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "agreed_by" varchar(120),
  "valid_from" date NOT NULL,
  "frozen_baseline_from" date,
  "frozen_baseline_to" date,
  "notes" text,
  "created_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ads_goals_version_unique" UNIQUE ("client_id", "version"),
  CONSTRAINT "ads_goals_kind_check" CHECK ("kind" IN ('provisional', 'acordado'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ads_findings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "account_id" uuid REFERENCES "ads_accounts"("id") ON DELETE CASCADE,
  "campaign_id" uuid REFERENCES "ads_campaigns"("id") ON DELETE SET NULL,
  "scope" varchar(10) DEFAULT 'cuenta' NOT NULL,
  "kind" varchar(32) NOT NULL,
  "cause_key" varchar(300) NOT NULL,
  "episode_started_at" timestamp DEFAULT now() NOT NULL,
  "channel" varchar(12) NOT NULL,
  "recipient" varchar(10) DEFAULT 'gestor' NOT NULL,
  "severity" varchar(10) DEFAULT 'media' NOT NULL,
  "title" varchar(300) NOT NULL,
  "evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "exposure" numeric(14, 2),
  "currency" varchar(3),
  "confidence" varchar(10),
  "status" varchar(12) DEFAULT 'abierto' NOT NULL,
  "first_seen_at" timestamp DEFAULT now() NOT NULL,
  "last_seen_at" timestamp DEFAULT now() NOT NULL,
  "last_checked_at" timestamp,
  "unchecked_since" timestamp,
  "resolved_at" timestamp,
  "silenced_until" timestamp,
  "notified_at" timestamp,
  "notify_state" varchar(12),
  CONSTRAINT "ads_findings_scope_check" CHECK ("scope" IN ('cuenta', 'campana', 'agencia')),
  CONSTRAINT "ads_findings_kind_check" CHECK ("kind" IN ('cuenta_no_sirve', 'rechazo_con_gasto', 'landing_caida', 'campana_parada_desbocada', 'lead_no_llega', 'pausado_aportaba', 'llamadas', 'ritmo_gasto', 'termino_come_gasto', 'lote_terminos', 'cambio_ajeno', 'medicion_rota', 'caida_leads', 'lanzamiento', 'fuente_sin_datos')),
  CONSTRAINT "ads_findings_channel_check" CHECK ("channel" IN ('interrupcion', 'parte', 'lote', 'revision')),
  CONSTRAINT "ads_findings_recipient_check" CHECK ("recipient" IN ('gestor', 'tecnico')),
  CONSTRAINT "ads_findings_status_check" CHECK ("status" IN ('abierto', 'resuelto', 'silenciado', 'descartado'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ads_findings_open_cause" ON "ads_findings" ("tenant_id", "cause_key") WHERE "status" IN ('abierto', 'silenciado');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ads_findings_account_idx" ON "ads_findings" ("tenant_id", "account_id", "status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ads_finding_responses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "finding_id" uuid NOT NULL REFERENCES "ads_findings"("id") ON DELETE CASCADE,
  "user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "response" varchar(24) NOT NULL,
  "reason" text,
  "until" date,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ads_finding_responses_check" CHECK ("response" IN ('hecho', 'lo_hago_yo', 'esperando_cliente', 'cliente_lo_quiere', 'ya_lo_sabia', 'no_es_problema', 'posponer', 'encargar'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ads_finding_responses_finding_idx" ON "ads_finding_responses" ("finding_id", "created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ads_rule_runs" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "scope_key" varchar(64) DEFAULT '' NOT NULL,
  "account_id" uuid REFERENCES "ads_accounts"("id") ON DELETE CASCADE,
  "rule" varchar(40) NOT NULL,
  "evaluated_at" timestamp DEFAULT now() NOT NULL,
  "outcome" varchar(14) NOT NULL,
  "reason" text,
  "data_through" date,
  CONSTRAINT "ads_rule_runs_unique" UNIQUE ("tenant_id", "scope_key", "rule"),
  CONSTRAINT "ads_rule_runs_outcome_check" CHECK ("outcome" IN ('ok', 'hallazgo', 'no_comprobado'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ads_account_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "account_id" uuid NOT NULL REFERENCES "ads_accounts"("id") ON DELETE CASCADE,
  "reviewed_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "note" text,
  "reviewed_at" timestamp DEFAULT now() NOT NULL,
  "next_review_on" date
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ads_account_reviews_account_idx" ON "ads_account_reviews" ("account_id", "reviewed_at");

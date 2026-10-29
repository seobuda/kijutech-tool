CREATE TABLE "ops_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" varchar(20) NOT NULL,
	"dedupe_key" varchar(200) NOT NULL,
	"for_clickup_user_id" varchar(50),
	"for_name" varchar(255),
	"chat_id" bigint,
	"request_id" uuid,
	"payload" jsonb NOT NULL,
	"status" varchar(10) DEFAULT 'pendiente' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp,
	"telegram_message_id" bigint,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ops_notifications_tenant_dedupe_unique" UNIQUE("tenant_id","dedupe_key"),
	CONSTRAINT "ops_notifications_status_check" CHECK ("ops_notifications"."status" IN ('pendiente', 'enviado', 'fallido')),
	CONSTRAINT "ops_notifications_kind_check" CHECK ("ops_notifications"."kind" IN ('new_request', 'daily_summary', 'test'))
);
--> statement-breakpoint
CREATE TABLE "ops_telegram_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"bot_token_encrypted" text NOT NULL,
	"bot_token_iv" text NOT NULL,
	"bot_username" varchar(100),
	"bot_name" varchar(255),
	"test_mode" boolean DEFAULT true NOT NULL,
	"receive_mode" varchar(10) DEFAULT 'polling' NOT NULL,
	"webhook_url" text,
	"last_update_id" bigint DEFAULT 0 NOT NULL,
	"last_poll_at" timestamp,
	"last_error" text,
	"last_error_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ops_telegram_config_tenant_id_unique" UNIQUE("tenant_id")
);
--> statement-breakpoint
CREATE TABLE "ops_telegram_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"clickup_user_id" varchar(50) NOT NULL,
	"username" varchar(255) NOT NULL,
	"link_code" varchar(40),
	"telegram_chat_id" bigint,
	"telegram_username" varchar(100),
	"linked_at" timestamp,
	"timezone" varchar(60) DEFAULT 'America/Santo_Domingo' NOT NULL,
	"work_start" varchar(5) DEFAULT '09:00' NOT NULL,
	"daily_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ops_telegram_members_link_code_unique" UNIQUE("link_code"),
	CONSTRAINT "ops_telegram_members_tenant_user_unique" UNIQUE("tenant_id","clickup_user_id")
);
--> statement-breakpoint
ALTER TABLE "ops_requests" ADD COLUMN "seen_at" timestamp;--> statement-breakpoint
ALTER TABLE "ops_requests" ADD COLUMN "seen_by" varchar(255);--> statement-breakpoint
ALTER TABLE "ops_notifications" ADD CONSTRAINT "ops_notifications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_notifications" ADD CONSTRAINT "ops_notifications_request_id_ops_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."ops_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_telegram_config" ADD CONSTRAINT "ops_telegram_config_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_telegram_members" ADD CONSTRAINT "ops_telegram_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ops_notifications_status_next_idx" ON "ops_notifications" USING btree ("status","next_attempt_at");
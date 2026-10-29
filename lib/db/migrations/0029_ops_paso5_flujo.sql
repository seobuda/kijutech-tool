CREATE TABLE "ops_blockers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"request_id" uuid,
	"asked_by_clickup_id" varchar(50),
	"asked_by_name" varchar(255),
	"question" text NOT NULL,
	"attachment_file_id" text,
	"status" varchar(20) DEFAULT 'abierto' NOT NULL,
	"ai_answer" text,
	"ai_source" text,
	"ai_summary" text,
	"ai_options" jsonb,
	"ai_recommendation" text,
	"owner_answer" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"answered_at" timestamp,
	CONSTRAINT "ops_blockers_status_check" CHECK ("ops_blockers"."status" IN ('abierto', 'respondido_agente', 'escalado', 'respondido_owner'))
);
--> statement-breakpoint
CREATE TABLE "ops_clickup_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"request_id" uuid,
	"action" varchar(20) NOT NULL,
	"payload" jsonb NOT NULL,
	"dedupe_key" varchar(200) NOT NULL,
	"status" varchar(10) DEFAULT 'pendiente' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"done_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ops_clickup_outbox_tenant_dedupe_unique" UNIQUE("tenant_id","dedupe_key"),
	CONSTRAINT "ops_outbox_status_check" CHECK ("ops_clickup_outbox"."status" IN ('pendiente', 'hecho', 'fallido')),
	CONSTRAINT "ops_outbox_action_check" CHECK ("ops_clickup_outbox"."action" IN ('set_status', 'comment'))
);
--> statement-breakpoint
CREATE TABLE "ops_request_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"request_id" uuid,
	"person_clickup_user_id" varchar(50),
	"person_name" varchar(255),
	"event_type" varchar(40) NOT NULL,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops_status_map" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"clickup_list_id" varchar(50) NOT NULL,
	"in_progress_status" varchar(100),
	"in_review_status" varchar(100),
	"done_status" varchar(100),
	"edited" boolean DEFAULT false NOT NULL,
	CONSTRAINT "ops_status_map_tenant_list_unique" UNIQUE("tenant_id","clickup_list_id")
);
--> statement-breakpoint
CREATE TABLE "ops_telegram_pending" (
	"chat_id" bigint PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"kind" varchar(20) NOT NULL,
	"request_id" uuid,
	"blocker_id" uuid,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops_work_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" varchar(40) NOT NULL,
	"label" varchar(100) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "ops_work_types_tenant_key_unique" UNIQUE("tenant_id","key")
);
--> statement-breakpoint
ALTER TABLE "ops_notifications" DROP CONSTRAINT "ops_notifications_kind_check";--> statement-breakpoint
ALTER TABLE "ops_clickup_lists" ADD COLUMN "statuses" jsonb;--> statement-breakpoint
ALTER TABLE "ops_requests" ADD COLUMN "work_status" varchar(20) DEFAULT 'asignado' NOT NULL;--> statement-breakpoint
ALTER TABLE "ops_requests" ADD COLUMN "work_status_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "ops_requests" ADD COLUMN "work_type_key" varchar(40);--> statement-breakpoint
ALTER TABLE "ops_requests" ADD COLUMN "reviewer_key" varchar(30);--> statement-breakpoint
ALTER TABLE "ops_requests" ADD COLUMN "done_note" text;--> statement-breakpoint
ALTER TABLE "ops_telegram_config" ADD COLUMN "digest_times" varchar(40) DEFAULT '13:00,18:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "ops_telegram_config" ADD COLUMN "digest_timezone" varchar(60) DEFAULT 'Europe/Madrid' NOT NULL;--> statement-breakpoint
ALTER TABLE "ops_blockers" ADD CONSTRAINT "ops_blockers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_blockers" ADD CONSTRAINT "ops_blockers_request_id_ops_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."ops_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_clickup_outbox" ADD CONSTRAINT "ops_clickup_outbox_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_clickup_outbox" ADD CONSTRAINT "ops_clickup_outbox_request_id_ops_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."ops_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_request_events" ADD CONSTRAINT "ops_request_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_request_events" ADD CONSTRAINT "ops_request_events_request_id_ops_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."ops_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_status_map" ADD CONSTRAINT "ops_status_map_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_telegram_pending" ADD CONSTRAINT "ops_telegram_pending_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_telegram_pending" ADD CONSTRAINT "ops_telegram_pending_request_id_ops_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."ops_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_telegram_pending" ADD CONSTRAINT "ops_telegram_pending_blocker_id_ops_blockers_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."ops_blockers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_work_types" ADD CONSTRAINT "ops_work_types_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ops_blockers_status_idx" ON "ops_blockers" USING btree ("tenant_id","status","created_at");--> statement-breakpoint
CREATE INDEX "ops_outbox_status_idx" ON "ops_clickup_outbox" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "ops_request_events_req_idx" ON "ops_request_events" USING btree ("request_id","created_at");--> statement-breakpoint
CREATE INDEX "ops_request_events_tenant_idx" ON "ops_request_events" USING btree ("tenant_id","created_at");--> statement-breakpoint
ALTER TABLE "ops_notifications" ADD CONSTRAINT "ops_notifications_kind_check" CHECK ("ops_notifications"."kind" IN ('new_request', 'daily_summary', 'test', 'review_request', 'block_alert', 'reply', 'returned', 'digest'));--> statement-breakpoint
ALTER TABLE "ops_requests" ADD CONSTRAINT "ops_requests_work_status_check" CHECK ("ops_requests"."work_status" IN ('asignado', 'en_curso', 'bloqueado', 'en_revision', 'devuelto', 'completado'));
--> statement-breakpoint
INSERT INTO "ops_work_types" ("tenant_id", "key", "label", "sort_order")
SELECT t."id", v.key, v.label, v.ord FROM "tenants" t,
 (VALUES ('cambio_web','Cambio web',1),('landing','Landing',2),('articulo','Artículo',3),
         ('google_ads','Google Ads',4),('mantenimiento','Mantenimiento',5),('otro','Otro',6)) AS v(key, label, ord);

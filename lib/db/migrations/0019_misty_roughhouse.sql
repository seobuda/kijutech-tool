CREATE TABLE "ai_clustering_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"job_id" uuid,
	"feedback_type" varchar(30) NOT NULL,
	"original_value" jsonb,
	"corrected_value" jsonb,
	"cluster_id" uuid,
	"keyword" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_intent_modifiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"modifier" varchar(100) NOT NULL,
	"effect" varchar(20) NOT NULL,
	"confidence" integer DEFAULT 70 NOT NULL,
	"source" varchar(20) DEFAULT 'ai_classified' NOT NULL,
	"times_seen" integer DEFAULT 1 NOT NULL,
	"language" varchar(5) DEFAULT 'es' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ai_intent_modifiers_modifier_language_unique" UNIQUE("modifier","language")
);
--> statement-breakpoint
ALTER TABLE "ai_clustering_feedback" ADD CONSTRAINT "ai_clustering_feedback_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_clustering_feedback" ADD CONSTRAINT "ai_clustering_feedback_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_clustering_feedback" ADD CONSTRAINT "ai_clustering_feedback_job_id_ai_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."ai_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_clustering_feedback" ADD CONSTRAINT "ai_clustering_feedback_cluster_id_seo_kw_clusters_id_fk" FOREIGN KEY ("cluster_id") REFERENCES "public"."seo_kw_clusters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO ai_intent_modifiers
(modifier, effect, confidence, source) VALUES
('precio', 'same_intent', 100, 'human_confirmed'),
('precios', 'same_intent', 100, 'human_confirmed'),
('coste', 'same_intent', 100, 'human_confirmed'),
('costes', 'same_intent', 100, 'human_confirmed'),
('cuanto cuesta', 'same_intent', 100, 'human_confirmed'),
('cuanto vale', 'same_intent', 100, 'human_confirmed'),
('presupuesto', 'same_intent', 100, 'human_confirmed'),
('barato', 'same_intent', 100, 'human_confirmed'),
('economico', 'same_intent', 100, 'human_confirmed'),
('asequible', 'same_intent', 100, 'human_confirmed'),
('gratis', 'same_intent', 100, 'human_confirmed'),
('gratuito', 'same_intent', 100, 'human_confirmed'),
('oferta', 'same_intent', 100, 'human_confirmed'),
('descuento', 'same_intent', 100, 'human_confirmed'),
('bueno', 'same_intent', 100, 'human_confirmed'),
('mejor', 'same_intent', 100, 'human_confirmed'),
('top', 'same_intent', 100, 'human_confirmed'),
('recomendado', 'same_intent', 100, 'human_confirmed'),
('opiniones', 'same_intent', 100, 'human_confirmed'),
('resenas', 'same_intent', 100, 'human_confirmed'),
('valoraciones', 'same_intent', 100, 'human_confirmed'),
('reviews', 'same_intent', 100, 'human_confirmed'),
('cerca', 'same_intent', 100, 'human_confirmed'),
('cerca de mi', 'same_intent', 100, 'human_confirmed'),
('telefono', 'same_intent', 100, 'human_confirmed'),
('contacto', 'same_intent', 100, 'human_confirmed'),
('horario', 'same_intent', 100, 'human_confirmed'),
('horarios', 'same_intent', 100, 'human_confirmed'),
('direccion', 'same_intent', 100, 'human_confirmed'),
('para ninos', 'different_intent', 100, 'human_confirmed'),
('infantil', 'different_intent', 100, 'human_confirmed'),
('para empresas', 'different_intent', 100, 'human_confirmed'),
('para profesionales', 'different_intent', 100, 'human_confirmed'),
('urgente', 'different_intent', 100, 'human_confirmed'),
('24 horas', 'different_intent', 100, 'human_confirmed'),
('express', 'different_intent', 100, 'human_confirmed'),
('alternativas', 'different_intent', 100, 'human_confirmed'),
('comparativa', 'different_intent', 100, 'human_confirmed')
ON CONFLICT (modifier, language) DO NOTHING;
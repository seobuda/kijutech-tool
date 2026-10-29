CREATE TABLE "ops_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_by" integer NOT NULL,
	"clickup_list_id" varchar(50) NOT NULL,
	"clickup_list_name" varchar(255),
	"title" varchar(500) NOT NULL,
	"original_request" text NOT NULL,
	"prepared_description" text NOT NULL,
	"assignee_clickup_id" varchar(50),
	"assignee_name" varchar(255),
	"due_date" date,
	"priority" integer,
	"status" varchar(20) DEFAULT 'pendiente_clickup' NOT NULL,
	"clickup_task_id" varchar(50),
	"clickup_task_url" text,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"synced_at" timestamp,
	CONSTRAINT "ops_requests_status_check" CHECK ("ops_requests"."status" IN ('pendiente_clickup', 'creado', 'error_sync')),
	CONSTRAINT "ops_requests_priority_check" CHECK ("ops_requests"."priority" IS NULL OR "ops_requests"."priority" BETWEEN 1 AND 4)
);
--> statement-breakpoint
ALTER TABLE "ops_requests" ADD CONSTRAINT "ops_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_requests" ADD CONSTRAINT "ops_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ops_requests_tenant_created_idx" ON "ops_requests" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ops_requests_clickup_task_id_unique" ON "ops_requests" USING btree ("clickup_task_id") WHERE "ops_requests"."clickup_task_id" IS NOT NULL;
--> statement-breakpoint
INSERT INTO "ai_prompts" ("key", "name", "description", "system_prompt", "user_prompt_template", "is_active")
VALUES (
  'ops_prepare_request',
  'Operaciones: preparar encargo',
  'Convierte una petición escrita deprisa en un encargo claro (título, resultado esperado, pasos, criterios de aceptación y datos que faltan). Placeholders: {fecha_hoy}, {lista}, {titulo}, {peticion}.',
  $kiju$Eres el project manager de Kijutech, una agencia de marketing digital (SEO, Google Ads y webs WordPress). Tu tarea es convertir una petición escrita deprisa en un encargo claro, que un miembro del equipo pueda ejecutar sin tener que hacer preguntas.

Reglas:
- No inventes datos (teléfonos, textos, URLs, precios, accesos). Si falta algo imprescindible para ejecutar el encargo, no lo supongas: añádelo a datos_que_faltan como una pregunta concreta.
- El título empieza por un verbo en infinitivo y dice qué hay que hacer y dónde (por ejemplo: "Cambiar el teléfono en la web de RF Serveis").
- resultado_esperado: una o dos frases que describan cómo debe quedar el trabajo terminado.
- pasos: entre 2 y 8 pasos concretos y en orden, sin pasos obvios ni genéricos.
- criterios_aceptacion: entre 2 y 5 comprobaciones que otra persona pueda verificar (qué se mira y dónde).
- Escribe en español, con frases cortas y lenguaje sencillo: el equipo es junior.
- Responde SOLO con JSON válido, sin ningún texto adicional, con esta forma:
{"titulo": "", "resultado_esperado": "", "pasos": [], "criterios_aceptacion": [], "datos_que_faltan": []}$kiju$,
  $kiju$Fecha de hoy: {fecha_hoy}
Lista de ClickUp: {lista}
Título provisional: {titulo}
Petición:
{peticion}$kiju$,
  true
)
ON CONFLICT ("key") DO NOTHING;

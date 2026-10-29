CREATE TABLE "ops_note_audios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"note_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"size_bytes" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"transcript" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ops_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_by" integer NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"clickup_space_id" varchar(50),
	"clickup_space_name" varchar(255),
	"assignee_clickup_id" varchar(50),
	"assignee_name" varchar(255),
	"status" varchar(20) DEFAULT 'borrador' NOT NULL,
	"proposal" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"converted_at" timestamp,
	CONSTRAINT "ops_notes_status_check" CHECK ("ops_notes"."status" IN ('borrador', 'convertida'))
);
--> statement-breakpoint
CREATE TABLE "ops_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ops_settings_tenant_key_unique" UNIQUE("tenant_id","key")
);
--> statement-breakpoint
ALTER TABLE "ops_requests" ADD COLUMN "note_id" uuid;--> statement-breakpoint
ALTER TABLE "ops_requests" ADD COLUMN "audio_attached_at" timestamp;--> statement-breakpoint
ALTER TABLE "ops_note_audios" ADD CONSTRAINT "ops_note_audios_note_id_ops_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."ops_notes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_note_audios" ADD CONSTRAINT "ops_note_audios_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_notes" ADD CONSTRAINT "ops_notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_notes" ADD CONSTRAINT "ops_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ops_settings" ADD CONSTRAINT "ops_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ops_note_audios_note_idx" ON "ops_note_audios" USING btree ("note_id");--> statement-breakpoint
CREATE INDEX "ops_notes_tenant_updated_idx" ON "ops_notes" USING btree ("tenant_id","updated_at");--> statement-breakpoint
ALTER TABLE "ops_requests" ADD CONSTRAINT "ops_requests_note_id_ops_notes_id_fk" FOREIGN KEY ("note_id") REFERENCES "public"."ops_notes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ops_requests_note_idx" ON "ops_requests" USING btree ("note_id");
--> statement-breakpoint
INSERT INTO "ai_model_pricing" ("provider", "model", "input_cost_per_1k", "output_cost_per_1k")
VALUES ('gemini', 'gemini-2.5-flash', '0.001000', '0.002500')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "ai_prompts" ("key", "name", "description", "system_prompt", "user_prompt_template", "is_active")
VALUES (
  'ops_note_to_requests',
  'Operaciones: convertir nota en encargos',
  'Lee una nota (escrita o dictada) y propone uno o varios encargos, con lista y responsable, más lo que no es un encargo. Placeholders: {fecha_hoy}, {espacio}, {responsable_seleccionado}, {listas}, {miembros}, {nota}.',
  $kiju$Eres el project manager de Kijutech, una agencia de marketing digital (SEO, Google Ads y webs WordPress). Recibes una nota escrita o dictada deprisa por quien lleva las operaciones. Tu tarea es separarla en encargos claros, que un miembro del equipo pueda ejecutar sin tener que hacer preguntas.

Reglas:
- Una nota puede contener uno o varios trabajos distintos. Crea un encargo por cada trabajo. No partas un mismo trabajo en varios encargos ni juntes trabajos distintos en uno.
- No inventes datos (teléfonos, textos, URLs, precios, accesos). Si falta algo imprescindible para ejecutar un encargo, no lo supongas: añádelo a datos_que_faltan de ese encargo como una pregunta concreta.
- titulo: empieza por un verbo en infinitivo y dice qué hay que hacer y dónde (por ejemplo: "Cambiar el teléfono en la web de RF Serveis").
- resultado_esperado: una o dos frases que describan cómo debe quedar el trabajo terminado.
- pasos: entre 2 y 8 pasos concretos y en orden, sin pasos obvios ni genéricos.
- criterios_aceptacion: entre 2 y 5 comprobaciones que otra persona pueda verificar (qué se mira y dónde).
- lista_id: SOLO puedes usar uno de los ids de la lista "Listas disponibles". Elige la que mejor encaje con el trabajo según su nombre. Si ninguna encaja con claridad, pon "" (cadena vacía). Nunca inventes un id.
- responsable: el nombre EXACTO de uno de los miembros del equipo. Por defecto, el responsable seleccionado. Solo propón a otra persona si la nota dice con claridad que ese trabajo lo hace esa persona. Si no hay responsable seleccionado y la nota no menciona a nadie, pon "".
- fecha: formato AAAA-MM-DD, solo si la nota menciona una fecha o un plazo claro (usa la fecha de hoy para resolver "mañana", "el viernes", etc.). Si no, pon "".
- prioridad: 1 urgente, 2 alta, 3 normal, 4 baja. Usa 3 salvo que la nota indique otra cosa; urgente solo si la nota lo dice.
- Si algo es claramente una tarea de quien escribe la nota (por ejemplo "llamar al cliente", "mandar el presupuesto"), conviértelo en un encargo asignado al responsable seleccionado.
- no_convertido: todo lo que NO es un encargo (ideas, información sobre el cliente, comentarios, recordatorios sin una acción concreta), resumido en una línea cada uno. Nada de la nota puede perderse: o va a un encargo o va a no_convertido.
- Si la nota está vacía o no contiene ningún trabajo, devuelve "encargos": [].
- Escribe en español, con frases cortas y lenguaje sencillo: el equipo es junior.
- Responde SOLO con JSON válido, sin ningún texto adicional, con esta forma:
{"encargos": [{"titulo": "", "resultado_esperado": "", "pasos": [], "criterios_aceptacion": [], "datos_que_faltan": [], "lista_id": "", "responsable": "", "fecha": "", "prioridad": 3}], "no_convertido": []}$kiju$,
  $kiju$Fecha de hoy: {fecha_hoy}
Espacio de ClickUp: {espacio}
Responsable seleccionado: {responsable_seleccionado}

Listas disponibles (usa SOLO estos ids):
{listas}

Miembros del equipo:
{miembros}

Nota:
{nota}$kiju$,
  true
)
ON CONFLICT ("key") DO NOTHING;

-- La ficha del cliente pasa al NÚCLEO (14 nov 2026, aprobado por Enric; diseño en docs/DISENO-FICHA-CLIENTE.md).
--   clients             identidad, estado, empresa, negocio, estrategia y contrato (mismo id que ops_clients)
--   client_contacts     personas del cliente (sustituye a ops_client_senders para reconocer correos)
--   client_locations    locales o sedes
--   client_assets       webs, dominios y cuentas (Search Console, Analytics, ficha de Google, Ads, redes…). NUNCA contraseñas.
--   client_competitors  competencia
--   client_memory       memoria del cliente (antes ops_client_memory; mismos datos)
--   projects.client_id  proyectos SEO de un cliente
-- ops_clients se queda con los ajustes de Operaciones (nivel, plazo, ClickUp, alertas, horas, días). Las tablas de
-- Operaciones que apuntaban a ops_clients apuntan ahora a clients (mismos ids: no se reescribe ninguna fila).
-- Todo en una transacción: si algo falla, no cambia nada.

CREATE TABLE IF NOT EXISTS "clients" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" varchar(20) DEFAULT 'activo' NOT NULL,
  "sector" varchar(120),
  "summary" text,
  "logo_url" varchar(500),
  "legal_name" varchar(255),
  "tax_id" varchar(30),
  "fiscal_address" text,
  "business" text,
  "offerings" text,
  "area" varchar(255),
  "audience" text,
  "value_proposition" text,
  "brand_tone" text,
  "goals" text,
  "strategy" text,
  "notes" text,
  "contract_services" text,
  "monthly_fee" numeric(10, 2),
  "contract_start" date,
  "contract_renewal" date,
  "started_at" date,
  "ended_at" date,
  "end_reason" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "clients_status_check" CHECK ("status" IN ('prospecto', 'onboarding', 'activo', 'pausado', 'baja'))
);
CREATE INDEX IF NOT EXISTS "clients_tenant_idx" ON "clients" USING btree ("tenant_id", "status");

CREATE TABLE IF NOT EXISTS "client_contacts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "job_title" varchar(120),
  "role" varchar(20) DEFAULT 'otro' NOT NULL,
  "email" varchar(255),
  "phone" varchar(40),
  "whatsapp" varchar(40),
  "preferred_channel" varchar(20),
  "is_primary" boolean DEFAULT false NOT NULL,
  "notes" text,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "client_contacts_role_check" CHECK ("role" IN ('decisor', 'facturacion', 'tecnico', 'marketing', 'otro')),
  CONSTRAINT "client_contacts_channel_check" CHECK ("preferred_channel" IS NULL OR "preferred_channel" IN ('email', 'telefono', 'whatsapp', 'otro'))
);
CREATE INDEX IF NOT EXISTS "client_contacts_client_idx" ON "client_contacts" USING btree ("client_id");
-- Un correo solo puede ser de un cliente (así se sabe de quién es un email recibido).
CREATE UNIQUE INDEX IF NOT EXISTS "client_contacts_email_unique" ON "client_contacts" USING btree ("tenant_id", "email") WHERE "email" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "client_locations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "name" varchar(255),
  "address" text,
  "city" varchar(120),
  "postal_code" varchar(20),
  "region" varchar(120),
  "country" varchar(80),
  "phone" varchar(40),
  "hours" text,
  "is_primary" boolean DEFAULT false NOT NULL,
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "client_locations_client_idx" ON "client_locations" USING btree ("client_id");

CREATE TABLE IF NOT EXISTS "client_assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "kind" varchar(30) NOT NULL,
  "label" varchar(255),
  "value" varchar(500),
  "access" varchar(20) DEFAULT 'sin_revisar' NOT NULL,
  "access_notes" text,
  "is_primary" boolean DEFAULT false NOT NULL,
  -- Dominio cuyos correos son de este cliente (solo webs y dominios; null = no se usa para reconocer correos).
  "email_domain" varchar(255),
  "notes" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "client_assets_kind_check" CHECK ("kind" IN ('web', 'dominio', 'search_console', 'analytics', 'business_profile', 'google_ads', 'meta', 'instagram', 'tiktok', 'linkedin', 'youtube', 'tienda', 'crm', 'otro')),
  CONSTRAINT "client_assets_access_check" CHECK ("access" IN ('sin_revisar', 'si', 'pendiente', 'no', 'no_aplica'))
);
CREATE INDEX IF NOT EXISTS "client_assets_client_idx" ON "client_assets" USING btree ("client_id");
CREATE UNIQUE INDEX IF NOT EXISTS "client_assets_email_domain_unique" ON "client_assets" USING btree ("tenant_id", "email_domain") WHERE "email_domain" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "client_competitors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "client_id" uuid NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "domain" varchar(255),
  "notes" text,
  "source" varchar(12) DEFAULT 'manual' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "client_competitors_source_check" CHECK ("source" IN ('manual', 'agente'))
);
CREATE INDEX IF NOT EXISTS "client_competitors_client_idx" ON "client_competitors" USING btree ("client_id");

-- 1) Copia de las fichas al núcleo con el MISMO id.
INSERT INTO "clients" ("id", "tenant_id", "name", "aliases", "status", "business", "offerings", "area", "audience", "goals", "strategy", "notes", "created_at", "updated_at")
SELECT "id", "tenant_id", "name", "aliases", CASE WHEN "active" THEN 'activo' ELSE 'baja' END, "business", "offerings", "area", "audience", "goals", "strategy", "notes", "created_at", "updated_at"
FROM "ops_clients"
ON CONFLICT ("id") DO NOTHING;

-- 2) «Webs y herramientas» → activos (tipo deducido de la URL o el nombre; acceso «sin revisar»).
INSERT INTO "client_assets" ("tenant_id", "client_id", "kind", "label", "value", "notes")
SELECT c."tenant_id", c."id",
  CASE
    WHEN (t->>'url') ~* 'search\.google|searchconsole' OR (t->>'name') ~* 'search console' THEN 'search_console'
    WHEN (t->>'url') ~* 'analytics\.google' OR (t->>'name') ~* 'analytics|ga4' THEN 'analytics'
    WHEN (t->>'url') ~* 'business\.google|g\.page|maps\.google' OR (t->>'name') ~* 'business profile|my business|ficha de google' THEN 'business_profile'
    WHEN (t->>'url') ~* 'ads\.google' OR (t->>'name') ~* 'google ads|adwords' THEN 'google_ads'
    WHEN (t->>'url') ~* 'instagram\.com' THEN 'instagram'
    WHEN (t->>'url') ~* 'facebook\.com|meta\.com' THEN 'meta'
    WHEN (t->>'url') ~* 'linkedin\.com' THEN 'linkedin'
    WHEN (t->>'url') ~* 'tiktok\.com' THEN 'tiktok'
    WHEN (t->>'url') ~* 'youtube\.com' THEN 'youtube'
    WHEN (t->>'name') ~* 'gohighlevel|hubspot|crm' THEN 'crm'
    WHEN (t->>'name') ~* '^(web|p[aá]gina|sitio)' OR ((t->>'url') ~* '^https?://' AND (t->>'name') = '') THEN 'web'
    ELSE 'otro'
  END,
  NULLIF(t->>'name', ''), NULLIF(t->>'url', ''), NULLIF(t->>'note', '')
FROM "ops_clients" c, jsonb_array_elements(c."tools") t;

-- 3) Remitentes → contactos (correos) y dominios que reconocen correos.
INSERT INTO "client_contacts" ("tenant_id", "client_id", "name", "job_title", "email", "active", "created_at")
SELECT "tenant_id", "client_id", COALESCE(NULLIF("name", ''), split_part("value", '@', 1)), "role", "value", "active", "created_at"
FROM "ops_client_senders" WHERE "kind" = 'email'
ON CONFLICT DO NOTHING;
INSERT INTO "client_assets" ("tenant_id", "client_id", "kind", "label", "value", "email_domain", "notes", "created_at")
SELECT "tenant_id", "client_id", 'dominio', COALESCE(NULLIF("name", ''), 'Dominio de correo'), "value", CASE WHEN "active" THEN "value" END, "role", "created_at"
FROM "ops_client_senders" WHERE "kind" = 'domain'
ON CONFLICT DO NOTHING;

-- 4) Memoria al núcleo (se renombra: mismos datos), con el origen «agente» admitido.
ALTER TABLE "ops_client_memory" RENAME TO "client_memory";
ALTER TABLE "client_memory" DROP CONSTRAINT IF EXISTS "ops_client_memory_client_id_fkey";
ALTER TABLE "client_memory" ADD CONSTRAINT "client_memory_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE;
ALTER TABLE "client_memory" RENAME CONSTRAINT "ops_client_memory_kind_check" TO "client_memory_kind_check";
ALTER TABLE "client_memory" RENAME CONSTRAINT "ops_client_memory_status_check" TO "client_memory_status_check";
ALTER TABLE "client_memory" DROP CONSTRAINT "ops_client_memory_source_check";
ALTER TABLE "client_memory" ADD CONSTRAINT "client_memory_source_check" CHECK ("source_type" IN ('manual', 'email', 'nota', 'encargo', 'agente'));
ALTER INDEX IF EXISTS "ops_client_memory_client_idx" RENAME TO "client_memory_client_idx";

-- 5) Las tablas de Operaciones apuntan al cliente del núcleo.
ALTER TABLE "ops_client_services" DROP CONSTRAINT IF EXISTS "ops_client_services_client_id_fkey";
ALTER TABLE "ops_client_services" ADD CONSTRAINT "ops_client_services_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE;
ALTER TABLE "ops_client_activity" DROP CONSTRAINT IF EXISTS "ops_client_activity_client_id_fkey";
ALTER TABLE "ops_client_activity" ADD CONSTRAINT "ops_client_activity_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE;
ALTER TABLE "ops_inbound_emails" DROP CONSTRAINT IF EXISTS "ops_inbound_emails_client_id_fkey";
ALTER TABLE "ops_inbound_emails" ADD CONSTRAINT "ops_inbound_emails_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL;
ALTER TABLE "ops_clients" ADD CONSTRAINT "ops_clients_id_clients_fkey" FOREIGN KEY ("id") REFERENCES "clients"("id") ON DELETE CASCADE;

-- 6) ops_clients se queda solo con los ajustes de Operaciones.
DROP TABLE "ops_client_senders";
ALTER TABLE "ops_clients"
  DROP COLUMN "name",
  DROP COLUMN "aliases",
  DROP COLUMN "tools",
  DROP COLUMN "business",
  DROP COLUMN "offerings",
  DROP COLUMN "area",
  DROP COLUMN "audience",
  DROP COLUMN "goals",
  DROP COLUMN "strategy",
  DROP COLUMN "notes",
  DROP COLUMN "active";

-- 7) Proyectos SEO de un cliente.
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "client_id" uuid REFERENCES "clients"("id") ON DELETE SET NULL;

-- 8) «Rellenar con IA» (prompt ops_client_fill v2): propone la ficha completa (empresa, contactos, locales, webs y
--    cuentas, competencia, memoria), redactada de forma profesional sin inventar datos. Lo usan la ficha y el agente.
UPDATE "ai_prompts" SET
  "system_prompt" = $kiju$Eres el account manager de Kijutech, una agencia de marketing digital (SEO, Google Ads, webs WordPress). Recibes un texto escrito o dictado por quien dirige la agencia (y a veces el contenido de la web del cliente) y propones la ficha completa del cliente.

Reglas:
- Redacta los textos de forma profesional, clara y completa, como lo haría un buen account manager: frases bien construidas, con las ideas del texto ordenadas. No te limites a copiar.
- NO inventes datos: ni teléfonos, correos, direcciones, cifras, CIF, cuotas ni servicios contratados que no aparezcan. Lo que deduzcas de la web, dilo («según su web…»). Lo que no se sepa, déjalo vacío ("", [], null o false).
- NUNCA incluyas contraseñas, claves ni accesos: si el texto los menciona, ignóralos. En los activos solo puede ir DÓNDE están los accesos.
- nombre: nombre comercial. alias: otras formas de llamarlo (marca, dominio sin www, abreviaturas, errores de dictado).
- estado: "prospecto", "onboarding", "activo", "pausado" o "baja" solo si el texto lo indica; si es un cliente nuevo que empieza, "onboarding".
- nivel: clave EXACTA de "Niveles" si se indica la importancia; servicios: claves EXACTAS de "Servicios" con el responsable (nombre EXACTO de un miembro) solo si se dice.
- contactos: personas con nombre, cargo, rol ("decisor", "facturacion", "tecnico", "marketing" u "otro"), email, telefono, whatsapp, canal_preferido ("email", "telefono", "whatsapp", "otro" o "") y principal (true en el contacto principal).
- locales: tiendas, oficinas o sedes con su dirección, ciudad, código postal, provincia, país, teléfono y horario. El teléfono general del negocio va en el local principal.
- activos: webs y cuentas con tipo ("web", "dominio", "search_console", "analytics", "business_profile", "google_ads", "meta", "instagram", "tiktok", "linkedin", "youtube", "tienda", "crm" u "otro"), nombre, url, acceso ("si", "pendiente", "no" o "" si no se sabe), donde_accesos, principal y nota. La web principal, con principal true.
- competidores: solo los que se nombren o aparezcan claramente, con nombre, dominio y nota.
- memoria: preferencias, promesas, decisiones, restricciones o contexto que haya que recordar siempre (tipo "preferencia", "promesa", "decision", "restriccion" o "contexto").
- contrato: servicios contratados en texto, cuota_mensual (número) y fechas AAAA-MM-DD solo si se dicen.
- Responde SOLO con JSON válido, sin texto adicional, con esta forma:
{"nombre": "", "alias": [], "estado": "", "sector": "", "descripcion": "", "razon_social": "", "cif": "", "direccion_fiscal": "", "negocio": "", "productos_servicios": "", "zona": "", "publico": "", "propuesta_valor": "", "tono_marca": "", "objetivos": "", "estrategia": "", "notas": "", "nivel": "", "servicios": [{"servicio": "", "responsable": ""}], "horas_mes": 0, "contactos": [{"nombre": "", "cargo": "", "rol": "", "email": "", "telefono": "", "whatsapp": "", "canal_preferido": "", "principal": false}], "locales": [{"nombre": "", "direccion": "", "ciudad": "", "codigo_postal": "", "provincia": "", "pais": "", "telefono": "", "horario": "", "principal": false}], "activos": [{"tipo": "", "nombre": "", "url": "", "acceso": "", "donde_accesos": "", "principal": false, "nota": ""}], "competidores": [{"nombre": "", "dominio": "", "nota": ""}], "memoria": [{"tipo": "", "texto": ""}], "contrato_servicios": "", "cuota_mensual": null, "contrato_inicio": "", "contrato_renovacion": ""}$kiju$,
  "description" = 'Recibe un texto (o la transcripción de un audio) sobre un cliente y propone su ficha completa: empresa, negocio, contactos, locales, webs y cuentas, competencia, memoria y contrato. Placeholders: {cliente_actual}, {niveles}, {servicios}, {miembros}, {texto}.',
  "version" = "version" + 1,
  "updated_at" = now()
WHERE "key" = 'ops_client_fill';

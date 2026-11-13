# La ficha del cliente pasa al núcleo
**Fecha:** 2026-11-14  
**Rama:** feature/ficha-cliente-nucleo (sale de `feature/agente-fichas`, que no se desplegó)  
**Commit:** ba9b58c2

Enric pidió, antes de desplegar las fichas por Telegram, reestructurar la ficha para que tenga toda la información del cliente (personal, negocio, integraciones…). Diseño en `docs/DISENO-FICHA-CLIENTE.md`, aprobado: núcleo, contrato solo para administradores y sección propia en el menú.

## Qué se construyó
**Núcleo**
- `lib/db/migrations/0048_clientes_nucleo.sql` y `lib/db/schema.ts`:
  - el cliente del núcleo `clients` con 4 tablas hijas (contactos, locales, webs y cuentas, competencia);
  - `client_memory` (antes `ops_client_memory`) y `projects.client_id`;
  - `ops_clients` se queda solo con los ajustes de Operaciones;
  - el prompt `ops_client_fill` pasa a la v2.
- `lib/core/clients.ts`: lectura y escritura del cliente y de sus tablas, completitud de la lista, reglas para reconocer correos (`emailMatchRules`), memoria, cuenta principal de cada tipo (`primaryAsset`) y la ficha en texto para la IA (`sheetText`, la cuota solo si se pide).
- `lib/core/client-rules.ts`: estados, roles, canales, tipos de cuenta, accesos, `domainOf`, `normalizeUrl`, `recognizableDomain` y `completeness()`. Antes era `lib/operaciones/client-memory-rules.ts`, que ahora solo la reexporta.
- `lib/core/client-actions.ts`: acciones con permisos. «edit» para la ficha, los contactos, los locales, las webs y la competencia; «admin» para el contrato, borrar un cliente y borrar un contacto.
- `lib/core/client-memory-actions.ts`: memoria. Se movió desde Operaciones y ya no gestiona remitentes.
- `lib/core/capabilities.ts`: `registerClientDeleteGuard` y `clientDeleteBlockers`. Un módulo puede impedir que se borre un cliente.
- `lib/core/clients-process-map.ts`: mapa «Clientes», con su nodo en el nivel 1 del Mapa Visual.

**Operaciones**
- `lib/operaciones/clients.ts`: `listClients` une el núcleo con los ajustes y mantiene la misma forma que antes. «Activo» significa onboarding o activo.
- `lib/operaciones/client-ops.ts`: ajustes de Operaciones y servicios (`upsertOpsSettings`, `replaceServices`, `changeServices`).
- `lib/operaciones/client-write.ts` (reescrito): el plan validado de una propuesta de la IA (`planClientChange`, `planLines`, `planHtml`, `applyClientPlan`, `loadTarget`, `opsSheetText`).
- `lib/operaciones/client-actions.ts`:
  - `saveClientOps` y la importación de opciones de ClickUp, que crea el cliente en el núcleo;
  - niveles y servicios;
  - `aiProposeClient` y `applyClientProposal` (vista previa, y el servidor vuelve a validar al aplicar);
  - el trabajo del mes.
- `lib/operaciones/agent-capabilities.ts`: `ficha_cliente`, `crear_cliente`, `actualizar_cliente` y `anotar_memoria_cliente` sobre el modelo nuevo. Además, el aviso de «no se borra un cliente con encargos».
- Lectores adaptados:
  - `email-agent.ts` (contexto con el tono de la marca);
  - `inbound-email.ts` (reconoce con contactos y dominios);
  - `inbound-email-actions.ts` (asignar guarda al remitente como contacto);
  - `owner-queue.ts`, `client-proposal-actions.ts` y `correos/page.tsx`.

**Pantalla**
- `app/(dashboard)/dashboard/clientes/`: la lista con completitud, «Nuevo cliente» y «Nuevo con IA».
- `[id]/`: la ficha con 7 pestañas (`ficha-view.tsx`, `tab-empresa.tsx`, `tab-contactos.tsx`, `tab-webs.tsx`, `tab-competencia.tsx`).
- Piezas comunes: `ai-fill.tsx`, `ops-parts.tsx`, `ui.tsx` y `client-memoria.tsx`, que ahora solo lleva la memoria.
- `app/(dashboard)/dashboard/operaciones/clientes/page.tsx`: redirige a la sección nueva.
- `components/app-shell/nav.ts`: «Clientes» en el grupo Trabajo. Se quita la pestaña de Operaciones.

**Pruebas, mapa y documentos**
- Pruebas:
  - `tests/agentes.test.ts`: crear con cada dato en su sitio, editar sumando y quitando, cuota solo para el dueño, memoria, completitud;
  - `tests/seguridad.test.ts`: guards de todas las acciones nuevas, contrato solo admin, correo único, dominio público, sin contraseñas, aislamiento entre cuentas.
- `scripts/check-architecture-map.js`: también exige que cada tabla del cliente del núcleo esté en el mapa «Clientes».
- `lib/operaciones/process-map.ts` y `lib/architecture-map/registry.ts`: actualizados.
- Documentos: `docs/ESTADO.md` (§6.22 nueva, tablas, migraciones, cronología, mapa de archivos), `docs/GUIA-AGENTES.md`, `docs/PENDIENTES-ENRIC.md` y `docs/DISENO-FICHA-CLIENTE.md`.

## Migraciones aplicadas
`0048_clientes_nucleo.sql`. Se aplicó en local, con una copia de seguridad previa en `backups/backup_pre_clientes_nucleo_20261114.sql`. Comprobado con un volcado: 52 clientes en `clients` y 52 en `ops_clients`, 3 webs y herramientas convertidas en activos, y la tabla `ops_client_senders` eliminada. En producción se aplica con `bash scripts/deploy.sh --migrate`, que hace la copia antes.

```sql
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
```

## Decisiones técnicas tomadas en auto mode
- **Mismo id para el cliente del núcleo y para `ops_clients`.** Así ninguna referencia existente se reescribe: encargos por opción, actividad, correos y servicios. Las tablas de Operaciones que apuntaban a `ops_clients` apuntan ahora a `clients`, de modo que un cliente creado en el núcleo sin ajustes funciona en Operaciones con los valores por defecto (unión izquierda). El núcleo nunca crea filas de Operaciones.
- **Remitentes integrados en la ficha, sin tabla aparte:**
  - los correos van a los contactos;
  - los dominios van a webs o dominios con «reconoce correos», con `email_domain` único por cuenta.
  
  Se evita tener el mismo correo en dos sitios. `matchSender` no cambia: recibe las reglas desde `emailMatchRules`. Asignar un correo a un cliente guarda al remitente como contacto.
- **Memoria renombrada, no copiada** (`ALTER TABLE … RENAME`): mismos datos e ids. Se admite el origen «agente».
- **«Activo» para Operaciones = onboarding o activo.** Los prospectos, pausados y bajas no generan alertas ni cuentan como trabajando. Al migrar, una ficha desactivada pasa a «baja».
- **Contrato solo para administradores en tres capas:**
  - la ficha no lo manda al navegador de un editor;
  - la acción del perfil no lo acepta;
  - hay una acción aparte con permiso de administrador.
  
  Para el agente, la cuota solo aparece si quien habla es el dueño.
- **«Rellenar con IA» comparte el plan con el agente** (`client-write.ts`): la misma validación y la misma vista previa. En la web, «Aplicar» vuelve a planificar en el servidor con lo que propuso la IA; lo que llega del navegador no se da por bueno.
- **Al aplicar un plan, cada parte se guarda por separado.** Si falla algo concreto (por ejemplo, un correo que ya es de otro cliente), se informa sin deshacer el resto.
- **Borrar un cliente pregunta antes a los módulos** a través del registro del núcleo. Operaciones lo impide si el cliente tiene encargos, y el mensaje propone darle de baja.
- **Completitud con pesos.** Lo esencial pesa 3: negocio, objetivos, contacto y web. Se enseña como progreso (verde desde el 80 %), no como reproche, siguiendo la regla de diseñar con psicología.
- **La comprobación del mapa se amplió** con un criterio nuevo para las tablas `clients` y `client_*`, como pide la regla del Mapa Visual.
- **No arranqué la app en local** porque comparte el bot con producción. En su lugar: compilación completa (`next build`) en un contenedor temporal, sin errores y con las rutas nuevas; comprobación de tipos limpia; y la suite completa contra la base local migrada.

## Qué verificar manualmente
- Tras `bash scripts/deploy.sh --migrate`, en brain.kijutech.com:
  - **Clientes** aparece en el menú y la lista enseña las 52 fichas con su estado y su porcentaje;
  - `/dashboard/operaciones/clientes` redirige a la sección nueva.
- Abrir una ficha y pasar por las 7 pestañas:
  - guardar algo en Empresa y negocio;
  - añadir un contacto con correo, un local, la web con «reconoce correos» y un competidor;
  - en Operaciones, cambiar el nivel y guardar.
- El contrato aparece con la cuenta de administrador y no con la de un editor.
- «Rellenar con IA» en una ficha: grabar un audio, «Proponer», revisar la vista previa y «Aplicar».
- «Nuevo con IA» en la lista crea la ficha y la abre.
- Por Telegram: «Nos ha entrado un cliente nuevo…» con web, contacto, dirección y competidor, aprobar con ✅ y comprobar que cada dato está en su pestaña. Borrar la ficha de prueba al terminar.
- Correos:
  - un correo de un contacto se reconoce;
  - asignar un correo «sin cliente» con «guardar remitente» lo añade como contacto.
- Mapa del sistema: el nodo «Clientes» abre su mapa de 7 pasos.

## Pendientes detectados
- **Cuentas de Google por cliente (siguiente paso):**
  - elegir en «Webs y cuentas» la propiedad de Search Console, Analytics o Business Profile de la lista conectada;
  - que las herramientas del agente usen sola la cuenta principal de cada cliente (`primaryAsset` ya existe).
- **Onboarding con subagentes:** auditor técnico, competencia y contenido, con el informe guardado en la ficha. Cuando Enric aprueba una ficha nueva, el agente aún no se entera en la conversación.
- **Las 52 fichas migradas tienen la información antigua en texto.** Las webs están como activos «sin revisar» y los teléfonos o contactos que estuvieran en las notas siguen ahí. Conviene completarlas con «Rellenar con IA».
- **`ops_clients` conserva el nivel por defecto 'standard' en el código** (`DEFAULT_LEVEL`). Si algún día se borra ese nivel, los clientes sin ajustes quedarían con un nivel inexistente.
- **El agente de correo usa negocio, estrategia, tono y memoria**, pero todavía no los contactos ni el canal preferido.
- **Comprobaciones:** el mapa pasa (20 automatizaciones, 17 tareas, 7 prompts, 38 tablas `ops_*`, 105 pasos en 16 mapas, más el mapa «Clientes»). Pruebas: 264 correctas; las 9 de `http` y `auditoria` fallan por diseño en el contenedor temporal.

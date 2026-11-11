# Entrada de correos de clientes, paso B1 (recibir y reconocer, vía Cloudflare)
**Fecha:** 2026-11-07  
**Rama:** feature/memoria-cliente-email  
**Commit:** pendiente de commit (anterior: 705af2f5)

## Qué se construyó
- Investigación previa de la vía de entrada (IMAP con contraseña de aplicación, Gmail API con Pub/Sub, Postmark, SES, Cloudflare). Decisión: **Cloudflare Email Routing + Email Worker** sobre el subdominio `in.kijutech.com`; no se guarda ninguna contraseña de buzón. Se actualizó `docs/DISENO-ENTRADA-EMAIL.md` con el cambio de rumbo.
- `lib/db/schema.ts` y `lib/db/migrations/0039_ops_inbound_emails.sql` (+ `_journal.json`): tabla `ops_inbound_emails`.
- `lib/operaciones/inbound-email-rules.ts` (puro): limpieza de texto y HTML, direcciones, `Message-ID`, detección de correos automáticos, firma HMAC con caducidad y validación del aviso (zod).
- `lib/operaciones/inbound-email.ts` (`server-only`): guardar sin duplicar, tope por hora, ignorar automáticos y reconocer al cliente con `matchSender`.
- `app/api/email/entrada/route.ts`: ruta firmada para el Worker (404 sin UUID, 403 sin firma, 413 demasiado grande, 429 por tope).
- `lib/operaciones/inbound-email-actions.ts` (`'use server'`): listar, ver, pegar un correo, asignar cliente (con opción de recordar al remitente), ignorar, reabrir y eliminar (admin).
- `app/(dashboard)/dashboard/operaciones/correos/` (`page.tsx`, `correos-view.tsx`) y pestaña «Correos» en `operaciones-tabs.tsx`.
- `tests/correos.test.ts` (nuevo, reglas) y `tests/seguridad.test.ts` (acciones en las listas de permisos y bloque «correos de clientes»).
- Mapa Visual: nuevo paso `ops-int-email` (en curso) en `process-map.ts` y texto del paso de memoria actualizado. `node scripts/check-architecture-map.js` pasó (36 tablas, 79 pasos en 13 mapas).
- `docs/ESTADO.md` actualizado (§2, §6.15, §10, §15, §16, §17, §18, §19).

## Migraciones aplicadas
`0039_ops_inbound_emails.sql`, aplicada **solo en la base local** (en producción se aplicará al desplegar la rama, con `pg_dump` previo). Backup previo: `backups/backup_pre_correos_20261107.sql` (no versionado).

```sql
CREATE TABLE IF NOT EXISTS "ops_inbound_emails" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "message_id" varchar(500) NOT NULL,
  "source" varchar(12) DEFAULT 'cloudflare' NOT NULL,
  "from_address" varchar(320) NOT NULL,
  "from_name" varchar(255),
  "to_address" varchar(320),
  "subject" varchar(500) DEFAULT '' NOT NULL,
  "body_text" text DEFAULT '' NOT NULL,
  "attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "in_reply_to" varchar(500),
  "sent_at" timestamp,
  "auth_status" varchar(8) DEFAULT 'none' NOT NULL,
  "client_id" uuid REFERENCES "ops_clients"("id") ON DELETE SET NULL,
  "matched_by" varchar(10) DEFAULT 'ninguno' NOT NULL,
  "status" varchar(14) DEFAULT 'nuevo' NOT NULL,
  "status_note" varchar(255),
  "proposal" jsonb,
  "decided_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "decided_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ops_inbound_emails_message_unique" UNIQUE("tenant_id", "message_id"),
  CONSTRAINT "ops_inbound_emails_source_check" CHECK ("source" IN ('cloudflare', 'pegado')),
  CONSTRAINT "ops_inbound_emails_auth_check" CHECK ("auth_status" IN ('pass', 'fail', 'none')),
  CONSTRAINT "ops_inbound_emails_match_check" CHECK ("matched_by" IN ('email', 'domain', 'manual', 'ninguno', 'ambiguo')),
  CONSTRAINT "ops_inbound_emails_status_check" CHECK ("status" IN ('nuevo', 'ignorado', 'sin_cliente', 'informativo', 'interpretando', 'propuesto', 'aprobado', 'descartado', 'error'))
);
CREATE INDEX IF NOT EXISTS "ops_inbound_emails_status_idx" ON "ops_inbound_emails" USING btree ("tenant_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "ops_inbound_emails_client_idx" ON "ops_inbound_emails" USING btree ("client_id");
```

## Decisiones técnicas tomadas en auto mode
- **Sin variable de entorno nueva ni cambio en `docker-compose.yml`:** el secreto de la firma se deriva de `AUTH_SECRET` y de la cuenta (igual que el del webhook de Telegram), así no hubo que tocar el compose (que pide aprobación).
- **Migración 0039 más pequeña que la aprobada:** solo `ops_inbound_emails`. Sin `ops_mailbox_config` (ya no hay buzón) y sin ampliar el `CHECK` de `ops_notifications.kind`: ese cambio pasa al B2, donde se usan los avisos `email_proposal`.
- **Sin aviso a Telegram de «remitente desconocido» en B1:** se ve en la pestaña Correos; el aviso viaja con B2 junto al resto de notificaciones de correo.
- **La confirmación de reenvío de Gmail** (`forwarding-noreply@google.com`) se marca «ignorado» pero su texto queda visible, porque lleva el código que Enric tiene que copiar.
- **Columnas `proposal`, `decided_by` y `decided_at`** ya en 0039 para no tener que migrar otra vez en B2.
- **Verificación en navegador con copia desechable** (`kijutech_verify`, sin `ops_telegram_config`, ClickUp, outbox ni avisos), eliminada al terminar; la base local real no se tocó.
- El HTML se convierte con una función propia en vez de una librería (sin dependencia nueva): se quitan `script`, `style` y etiquetas y se decodifican las entidades básicas.

## Qué verificar manualmente
- En la app: Operaciones → **Correos**. «Pegar un correo» con un remitente que sea contacto de un cliente (debe salir «Reconocido») y con otro desconocido («Sin cliente»); asignarlo a una ficha con «Recordar como contacto» y comprobar que aparece en Clientes → Contactos y memoria.
- Con un usuario editor no debe aparecer «Eliminar»; con admin sí, y pide confirmación.
- Antes de desplegar: `pg_dump` en el servidor y `pnpm db:migrate` allí.
- Cuando exista el Worker: reenviar un correo desde `paidmedia@waterlemonstudio.com` y ver que llega a la pestaña Correos, asignado al cliente DEMO.

## Pendientes detectados
- **Cloudflare:** el token del `.env` solo lee DNS; para crear el subdominio, activar Email Routing y desplegar el Worker hay que ampliarle los permisos (Zona → Email Routing Rules: Editar, Cuenta → Workers Scripts: Editar, Zona → DNS: Editar). Comprobar en la documentación de Cloudflare que Email Routing se puede activar solo en un subdominio.
- Subir el Worker (código en un archivo versionado) y un secreto de Worker con el valor de `inboundSecret(<cuenta>)` sin mostrarlo.
- Cambiar el filtro de Gmail de paidmedia para que reenvíe a `operaciones@in.kijutech.com`; confirmar la dirección con el código que llegará a la pestaña Correos.
- Crear el cliente DEMO en producción (contacto `paidmedia@waterlemonstudio.com`, lista «Pruebas Kiju»).
- B2: clasificador pequeño, conversión con el refactor de `note-actions.ts` (aprobación pendiente), aviso y botones de Telegram, ampliar `ops_notifications_kind_check`, tope de IA por hora.
- Desplegar 0038 y 0039 en producción y decidir el push de la rama.
- Correo privado de Enric en el Gmail de herramientas (por el reenvío global de ayer): borrarlo; la cuenta ya no se usará.
- `/api/telegram/webhook` debería devolver 404 con un `t` que no sea UUID (hoy da 500).

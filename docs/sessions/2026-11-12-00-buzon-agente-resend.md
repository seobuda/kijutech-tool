# Buzón del agente con Resend (paso 3)
**Fecha:** 2026-11-12  
**Rama:** feature/correo-agente → main  
**Commit:** 66c25c6c

## Qué se construyó
- **DNS de `equipo.kijutech.com`** en Cloudflare (MX de recepción, DKIM, MX+SPF de rebotes y CNAME). Los añadió Claude con el token del `.env`, después de que Enric los aprobara; el MX raíz (Google) quedó sin tocar. Dominio verificado en Resend.
- `lib/db/migrations/0041_ops_email_agente.sql` y `lib/db/schema.ts`.
- `lib/operaciones/resend.ts`: conexión (clave y secreto cifrados), firma Svix, lectura por API, autenticación del remitente y envío en el mismo hilo.
- `app/api/email/resend/route.ts`: webhook firmado.
- `lib/operaciones/email-agent.ts`: interpretación desde el planificador, propuesta en el motor de acciones, aviso a Telegram, aprobar/corregir/descartar.
- `lib/operaciones/email-agent-actions.ts`: acciones web (conectar: admin; decidir: dueño de Mi bandeja).
- `lib/operaciones/inbound-email.ts`: remitente no autenticado y correos del equipo.
- `lib/operaciones/telegram-handler.ts`: botón «Corregir» (`ag:<id>:ed`) y conversación `agent_correct`.
- `lib/operaciones/agent-actions.ts`: tipo `email_reply` (autonomía máxima «con aprobación»).
- `correos/correos-view.tsx`: tarjeta «Buzón del agente», resumen del agente y respuesta propuesta.
- `lib/operaciones/process-map.ts` y `map-live.ts`: nodo del buzón con prompt y tarea.
- `tests/correo-agente.test.ts` y `tests/seguridad.test.ts`.

## Migraciones aplicadas
`0041_ops_email_agente.sql` (backup local `backups/backup_pre_correo_agente_20261111.sql`; en producción, backup previo en el servidor):

```sql
ALTER TABLE "ops_inbound_emails" DROP CONSTRAINT IF EXISTS "ops_inbound_emails_source_check";
ALTER TABLE "ops_inbound_emails" ADD CONSTRAINT "ops_inbound_emails_source_check" CHECK ("source" IN ('cloudflare', 'pegado', 'resend'));
ALTER TABLE "ops_inbound_emails" ADD COLUMN IF NOT EXISTS "provider_email_id" varchar(100);
ALTER TABLE "ops_inbound_emails" ADD COLUMN IF NOT EXISTS "references_header" text;
ALTER TABLE "ops_agent_actions" DROP CONSTRAINT IF EXISTS "ops_agent_actions_kind_check";
ALTER TABLE "ops_agent_actions" ADD CONSTRAINT "ops_agent_actions_kind_check" CHECK ("kind" IN ('blocker_answer', 'note_conversion', 'email_reply'));
ALTER TABLE "ops_agent_actions" ADD COLUMN IF NOT EXISTS "inbound_email_id" uuid REFERENCES "ops_inbound_emails"("id") ON DELETE SET NULL;
ALTER TABLE "ops_notifications" DROP CONSTRAINT IF EXISTS "ops_notifications_kind_check";
ALTER TABLE "ops_notifications" ADD CONSTRAINT "ops_notifications_kind_check" CHECK ("kind" IN ('new_request','daily_summary','test','review_request','block_alert','reply','returned','digest','reminder','cleanup','cleanup_summary','startup','email_proposal'));
ALTER TABLE "ops_telegram_pending" ADD COLUMN IF NOT EXISTS "agent_action_id" uuid REFERENCES "ops_agent_actions"("id") ON DELETE CASCADE;
INSERT INTO "ai_prompts" (...) VALUES ('ops_email_reply', ...) ON CONFLICT ("key") DO NOTHING;  -- texto completo en el archivo
```

## Decisiones técnicas tomadas en auto mode
- **Subdominio con Resend en vez de una licencia de Workspace** (la decidió Enric tras comparar alternativas): reputación de envío aislada de `kijutech.com`, sin tocar Google y gratis para empezar.
- **Clave y secreto en la base de datos, cifrados, y no en `docker-compose`**: mismo patrón que ClickUp y Telegram, y no hace falta cambiar `docker-compose.yml` (que requiere aprobación). El webhook se crea solo al conectar desde el servidor.
- **La IA interpreta desde el planificador, no dentro del webhook**: el webhook responde enseguida y un reinicio no pierde correos (reclamo atómico y reintento).
- **Una sola llamada de IA (resumen + respuesta)** con el modelo configurado (Sonnet). Clasificar por separado con un modelo pequeño ahorraría poco con el volumen actual (≤ 100 correos/día por el plan gratuito); queda anotado para cuando la pasarela permita elegir modelo por tarea.
- **Remitente que no pasa la autenticación**: no se reconoce ni se interpreta (cierra el riesgo de remitentes falsificados que señaló la revisión).
- **Copia oculta al primer super_admin** de la cuenta en cada respuesta enviada.

## Qué verificar manualmente
1. En producción, **Operaciones → Correos → Buzón del agente**: pegar la clave de Resend (`re_…`) y pulsar «Conectar» → debe quedar «Activo» (crea el webhook).
2. Enviar un correo de prueba desde tu Gmail a `agente@equipo.kijutech.com`, con tu dirección dada de alta como contacto de un cliente (o desde una dirección `@kijutech.com`). En ~30 s llega a Telegram con la respuesta propuesta.
3. Probar «✏️ Corregir» (escribes la respuesta) y «✅ Enviar respuesta»: la respuesta llega en el mismo hilo y recibes copia oculta.
4. Pestaña **Agente**: aparece «Responder correos» con la acción registrada.

## Pendientes detectados
- Los adjuntos no se descargan (solo se listan los nombres).
- No se crean encargos desde un correo: el «encargo sugerido» se muestra, pero crearlo sigue siendo a mano (siguiente mejora sobre el motor de acciones).
- Límite de 100 correos/día del plan gratuito: vigilar si el agente coge volumen.

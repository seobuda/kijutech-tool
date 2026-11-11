# Motor de acciones del agente (paso 2)
**Fecha:** 2026-11-11  
**Rama:** feature/motor-acciones → main  
**Commit:** e9bcb169

## Qué se construyó
- `lib/db/schema.ts`, `lib/db/migrations/0040_ops_agent_actions.sql` y `meta/_journal.json`: tabla `ops_agent_actions`.
- `lib/operaciones/agent-actions.ts` (`server-only`): tipos y autonomía por tipo (`getAutonomy`/`setAutonomy` en `ops_settings`), `recordAction` (clave única), `decideAction` (atómica, una sola vez), `getAgentStats`, `recommend`, `listRecentActions` y `compareNoteProposal`.
- `lib/operaciones/blockers.ts`: el triaje respeta la autonomía; si no puede responder solo y la IA tiene respuesta, crea una propuesta con botones (`ag:<id>:ok|no`); nuevas `approveBlockerProposal` y `rejectBlockerProposal`; `ownerAnswerBlocker` anota si se aprobó tal cual o se corrigió.
- `lib/operaciones/telegram-handler.ts`: botones del motor (`AGENT_CALLBACK_RE`), solo para el dueño.
- `lib/operaciones/inbox.ts`, `flow-actions.ts` (`inboxApproveProposal`, `inboxRejectProposal`) y `bandeja/*`: la propuesta se ve en Mi bandeja con «Enviar la propuesta / Escribir otra / Descartar propuesta».
- `lib/operaciones/note-actions.ts`: al enviar los encargos de una nota se registra si se envió lo propuesto.
- `lib/operaciones/agent-panel-actions.ts` y `operaciones/agente/*`: pestaña «Agente» (solo administración).
- `components/app-shell/nav.ts`: pestaña «Agente» en Operaciones y en la paleta Ctrl+K.
- `lib/operaciones/process-map.ts`: nodo «Motor de acciones del agente» y tabla en el paso de bloqueos.
- `tests/agente.test.ts` y `tests/seguridad.test.ts`: lógica, base de datos y permisos.
- `docs/DISENO-MOTOR-ACCIONES.md` y `docs/ESTADO.md` §6.16.

## Migraciones aplicadas
`0040_ops_agent_actions.sql` (local: backup `backups/backup_pre_motor_acciones_20261111.sql`; producción: backup en el servidor antes de migrar):

```sql
CREATE TABLE IF NOT EXISTS "ops_agent_actions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "kind" varchar(30) NOT NULL,
  "status" varchar(12) DEFAULT 'propuesto' NOT NULL,
  "autonomy" varchar(10) NOT NULL,
  "summary" varchar(500) DEFAULT '' NOT NULL,
  "proposal" jsonb NOT NULL,
  "final" jsonb,
  "request_id" uuid REFERENCES "ops_requests"("id") ON DELETE SET NULL,
  "blocker_id" uuid REFERENCES "ops_blockers"("id") ON DELETE SET NULL,
  "note_id" uuid REFERENCES "ops_notes"("id") ON DELETE SET NULL,
  "decided_by_name" varchar(255),
  "decided_via" varchar(10),
  "decided_at" timestamp,
  "executed_at" timestamp,
  "error" varchar(500),
  "dedupe_key" varchar(200) NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "ops_agent_actions_dedupe_unique" UNIQUE("tenant_id", "dedupe_key"),
  CONSTRAINT "ops_agent_actions_kind_check" CHECK ("kind" IN ('blocker_answer', 'note_conversion')),
  CONSTRAINT "ops_agent_actions_status_check" CHECK ("status" IN ('propuesto', 'aprobado', 'corregido', 'rechazado', 'auto', 'sombra')),
  CONSTRAINT "ops_agent_actions_autonomy_check" CHECK ("autonomy" IN ('sombra', 'aprobacion', 'autonomo')),
  CONSTRAINT "ops_agent_actions_via_check" CHECK ("decided_via" IS NULL OR "decided_via" IN ('telegram', 'panel', 'agente'))
);
CREATE INDEX IF NOT EXISTS "ops_agent_actions_kind_idx" ON "ops_agent_actions" USING btree ("tenant_id", "kind", "created_at");
```

## Decisiones técnicas tomadas en auto mode
- **Una tabla común en vez de columnas en cada tabla:** evaluadas tres alternativas (ver el documento de diseño). Así el correo, la estrategia y el agente de alta serán tipos nuevos sobre el mismo motor.
- **La autonomía se guarda en `ops_settings`**, sin tabla nueva.
- **Sin tipo de aviso nuevo:** la propuesta viaja en el aviso urgente de bloqueo que ya existe (`block_alert`), con botones nuevos. No hizo falta tocar el CHECK de `ops_notifications`.
- **Por defecto no cambia nada para el equipo:** bloqueos en «autónomo», como hasta ahora; lo único nuevo es que, cuando la IA tiene respuesta pero no puede enviarla sola, Enric la envía con un botón en vez de escribirla.
- **Fallo encontrado por las pruebas:** `decideAction` dejaba volver a decidir una propuesta ya decidida. Corregido: solo decide si sigue abierta y sin fecha de decisión, y es atómico.
- La pestaña «Agente» es de administración (como Piloto): enseña decisiones del dueño y permite cambiar cuánto actúa el agente solo.

## Qué verificar manualmente
- Pestaña Operaciones → **Agente**: cifras (al principio en cero), autonomía por tipo y lista vacía con su mensaje.
- Convertir una nota y enviar los encargos sin tocar nada: aparece una acción «Aprobada a la primera». Repetir cambiando un responsable: «Corregida».
- Con «Responder bloqueos» en «Con tu aprobación», un bloqueo urgente cuya respuesta esté en la tarea: llega a Telegram con «✅ Enviar la propuesta»; al pulsarlo, la persona recibe la respuesta y la acción queda «Aprobada a la primera».
- Mi bandeja: un bloqueo con propuesta muestra la tarjeta «Propuesta del agente» y sus tres botones.

## Pendientes detectados
- Los resúmenes de bandeja (13:00 y 18:00) aún no enseñan la propuesta ni el botón de aprobar; solo el aviso urgente y Mi bandeja.
- El correo (paso 3) será el siguiente tipo de acción: necesita que Enric cree el usuario de Workspace y la cuenta de servicio.
- La comprobación del mapa pasa (37 tablas, 80 pasos); `pnpm test` 135 OK.

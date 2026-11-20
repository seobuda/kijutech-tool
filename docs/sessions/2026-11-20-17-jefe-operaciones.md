# Jefe de operaciones: el equipo pregunta sus dudas por su chat
**Fecha:** 2026-11-20  
**Rama:** feature/jefe-operaciones-fase2  
**Commit:** 4784a51e

## Qué se construyó
Fase 2 de `docs/DISENO-JEFE-OPERACIONES.md`. Propuse un proceso fijo en código. Enric pidió en cambio un **agente libre que razone como un supervisor humano**, que escale tras varias dudas del mismo tema sin resolverlas y que los jefes usen **Opus 5.5** («el jefe no puede tener el mismo nivel que los de abajo»). Se acordó un agente libre con garantías en código y Enric aprobó el esquema.

**Esquema:** `lib/db/schema.ts` + `lib/db/migrations/0057_preguntas_equipo.sql`, con la tabla `agt_team_questions`.

**Núcleo:**
- `lib/core/capabilities.ts`: `InboundMessage.replyToRequestId` y `replyToSummary`.
- `lib/core/knowledge.ts`:
  - funciones `recordFeedback`, `publishedIds` y `embedQuery`;
  - `buscar_conocimiento` devuelve los ids de las entradas.

**Operaciones (el canal):**
- `lib/operaciones/telegram.ts`: `reply_to_message`.
- `lib/operaciones/telegram-handler.ts`: `repliedRequest` busca el encargo del aviso respondido en `ops_notifications`, sin pedir nada a ClickUp, y lo pasa al núcleo.

**Agentes:**
- `lib/agentes/store.ts`:
  - agente **Jefe de operaciones** (`jefe_operaciones`, jefe del departamento Operaciones, Opus 5.5, 30 $/mes, apagado de serie, solo lectura);
  - `HEAD_MODEL`: el principal y el jefe de sistema pasan a Opus, mediante la mejora `2026-11-20-jefe-operaciones`, que solo cambia el modelo si nadie lo había tocado;
  - las mejoras admiten código propio (`run`).
- `lib/agentes/team.ts` (nuevo):
  - la conversación con el equipo (texto y audio, seguimiento de la misma duda, «gracias» cierra);
  - herramientas `mis_tareas`, `casos_anteriores`, `responder_al_equipo` y `escalar_a_enric`;
  - las garantías: fuente comprobada, IA general con aprobación, red de seguridad, sin bucles;
  - botones `x:tq:` para la persona y para Enric, y los textos que piden («qué probaste», «qué cambio», «tu respuesta»);
  - ejemplos de las correcciones de Enric en dudas parecidas;
  - propuesta para la base de conocimiento de cada respuesta suya o aprobada;
  - funciones para la pantalla y sección del informe semanal.
- `lib/agentes/team-actions.ts`: 4 acciones, solo admin.
- `lib/agentes/inbound.ts`: los mensajes del equipo van al jefe.
- `lib/agentes/register.ts`: registra lo anterior.

**Pantallas:** pestaña **Agentes → Dudas del equipo** (`app/(dashboard)/dashboard/agentes/equipo/`), con interruptor, ajustes, lista de dudas y acciones.

**Mapa Visual:**
- `lib/agentes/process-map.ts`: pasos `agt-equipo` y `agt-equipo-enric`.
- `lib/core/knowledge-process-map.ts`: la fase 2 pasa a construida y se añade la fase 3 en gris.
- La comprobación pasa.

**Pruebas:**
- `tests/equipo.test.ts` (11, nuevo).
- `tests/seguridad.test.ts`: 4 acciones nuevas.
- `tests/agentes.test.ts`: la lista de agentes incluye al nuevo jefe.
- Pasan 453 de 453.

**Documentación:**
- `docs/ESTADO.md`: §6.30, cabecera, tablas (113), pendientes, hoja de ruta, cronología y archivos.
- `docs/PENDIENTES-ENRIC.md`.
- `docs/DISENO-JEFE-OPERACIONES.md`: §9, con el cambio aprobado.

## Migraciones aplicadas
`0057_preguntas_equipo.sql`, aplicada en local tras `backups/backup_pre_preguntas_equipo_20261120.sql`. En producción se aplica con `deploy.sh --migrate`, con el OK de Enric.

```sql
CREATE TABLE IF NOT EXISTS "agt_team_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"asked_by_clickup_id" varchar(50),
	"asked_by_name" varchar(255) NOT NULL,
	"chat_id" varchar(40) NOT NULL,
	"request_id" uuid,
	"client_id" uuid,
	"question" text NOT NULL,
	"followups" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(22) DEFAULT 'respondida' NOT NULL,
	"tier" varchar(10),
	"topic_key" varchar(60),
	"sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_first_answer" text,
	"ai_answer" text,
	"revisions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"final_answer" text,
	"answered_by" varchar(8),
	"feedback" varchar(10),
	"feedback_note" text,
	"escalation_reason" varchar(16),
	"escalated_at" timestamp,
	"awaiting_chat_id" varchar(40),
	"awaiting_kind" varchar(12),
	"kb_article_id" uuid,
	"embedding" vector(1536),
	"embedding_model" varchar(80),
	"cost_usd" numeric(10, 6),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"answered_at" timestamp,
	"closed_at" timestamp,
	CONSTRAINT "agt_team_questions_status_check" CHECK ("agt_team_questions"."status" IN ('respondida', 'pendiente_aprobacion', 'escalada', 'resuelta', 'cerrada', 'descartada')),
	CONSTRAINT "agt_team_questions_tier_check" CHECK ("agt_team_questions"."tier" IS NULL OR "agt_team_questions"."tier" IN ('ficha', 'base', 'casos', 'general', 'enric'))
);
ALTER TABLE "agt_team_questions" ADD CONSTRAINT "agt_team_questions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "agt_team_questions" ADD CONSTRAINT "agt_team_questions_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "agt_team_questions" ADD CONSTRAINT "agt_team_questions_kb_article_id_kb_articles_id_fk" FOREIGN KEY ("kb_article_id") REFERENCES "public"."kb_articles"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX IF NOT EXISTS "agt_team_questions_status_idx" ON "agt_team_questions" USING btree ("tenant_id","status","created_at");
CREATE INDEX IF NOT EXISTS "agt_team_questions_person_idx" ON "agt_team_questions" USING btree ("tenant_id","chat_id","created_at");
```

## Decisiones técnicas tomadas en auto mode
- **Ajustes en Agentes, no en el panel de Operaciones.** El jefe vive en Agentes y un módulo no puede leer las automatizaciones de otro. Se guardan en `agt_integrations` (proveedor `equipo`) y el interruptor es el campo `active` del agente.
- **Herramienta final obligatoria.** El texto suelto del agente no llega a nadie. Si no llama a `responder_al_equipo` ni a `escalar_a_enric`, la duda se escala con lo que haya.
- **Red de seguridad estrecha.** Solo contraseñas, sueldo, nómina, despidos y quejas de clientes. Plazos y precios los escala el propio agente, porque una palabra como «factura» también aparece en tutoriales legítimos.
- **Un cambio pedido por Enric siempre vuelve a él para aprobarlo**, aunque la nueva versión salga de la base: él la está revisando.
- **Los votos y los temas se cuentan en 24 horas.** Si una persona insiste en la misma duda dentro de los minutos de seguimiento, se escala antes de llamar a la IA (no gasta).
- **`mis_tareas` en vez de `tareas_de_persona`.** Así el equipo ve sus propias tareas, no las de los demás. `ficha_cliente` ya ocultaba el contrato a quien no es el dueño.
- **Los ejemplos de corrección no reentrenan nada.** Se le pasan al jefe al responder: las dudas parecidas con su primera propuesta, lo que pidió Enric y la respuesta final.
- **Verificación en el navegador:** rol admin temporal **solo en la base local** y vuelta a editor al terminar.

## Qué verificar manualmente
- Tras desplegar:
  - **Agentes → Dudas del equipo:** el jefe aparece apagado, con `claude-opus-5-5`.
  - **Agentes → Departamentos:** Operaciones tiene como jefe al Jefe de operaciones (desactivado).
  - **Agentes:** el Operations manager y el jefe de sistema tienen Opus 5.5.
- **Encender el jefe y probar desde un chat vinculado del equipo** (o el de pruebas):
  1. una duda que esté en la base: llega con «📚» y los botones;
  2. una que no esté: te llega para aprobar, y «✏️ Cambiar» rehace la respuesta;
  3. «No me sirve»: pide qué probó y te llega;
  4. algo de plazos o de sueldo: te llega directamente;
  5. responder a un aviso de encargo: la duda llega con ese encargo.
- Tras responder o aprobar, te llega también la propuesta para la base de conocimiento.
- `docker logs kijutech_app` sin `ReferenceError`.

## Pendientes detectados
- **Subagentes que trabajan para un jefe:** que presenten su trabajo al jefe (Opus) y que este lo corrija; tras 2 rondas sin acuerdo, a Enric. Acordado; está por construir.
- **Capturas del equipo:** el jefe aún no ve las fotos o capturas que manda el equipo, solo texto y audio.
- **Fase 3:** triaje de «Bloqueado» con la misma búsqueda y pestaña Huecos de conocimiento.
- **Coste real con Opus:** está por medir. La estimación es de unos 0,09 $ por duda.
- Sigue pendiente lo de antes: el paso «Despliegue protegido» del mapa de Seguridad (necesita OK) y el `TimeoutNegativeWarning` de producción.

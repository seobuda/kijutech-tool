# Organigrama y departamento de Sistema con su propio chat de Telegram
**Fecha:** 2026-11-20  
**Rama:** feature/departamentos-sistema  
**Commit:** ee9b5b1a

## Qué se construyó
Enric no quería que todo (errores, reinicios, pruebas, equipo) llegara a un único chat de Telegram, ni perder el control a medida que crece el sistema.

**Cómo se decidió:**
- Tras investigar cómo se organizan estos sistemas en 2025-2026 (Anthropic, Google Research, MAST de Berkeley, OrgAgent, McKinsey), se acordó organizar la herramienta como una agencia por departamentos: jefes que filtran y te informan, cada uno con su canal.
- Organigrama de partida en un artifact de la conversación.
- Decisiones de Enric:
  - cinco departamentos;
  - un solo agente para todas las cuentas;
  - el Operations manager pasa a ser el jefe de gabinete;
  - el equipo humano pregunta sus dudas a Operaciones por su chat de siempre;
  - piloto con Sistema.
- Aprobó el esquema, los cambios en el núcleo, el despliegue con migración y el arreglo de raíz de los errores de las pruebas.

**Organigrama (módulo Agentes):**
- `lib/db/schema.ts` + `lib/db/migrations/0055_organigrama_bots.sql`:
  - tablas `agt_departments` y `ops_telegram_bots`;
  - columna `agt_agents.department_key`;
  - tipo de agente `jefe`.
- `lib/agentes/store.ts`:
  - departamentos por defecto: Gabinete, Operaciones, Cuentas y Estrategia, Sistema y Plataforma, Seguridad;
  - nuevo agente **Jefe de sistema** (`jefe_sistema`, Sonnet, con sus instrucciones y herramientas);
  - los agentes que ya existían pasan a su departamento una sola vez;
  - funciones `listDepartments`, `departmentByBot`, `botForAgent` y `conversationAgent`.
- `lib/agentes/inbound.ts`:
  - un mensaje que llega por el bot de un departamento va a su jefe y se contesta por el mismo bot;
  - si el departamento no tiene jefe activo, contesta el principal.
- `lib/agentes/jobs.ts`: el informe de un trabajo vuelve al chat de quien lo encargó.
- `lib/agentes/actions.ts`, `app/(dashboard)/dashboard/agentes/` (ficha y lista): tipo «Jefe de departamento».
- `app/(dashboard)/dashboard/agentes/departamentos/` (nueva, pestaña **Departamentos**): cada departamento con su jefe, sus agentes y a quién reporta, y el panel del bot: pegar el token, comprobar y quitar (con confirmación).

**Bots de departamento (Operaciones):**
- `lib/operaciones/dept-bots.ts` (nuevo):
  - guardar el token: lo comprueba con getMe, rechaza el del bot principal y uno mal formado, lo cifra, pone el webhook con secreto propio y saluda al dueño;
  - si consigue saludar, el bot queda «listo»;
  - funciones para comprobar, quitar, `readyDeptBotToken` y `markDeptBotReady`.
- `lib/operaciones/dept-bot-actions.ts` (nuevo): las 3 acciones, solo admin.
- `app/api/telegram/webhook/route.ts`: con `&b=<clave>` comprueba el secreto de ese bot y lo atiende como bot de departamento.
- `lib/operaciones/telegram-handler.ts` (`handleDeptBotUpdate`):
  - solo el dueño; otros chats reciben «solo para la dirección»;
  - «Iniciar» deja el bot listo;
  - los mensajes y audios van al núcleo con `bot`;
  - los botones funcionan igual que en el bot principal.
- `lib/operaciones/notifications.ts`:
  - un aviso con `payload.bot` sale por ese bot si está listo; si no, por el principal;
  - `payload.silent` envía el mensaje con `disable_notification`;
  - los avisos `health` y `startup` al dueño llevan solos el bot «sistema»;
  - «Sistema en marcha» sale sin sonido.
- `lib/operaciones/health.ts`: solo suenan las incidencias críticas; lo resuelto y los avisos, en silencio.
- `lib/operaciones/agent-capabilities.ts`: la salida de Telegram del núcleo acepta `bot` y `silent`; se registra `estado_sistema`.
- `lib/operaciones/system-report.ts` (nuevo):
  - estado del sistema (salud, pruebas, errores, gasto de IA, servidor) sin IA;
  - herramienta `estado_sistema`;
  - parte diario `runSystemDigest` / `queueSystemDigest`.
- `lib/operaciones/automations.ts` + `automation-actions.ts`: automatización **Parte de Sistema** (`system_digest`, a las 09:00 por defecto, con «Enviarme una prueba»).
- `lib/operaciones/telegram-worker.ts`: el parte, en el planificador.

**Núcleo:**
- `lib/core/capabilities.ts`: `InboundMessage.bot`, `OutboundOptions` (`bot`, `silent`) y `SYSTEM_BOT`.
- `lib/core/errors.ts`:
  - los avisos de error van a Sistema y solo suenan los críticos;
  - `registerConsoleTenantResolver`: lo que se escribe en la consola durante una prueba simulada queda en la cuenta de pruebas.
- `lib/operaciones/sim/transport.ts` / `runner.ts`: el contexto de la ejecución lleva la cuenta de pruebas y registra el resolutor.

**Scripts:**
- `scripts/notify-sistema.sh` (nuevo): deja en la cola de avisos el resultado de un despliegue. Usa variables de psql, sin mezclar el texto con el SQL.
- `scripts/deploy.sh`:
  - «Desplegado» sin sonido; «Despliegue fallido» con sonido, tanto si falla la verificación como si falla una prueba simulada;
  - al terminar, regenera `watchdog.env`.
- `scripts/watchdog-env.mjs`: usa el bot de Sistema si está listo y nunca la cuenta de pruebas.

**Mapa Visual:**
- pasos nuevos `ops-int-dept-bots`, `ops-au-sysdigest` y `agt-organigrama`;
- actualizados el paso de avisos del registro de errores y `ops-sim-run`.

La comprobación pasa: 113 pasos en 16 mapas.

**Pruebas:**
- `tests/organigrama.test.ts` (nuevo, 10 pruebas, con Telegram interceptado por `fetch`): ver ESTADO §6.28.
- `tests/seguridad.test.ts`: las 3 acciones nuevas, solo admin.
- `tests/agentes.test.ts`: cuenta también el jefe de sistema.

En total pasan 426 de 426, y el typecheck está limpio.

**Documentación:**
- `docs/ESTADO.md`:
  - nueva sección §6.28;
  - Automatizaciones, tablas (110), pendientes, cronología, mapa de archivos y cabecera;
  - §6.27: el error de raíz queda arreglado.
- `docs/DESPLIEGUE.md` y `docs/PENDIENTES-ENRIC.md`.

## Migraciones aplicadas
`0055_organigrama_bots.sql`, aplicada en local. En producción se aplicará al desplegar con `--migrate`, con el OK de Enric.

```sql
CREATE TABLE IF NOT EXISTS "ops_telegram_bots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" varchar(40) NOT NULL,
	"bot_token_encrypted" text NOT NULL,
	"bot_token_iv" text NOT NULL,
	"bot_username" varchar(100),
	"bot_name" varchar(255),
	"ready_at" timestamp,
	"webhook_set_at" timestamp,
	"last_error" text,
	"last_error_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ops_telegram_bots_tenant_key_unique" UNIQUE("tenant_id","key")
);
ALTER TABLE "ops_telegram_bots" ADD CONSTRAINT "ops_telegram_bots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
CREATE TABLE IF NOT EXISTS "agt_departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"head_agent_key" varchar(40),
	"reports_to" varchar(20) DEFAULT 'direccion' NOT NULL,
	"bot_key" varchar(40),
	"sort" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agt_departments_tenant_key_unique" UNIQUE("tenant_id","key"),
	CONSTRAINT "agt_departments_reports_check" CHECK ("agt_departments"."reports_to" IN ('direccion', 'gabinete'))
);
ALTER TABLE "agt_departments" ADD CONSTRAINT "agt_departments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "agt_agents" ADD COLUMN IF NOT EXISTS "department_key" varchar(40);
ALTER TABLE "agt_agents" DROP CONSTRAINT IF EXISTS "agt_agents_kind_check";
ALTER TABLE "agt_agents" ADD CONSTRAINT "agt_agents_kind_check" CHECK ("agt_agents"."kind" IN ('principal', 'jefe', 'subagente'));
```

Copia local previa: `backups/backup_pre_departamentos_20261120.sql`.

## Decisiones técnicas tomadas en auto mode
- **El bot del aviso va en `payload`, no en una columna nueva de `ops_notifications`.**
  - La propuesta aprobada hablaba de un campo nuevo. `payload` (jsonb) ya lleva la configuración de cada aviso, así que se evita tocar una tabla existente: el cambio de esquema es menor que lo aprobado.
  - Para consultarlo: `payload->>'bot'`.
- **Sin vinculación para los bots de departamento.**
  - En un chat privado de Telegram, el id del chat es el del usuario, así que el chat del dueño con el bot de Sistema es el mismo número que con el principal.
  - Basta con que pulse «Iniciar». Al guardar el token se intenta saludar: si lo consigue, el bot ya queda listo.
- **Solo webhook** para los bots de departamento (no consulta periódica): en local no se usan, así no hay segundo proceso escuchando ningún token.
- **En el bot de Sistema no hay «conversación pendiente».** Lo que el bot principal espera por escrito (por chat) se contesta en el principal. Así no se mezclan: lo que escribes en Sistema siempre va al jefe de sistema.
- **Qué suena:**
  - incidencias de salud críticas, errores críticos, despliegue fallido y, del vigía de IA y el servidor, sus avisos semanales y de umbral (son pocos);
  - en silencio: lo resuelto, las incidencias de aviso, «Sistema en marcha», el despliegue correcto y el parte.
- **El parte de Sistema lo genera el código, no la IA** (directiva de optimización de IA). Solo la conversación con el jefe usa IA (Sonnet, 10 $/mes de presupuesto).
- **Las comprobaciones de Salud de otros módulos** (Rendimiento, Estrategia) también van hoy al chat de Sistema, porque son avisos `health`. Cuando Cuentas tenga jefe, irán a su chat (anotado en pendientes).
- **`watchdog-env.mjs` filtraba mal:** cogía «la primera» configuración de Telegram, que con el entorno de pruebas podía ser la simulada. Ahora excluye el modo `simulado`.
- **`lib/auth/security-process-map.ts` sin tocar:** el texto del paso «Despliegue protegido» sigue pendiente del OK de Enric.
- **No se ha podido ver la pantalla nueva en el navegador.** Rebuild del contenedor local descartado porque comparte el bot con producción (memoria: no arrancar la app local con el bot).

## Qué verificar manualmente
- Tras desplegar, en **Agentes → Departamentos**:
  - salen 5 departamentos; Sistema con «Jefe: Jefe de sistema» y «Sin bot»;
  - en **Agentes** aparece «Jefe de sistema» como «Jefe de departamento».
- Pega el token de «Kijutech Sistema» y pulsa Guardar.
  - Si ya habías pulsado «Iniciar», te escribe al momento («Hola, soy el jefe de Sistema»).
  - Si no, abre el chat, pulsa «Iniciar» y luego «Comprobar».
- Escríbele o mándale un audio: «¿cómo está el sistema?». Debe contestar él, por ese chat, con datos reales.
- **Automatizaciones → Parte de Sistema → «Enviarme una prueba»:** el parte llega por el chat de Sistema, sin sonido.
- Un error nuevo (o un aviso de Salud) debe llegar a Sistema y no al chat principal.
- El próximo despliegue debe dejar «🚀 Desplegado …» en Sistema.
- Quita el bot (Agentes → Departamentos → Quitar → Sí, quitar): los avisos vuelven al principal.

## Pendientes detectados
- Siguientes departamentos con jefe propio: Operaciones (con el equipo humano y su grupo) y después Cuentas.
- Actualizar el paso «Despliegue protegido» del bloque Seguridad del Mapa Visual. Necesita OK porque es `lib/auth/`.
- Las comprobaciones de Salud de Rendimiento y Estrategia irán al chat de Cuentas cuando exista su jefe.
- El vigilante externo usará el bot de Sistema a partir del despliegue siguiente a dejar el bot listo, porque `watchdog.env` se regenera al desplegar. Hasta entonces, sigue por el principal.
- `TimeoutNegativeWarning` en los logs de producción (de la sesión anterior), sin localizar.

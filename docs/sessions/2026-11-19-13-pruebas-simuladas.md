# Pruebas simuladas y entorno de pruebas aislado
**Fecha:** 2026-11-19  
**Rama:** feature/pruebas-simuladas  
**Commit:** 3dafc6ad

## Qué se construyó
Enric quería un miembro del equipo IA para que Claude pruebe flujos reales sin que les llegue nada a él ni al equipo. También quería poder ver lo probado en el panel, en un Telegram simulado con la lista de pruebas. Tras revisarlo con ojo crítico, se acordó la fase 1:
- el miembro de pruebas;
- Sistema → Pruebas, con el Telegram simulado y la lista de escenarios con su último resultado;
- unos 10 escenarios.

Enric aprobó el esquema: «asegúrate de que integra con la arquitectura y que si falla no afecte al resto».

**Decisión de arquitectura: un entorno de pruebas que es otra cuenta.** Marcar encargos y miembros como «de prueba» dentro de Kijutech habría obligado a filtrar decenas de sitios: resúmenes, informes, piloto, plazos, Equipo hoy… Cada función nueva podría volver a colarlos. Otra cuenta queda aislada por las mismas reglas que separan dos clientes de la plataforma, y esas reglas ya tienen pruebas de seguridad.

**Archivos:**
- `lib/operaciones/sim/env.ts`: crea y repara el entorno:
  - cuenta «<cuenta> · pruebas» con la IA bloqueada (`byok_required` sin clave);
  - bot con token centinela `SIM:<id>` en modo `simulado`;
  - ClickUp centinela;
  - dos miembros vinculados con chats negativos propios del entorno;
  - lista simulada con sus estados.
- `lib/operaciones/sim/transport.ts`: el Telegram simulado. Guarda en `ops_sim_messages` lo que envía, edita o borra el bot, y las ventanitas de los botones. Devuelve lo mismo que Telegram. Registra la ejecución en curso con `AsyncLocalStorage`.
- `lib/operaciones/sim/actor.ts`: la persona simulada (escribir, pulsar, pulsar por posición, reenviar una pulsación vieja). Construye la `TgUpdate` y llama a `handleUpdate`, el mismo código que atiende a las personas.
- `lib/operaciones/sim/scenarios.ts`: los 10 escenarios y sus ayudas (`check`, `press`, `say`, `flush`…).
- `lib/operaciones/sim/runner.ts`:
  - una tanda a la vez y 60 s por escenario;
  - historial en `ops_sim_runs`;
  - limpieza a los 30 días y 30 ejecuciones por escenario;
  - las ejecuciones colgadas pasan a fallo;
  - lecturas para el panel.
- `lib/operaciones/sim/actions.ts`: acciones del panel, solo admin.
- `app/(dashboard)/dashboard/operaciones/pruebas/` (página y vista):
  - resumen;
  - escenarios por área, con el último resultado, el historial en puntos y los pasos ✓/✗ con detalle;
  - Telegram simulado con los dos chats: filtrar por ejecución, pulsar, escribir, crear un encargo de prueba;
  - refresco cada 5 s.
- `app/api/pruebas/run/route.ts` y `scripts/run-scenarios.sh`: lanzar las pruebas desde el servidor, con un secreto derivado de `AUTH_SECRET` (404 sin él). El script manda el código por la entrada estándar, sin comillas anidadas.
- **Puntos de salida:**
  - `lib/operaciones/telegram.ts`: `tg()` desvía los tokens `SIM:` al simulador registrado. Sin simulador, falla sin salir. `tgSendVoice` y `tgDownloadFile` igual.
  - `lib/operaciones/clickup.ts`: `cuFetch()` rechaza el token `SIM:` antes de cualquier `fetch`.
- `lib/operaciones/telegram-worker.ts`: el planificador ignora las configuraciones en modo `simulado`. La escucha ya solo recorría `polling` y el webhook exige `webhook`.
- `lib/operaciones/workflow.ts`: **arreglo encontrado por la primera tanda.** `startWork` guardaba `seenAt` pero no `seenBy`, así que un aviso empezado salía como visto sin nombre.
- `components/app-shell/nav.ts`: pestaña Sistema → Pruebas (solo admin).
- **Mapa Visual:** `lib/operaciones/process-map.ts`, carril «Pruebas simuladas» con 3 pasos y las tablas `ops_sim_*`.
- **Pruebas:**
  - `tests/pruebas-simuladas.test.ts`:
    - entorno;
    - los 10 escenarios;
    - **cero llamadas a internet**, interceptando `fetch`;
    - la cuenta real sin encargos, avisos ni bandeja;
    - una tanda a la vez;
    - token simulado sin simulador.
  - `tests/seguridad.test.ts`: 5 acciones nuevas negadas a un editor, y 404 de la ruta sin secreto.
- `docs/ESTADO.md`: §6.27, tablas (108 en total, 41 `ops_*`), seguridad, cronología y cabecera.

## Migraciones aplicadas
`0054_ops_pruebas_simuladas.sql`. Aplicada en local tras `backups/backup_pre_pruebas_simuladas_20261119.sql`. En producción va con `deploy.sh --migrate`, que hace la copia antes.
```sql
CREATE TABLE IF NOT EXISTS "ops_sim_environments" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "tenant_id" uuid NOT NULL, "sim_tenant_id" uuid NOT NULL, "created_at" timestamp DEFAULT now() NOT NULL, CONSTRAINT "ops_sim_environments_tenant_id_unique" UNIQUE("tenant_id"), CONSTRAINT "ops_sim_environments_sim_tenant_id_unique" UNIQUE("sim_tenant_id"));
CREATE TABLE IF NOT EXISTS "ops_sim_runs" ("id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL, "tenant_id" uuid NOT NULL, "scenario_key" varchar(60) NOT NULL, "status" varchar(10) DEFAULT 'en_curso' NOT NULL, "trigger" varchar(12) DEFAULT 'manual' NOT NULL, "triggered_by" varchar(255), "steps" jsonb DEFAULT '[]'::jsonb NOT NULL, "error" text, "commit" varchar(20), "started_at" timestamp DEFAULT now() NOT NULL, "finished_at" timestamp, CONSTRAINT "ops_sim_runs_status_check" CHECK (status IN ('en_curso','ok','fallo')), CONSTRAINT "ops_sim_runs_trigger_check" CHECK (trigger IN ('claude','manual','despliegue')));
CREATE TABLE IF NOT EXISTS "ops_sim_messages" ("id" bigserial PRIMARY KEY NOT NULL, "tenant_id" uuid NOT NULL, "chat_id" bigint NOT NULL, "direction" varchar(8) NOT NULL, "text" text DEFAULT '' NOT NULL, "buttons" jsonb, "run_id" uuid, "edited_at" timestamp, "deleted_at" timestamp, "created_at" timestamp DEFAULT now() NOT NULL, CONSTRAINT "ops_sim_messages_direction_check" CHECK (direction IN ('bot','persona','aviso')));
-- Claves foráneas: tenant_id y sim_tenant_id → tenants (cascade); ops_sim_messages.run_id → ops_sim_runs (set null).
-- Índices: ops_sim_runs (tenant_id, scenario_key, started_at); ops_sim_messages (tenant_id, chat_id, id) y (run_id).
```
El SQL completo, con sus `ALTER TABLE` e índices, está en el archivo de la migración.

## Decisiones técnicas tomadas en auto mode
- **Otra cuenta en vez de marcas «de prueba»:** el aislamiento sale de lo que ya existe y no hay que mantener filtros.
- **Credenciales centinela en los dos únicos puntos de salida** (`tg()` y `cuFetch()`), en vez de interceptar función a función. Un token real nunca empieza por `SIM:`, así que el camino normal solo hace una comparación de texto.
- **IA bloqueada en la cuenta de pruebas:** escenarios deterministas, gasto cero y ninguna salida a internet. El motor de agentes resuelve la clave por la misma vía y también queda bloqueado.
- **Chats negativos por entorno:** `ops_telegram_pending` se indexa solo por chat. Con números fijos, dos entornos podrían pisarse, y un número positivo podría coincidir con una persona real.
- **ClickUp sin llamadas reales en la fase 1:** se comprueba lo que se manda a la bandeja (`ops_clickup_outbox`), que es lo que decide nuestro código. ClickUp real en «Pruebas Kiju» queda para la fase 2.
- **Al escribir los escenarios** se dio por hecho que el aviso nuevo traía todos los botones. El código real los muestra según el estado (sin empezar: Empezar y Más tarde; en curso: Bloqueado y los dos Hecho), y eso es lo correcto. Se corrigieron los escenarios, no el código.
- **Secreto de la ruta derivado de `AUTH_SECRET`:** no hace falta una variable nueva ni tocar docker-compose.
- **Sin editor de pruebas en el panel:** solo escenarios en código. Se acordó así, y la fase 2 añadirá «Pedir una prueba».

## Qué verificar manualmente
- Sistema → Pruebas: los 10 escenarios con su resultado y el Telegram simulado. Pulsa «Ejecutar todas» y, después, «Ver su conversación» en uno de ellos.
- Prueba a mano: escribe un título en «Nuevo encargo de prueba», pulsa Crear y usa los botones del chat de «Kiju IA».
- Comprobar que **no te llega nada a tu Telegram** mientras tanto, y que esos encargos no salen en Encargos, Equipo hoy ni en tus resúmenes.
- En móvil y en oscuro: la lista se apila encima del chat.

Comprobaciones hechas:
- `vitest`: 406/406, de ellas 6 nuevas del simulador y 6 de seguridad.
- `tsc`: sin errores.
- `node scripts/check-architecture-map.js`: OK (41 tablas, 109 pasos; mapa actualizado).

## Después del despliegue (19 nov, 13:30)
- Desplegado con `deploy.sh --migrate` (55 migraciones) y **10 de 10 escenarios correctos en producción** con `bash scripts/run-scenarios.sh`.
- `scripts/server-status.sh` y la verificación de `deploy.sh`:
  - excluyen la cuenta de pruebas (el bot simulado y sus avisos);
  - el estado muestra el detalle de los avisos pendientes (próximo intento, intentos, error) y el resumen de las pruebas simuladas.
- Los 2 avisos pendientes que se vieron eran de la cuenta real: «Sistema en marcha» retenidos por la hora de comida o silencio de la ficha del dueño. Es el comportamiento previsto.
- Un «Failed to find Server Action» en los logs justo tras desplegar viene de una pestaña abierta con la versión anterior. Desaparece al recargar.

## Pendientes detectados
- **Fase 2:**
  - pruebas de humo tras cada despliegue (`deploy.sh` → `run-scenarios.sh` → vuelta atrás si fallan);
  - «Pedir una prueba»;
  - escenarios de jornada y tiempos (necesitan reloj simulado o funciones con `now`);
  - ClickUp real en «Pruebas Kiju».
- El permiso de Claude Code para `bash scripts/run-scenarios.sh` no se pudo añadir solo: el filtro de seguridad no deja que Claude amplíe sus propios permisos. Enric puede añadirlo, o el script preguntará cada vez.
- Los fallos de la cuenta de pruebas van al registro de errores de esa cuenta, que no ve nadie. En los escenarios quedan en la propia ejecución. Si hiciera falta, se mostrarían en Sistema → Pruebas.

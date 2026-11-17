# Noche del 17 nov: despliegues, registro central de errores con Técnico de mantenimiento y revisión completa
**Fecha:** 2026-11-17  
**Rama:** `fix/ia-respuesta-vacia`, `feature/estrategia-fase2`, `feature/registro-errores`, `fix/revision-17nov` y `fix/tecnico-por-defecto`, todas fusionadas en `main`  
**Commit:** 094088c6

Enric se fue a dormir y aprobó: push y fusiones, todo lo del registro de errores con agente de mantenimiento, y una revisión completa del proyecto con informe para la mañana.

## Qué se hizo (en orden)

1. **Diagnóstico del audio que falló** (16 nov, 19:35, «crear una tarea… formulario de Atos»), en producción y solo leyendo:
   - la transcripción fue bien;
   - la conversión de la nota (`ops_note_to_requests`, Sonnet 5.5) quedó como **completada con el texto vacío**;
   - causa: los modelos Claude 5.5 piensan por defecto y el adaptador solo leía el primer bloque de la respuesta (el pensamiento).
   - **Arreglo desplegado:** `855dce77`.
2. **Estrategia fase 2 desplegada** (`a103cbf0`, migración 0051). Se subió `max_tokens` del estratega a 16 000, porque Opus 5.5 siempre piensa.
3. **Registro central de errores y Técnico de mantenimiento** (`1fa16b33`, migración 0052). Ver ESTADO §6.26.
4. **Revisión completa** con 5 revisores en paralelo (seguridad, Operaciones, IA y agentes, módulos de cliente, infraestructura): 57 hallazgos verificados. Informe en `docs/REVISION-2026-11-17.md`.
5. **Arreglos de la revisión** (`368c0b32`): 25 hallazgos arreglados (lista en el informe y en ESTADO §6.26).
6. **Arreglo del Técnico por defecto** (`a241765a`): en producción el Técnico no existía hasta abrir Agentes. Sin este arreglo, el primer diagnóstico habría fallado.

## Qué se construyó

**Registro central de errores (núcleo):**
- `lib/core/errors.ts`: captura (consola, peticiones, `reportError`), escritura en lotes con huella, avisos por Telegram, gestión, limpieza, diagnóstico automático, herramientas del Técnico (`errores_lista`, `error_detalle`, `codigo_buscar`, `codigo_leer`, `ia_llamada`, `guardar_diagnostico`) y botones `x:err:`.
- `lib/core/error-rules.ts`: puro (huella, limpieza de secretos, lectura de líneas de consola, aviso, texto para arreglar, diagnóstico).
- `lib/core/errors-process-map.ts` y `lib/architecture-map/registry.ts`: Mapa Visual (nodo «Errores y mantenimiento» y mapa «errores»). `scripts/check-architecture-map.js` comprueba las tablas `sys_*`.
- `lib/core/capabilities.ts`: `setAgentJobCreator` / `agentJobCreator`, para que el núcleo encargue trabajos a subagentes sin importar Agentes.
- `instrumentation.ts`: `captureConsole()`, promesas rechazadas y `onRequestError`.

**Pantalla y navegador:**
- `app/(dashboard)/dashboard/errores/` (`page.tsx`, `errores-view.tsx`, `actions.ts`): pantalla Administración → Errores con filtros, detalle, acciones y ajustes.
- `app/api/errores/route.ts`, `components/error-reporter.tsx` y `app/error.tsx`: errores del navegador.
- `components/app-shell/nav.ts`: entrada «Errores».

**Agentes y gateway de IA:**
- `lib/agentes/store.ts`: subagente «Técnico de mantenimiento» (Sonnet 5.5, 10 $/mes). El agente principal recibe `errores_lista`.
- `lib/agentes/register.ts`: registra el creador de trabajos, asegura los agentes por defecto y lanza los trabajos de subagentes en segundo plano.
- `lib/agentes/engine.ts`, `jobs.ts` e `inbound.ts`:
  - errores con contexto;
  - sin «Hecho.» ni mensajes vacíos cuando la respuesta se corta;
  - más vueltas en los trabajos;
  - respuesta a un audio vacío;
  - resumen con 3 000 tokens.
- `lib/ai/gateway.ts`, `types.ts` y `adapters/*`: cancelación real al agotar el tiempo, tiempo propio por llamada y fallos de IA al registro.

**Arreglos de la revisión:**
- `lib/core/net.ts` (nuevo): comprobación SSRF compartida (`isPublicUrl`, `resolvesPublic`, `fetchPublic`), que usan `lib/estrategia/web.ts` y `lib/seo/competitor-scraper.ts`.
- `lib/operaciones/`:
  - `profile-actions.ts`: miembro de ClickUp solo `admin`;
  - `health.ts`: sin falsas alarmas;
  - `inbox.ts`: bloqueos vigentes;
  - `outbox.ts` y `notifications.ts`: sin duplicados;
  - `cleanup.ts`: cambio de año;
  - `telegram-handler.ts`: «Sin comentario»;
  - `agent-capabilities.ts` y `work-source.ts`: textos.
- `lib/estrategia/`:
  - `strategist.ts`: porcentajes, tiempo, aviso aparte, propuesta sin encargo vuelve a pendiente;
  - `processes.ts`: tokens de Haiku, vigilancia con avisos apagados.
- `lib/seo/kw-ai-actions.ts`: `testAiPrompt` solo super_admin.
- `scripts/deploy.sh`: para si el backup sale vacío o la migración falla; muestra los errores nuevos del registro.

**Pruebas:**
- `tests/errores.test.ts` (nuevo, 14);
- `tests/revision.test.ts` (nuevo, 3);
- `tests/ia-adaptador.test.ts` (nuevo, 4);
- `tests/agentes.test.ts`, `tests/estrategia.test.ts` y `tests/seguridad.test.ts` (5 acciones nuevas).

**Documentación:**
- `docs/ESTADO.md`: §6.26, cabecera, migraciones, tablas, pendientes, cronología y mapa de archivos.
- `docs/REVISION-2026-11-17.md`: informe de la revisión.

## Prueba real del Técnico de mantenimiento (local)

Se metió en la base local el error real del 16 nov: mensaje, lo que vio Enric y el contexto. El Técnico lo diagnosticó con la IA real (Sonnet 5.5): **32 s y 0,11 $**.

Una prueba puntual hizo el encargo y procesó el trabajo; se copió al contenedor y se borró después. Se hizo así porque el planificador local no recorre ninguna cuenta: no hay bot configurado en local.

**Resultado:**
- **Causa encontrada:** solo leyendo el registro y el código, encontró la causa correcta (el adaptador leía el bloque de pensamiento), con evidencia archivo:línea.
- **Problema secundario real:** `lib/operaciones/request-proposer.ts:189-193` da «la nota genera demasiados encargos» ante una respuesta vacía. Con el arreglo del adaptador ya no llega vacía, pero el mensaje sigue siendo engañoso para otros casos.
- **Confianza:** se puso 7/10 y explicó por qué: no podía saber qué versión corría en producción.
- **Lo guardado:** el diagnóstico quedó en el error, que pasó a «investigando», y el informe se escribió para Telegram.

Los datos de prueba se borraron.

## Migraciones aplicadas

`0052_sys_errores.sql`. Se aplicó en local (tras `backups/backup_pre_errores_20261117.sql`) y en producción (con `deploy.sh --migrate`, que hizo backup antes). La 0051 también se aplicó esta noche en producción; su SQL está en el documento de sesión del 16 nov.

```sql
CREATE TABLE IF NOT EXISTS "sys_error_groups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE CASCADE,
  "fingerprint" varchar(64) NOT NULL,
  "source" varchar(40) NOT NULL,
  "area" varchar(120) DEFAULT '' NOT NULL,
  "title" varchar(300) NOT NULL,
  "severity" varchar(10) DEFAULT 'error' NOT NULL,
  "status" varchar(14) DEFAULT 'nuevo' NOT NULL,
  "occurrences" integer DEFAULT 0 NOT NULL,
  "reopened_count" integer DEFAULT 0 NOT NULL,
  "first_seen" timestamp DEFAULT now() NOT NULL,
  "last_seen" timestamp DEFAULT now() NOT NULL,
  "resolved_at" timestamp,
  "resolved_by" varchar(160),
  "note" text,
  "diagnosis" jsonb,
  "diagnosis_at" timestamp,
  "diagnosis_job_id" uuid,
  "diagnosis_requested_at" timestamp,
  "notified_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "sys_error_groups_severity_check" CHECK ("severity" IN ('aviso', 'error', 'critico')),
  CONSTRAINT "sys_error_groups_status_check" CHECK ("status" IN ('nuevo', 'investigando', 'resuelto', 'ignorado'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "sys_error_groups_fingerprint_unique" ON "sys_error_groups" ("fingerprint");
CREATE INDEX IF NOT EXISTS "sys_error_groups_tenant_idx" ON "sys_error_groups" ("tenant_id", "status", "last_seen");
CREATE INDEX IF NOT EXISTS "sys_error_groups_last_seen_idx" ON "sys_error_groups" ("last_seen");

CREATE TABLE IF NOT EXISTS "sys_error_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "group_id" uuid NOT NULL REFERENCES "sys_error_groups"("id") ON DELETE CASCADE,
  "tenant_id" uuid REFERENCES "tenants"("id") ON DELETE CASCADE,
  "message" text DEFAULT '' NOT NULL,
  "stack" text,
  "user_message" text,
  "context" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "actor" varchar(160),
  "channel" varchar(20),
  "path" varchar(300),
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "sys_error_events_group_idx" ON "sys_error_events" ("group_id", "created_at");
CREATE INDEX IF NOT EXISTS "sys_error_events_created_idx" ON "sys_error_events" ("created_at");

CREATE TABLE IF NOT EXISTS "sys_error_settings" (
  "tenant_id" uuid PRIMARY KEY REFERENCES "tenants"("id") ON DELETE CASCADE,
  "alerts" boolean DEFAULT true NOT NULL,
  "alert_min_severity" varchar(10) DEFAULT 'error' NOT NULL,
  "auto_diagnose" boolean DEFAULT true NOT NULL,
  "max_diagnoses_per_day" integer DEFAULT 2 NOT NULL,
  "retention_days" integer DEFAULT 60 NOT NULL,
  "state" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
```

## Decisiones técnicas tomadas en auto mode

**Diseño del registro:**
- **Tabla propia en vez de Sentry u otro servicio externo.** Los datos se quedan en casa, el agente los lee sin otra API y no hay coste mensual. Descartados también:
  - guardar los logs de Docker en un archivo (sin estructura);
  - ampliar `ops_health_incidents`, que es de Operaciones y solo para comprobaciones periódicas.
- **Capturar la consola entera** (`console.error`/`warn`) en vez de cambiar las 85 llamadas una a una. Cubre todo el código existente de golpe. `reportError()` se añadió solo donde hacía falta contexto (IA, agentes, voz, navegador).
- **Agrupar por huella, escribir en lotes de 3 s y guardar 10 muestras por error y hora**, para que una tormenta de errores no llene la base. Nunca lanza.
- **Errores sin cuenta (sistema):** los ve y recibe la cuenta dueña de la plataforma (la primera), no todos los `super_admin`.

**El Técnico de mantenimiento:**
- **Es un subagente del módulo Agentes**, no código del núcleo, para reutilizar el motor, la cola, el presupuesto y el informe por Telegram. El núcleo lo encarga por una capacidad nueva (`setAgentJobCreator`) sin importar el módulo.
- **Usa Sonnet 5.5, no Opus**, para el coste (10 $/mes de presupuesto, 2 diagnósticos automáticos al día). Enric puede cambiarlo a Opus en Agentes.
- **Solo lee y propone** (código, errores, llamadas de IA). Aplicar el arreglo lo hace quien programa: la pantalla tiene «Copiar para arreglarlo» con todo listo para Claude Code.
- **Lee el código del servidor (`/app`)**: comprobado que la imagen de producción lo lleva. Solo app, lib, components, scripts, tests, modules y docs; nunca `.env`, `node_modules` ni copias.

**Arreglos hechos de paso:**
- **Los trabajos de subagentes, en segundo plano** (hallazgo de la revisión). El diagnóstico automático lo habría empeorado: bloqueaban el planificador.
- **Tiempo agotado en la IA:** se cancela la petición de verdad. Se mantiene el salto a la IA de reserva (diseño del 13 nov); el estratega tiene 10 min.

**Qué se arregló de la revisión y qué no:**
- Solo lo claro y de bajo riesgo.
- No se tocó lo que necesita el OK de Enric: login, `docker-compose`, índices o columnas de tablas existentes y decisiones de diseño. Queda en el informe con su recomendación.
- **Cola de avisos:** el cambio a «una fila por vuelta» rompió las pruebas del circuito de la jornada. Se revirtió y, en su lugar, la reserva pasó a 300 s (cubre el lote entero). En la bandeja de ClickUp sí es una fila por vuelta.
- **Propuesta del estratega sin encargo creado:** vuelve a «pendiente» solo si no se creó nada. Si Operaciones guardó el encargo aunque ClickUp fallara, no se devuelve, para que nunca haya dos.

**Pruebas sin coste:**
- **Ningún análisis real de Opus.** En producción no hay ningún cliente con plan, y activar uno es decisión de Enric. El despliegue no lanza análisis.

## Qué verificar manualmente

1. **Administración → Errores:** con los filtros, el detalle y los ajustes. Al principio estará vacío: en producción no se había escrito ningún error en la consola en 2 h.
2. **Mandar por Telegram «crea una tarea para mí para mañana: probar el bot»:** tiene que llegar la propuesta con botones (es el fallo del 16 nov, ya arreglado).
3. **El primer error real:** debe llegar un aviso por Telegram con «🔎 Diagnosticar» y «🙈 Ignorar». Al rato llega el informe del Técnico y queda en la pantalla.
4. **Agentes:** que aparece el subagente «Técnico de mantenimiento» con sus 6 herramientas y 10 $/mes.
5. **Estrategia:** activar un plan a un cliente de prueba y pulsar «Analizar ahora» en su ficha. Es la primera prueba real de Opus.
6. **Leer `docs/REVISION-2026-11-17.md`** y decidir los pendientes marcados con 🔒.

## Pendientes detectados

- **Los 32 pendientes de la revisión** (`docs/REVISION-2026-11-17.md`). Lo más valioso:
  - URLs trabajadas con su versión canónica;
  - índice y purga de `ai_jobs` y de los registros (con OK);
  - coste de las llamadas de IA fallidas;
  - jornada atómica;
  - separar el rol de plataforma;
  - cambio de correo y contraseña (login, con OK).
- **No verificado de punta a punta en producción:** el aviso por Telegram de un error nuevo y `onRequestError` de Next 16. En local sí se comprobó la ruta del navegador y la captura de la consola (prueba automática).
- **Tras el cambio a la captura de consola:** vigilar que los `console.warn` de librerías no llenen el registro de avisos. `isNoise` filtra los conocidos.
- **Los `catch {}` vacíos** siguen tragando errores sin registrarlos. Se irán viendo cuando causen algo.
- **En local el planificador no recorre ninguna cuenta** (no hay bot configurado): ni el diagnóstico automático ni los trabajos de subagentes se ejecutan solos en local. En producción sí.
- **`request-proposer.ts`:** distinguir una respuesta vacía de una cortada. Mejor aún: que el adaptador devuelva el motivo de parada (`stop_reason`). Lo propuso el Técnico.

**Comprobaciones:**
- Mapa Visual actualizado y `node scripts/check-architecture-map.js` OK.
- `pnpm test` 368/368.
- Navegador con el usuario de pruebas: Bloc, Encargos y Equipo hoy cargan; Errores redirige a un editor; sin `ReferenceError`.

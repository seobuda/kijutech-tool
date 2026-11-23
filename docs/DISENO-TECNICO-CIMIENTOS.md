# Diseño técnico del paso 0: cimientos de la plataforma (para aprobar)

**Fecha:** 2026-11-23 · **Rama:** `diseno/modulo-seo` · **Depende de:** `docs/DISENO-MODULO-SEO.md` v2 (§4, §8, §10).
**Estado:** propuesta. No se ha tocado ni el esquema ni `docker-compose`.

Este paso deja lo mínimo para que el Hito 1 (prueba real con un cliente) funcione y escale:
1. proyecto vinculado al cliente;
2. contactos con sus comunicaciones;
3. cola de trabajos con trabajador aparte;
4. Search Console guardado en detalle;
5. rastreador;
6. hallazgos tipados.

Todo es **núcleo**, porque lo usarán SEO y después Ads, y un módulo no puede importar a otro. Por eso necesita la aprobación de Enric (CLAUDE.md).

**Convenciones:**
- todas las tablas nuevas llevan `tenant_id` y son del núcleo;
- se registran en `CORE_TABLES` de `tests/arquitectura-guardrails.test.ts`;
- migraciones escritas a mano: **0060** en adelante, con su entrada en `meta/_journal.json`;
- antes de migrar, backup con `pg_dump`.

---

## 1. Proyecto vinculado al cliente

**Cambios en `projects`:**

| Columna | Tipo | Para qué |
|---|---|---|
| `client_id` | ya existe | Pasa a ser **obligatorio en filas nuevas**: `CHECK (client_id IS NOT NULL) NOT VALID`. No falla con el proyecto de prueba antiguo y obliga a partir de ahora. Cuando se retire el SEO de agosto se valida (`VALIDATE CONSTRAINT`). |
| `service` | `varchar(20)` NOT NULL DEFAULT `'seo'` | Servicio del proyecto: `seo` \| `ads` \| `web` \| `otro`. Así el proyecto es genérico y Ads lo reutiliza. |
| `monthly_hours` | `numeric(6,1)` NULL | Horas al mes del proyecto. El estratega reparte estas horas y, si faltan, las del cliente. |
| `brief` | `jsonb` NULL | Reservado para el expediente del Hito 1. El detalle irá en tablas del módulo SEO; aquí solo un resumen. |
| `updated_at` | `timestamp` | — |

`client_name`, `domain` y `location` se dejan de usar en código nuevo y se borrarán al retirar el SEO de agosto (aprobación aparte).

**Tabla nueva `project_assets`** (alcance del proyecto):
- **Columnas:**
  - `project_id` FK → `projects` ON DELETE CASCADE;
  - `client_asset_id` FK → `client_assets` ON DELETE CASCADE;
  - `role` `varchar(12)` (`principal` | `secundario`);
  - `created_at`.
- **Clave primaria:** `(project_id, client_asset_id)`.
- **Índice:** `client_asset_id`.

Un proyecto elige de entre las «Webs y cuentas» del cliente: webs, dominios, Search Console, Analytics, fichas de Google y redes. Una misma cuenta puede estar en dos proyectos.

**Encargos con su proyecto.** Módulo Operaciones: `ops_requests.project_id uuid NULL` FK → `projects` ON DELETE SET NULL, con índice.
- Se rellena cuando el encargo nace de un proyecto: el estratega o el plan de mejora, mediante `WorkSource.createTask({ projectId })`.
- `NewTaskInput` y `WorkSource` aceptan `projectId` opcional.

**Pantallas:**
- «Nuevo proyecto» exige elegir el cliente (selector) y su alcance.
- Desde la ficha del cliente, el cliente ya va elegido.

## 2. Contactos y comunicaciones

**Tabla nueva `client_contact_subscriptions`:**
- **Columnas:**
  - `id`;
  - `tenant_id`;
  - `contact_id` FK → `client_contacts` ON DELETE CASCADE;
  - `kind` `varchar(16)`, con CHECK: `informes` | `preguntas` | `avisos` | `aprobaciones` | `facturacion` | `todo`;
  - `project_id` NULL FK → `projects` ON DELETE CASCADE (NULL = todos los proyectos del cliente);
  - `created_at`.
- **Índice único:** `(contact_id, kind, coalesce(project_id, '00000000-0000-0000-0000-000000000000'))`.
- **Regla de destinatarios (función pura, probada):** los contactos activos con correo que tengan ese `kind` o `todo`, para ese proyecto o para todos. Si no queda ninguno, se devuelve **`sin_destinatario`** y el paso que lo necesitaba queda bloqueado.

**Política de aprobación:**
- `clients.comms_approval varchar(10) NOT NULL DEFAULT 'heredar'` (`heredar` | `siempre` | `nunca`).
- Ajuste de cuenta `comms_approval_default = 'siempre'`. Va en la tabla de ajustes de cuenta que ya exista (se comprobará cuál al implementar) o en una fila de `tenant_settings`.
- **De entrada, todo pasa por Enric.**

**Tabla nueva `client_messages`** (todo lo que sale hacia un cliente, quien lo escriba):
- **Columnas:**
  - `id`, `tenant_id`, `client_id`, `project_id` NULL;
  - `kind` (los de arriba);
  - `subject` `varchar(300)`, `body_text` `text`;
  - `to_contact_ids` `uuid[]`, `cc_contact_ids` `uuid[]`;
  - `author_kind` (`persona` | `agente` | `sistema`), `author_name`, `author_user_id` NULL, `author_agent_key` NULL;
  - `status` (`borrador` | `pendiente_aprobacion` | `aprobado` | `enviado` | `rechazado` | `fallido`);
  - `approval_required` bool, `decided_by`, `decided_at`, `reject_reason`;
  - `sent_at`, `provider_message_id`;
  - `thread_key` (para unir las respuestas que entren por el buzón), `reply_to_inbound_id` NULL;
  - `dedupe_key` UNIQUE por cuenta;
  - `created_at`, `updated_at`.
- **Índices:** `(tenant_id, status)`, `(client_id, created_at)`, `(thread_key)`.

**Envío:**
- El núcleo no conoce Resend. Operaciones registra un **`MailSender`** en `lib/core/capabilities.ts` (`registerMailSender`) con su buzón y su reintento.
- El núcleo decide, el módulo envía. El envío va **por la cola de trabajos** (§3), con clave única: nunca dos veces.

**Aprobación:**
- Tipo nuevo en Para ti, `mensajes`, con «Enviar», «Corregir» o «Descartar».
- También por Telegram, con los botones de siempre.

**Respuestas:** el buzón que ya existe (`ops_inbound_emails`) las asocia por `thread_key` (cabeceras `In-Reply-To` y `References`) y quedan en el hilo del mensaje.

**Herramienta para agentes:** `escribir_al_cliente(cliente, proyecto?, tipo, asunto, texto)`. Crea un `client_message` en `pendiente_aprobacion`, o en `aprobado` si la política es `nunca`. **El agente nunca elige direcciones**: las elige la regla.

## 3. Cola de trabajos y trabajador aparte

**Tabla nueva `jobs`:**
- **Columnas:**
  - `id`, `tenant_id`;
  - `kind` `varchar(60)` (registrado por un módulo);
  - `scope_type` (`proyecto` | `cliente` | `cuenta`), `scope_id` NULL;
  - `payload` jsonb;
  - `priority` smallint (0 = urgente … 9 = de fondo);
  - `run_at` timestamp;
  - `status` (`pendiente` | `en_curso` | `hecho` | `fallido` | `cancelado`);
  - `attempts`, `max_attempts` (3);
  - `locked_by` `varchar(60)`, `locked_at`, `heartbeat_at`;
  - `timeout_s` (por tipo);
  - `last_error` text;
  - `result` jsonb (resumen tipado pequeño, nunca datos grandes);
  - `dedupe_key` NULL;
  - `created_at`, `finished_at`.
- **Índices:**
  - `(status, run_at, priority)` parcial `WHERE status='pendiente'`;
  - único `(tenant_id, dedupe_key)` parcial `WHERE status IN ('pendiente','en_curso')`.

**Cómo se reclama un trabajo:**
- `UPDATE … WHERE id = (SELECT id … FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`. Escala a varios trabajadores sin pisarse.
- **Latido** cada 15 s.
- Un trabajo con el latido vencido (más de 2 × 15 s) se devuelve a `pendiente` y cuenta un intento.

**Concurrencia por tipo:** cada tipo declara su máximo a la vez. Por ejemplo, rastreo 2 y descarga de Search Console 2, para no reventar la memoria ni las cuotas.

**Tabla nueva `job_schedules`** (generaliza `est_process_runs`):
- **Columnas:**
  - `tenant_id`, `process_key`, `scope_type`, `scope_id`;
  - `every_minutes`;
  - `next_run_at`, `last_run_at`, `last_status`, `last_error`;
  - `consecutive_failures`;
  - `enabled`, `paused_until`.
- **Clave primaria:** `(tenant_id, process_key, scope_id)`.
- **Funcionamiento:**
  - El programador mira cada minuto las filas vencidas, con `SKIP LOCKED`, y crea su trabajo con `dedupe_key`.
  - Tras un fallo, la espera crece: el patrón `nextRunAfter` de Estrategia, que se traslada.

**Registro en el núcleo:**
- `registerJobKind({ kind, timeoutS, maxConcurrent, run(ctx, payload) → resultado })`.
- `registerProcess({ key, scope, defaultEvery, enqueue })`.

SEO y Ads aportan los suyos sin tocar el núcleo.

**Trabajador aparte** (cambio en `docker-compose.yml` y `docker-compose.prod.yml`, **necesita aprobación**):
- **Servicio nuevo `worker`:**
  - **misma imagen** que `app` (sin herramientas de build nuevas);
  - arranca con `APP_ROLE=worker`;
  - Caddy no le manda tráfico;
  - `instrumentation.ts` mira `APP_ROLE`:
    - `worker`: corre el programador y la cola;
    - `web`: no corre ni el programador ni la cola.
- **Qué pasa con lo de ahora:**
  - El planificador actual (`runScheduled` dentro del bucle de Telegram) **sigue igual** en la web mientras Estrategia y Rendimiento no se trasladen. No se rompe nada.
  - Se irán moviendo a la cola uno a uno.
- **Memoria:** otra instancia de Node, unos 250-400 MB (estimación). Con 2 GB va justo. **Hay que subir el servidor a 4 GB antes** de activar el rastreo y la descarga completa de Search Console.

## 4. Search Console en detalle

Diccionarios para no repetir textos largos en millones de filas.

**Tabla nueva `gsc_properties`:**
- **Columnas:**
  - `id` serial;
  - `tenant_id`;
  - `client_asset_id` FK;
  - `site_url` UNIQUE por cuenta;
  - `kind` (`dominio` | `prefijo` | `plataforma`): esta última, para las propiedades sociales si la API las devuelve;
  - `first_date`, `last_date`;
  - `sync_state` jsonb (cursor);
  - `status`.

**Tabla nueva `gsc_queries`:**
- **Columnas:**
  - `id` bigserial;
  - `property_id`;
  - `query` text;
  - `query_hash` bytea UNIQUE por propiedad;
  - `branded` bool NULL (de la clasificación de Google cuando exista);
  - `first_seen`;
  - `embedding` halfvec(1536) NULL (para el mapa de palabras del Hito 2, con caché).

**Tabla nueva `gsc_pages`:** `id` bigserial, `property_id`, `url` text, `url_hash` UNIQUE por propiedad, `first_seen`.

**Tabla nueva `gsc_daily`**, **particionada por mes** (`PARTITION BY RANGE (date)`):
- **Columnas:**
  - `property_id` int;
  - `date` date;
  - `query_id` bigint;
  - `page_id` bigint;
  - `device` smallint (1 = móvil, 2 = ordenador, 3 = tableta);
  - `search_type` smallint (web, imágenes, vídeo, news, Discover);
  - `clicks` int;
  - `impressions` int;
  - `pos_sum` real.

  Se guarda posición × impresiones para poder agregar bien.
- **Clave primaria:** `(property_id, date, search_type, device, query_id, page_id)`.
- **Índices:** BRIN por `date` y B-tree `(property_id, query_id, date)` y `(property_id, page_id, date)`.

**Por qué esta forma:**
- **Tabla ancha, no larga:** una fila por combinación, no una por métrica. Son 4 veces menos filas que en el formato de `perf_daily`.
- **Sin país en el detalle diario:** casi todos los clientes son de España.
- **Tabla `gsc_daily_country`:** guarda `(property_id, date, country, clicks, impressions, pos_sum)` solo con totales por país.

**Volumen estimado:** unas 20.000 combinaciones al día por propiedad, × 10 propiedades × 365 días, son unos 73 millones de filas al año (4-6 GB con índices).
- **Disco hoy:** 66 % de 48 GB. Por eso:
  - **retención del detalle diario: 24 meses** (se borra la partición entera, que es barato);
  - **resúmenes mensuales para siempre** en `gsc_monthly(property_id, month, query_id, page_id, clicks, impressions, pos_sum)`.
- Se medirá con los primeros clientes y se ajustará.

**Descarga** (proceso `gsc.sync` en la cola, 1 trabajo por propiedad):
- **Al dar de alta:** 16 meses hacia atrás por tramos, empezando por lo más reciente.
- **Cada día:** los últimos 4 días, porque Google corrige.
- **Paginación** con `startRow` hasta acabar o llegar al tope. Si se llega al tope, se anota «truncado» y se propone la exportación a BigQuery.
- **Contador por minuto y reintento ante 429.** El conector se saca de `lib/agentes/integrations.ts` al núcleo (`lib/core/connectors/google.ts`), y Agentes lo usa desde ahí.

**Clics anónimos.** Se calculan como el total del día sin dimensiones menos la suma de las filas con consulta. Se guardan en `gsc_daily_totals(property_id, date, search_type, clicks, impressions, pos_sum)`.

## 5. Rastreador

**Tabla nueva `crawl_runs`:**
- **Columnas:**
  - `id`, `tenant_id`, `project_id` NULL;
  - `target` (`propio` | `competidor`), `root_url`;
  - `status`;
  - `max_pages` (por defecto 500 propio y 100 competidor), `pages_done`;
  - `robots_txt` text, `sitemaps` text[];
  - `started_at`, `finished_at`, `error`.

**Tabla nueva `crawl_pages`:**
- **Columnas:**
  - `run_id`, `url`, `url_hash`;
  - `status_code`, `redirect_to`, `content_type`;
  - `title`, `meta_description`, `h1` text[], `headings` jsonb (h2 y h3, recortados);
  - `canonical`, `robots_meta`, `x_robots`, `lang`, `hreflang` jsonb;
  - `word_count`, `content_hash`, `simhash` bigint (casi duplicados);
  - `links_internal`, `links_external`;
  - `depth`, `in_sitemap` bool;
  - `jsonld` jsonb (bloques recortados), `schema_types` text[];
  - `images_without_alt`;
  - `bytes`, `fetch_ms`, `fetched_at`.
- **Clave primaria:** `(run_id, url_hash)`.

**Tabla nueva `crawl_links`:** `run_id`, `from_hash`, `to_hash`, `anchor` `varchar(200)`, `nofollow`. Sirve para páginas huérfanas, profundidad y PageRank interno.

**Retención:** se conservan las 3 últimas ejecuciones completas por proyecto y objetivo. Lo anterior se borra, pero sus hallazgos se quedan.

**Comportamiento:**
- respeta `robots.txt` y se identifica con un User-Agent propio;
- 1 petición por segundo por dominio;
- solo URLs públicas (`fetchPublic`);
- tope de 2 MB por página;
- solo HTML.

**El JavaScript no se ejecuta en este paso.** Si una página parece «vacía» sin JS, sale el hallazgo «posible web hecha en JavaScript». El renderizado con un navegador vendría más adelante, con aprobación.

**Análisis del HTML:**
- **Propuesta:** una dependencia pequeña y conocida (`parse5` o `node-html-parser`) en lugar de expresiones regulares, que fallan en HTML real. **Necesita aprobación** (`pnpm add`, en un contenedor temporal).
- **Alternativa sin dependencia:** seguir con expresiones regulares, como el lector actual de la competencia. Es más frágil.

## 6. Hallazgos tipados

**Tabla nueva `findings`:**
- **Columnas:**
  - `id`, `tenant_id`, `project_id`;
  - `kind` `varchar(60)` (registrado: por ejemplo `seo.title_missing`, `seo.schema_localbusiness_missing`);
  - `rule_version` int;
  - `severity` (`info` | `aviso` | `importante` | `critico`);
  - `status` (`abierto` | `resuelto` | `descartado` | `aceptado`);
  - `dedupe_key` (único por proyecto entre los abiertos);
  - `url` text NULL, `query` text NULL;
  - `metric` `varchar(40)` NULL, `value` double NULL;
  - `evidence` jsonb (validado contra el esquema de su tipo);
  - `source` (`crawl:<run>` | `proceso:<clave>`);
  - `request_id` NULL (el encargo que lo resuelve);
  - `first_seen`, `last_seen`, `resolved_at`;
  - `dismissed_by`, `dismiss_reason`.
- **Índices:** `(project_id, status, severity)`, `(project_id, kind)` y `(project_id, url)`.

**Registro en el núcleo:** `registerFindingKind({ kind, title, explain, severityDefault, evidenceSchema, kbTopic })`. `kbTopic` enlaza la explicación de formación de la base de conocimiento: el «por qué importa esto».

**Ciclo de vida:**
- Cada ejecución **actualiza** `last_seen` de lo que sigue apareciendo.
- Lo que deja de aparecer se marca **resuelto** solo.
- Lo que se **descartó** no se reabre.

Es el mismo comportamiento que tienen hoy las señales de Estrategia, que acabarán migrando aquí.

## 7. Lo que no entra en el paso 0

Va en el Hito 1:
- expediente provisional;
- reglas de auditoría versionadas y sus comprobaciones;
- generador de JSON-LD;
- local;
- plan de mejora;
- I+D en fase A (bitácora);
- taxonomía de técnicas y la hipótesis en cada encargo.

Va en hitos posteriores:
- traslado de la lógica de Estrategia a la cola y al proyecto;
- las demás plataformas;
- el cerebro.

**Estrategia y Rendimiento siguen funcionando como hoy** hasta que se trasladen. No se rompe nada.

## 8. Pruebas

- **Barreras:** las tablas nuevas entran en `CORE_TABLES`. Ningún módulo importa a otro: el envío de correo y el conector de Google van por registros.
- **Cola:**
  - dos trabajadores no reclaman el mismo trabajo;
  - un latido vencido devuelve el trabajo;
  - `dedupe_key` evita los duplicados;
  - se respeta la concurrencia por tipo.
- **Destinatarios** (regla pura):
  - por tipo y por proyecto;
  - «todo»;
  - contacto inactivo o sin correo;
  - `sin_destinatario`.
- **Mensajes:** con aprobación queda pendiente y sin ella se envía una sola vez. La respuesta se une al hilo correcto.
- **Seguridad:**
  - aprobar o descartar mensajes y la herramienta del agente, con sus guards;
  - un editor no aprueba si la política lo pide.
- **Search Console:**
  - paginación y tope;
  - diccionarios sin duplicados;
  - posición agregada (`pos_sum / impressions`);
  - clics anónimos.

  Todo con el conector simulado.
- **Rastreador** (con un servidor de prueba local):
  - robots;
  - redirecciones;
  - canonical;
  - JSON-LD;
  - casi duplicados;
  - páginas huérfanas.
- **Mapa Visual:** procesos y tablas nuevas en el mapa, y `check-architecture-map` en verde.

## 9. Aprobaciones que pido

1. **Núcleo y esquema** de los apartados 1 a 6: tablas nuevas, los cambios en `projects`, `clients` y `ops_requests`, y las migraciones 0060 en adelante, con backup previo.
2. **`docker-compose.yml` y `docker-compose.prod.yml`:** servicio `worker`, la misma imagen con `APP_ROLE=worker`.
3. **Dependencia** para analizar HTML (`parse5` o `node-html-parser`), o seguir con expresiones regulares.
4. **Servidor de 4 GB** antes de activar el rastreo y la descarga completa en producción. Lo cambia Enric en DigitalOcean; Claude solo lee DO.
5. Para el Hito 1, **el cliente de la prueba**.

Con 1, 2 y 3 aprobados se construye el paso 0 en su rama, con pruebas, Mapa Visual y documentación. Se despliega con `--migrate`, que pide tu permiso.

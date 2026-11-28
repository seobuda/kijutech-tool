# Diseño técnico del módulo Google Ads (pasos 1 y 2)

**Fecha:** 28 nov 2026 · **Estado:** propuesta, pendiente de auditoría independiente (protocolo de decisión) ·
**Base:** `docs/ads/INVESTIGACION-GOOGLE-ADS.md` v3 (apartados 7, 8, 9 y 13.2) · **Encargo:** Enric, 28 nov: «Empieza a
construir toda la herramienta, tienes permiso para todo lo referente a este módulo».

## 0. Alcance de este documento

Pasos 1 y 2 del orden de construcción (13.2):

- **Paso 1:** conexión con la API, almacén propio, descarga del histórico, fotos diarias (estado, configuración, historial
  de cambios) y **salud de nuestras fuentes (MED-00)**.
- **Paso 2:** pantalla **Cartera**, pantalla **Hoy** (cabecera de cobertura real) y las **cuatro interrupciones** (campaña
  parada o desbocada, rechazo con gasto, landing caída con gasto, la cuenta no puede servir), ritmo de gasto, CPL frente a
  objetivo o frente a su línea base, estado de la medición («rota» / «sin conciliar todavía») y último cambio con su autor.

Los pasos 3 en adelante tendrán su propio documento cuando lleguen.

**Lo que sigue siendo línea roja aunque Enric haya dado permiso general al módulo** (CLAUDE.md, «si roza una línea roja,
se trata como línea roja»): cualquier **escritura en cuentas reales de Google Ads** (paquete C), **subir datos de leads a
Google** (paquete D), instalar scripts en la MCC, enviar mensajes a clientes y añadir dependencias. En estos pasos **todo
es lectura**: la herramienta no tiene ni una función que escriba en Google Ads.

## 1. Decisión: cómo se autentica la herramienta (protocolo de decisión)

**Problema.** La API de Google Ads necesita credenciales OAuth con el permiso `adwords`. Hoy la conexión de Google vive en
el módulo Agentes (`lib/agentes/integrations.ts`, permisos de Search Console, Analytics y Business Profile), con el refresh
token de una persona, y Ads no puede importar Agentes.

**Tres puntos de vista.**
- *Arquitecto:* Ads no debe depender de Agentes ni obligar a tocar el núcleo para arrancar; cuanto más autocontenido, menos
  riesgo para lo que ya funciona (SEO congelado, Rendimiento en producción).
- *Seguridad y costes:* una credencial que no dependa de un empleado, de mínimo privilegio (lectura), cifrada, sin pasar
  nunca al navegador; desde 2026 los accesos de usuario piden doble factor y llave de acceso, que caducan o se pierden.
- *Quien la usa (Enric):* el alta tiene que ser un formulario en Ajustes con un botón «Probar conexión»; nada de volver a
  autorizar Google en otra pantalla ni romper lo que ya está conectado.

**Alternativas.**

| | Alternativa | Coste | Riesgo | Qué se pierde |
|---|---|---|---|---|
| A | **Cuenta de servicio de Google Cloud**, su clave JSON guardada cifrada en una tabla de Ads; la herramienta firma el JWT (RS256 con `node:crypto`, sin dependencias) y pide el token | Bajo: ~80 líneas | Bajo: no toca Agentes ni el núcleo | Nada; recomendada por los informes 04 y 10 |
| B | Añadir el permiso `adwords` a la conexión de Google de Agentes y publicar una capacidad `registerAdsAuth` en el núcleo | Medio: toca Agentes, el núcleo y obliga a reautorizar | Medio: una reautorización mal hecha corta Search Console/GA4/GBP de todos los clientes | Depende del usuario que autorizó |
| C | No hacer nada hasta la prueba de acceso (paquete A) | 0 | 0 | Una semana; el almacén y las pantallas se pueden construir ya con datos simulados |

**Decisión (hipótesis): A**, con un **modo simulado** (credencial `SIM`) que genera cuentas y datos deterministas para
desarrollo, pruebas y pantallas mientras no hay acceso real (mismo patrón que el `SIM:` de ClickUp). El modo simulado
nunca sale a internet y la pantalla lo dice en grande.

**Cuestionada tres veces.**
1. *¿Cumple el objetivo final?* Sí: el agente necesita una credencial estable 24/7 que no caduque con un empleado; la
   cuenta de servicio es la recomendación oficial para procesos de servidor.
2. *¿Coste oculto a semanas vista?* (a) Una cuenta de servicio solo entra en 20 cuentas sin MCC → se añade a la MCC y se
   envía `login-customer-id`. (b) Si Google exigiera aún el *developer token* en algún caso, el campo existe y es opcional.
   (c) Rotación de la clave: el formulario permite sustituirla; se guarda la fecha de alta y se avisa a los 300 días.
3. *¿Hay algo que ya tenemos y no usamos?* El cifrado (`lib/ai/encryption.ts`), el registro de errores (`reportError`),
   `registerHealthCheck`, la cola de trabajos y la ficha del cliente (`client_assets` tipo `google_ads`): se usan todos.

**Lo no verificado:** que la API acepte cuentas de servicio añadidas a la MCC sin *developer token* (documentación de
sep 2026, sin probar). Si la prueba real falla, la alternativa B queda como plan de reserva.

## 2. Estructura de archivos (`lib/ads/`)

| Archivo | Qué hace |
|---|---|
| `client.ts` | **Único archivo con `googleads.googleapis.com`** (barrera en guardrails). JWT de la cuenta de servicio, caché del token, `searchStream(customerId, gaql)`, contador de operaciones por día, reintentos ante 429/`RESOURCE_EXHAUSTED`, errores en español (`AdsApiError`), versión de la API configurable (por defecto `v26`), modo simulado |
| `sim.ts` | Datos simulados deterministas (semilla por cuenta): 6 cuentas, campañas de búsqueda y PMax, 400 días de métricas con estacionalidad semanal, conversiones por acción, historial de cambios, estados. Sirve para pantallas y pruebas |
| `queries.ts` | Las consultas GAQL (texto) y su traducción a filas nuestras (puro, probado con respuestas grabadas: pruebas de contrato GOO-07) |
| `store.ts` | Lectura y escritura de tablas `ads_*` (sin lógica de negocio) |
| `settings.ts` | `ads_settings`: valores por defecto, lectura y guardado con límites |
| `sync.ts` | Descarga: cuentas de la MCC, estructura, métricas diarias (resincroniza 10 días), histórico hacia atrás por tramos, historial de cambios, fotos diarias de estado y versiones de configuración |
| `health.ts` | **MED-00**: frescura por cuenta y fuente, `registerHealthCheck`, y `sourceHealth(account, source)` que leen las reglas antes de afirmar |
| `rules/` | Reglas puras (sin base de datos) de los hallazgos del paso 2, con pruebas unitarias |
| `findings.ts` | Evalúa las reglas, deduplica por causa, aplica silencios y tope de atención, guarda en `ads_findings` |
| `alerts.ts` | Interrupciones por `telegramOutbound().notifyOwner` (tope 2/día, horario laboral) |
| `process-map.ts` | `ADS_PROCESS_MAP` para el Mapa Visual |
| `register.ts` | Registro en el núcleo: tipos de trabajo, procesos, tarea del planificador, comprobación de salud |
| `actions.ts` | Acciones `'use server'` con guard (ajustes, probar conexión, vincular cuenta a cliente, objetivo provisional, respuestas a hallazgos) |
| `access.ts` | `server-only`: comprobaciones internas no exportables desde `'use server'` |

Pantallas: `app/(dashboard)/dashboard/ads/` → `page.tsx` (Hoy), `cartera/`, `cuentas/[accountId]/` (expediente mínimo:
línea de tiempo de cambios y hallazgos), `ajustes/` (admin). Entrada «Google Ads» en el menú (grupo Clientes).

## 3. Tablas (migración aditiva `0084_ads_cimientos.sql`)

Principios del apartado 8.1: columna `platform` (`'google'`), identificadores nativos, conversiones fraccionarias
(`numeric`), un dato ausente es `NULL` (no 0), dinero en `numeric(14,2)` en la moneda de la cuenta, fechas `date` en la
zona de la cuenta.

| Tabla | Granularidad | Columnas principales |
|---|---|---|
| `ads_settings` | cuenta (tenant) | `mcc_customer_id`, `auth_mode` (`service_account`/`sim`), `credentials` cifradas, `credentials_added_at`, `developer_token` cifrado (opcional), `api_version`, `sync_enabled`, `daily_ops_budget` (2.500), `ai_monthly_cap_usd` (25), `alert_hours` (`09:00-19:00`), `max_interruptions_per_day` (2), `history_months` (37), `state` jsonb |
| `ads_accounts` | cuenta de Ads × plataforma | `platform`, `customer_id` (10 dígitos), `name`, `currency`, `time_zone`, `status`, `is_manager`, `client_id` (nullable, núcleo), `client_level` (`A`/`B`/`C`, nullable), `tracked` (bool), `linked_by`, `first_seen_at`, `last_seen_at` |
| `ads_sync_state` | cuenta de Ads × fuente | `source` (`estructura`, `metricas`, `historico`, `cambios`, `estado`, `rastreo_landing`…), `last_ok_at`, `last_data_date`, `cursor` jsonb, `expected_every_minutes`, `consecutive_failures`, `last_error`, `updated_at` |
| `ads_api_usage` | cuenta (tenant) × día | `day`, `operations`, `errors`, `last_error` (contador del cupo diario; el detalle va a `sys_error_*`) |
| `ads_campaigns` | campaña | `account_id`, `platform`, `native_id`, `name`, `channel_type`, `channel_subtype`, `status`, `bidding_strategy_type`, `budget_amount`, `target_cpa`, `target_roas`, `final_urls` jsonb, `attrs` jsonb, `first_seen_at`, `last_seen_at` |
| `ads_config_versions` | entidad × periodo | `account_id`, `entity_type`, `entity_native_id`, `valid_from`, `valid_to` (null = vigente), `snapshot` jsonb, `hash` |
| `ads_conversion_actions` | acción de conversión | `account_id`, `native_id`, `name`, `category`, `type`, `status`, `primary_for_goal`, `counting_type`, `attrs` jsonb |
| `ads_daily_campaign` | campaña × día | `account_id`, `campaign_id`, `day`, `platform`, `cost`, `impressions`, `clicks`, `conversions`, `conversions_value`, `all_conversions`, `ext` jsonb (cuota de impresiones y propias de Google), `synced_at`; único `(campaign_id, day)` |
| `ads_daily_conversion` | campaña × acción × día | `account_id`, `campaign_id`, `conversion_action_id`, `day`, `conversions`, `conversions_value`; único |
| `ads_campaign_status_daily` | campaña × día | `primary_status`, `primary_status_reasons` jsonb, `bidding_status`, `serving_status`, `budget_amount`, `recommended_budget`, `disapproved_ads` int, `limited_ads` int |
| `ads_change_events` | evento | `account_id`, `change_at`, `user_email`, `client_type`, `resource_type`, `resource_name`, `campaign_native_id`, `operation`, `changed_fields` jsonb, `old_value` jsonb, `new_value` jsonb; único `(account_id, resource_name, change_at)` |
| `ads_goals` | cliente × versión (NEG-01) | `client_id`, `version`, `kind` (`provisional`/`acordado`), `cpl_max`, `budget_min`, `budget_usual`, `budget_max`, `capacity_per_week`, `calendar` jsonb, `rules` jsonb, `data_quality` jsonb, `agreed_by`, `valid_from`, `frozen_baseline_from`, `frozen_baseline_to`, `notes` |
| `ads_findings` | hallazgo (uno por causa) | `account_id`, `campaign_id` (nullable), `kind` (lista cerrada de 15), `cause_key` (deduplica), `channel` (`interrupcion`/`parte`/`lote`/`revision`), `severity`, `title`, `evidence` jsonb, `exposure` (€), `confidence`, `status` (`abierto`/`resuelto`/`silenciado`/`descartado`), `first_seen_at`, `last_seen_at`, `resolved_at`, `silenced_until`, `notified_at` |
| `ads_finding_responses` | respuesta del gestor (7.4) | `finding_id`, `user_id`, `response` (ocho valores), `reason`, `created_at` |
| `ads_account_reviews` | cuenta × fecha | `account_id`, `reviewed_by`, `note`, `next_review_on` |

Los hallazgos van en tabla propia y **no** en `findings` del núcleo, porque `findings` cuelga de `project_id` (obligatorio)
y no tiene canal, exposición, silencios ni respuestas del gestor. Ampliarlo sería tocar el núcleo (protocolo) y afectaría
al SEO congelado. Queda anotado como candidato a unificar más adelante.

`ads_goals` vive en Ads (y no en el núcleo) de forma **provisional**: el documento de investigación lo propone en el
núcleo porque es de toda la agencia, pero Ads es hoy su único usuario y moverlo después es una migración aditiva más un
cambio de lectura. Queda en «Pendientes».

## 4. Descarga (paso 1)

| Proceso (cola de trabajos) | Cada cuánto | Qué hace | Operaciones aprox. |
|---|---|---|---|
| `ads.descubrir` (scope cuenta) | 24 h | Lista las cuentas bajo la MCC (`customer_client`), las crea o actualiza en `ads_accounts`, y vincula al cliente cuyo `client_assets` (`google_ads`) coincide con el `customer_id` | 1 |
| `ads.sincronizar` (por cuenta de Ads) | 6 h (07:00 la principal) | Estructura (campañas, acciones de conversión) + versiones de configuración; métricas de los últimos 10 días; conversiones por acción; estado del día | 5-6 |
| `ads.cambios` (por cuenta de Ads) | 6 h | `change_event` de los últimos 14 días (límite de la API: 30), desde el cursor | 1 |
| `ads.historico` (por cuenta de Ads) | hasta terminar | Métricas diarias hacia atrás por tramos de 90 días hasta `history_months` o hasta un tramo vacío | 1-2 por tramo |

Presupuesto de cupo: 25 cuentas × (6 + 1) × 4 = 700 operaciones al día más el histórico (≈ 13 tramos por cuenta, una vez).
Cabe en Explorer (2.880). Si `ads_api_usage.operations` supera `daily_ops_budget`, la descarga se para hasta el día
siguiente y MED-00 lo dice.

## 5. Salud de nuestras fuentes (MED-00)

- Cada proceso escribe `ads_sync_state` (éxito, fallo, fecha del último dato).
- `sourceHealth(accountId, source)` → `sana` / `atrasada` / `caida` / `sin_datos`, según `expected_every_minutes` × 2 y
  `consecutive_failures`.
- **Toda regla declara las fuentes de las que depende**; si alguna no está sana, la regla no afirma: devuelve «no
  comprobado» y la cabecera de Hoy lo cuenta («comprobadas 23 de 25 cuentas; 2 sin datos desde las 06:00»).
- `registerHealthCheck('ads', …)` para Salud del sistema; fallos repetidos a `reportError` (área `ads`).
- Hallazgo visible n.º 15 «Nuestra fuente está sin datos», al responsable técnico (Enric), nunca a Eury.

## 6. Hallazgos del paso 2 (lista cerrada, apartado 7.1)

| # | Hallazgo | Regla de partida (editable) | Fuentes | Canal |
|---|---|---|---|---|
| 1 | La cuenta no puede servir | Cuenta con gasto medio > 0 en 14 días y **0 impresiones ayer y hoy** en todas las campañas activas, o `primary_status` con motivo de facturación/suspensión | estado, métricas | interrupción |
| 2 | Anuncio rechazado con gasto | Campaña con anuncios rechazados (`disapproved_ads > 0`) y es la de más gasto de la cuenta o > 20 % del gasto | estado | interrupción / parte |
| 3 | Página de destino caída con gasto | URL final de una campaña con gasto que responde error en dos comprobaciones seguidas (rastreador del núcleo, `fetchPublic`) | rastreo_landing | interrupción |
| 4 | Campaña parada o gasto desbocado | Parada: campaña activa con gasto medio ≥ 5 €/día en 14 días y gasto 0 ayer (no explicado por pausa propia en el historial). Desbocada: gasto de hoy proyectado > 2 × su media diaria de 14 días y > 1,5 × presupuesto | métricas, cambios | interrupción |
| 6 | Algo pausado que aportaba leads | Campaña pausada en los últimos 7 días (historial) con ≥ 2 conversiones en sus 30 días previos | cambios, métricas | parte |
| 8 | Ritmo de gasto fuera de banda | Gasto del mes proyectado fuera de ±15 % del presupuesto de medios del acuerdo (o de la suma de presupuestos diarios × días si no hay acuerdo) | métricas, objetivos | parte |
| 11 | Cambio ajeno en algo con gasto | Cambio en el historial hecho por un usuario que no es de la agencia (dominio distinto de los configurados) o por Google (`client_type` de recomendaciones automáticas) en una campaña con gasto | cambios | parte |
| 12 | Medición rota | Acción de conversión primaria con ≥ 1 conversión al día de media en 28 días y **0 en los últimos N días**, con N calculado por Poisson para α = 1 % (apartado 5.1) | métricas por acción | parte |
| 15 | Nuestra fuente está sin datos | MED-00 | sync | interrupción (técnica) |

El resto de la lista cerrada (5, 7, 9, 10, 13, 14) llega en los pasos 4, 5 y 6.

**Tope de atención:** como máximo `max_interruptions_per_day` interrupciones al día por cuenta de la agencia (la tercera y
siguientes se agrupan en un único mensaje), solo dentro de `alert_hours`; el parte de la mañana muestra 5 con decisión + 3
«para que lo sepas» y «N más por debajo del corte». **Modo sombra:** hasta que Enric lo encienda, los hallazgos se guardan
y se ven en Hoy pero **no se envían** por Telegram (la investigación pide sombra y no estrenar avisos en Navidad).

**Respuestas del gestor (7.4):** `hecho`, `lo hago yo`, `esperando al cliente` (con fecha), `el cliente lo quiere así`,
`ya lo sabía`, `no es un problema` (con motivo), `posponer` (1/7/28 días, máx. 2), `encargar` (crea encargo; paso 3).

## 7. Cartera

Una fila por cuenta seguida: cliente y nivel (A/B/C), gasto del mes y ritmo (proyección frente a presupuesto), CPL de 30
días frente a objetivo (o «frente a su línea base, sin objetivo de negocio» si es provisional), conversiones de 7 días,
estado de la medición (`rota` / `sin conciliar todavía`), hallazgos abiertos, último cambio (fecha y autor), última
revisión humana y próxima. En gris lo no comprobado (MED-00).

**Objetivo provisional congelado (2.2):** botón «Fijar objetivo provisional» por cliente: mediana del CPL diario de los 90
días previos (días con conversiones), congelada, marcada como supuesto. Una cuenta con objetivo provisional no puede ser
nivel A.

## 8. Permisos

- Ver Hoy, Cartera y Cuenta: `view`. Responder a hallazgos, fijar objetivo provisional, marcar revisión: `edit`.
- Ajustes, credenciales, vincular cuentas y encender avisos: `admin`.
- Las credenciales nunca viajan al navegador (solo `hasCredentials: boolean` y el correo de la cuenta de servicio
  enmascarado).

## 9. Pruebas

- Unitarias de reglas (puras) y de Poisson.
- Contrato GOO-07: traducción de respuestas grabadas de la API (`tests/fixtures/ads/*.json`, escritas desde la
  documentación; marcadas «no grabadas de una cuenta real» hasta la prueba de acceso).
- Sincronización completa en modo simulado contra la base de desarrollo.
- Seguridad: acciones nuevas en `tests/seguridad.test.ts`; guardrails: solo `lib/ads/client.ts` contiene la URL de la API.
- Pantallas: entran solas en `pantallas-*`.

## 10. Mapa Visual y comprobación

`lib/ads/process-map.ts` (`ADS_PROCESS_MAP`), nodo `ads` en `registry.ts` (deja de ser futuro), `'ads'` en
`PROCESS_MAP_IDS` y en la lista `known` de `scripts/check-architecture-map.js`, con un bloque que exige que todas las
tablas `ads_*`, los tipos de trabajo `ads.*` y la tarea del planificador estén en el mapa.

## 11. Pendientes y riesgos

- Prueba de acceso real (paquete A): hasta entonces, modo simulado. Las consultas GAQL se validan contra la documentación
  v26; los nombres de campo pueden necesitar ajuste tras la primera respuesta real.
- `ads_goals` y `ads_findings` en Ads y no en el núcleo: candidatos a unificar.
- El rastreo de landings usa `fetchPublic` del núcleo; landings en embudos de GoHighLevel se rastrean igual si son públicas.

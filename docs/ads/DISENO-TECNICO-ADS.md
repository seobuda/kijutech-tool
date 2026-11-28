# Diseño técnico del módulo Google Ads (pasos 1 y 2)

**Fecha:** 28 nov 2026 · **Versión:** 2 (auditoría R5 aplicada; tabla de seguimiento al final) · **Estado:** paso 1 en
construcción en `feature/ads-paso1`; paso 2 diseñado · **Base:** `docs/ads/INVESTIGACION-GOOGLE-ADS.md` v3 (apartados
5.1, 7, 8, 9 y 13.2) · **Auditoría:** `docs/ads/investigacion/revision/R5-auditoria-diseno-tecnico.md` (3 graves, 12
importantes, 16 menores) · **Encargo:** Enric, 28 nov: «Empieza a construir toda la herramienta, tienes permiso para todo
lo referente a este módulo».

## 0. Alcance de este documento

Pasos 1 y 2 del orden de construcción (13.2):

- **Paso 1:** conexión con la API, almacén propio, descarga del histórico, fotos diarias (estado, configuración, políticas,
  URL de destino, historial de cambios), **latido horario**, **cobertura por cuenta y día** y **salud de nuestras fuentes
  (MED-00)**.
- **Paso 2:** pantalla **Cartera**, pantalla **Hoy** (cabecera de cobertura real), las **cuatro interrupciones** (campaña
  parada o desbocada, rechazo con gasto, landing caída con gasto, la cuenta no puede servir), ritmo de gasto, CPL frente a
  objetivo o frente a su línea base, medición rota («rota» / «sin datos para afirmar»), lo pausado que aportaba leads, el
  cambio ajeno y el último cambio con su autor.

Los pasos 3 en adelante tendrán su propio documento. **Los pasos 3-4 (términos, palabras, nivel de calidad) sí necesitarán
el acceso Basic** (9.1): «cabe en Explorer» vale solo para los pasos 1-2.

**Lo que sigue siendo línea roja aunque Enric haya dado permiso general al módulo** (CLAUDE.md, «si roza una línea roja,
se trata como línea roja»): cualquier **escritura en cuentas reales de Google Ads** (paquete C), **subir datos de leads a
Google** (paquete D), instalar scripts en la MCC, **cambiar los accesos de la MCC o de una cuenta** (incluido añadir la
cuenta de servicio: lo hace Enric en el paquete A, nunca la herramienta), enviar mensajes a clientes y añadir
dependencias. En estos pasos **todo es lectura**: la herramienta no tiene ni una función que escriba en Google Ads.

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
| A | **Cuenta de servicio de Google Cloud**, su clave JSON guardada cifrada en `ads_settings`; la herramienta firma el JWT (RS256 con `node:crypto`, sin dependencias) y pide el token | Bajo: ~80 líneas | Bajo: no toca Agentes ni el núcleo | Nada; recomendada por los informes 04 y 10 |
| D | **Refresh token OAuth propio del módulo Ads**: cliente OAuth del mismo proyecto de Cloud, autorizado una vez por un **buzón de la agencia que no es de ningún empleado** (p. ej. `ads@…`) con acceso de lectura a la MCC | Medio: pantalla de autorización propia | Medio: con la pantalla de consentimiento en «Testing» el token caduca a los **7 días** (hay que dejarla «Interna» o «En producción»); el buzón pide doble factor una vez | Nada técnico; depende de un buzón que hay que custodiar |
| B | Añadir `adwords` a la conexión de Google de Agentes y publicar `registerAdsAuth` en el núcleo | Medio-alto: toca Agentes y el núcleo, obliga a reautorizar | Medio: una reautorización mal hecha corta Search Console/GA4/GBP de todos los clientes | Depende del usuario que autorizó. **Descartada** |
| C | No hacer nada hasta la prueba de acceso (paquete A) | 0 | 0 | Una semana; el almacén y las pantallas se pueden construir ya con datos simulados. No es alternativa de autenticación: se usa como **modo simulado** mientras tanto |

**Decisión: A**, con **D como plan de reserva real** si la prueba de acceso con cuenta de servicio falla o la política de
la organización no se puede excepcionar. Mientras no hay acceso, **modo simulado** (credencial `SIM`) que genera cuentas y
datos deterministas para desarrollo, pruebas y pantallas. A diferencia del `SIM:` de ClickUp (que solo impide salir a
internet), el de Ads **sí genera datos**, por eso lleva sus propias barreras (§3.4).

**Cuestionada tres veces.**
1. *¿Cumple el objetivo final?* Sí: el agente necesita una credencial estable 24/7 que no caduque con un empleado; la
   cuenta de servicio es la recomendación oficial para procesos de servidor.
2. *¿Coste oculto a semanas vista?* (a) Una cuenta de servicio entra por la MCC → se añade a la MCC (lo hace Enric) y se
   envía `login-customer-id`. (b) El *developer token*: el campo existe, es opcional y **se envía siempre que esté
   guardado**. (c) Rotación de la clave: el formulario permite sustituirla; se guarda la fecha de alta y Salud avisa a los
   300 días. (d) **La clave no caduca y da poder sobre todas las cuentas**: la de lectura **nunca se sube de rol**; la
   escritura (paquete C, decisiones 9/10) irá con **otra cuenta de servicio**.
3. *¿Hay algo que ya tenemos y no usamos?* El cifrado (`lib/ai/encryption.ts`), el registro de errores (`reportError`),
   `registerHealthCheck`, la cola de trabajos y la ficha del cliente (`client_assets` tipo `google_ads`): se usan todos.

**Detalle del flujo (comprobado contra la documentación, R5 I1).** JWT con cabecera `{"alg":"RS256","typ":"JWT","kid":
<private_key_id>}`, reclamaciones `iss` = `client_email`, `scope` = `https://www.googleapis.com/auth/adwords`, `aud` =
`token_uri`, `iat`, `exp` = `iat` + 3600, **sin `sub`** (no hay delegación de dominio). `POST token_uri` con
`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=…`. Token cacheado por proceso hasta 60 s antes de
caducar (web y trabajador lo piden por separado). Cada petición: `Authorization: Bearer`, `login-customer-id` = MCC sin
guiones, `developer-token` si está guardado.

**«Probar conexión» enseña el error literal de Google** (sin secretos), para distinguir `DEVELOPER_TOKEN_*`,
`USER_PERMISSION_DENIED` (falta `login-customer-id` o la cuenta de servicio no está en la MCC) y `AUTHORIZATION_ERROR` del
proyecto (problema conocido citado en 9.1).

**Lo no verificado:**
- Que la API acepte cuentas de servicio añadidas a la MCC sin *developer token* (documentación de sep 2026, sin probar).
- **Política de la organización de Cloud.** Las organizaciones creadas desde mayo de 2024 aplican por defecto
  `iam.disableServiceAccountKeyCreation`. Si el proyecto cuelga de la organización del Workspace de Kijutech, la consola no
  dejará descargar la clave: Enric (administrador) crea una excepción de esa política **solo para el proyecto de Ads**.
  Añadido al paquete A en `docs/PENDIENTES-ENRIC.md`. Si no se puede, se pasa a D.

## 2. Estructura de archivos (`lib/ads/`)

| Archivo | Qué hace | Paso |
|---|---|---|
| `client.ts` | **Único archivo con `googleads.googleapis.com`** (barrera en guardrails). JWT de la cuenta de servicio, caché del token, `runQuery(customerId, consulta)`, contador de operaciones por día **en hora del Pacífico**, reintentos ante `RESOURCE_TEMPORARILY_EXHAUSTED`/429/5xx con la espera que trae el error, parada sin reintento ante `RESOURCE_EXHAUSTED` (cupo del día), errores en español (`AdsApiError`) con el código literal de Google, versión configurable (por defecto `v26`), modo simulado. Nunca pone el JWT, el token ni el cuerpo de la petición de token en un mensaje de error | 1 |
| `sim.ts` | Datos simulados deterministas (semilla por cuenta y día): 6 cuentas, campañas de búsqueda y PMax, histórico con estacionalidad semanal, conversiones por acción, historial de cambios, estados, políticas, URL de destino y horas de hoy. **Devuelve filas con la forma de la API** para que la traducción de `queries.ts` se ejercite igual. Nunca sale a internet | 1 |
| `queries.ts` | Las consultas GAQL (texto) y su traducción a filas nuestras (puro; pruebas de contrato con respuestas escritas desde la documentación, §9) | 1 |
| `rules.ts` | Cálculos puros del paso 1: normalizar el id de cliente, ventana de cobertura, hora del Pacífico, clasificación de autores del historial, estado de una fuente | 1 |
| `store.ts` | Lectura y escritura de tablas `ads_*` (sin lógica de negocio) | 1 |
| `settings.ts` | `ads_settings`: valores por defecto, lectura, guardado con límites, credenciales cifradas y validación de la clave | 1 |
| `sync.ts` | Descarga: cuentas de la MCC, estructura y configuración, métricas (10 días), conversiones por acción, cobertura, histórico por tramos, historial de cambios, fotos de estado y políticas, URL de destino, latido horario | 1 |
| `health.ts` | **MED-00**: estado por cuenta y fuente, cobertura de una ventana, `registerHealthCheck`, `sourceHealth()` para las reglas, cabecera de cobertura | 1 |
| `register.ts` | Registro en el núcleo: tipos de trabajo, procesos, tarea del planificador, comprobación de salud. Se llama desde `wireApp()` (`lib/app-wiring.ts`) | 1 |
| `process-map.ts` | `ADS_PROCESS_MAP` para el Mapa Visual | 1 |
| `actions.ts` | Acciones `'use server'` con guard (ajustes, credenciales, probar conexión, descarga, vincular cuenta, nivel) | 1 (y 2) |
| `access.ts` | `server-only`: funciones internas que no deben exportarse desde `'use server'` | 1 |
| `rules/` | Reglas puras de los hallazgos del paso 2, con pruebas unitarias | 2 |
| `findings.ts` | Evalúa las reglas con su ventana y su cobertura, guarda `ads_rule_runs` y `ads_findings`, deduplica por causa, aplica precedencia, silencios y tope de atención | 2 |
| `alerts.ts` | Interrupciones por `telegramOutbound().notifyOwner` en modo sombra (ver §6.4) | 2 |
| `landing.ts` | Comprobación de las URL de destino con `safeFetcher` del núcleo (`lib/core/crawler.ts`) | 2 |

Pantallas: `app/(dashboard)/dashboard/ads/` → `page.tsx` (Hoy; en el paso 1, cabecera de cobertura y estado de la
descarga), `ajustes/` (admin), y en el paso 2 `cartera/` y `cuentas/[accountId]/` (expediente mínimo: línea de tiempo de
cambios y hallazgos). Entrada «Google Ads» en el menú (grupo Clientes).

## 3. Tablas (migración aditiva `0084_ads_cimientos.sql`)

Una sola migración para los pasos 1 y 2 (las tablas del paso 2 se crean ya, vacías, para no migrar dos veces).

**Principios (8.1 + R5):** **`tenant_id` en todas**, con índices que empiezan por él donde se filtra; columna `platform`
(`'google'`); identificadores nativos; conversiones `numeric(14,4)`; dinero `numeric(14,2)` **en la moneda de la cuenta**
(las reglas con euros fijos usan la moneda de la cuenta y Cartera no suma entre monedas distintas); fechas `date` en la
zona de la cuenta; los momentos (`timestamptz` cuando vienen de Google con zona local).

### 3.1 Cero frente a «sin dato» (R5 G1)

La API **no devuelve fila** para una campaña sin impresiones un día (guía «Zero metrics») [verificar en v26]. Por eso:

- `ads_daily_coverage` (cuenta de Ads × día) dice si un día está **completo**. Una sincronización de métricas marca
  `complete = true` para el día D solo si (a) terminó después del cierre de D en la zona de la cuenta más 3 h de retraso de
  la fuente y (b) la **consulta de control** cuadra: el total de la cuenta pedido a `customer` (sin segmentar por campaña)
  coincide con la suma de las filas de campaña (±1 % en coste y en impresiones, con un margen absoluto de 1 unidad).
- **Para un día cubierto**, la ausencia de fila de una campaña que estaba activa ese día **es 0**. **Para un día no
  cubierto**, es «sin dato» y la regla devuelve «no comprobado».
- Las reglas declaran la **ventana de días** (y de horas) que necesitan, no solo la fuente; `windowCoverage()` comprueba
  la cobertura de esa ventana.
- Esa consulta de control es el «dato bueno no es "no dio error"» que pide MED-00.

### 3.2 Tablas del paso 1

| Tabla | Granularidad | Columnas principales |
|---|---|---|
| `ads_settings` | tenant (PK) | `mcc_customer_id`, `auth_mode` (`none`/`service_account`/`sim`), `credentials_encrypted` + `credentials_iv`, `credentials_hint` (correo enmascarado y `private_key_id` corto), `credentials_added_at`, `developer_token_encrypted` + `_iv` (opcional), `api_version` (`v26`), `api_version_sunset` (fecha de retirada, para el aviso de 60 días de GOO-07), `sync_enabled`, `daily_ops_budget` (2.500), `history_months` (37), `ai_monthly_cap_usd` (25), `alerts_enabled` (falso = modo sombra), `alert_hours` (`09:00-19:00`), `alert_days` (`1,2,3,4,5`), `max_interruptions_per_day` (2, **por persona**), `agency_email_domains`, `agency_user_emails` (jsonb), `state` jsonb, `updated_at`, `updated_by` |
| `ads_accounts` | tenant × plataforma × cuenta | `platform`, `customer_id` (10 dígitos), `name`, `currency`, `time_zone`, `status`, `is_test`, `simulated`, `tracked`, `client_id` (FK `clients` **ON DELETE SET NULL**), `linked_by` (`ficha`/`manual`), `link_note` (conflicto), `auto_tagging`, `first_seen_at`, `last_seen_at`. Único `(tenant_id, platform, customer_id)` |
| `ads_clients` | tenant × cliente | `level` (`A`/`B`/`C`), `updated_by`. **El nivel es del cliente, no de la cuenta** (R5 I12): un cliente con dos cuentas tiene un nivel. Candidato al núcleo junto a `ads_goals` |
| `ads_sync_state` | tenant × cuenta de Ads × fuente | `scope_key` (`''` para lo de la MCC), `account_id` (nullable), `source` (`descubrir`, `estructura`, `metricas`, `historico`, `cambios`, `latido`, `landing`), `last_ok_at`, `last_attempt_at`, `last_data_date`, `cursor` jsonb, `expected_every_minutes`, `consecutive_failures`, `last_error`. Único `(tenant_id, scope_key, source)` |
| `ads_api_usage` | tenant × día **del Pacífico** | `operations`, `errors`, `last_error`. PK `(tenant_id, day)` |
| `ads_budgets` | presupuesto | `native_id`, `name`, `amount`, `period` (diario / total), `explicitly_shared`, `delivery_method`, `status`, `reference_count`. Único `(account_id, native_id)`. **Las sumas por cuenta se hacen sobre presupuestos, no sobre campañas** (un compartido sale entero en cada campaña que lo usa) |
| `ads_campaigns` | campaña | `native_id`, `name`, `channel_type`, `channel_subtype`, `status`, `serving_status`, `primary_status`, `bidding_strategy_type`, `bidding_strategy_native_id` (cartera), `budget_native_id`, `target_cpa`, `target_roas` (de `maximize_conversions`, `target_cpa`/`target_roas` o la estrategia de cartera), `start_date`, `end_date`, `ad_schedule` jsonb (`campaign_criterion` tipo `AD_SCHEDULE`), `attrs`. Único `(account_id, native_id)`. **Sin `final_urls`** (la campaña no tiene URL final: van en `ads_landing_urls`) |
| `ads_config_versions` | entidad × periodo | `entity_type` (`cuenta`, `campana`, `presupuesto`, `estrategia`, `accion_conversion`), `entity_native_id`, `valid_from`, `valid_to` (null = vigente), `snapshot`, `hash`. Único parcial `(account_id, entity_type, entity_native_id) WHERE valid_to IS NULL` |
| `ads_conversion_actions` | acción de conversión | **`resource_name` como clave de texto** (las acciones propiedad de la MCC traen `customers/<MCC>/…` y no aparecen al listar la cuenta hija; se dan de alta al verlas), `native_id`, `owner_customer_id`, `name`, `category`, `type`, `status`, `primary_for_goal`, `include_in_conversions`, `counting_type`. Único `(account_id, resource_name)` |
| `ads_daily_campaign` | campaña × día | `cost`, `impressions`, `clicks`, `conversions`, `conversions_value`, `all_conversions`, `conversions_by_conv_date`, `ext` jsonb (cuota de impresiones), `synced_at`. Único `(campaign_id, day)`; índice `(account_id, day)` |
| `ads_daily_conversion` | campaña × acción × día | `conversion_action` (resource name, sin FK obligatoria), `conversions`, `all_conversions`, `conversions_value`, `conversions_by_conv_date`, `all_conversions_by_conv_date`. Único `(campaign_id, conversion_action, day)` |
| `ads_daily_coverage` | cuenta × día | `synced_at`, `complete`, `control_cost`, `control_impressions`, `rows_cost`, `rows_impressions`, `note`. PK `(account_id, day)` |
| `ads_hourly_campaign` | campaña × día × hora | `impressions`, `clicks`, `cost`, `conversions`, `synced_at`. Se guardan 60 días. Único `(campaign_id, day, hour)` |
| `ads_campaign_status_daily` | campaña × día | `status`, `primary_status`, `primary_status_reasons`, `serving_status`, `bidding_status`, `budget_amount`, **`observations`** y **`worst_primary_status`** (la peor foto del día: un problema de 10:00 a 15:00 no se pierde). Sin `recommended_budget` (obsoleto; la vía es `recommendation`, paso 3) |
| `ads_ad_group_policy_daily` | grupo de anuncios × día | `entity_kind` (`ad_group`/`asset_group`), `ad_group_native_id`, `campaign_id`, `name`, `ads_total`, `ads_approved` (incluye `APPROVED_LIMITED`), `ads_limited`, `ads_disapproved`, `keywords_disapproved`. Se guarda **la peor del día** (máximo de rechazos, mínimo de aprobados) |
| `ads_change_events` | evento | **`event_resource_name`** (único por cuenta: `customers/{id}/changeEvents/{marca}~{orden}~{mutación}`), `change_at` **timestamptz** convertido con la zona de la cuenta, `change_at_local` (texto original), `user_email`, `client_type` (tal cual), `actor_class` (`agencia`/`cliente`/`google`/`herramienta`/`desconocido`), `resource_type`, `changed_resource`, `campaign_native_id`, `operation`, `changed_fields`, `old_value`, `new_value`. Único `(account_id, event_resource_name)`; índice `(account_id, change_at DESC)` |
| `ads_landing_urls` | cuenta × URL normalizada | `url`, `origins` (`anuncio`/`enlace_sitio`/`grupo_recursos`/`expandida`), `campaign_native_ids`, `cost_7d`, `clicks_7d`, `first_seen_at`, `last_seen_at`, y para el paso 2 `last_check_at`, `last_check_status`, `last_check_ok`, `consecutive_failures`. Alimentada por `landing_page_view` + `expanded_landing_page_view` (traen el gasto por URL) |

**Red y dispositivo (R5 I12).** `ads_daily_campaign` es campaña × día **sin** segmentos. El detalle por red y dispositivo
(paso 6) irá en una tabla de extensión (`ads_daily_campaign_segment`) que **nunca se suma con la principal**. Queda escrito
para que nadie cuente dos veces.

**Campañas eliminadas (R5 I10).** La consulta de métricas trae también `campaign.id`, `name`, `status` y
`advertising_channel_type`; el guardado da de alta la campaña si no existe (con su estado `REMOVED`), así el histórico de
37 meses no pierde las campañas ya borradas.

### 3.3 Tablas del paso 2 (se crean ya, vacías)

| Tabla | Granularidad | Columnas principales |
|---|---|---|
| `ads_goals` | cliente × versión (NEG-01) | `client_id`, `version`, `kind` (`provisional`/`acordado`), `cpl_max`, `budget_min`, `budget_usual`, `budget_max`, `capacity_per_week`, `calendar`, `rules`, `data_quality`, `agreed_by`, `valid_from`, `frozen_baseline_from`, `frozen_baseline_to`, `notes`. Único `(client_id, version)` |
| `ads_findings` | hallazgo (uno por causa y episodio) | `account_id` **nullable** y `scope` (`cuenta`/`campana`/`agencia`: el hallazgo 15 cuando cae la credencial es una sola causa para todas), `campaign_id`, `kind` (**CHECK con la lista cerrada de 15**), `cause_key`, `episode_started_at`, `channel`, `recipient` (`gestor`/`tecnico`), `severity`, `title`, `evidence`, `exposure`, `currency`, `confidence`, `status` (`abierto`/`resuelto`/`silenciado`/`descartado`), `first_seen_at`, `last_seen_at`, `last_checked_at`, `unchecked_since`, `resolved_at`, `silenced_until`, `notified_at`, `notify_state`. Único parcial `(tenant_id, cause_key) WHERE status IN ('abierto','silenciado')` |
| `ads_finding_responses` | respuesta del gestor (7.4) | `finding_id`, `user_id`, `response` (ocho valores), `reason`, `until`, `created_at` |
| `ads_rule_runs` | cuenta × regla (última evaluación) | `scope_key`, `account_id`, `rule`, `evaluated_at`, `outcome` (`ok`/`hallazgo`/`no_comprobado`), `reason`, `data_through`. **La cabecera de Hoy lee de aquí** |
| `ads_account_reviews` | cuenta × revisión | `reviewed_by`, `note`, `reviewed_at`, `next_review_on` |

Los hallazgos van en tabla propia y **no** en `findings` del núcleo, porque `findings` cuelga de `project_id` (obligatorio)
y no tiene canal, exposición, silencios ni respuestas del gestor. Candidato a unificar más adelante.

`ads_goals` y `ads_clients` viven en Ads (y no en el núcleo) de forma **provisional**: la investigación los propone en el
núcleo porque son de toda la agencia, pero Ads es hoy su único usuario y moverlos después es una migración aditiva más un
cambio de lectura. Pendiente.

### 3.4 Modo simulado: barreras (R5 I11)

- `ads_accounts.simulated = true` en todo lo que genera `sim.ts`. Las cuentas simuladas **nunca se vinculan a un cliente**
  (ni por la ficha ni a mano), **nunca generan avisos** y las pantallas las pintan con la banda «SIMULADO».
- No se puede activar `SIM` si ya hay cuentas reales descargadas en esa cuenta de la herramienta.
- Al pasar de `sim` a `service_account`, las cuentas simuladas **se ocultan** (`tracked = false` y filtro por
  `simulated`), no se borran.
- Pendiente para Enric: no activar `SIM` en producción (no hay forma fiable de saber desde el código si es producción).

## 4. Descarga (paso 1)

Todos los procesos son por **cuenta de Ads** con `scopeType: 'cuenta'` y `scopeId` = id de `ads_accounts` (`jobs.scope_type`
solo admite `proyecto`/`cliente`/`cuenta`; no se crea un tipo nuevo, que sería tocar el núcleo). `ads.descubrir` usa
`scopeId = ''` (la MCC).

| Proceso (cola de trabajos) | Cada cuánto | Qué hace | Operaciones |
|---|---|---|---|
| `ads.descubrir` | 24 h | `customer_client` de la MCC (sin sub-MCC, sin cuentas de prueba: `manager = false`, `test_account = false`; las no activas se guardan sin seguir), alta o actualización en `ads_accounts`, **vínculo con la ficha** (§4.1), alta o baja de los procesos de cada cuenta y encola el histórico de las cuentas nuevas | 1 |
| `ads.estructura` | 24 h (y cuando `ads.cambios` ve cambios de estructura) | `customer` (estado, moneda, zona, autoetiquetado), campañas con su configuración, presupuestos, estrategias de cartera, programación de anuncios, acciones de conversión, políticas por grupo de anuncios, palabras rechazadas y URL de destino con gasto de 7 días; versiones de configuración | ~9 |
| `ads.sincronizar` | 6 h, más una a las **06:30 de Madrid** por la tarea del planificador (con comprobación de reloj; `job_schedules` deriva la hora) | Métricas de campaña de los últimos 10 días (con los campos de campaña), conversiones por acción (fecha de clic y de conversión), **consulta de control** y cobertura, foto de estado del día | 4 |
| `ads.cambios` | 6 h | `change_event` desde el cursor **menos 1 día de solape** (no «14 días» cada vez), `ORDER BY change_event.change_date_time`, `LIMIT 10000`; si vuelven 10.000, sigue desde la última hora vista; la clave única deduplica. Si ve cambios de estructura, encola `ads.estructura` | 1-2 |
| `ads.latido` | 60 min, **solo entre las 07:00 y las 23:00 de la zona de la cuenta** | `campaign` × `segments.hour` de hoy → `ads_hourly_campaign`; borra lo de más de 60 días | 1 |
| `ads.historico` | hasta terminar (se reencola solo) | Métricas, conversiones y control **hacia atrás por tramos de 90 días** (por memoria y tiempo máximo, no por cupo) hasta `history_months`. **No para en un tramo vacío** (un cliente de temporada puede tener meses parados) | 3 por tramo |

**Cupo (R5 I9).** 25 cuentas × (4 × 4 + 9 + 4 × 1,5 + 16 latidos) ≈ **1.175 operaciones al día**, más el histórico una vez
(~13 tramos × 3 × 25 ≈ 975, repartido). Cabe en Explorer (2.880) y bajo `daily_ops_budget` (2.500). Si
`ads_api_usage.operations` alcanza `daily_ops_budget`, la descarga para hasta el reinicio (medianoche **del Pacífico**
[verificar]) y MED-00 lo dice. Recordatorio: **los pasos 3-4 sí necesitan Basic**.

### 4.1 Vínculo con la ficha del cliente (R5 menor 9)

`client_assets.value` es texto libre. Se normaliza a 10 dígitos al comparar («123-456-7890», «1234567890» o una URL con
`ocid`/`__c` no cuentan: solo los 10 dígitos). Se leen **todos** los activos `google_ads` (no solo el principal). Si dos
clientes reclaman el mismo id, no se vincula y se anota el conflicto (`link_note`) para la pantalla de ajustes. El vínculo
`ficha` se recalcula en cada `ads.descubrir`; el `manual` (desde Ajustes) se respeta.

## 5. Salud de nuestras fuentes (MED-00)

- Cada proceso escribe `ads_sync_state` (éxito, fallo, fecha del último dato).
- Frescura esperada (editable en código, valores de partida de la investigación): `latido` 120 min en horario de anuncios,
  `metricas` 6 h, `estructura` y `descubrir` 24 h, `cambios` 6 h.
- `sourceHealth(state, now)` → `sana` / `atrasada` / `caida` / `sin_datos` según el doble de la frescura esperada y los
  fallos seguidos. **`cambios` atrasada más de 7 días es crítica** (aviso técnico): pasados 30 días lo perdido no vuelve.
- `windowCoverage(días cubiertos, desde, hasta)` → si la ventana que pide una regla está completa.
- **Toda regla declara fuentes y ventana**; si algo no está sano o cubierto, la regla no afirma: guarda `no_comprobado` en
  `ads_rule_runs` y la cabecera de Hoy lo cuenta («comprobadas 23 de 25 cuentas; 2 sin datos desde las 06:00»). En el
  paso 1 la cabecera se calcula con la salud de las fuentes de cada cuenta.
- `registerHealthCheck('ads', …)` para Salud del sistema, con: fuentes caídas, cupo cerca del límite, credencial con más
  de 300 días y versión de la API a menos de 60 días de su retirada (GOO-07). Fallos repetidos a `reportError` (área `ads`).
- El hallazgo 15 (paso 2) sale al responsable técnico y **no se duplica** con `reportError` (que ya avisa por Telegram): en
  el paso 1 solo existe el registro de errores; en el paso 2 se elige el hallazgo y se deja de llamar a `reportError` para
  esa causa.
- **MED-06** (curva de madurez) se calcula en el paso 5 con `segments.conversion_lag_bucket` sobre el histórico
  [verificar]: no requiere recogida diaria.

## 6. Hallazgos del paso 2 (lista cerrada, apartado 7.1)

Las reglas toman **literalmente** PRO-01, PRO-05, PRO-07, PRO-08, PRO-13 y 5.1 de la investigación; cada desviación va
justificada. Umbrales editables; todo en la **moneda de la cuenta**.

| # | Hallazgo | Regla de partida | Fuentes · ventana y cobertura que necesita | Canal |
|---|---|---|---|---|
| 1 | La cuenta no puede servir | (a) `customer.status` en `SUSPENDED`/`CANCELED`/`CLOSED`, o `serving_status` de todas las campañas activas en `SUSPENDED`/`ENDED`; (b) **0 impresiones en las últimas 3 horas de servicio en todas las campañas activas** cuando el mismo tramo de las 4 semanas anteriores (mismo día de la semana) tuvo ≥ 20 impresiones en total; nunca fuera del horario programado de las campañas. Sin rama de «facturación» por `primary_status_reasons` (la API no da alertas de pago, 9.2; eso es MED-14) | estructura (24 h), latido · 3 horas de servicio cubiertas + 4 semanas de horas | interrupción |
| 2 | Anuncio rechazado con gasto | Grupos de anuncios activos con gasto en 14 días que **hoy no tienen ningún anuncio aprobado** (`APPROVED`/`APPROVED_LIMITED`), o grupo de recursos de PMax rechazado, o palabras clave rechazadas (`ad_group_criterion.approval_status`) con gasto. Canal según el gasto expuesto: interrupción si es la campaña que más gasta o > 20 % del gasto de la cuenta; si no, parte | estructura (políticas, peor foto del día), métricas · 14 días cubiertos | interrupción / parte |
| 3 | Página de destino caída con gasto | URL de `ads_landing_urls` con gasto en 7 días que falla en **dos comprobaciones seguidas con al menos 10 min entre ellas**. Cuenta como caída: DNS, TLS, conexión rechazada o agotada, 5xx, 404 y 410; **403/429 → «no comprobable»** (cortafuegos ante un bot). `fetchPublic` lanza en errores de red: se captura como caída, no como fallo del proceso. Gasto expuesto por hora | landing (60 min en horario de anuncios), estructura | interrupción |
| 4 | Campaña parada o gasto desbocado | **Parada:** campaña activa, dentro de su horario programado y antes de su fecha de fin, con 0 impresiones en las últimas 3 horas de servicio cuando el mismo tramo del mismo día de la semana (4 semanas) tuvo ≥ 20; o impresiones/clics −70 % frente al mismo día de la semana anterior con suelo. **Desbocada:** acumulado de hoy hasta esta hora > 1,5 × el acumulado típico hasta esta hora del mismo día de la semana **y** ≥ 1,5 × presupuesto diario **sin conversiones cuando se esperaba alguna**; o acumulado de 3 días > 1,3 × (3 × presupuesto). Suelo en moneda (5/día). No se usa «> 2 ×» (Google ya corta en 2 ×) | latido, métricas, estructura, cambios · horas de hoy + 4 semanas de horas + 14 días | interrupción |
| 6 | Algo pausado que aportaba leads | Entidad pausada o con fecha de fin vencida que en los 60 días previos aportaba **más del 10 % de los leads de la cuenta**; aviso a los **3 días**, con quién la pausó. Una pausa nuestra cuenta, pero solo como «para que lo sepas», nunca como decisión (resuelve el choque con el silencio de 14 días tras un cambio propio, 7.3) | cambios, métricas · 60 días cubiertos | parte |
| 8 | Ritmo de gasto fuera de banda | Proyección a fin de mes fuera de **±10 %** del presupuesto mensual de medios del acuerdo (`ads_goals`); **a partir del día 5** (antes, presupuesto esperado al día); sin acuerdo, suma de **presupuestos** (no de campañas: los compartidos cuentan una vez) por los días que cada campaña está activa en el mes. «Presupuesto agotado antes de las 14:00» con el dato horario | métricas, estructura, latido, objetivos · mes en curso cubierto | parte |
| 11 | Cambio ajeno en algo con gasto | Cambio de autor `cliente` o `google` (PRO-08: `agencia`/`cliente`/`google`/`herramienta`, con `agency_email_domains` y `agency_user_emails`) en una entidad con gasto en 14 días. Ráfaga de cambios o usuario nuevo, como evidencia | cambios · cursor al día | parte |
| 12 | Medición rota | Ver §6.1 | métricas por acción · 8 semanas + ventana cubiertas | parte |
| 15 | Nuestra fuente está sin datos | MED-00 | sync | interrupción (técnica) |

El resto de la lista cerrada (5, 7, 9, 10, 13, 14) llega en los pasos 4, 5 y 6.

### 6.1 Regla 12, medición rota (R5 G2; sustituye a la versión con Poisson)

A diario **solo a nivel de cuenta**; por campaña, semanal (5.1 punto 4). Para cada acción primaria con **≥ 30 conversiones
en 8 semanas**:

- μ = clics de la ventana × tasa de conversión de las **8 semanas previas**, contadas **por fecha de conversión**
  (`conversions_by_conversion_date` por acción: sin retraso de atribución, así los días recientes no parecen rotos por
  inmadurez [verificar nombres en v26]).
- P(0) = (k / (k + μ))^k, **binomial negativa**; k estimado de la cuenta con su histórico (k = 2 si no hay datos para
  estimarlo).
- Solo se evalúa si los **clics de la ventana están dentro de su banda habitual**; si no, la causa es de entrega (reglas
  1/4) y la regla 12 no habla.
- Umbral de partida α = 0,1 %, **calibrado en sombra** repitiendo 90 días de histórico hasta que las falsas alarmas quepan
  en el presupuesto de atención (5.1 punto 5). Hasta entonces no se envía nada.
- Por debajo de 30 conversiones en 8 semanas: «sin datos para afirmar», **nunca «rota»** (la protección en esas cuentas
  es MED-18/MED-17, paso 5).

Con números (R5): λ = 1/día y α = 1 %, Poisson daba 5 días; con k = 2 la probabilidad real de 5 días a cero en una cuenta
sana es 8,2 % y hacen falta 19 días para el 1 %. Por eso Poisson queda descartado.

### 6.2 Precedencia de causas (R5 G2)

**15 (nuestra fuente) > 1 (cuenta) > 4 (campaña parada) > 3 (landing) > 2 (rechazo) > 12 (medición) > 8 / 6 / 11.** Una
regla de rango inferior no se emite sobre la misma cuenta o campaña mientras haya abierta una de rango superior: queda como
evidencia dentro de esta.

### 6.3 Ciclo de vida (R5 I7)

- `ads_rule_runs` guarda el resultado de cada regla y cuenta (`ok` / `hallazgo` / `no_comprobado`).
- Un hallazgo abierto **solo se resuelve** si la regla se evaluó con fuentes sanas y cobertura completa y no lo encontró.
  Con `no_comprobado` se deja como estaba y se marca «sin comprobar desde…» (`unchecked_since`). Lo contrario (lo que hace
  `lib/core/findings-rules.ts`) resolvería un hallazgo el día que cae la fuente.
- Cada aparición es un **episodio** (`episode_started_at`): un problema que vuelve semanas después es un episodio nuevo.

### 6.4 Avisos (R5 I2)

- **Modo sombra** hasta que Enric lo encienda (`alerts_enabled`): los hallazgos se guardan y se ven en Hoy pero **no se
  envían**.
- En los pasos 1-2 los avisos salen con `telegramOutbound().notifyOwner` (**a Enric**). La investigación los diseña para el
  gestor (Eury), pero `notifyOwner` solo llega al dueño y el núcleo no tiene salida «a esta persona» por la cola de avisos.
  **Encender los avisos a Eury requiere una capacidad nueva del núcleo `notifyMember`** (implementada por Operaciones sobre
  `enqueueNotification`): tocar el núcleo, protocolo de decisión y OK de Enric antes de la semana de uso real. Usar
  `sendText` directo incumpliría CLAUDE.md («todo aviso pasa por `ops_notifications`»).
- El hallazgo 15 sale con `{ bot: SYSTEM_BOT }`.
- Clave del aviso con el **episodio**: `ads:<kind>:<cause_key>:<episode_started_at>`.
- `notifyOwner` devuelve `void` y no hace nada sin dueño configurado: `notify_state = 'encolado'`, no «avisado».
- **Horario y días**: `alert_hours` y `alert_days` (laborables) más los festivos del calendario de la agencia. Lo detectado
  fuera de horario se encola para las 09:00 del siguiente día laborable **si sigue abierto**; si ya se resolvió, no sale.
- **Tope por persona** (7.3), no por cuenta: como máximo `max_interruptions_per_day`; la tercera y siguientes se agrupan en
  un único mensaje. El parte de la mañana muestra 5 con decisión + 3 «para que lo sepas» y «N más por debajo del corte».
- Proceso: tarea del planificador `ads avisos` (cada 30 s, líder) que envía las interrupciones abiertas no avisadas con
  tope, horario y días.

### 6.5 Procesos del paso 2 (R5 I3)

| Proceso | Cada cuánto | Qué hace | Operaciones |
|---|---|---|---|
| `ads.evaluar` (por cuenta de Ads) | Al terminar `ads.sincronizar` o `ads.latido` (encolado por ellos, con `dedupeKey`) | Evalúa las reglas con su ventana y su cobertura, guarda `ads_rule_runs` y `ads_findings` | 0 |
| `ads.landing` (por cuenta de Ads) | 60 min en horario de anuncios | Pide cada URL con gasto en 7 días con `safeFetcher` del núcleo; dos fallos seguidos con ≥ 10 min → hallazgo 3 | 0 (peticiones HTTP) |
| Tarea `ads avisos` | 30 s (líder) | §6.4 | 0 |

### 6.6 Respuestas del gestor (7.4)

`hecho`, `lo hago yo`, `esperando al cliente` (con fecha), `el cliente lo quiere así`, `ya lo sabía`, `no es un problema`
(con motivo), `posponer` (1/7/28 días, máx. 2), `encargar`. **«Encargar» puede ir ya en el paso 2**: el núcleo ofrece
`workSource().createTask` y `clientOpen` (`lib/core/capabilities.ts`), y el silencio «mientras hay un encargo abierto» de
7.3 usa justo eso.

## 7. Cartera (paso 2)

Una fila por cuenta seguida: cliente y nivel (A/B/C, de `ads_clients`), gasto del mes y ritmo (proyección frente a
presupuesto), CPL de 30 días frente a objetivo (o «frente a su línea base, sin objetivo de negocio» si es provisional),
conversiones de 7 días, estado de la medición (`rota` / `sin datos para afirmar`), hallazgos abiertos, último cambio (fecha
y autor), última revisión humana y próxima. En gris lo no comprobado (MED-00). Las cifras en la moneda de cada cuenta; si
hay varias monedas, no se suman.

**Objetivo provisional congelado (2.2, R5 I8):** botón «Fijar objetivo provisional» por cliente: **coste total de los 90
días previos / conversiones primarias totales de esos 90 días** (por fecha de clic, excluyendo los últimos 7 días si la
acción madura despacio). **Con menos de 15 conversiones en 90 días no se fija**: «sin datos suficientes». Congelado, marcado
como supuesto. Una cuenta con objetivo provisional no puede ser nivel A. A los 90 días sin acuerdo real, recordatorio
(paso 7).

## 8. Permisos

- Ver Hoy, Cartera y Cuenta: `view`. Responder a hallazgos, fijar objetivo provisional, marcar revisión: `edit`.
- Ajustes, credenciales, probar conexión, encender la descarga, vincular cuentas, nivel del cliente y encender avisos:
  `admin`.
- Las credenciales nunca viajan al navegador: solo `hasCredentials: boolean` y la pista enmascarada (correo con
  `maskSecret` y `private_key_id` corto). La prueba de secretos de `tests/auditoria.test.ts` cubre también
  `credentialsEncrypted` y `developerTokenEncrypted`.
- **Validación de la clave subida:** `type === 'service_account'`, `client_email`, `private_key` (PEM), `private_key_id`,
  `token_uri` en `https://oauth2.googleapis.com/…`; tamaño máximo 10 KB.

## 9. Pruebas

- Unitarias de cálculos puros (paso 1: id de cliente, cobertura, hora del Pacífico, autores, estado de las fuentes,
  traducción) y, en el paso 2, de las reglas y de la binomial negativa.
- Contrato GOO-07: traducción de respuestas de la API (`tests/fixtures/ads/*.json`) **escritas desde la documentación y
  marcadas «no grabadas de una cuenta real»**. **No cuentan como GOO-07 hecho**: la primera respuesta real de la prueba de
  acceso las sustituye.
- Sincronización completa en modo simulado contra la base de desarrollo.
- Seguridad: acciones nuevas en `tests/seguridad.test.ts`; guardrails: solo `lib/ads/client.ts` contiene la URL de la API.
- Pantallas: entran solas en `pantallas-*`.

## 10. Mapa Visual y comprobación

`lib/ads/process-map.ts` (`ADS_PROCESS_MAP`), **nodo nuevo** `ads` en `registry.ts` (no existía en `FUTURE_NODES`), `'ads'`
en `PROCESS_MAP_IDS` y en la lista `known` de `scripts/check-architecture-map.js`, con un bloque que exige que todas las
tablas `ads_*`, los tipos de trabajo `ads.*` y la tarea del planificador estén en el mapa.

## 11. Copia antes de migrar

Regla de CLAUDE.md: `pg_dump` a `backups/backup_pre_ads_20261128.sql` (hecho) y rama propia (`feature/ads-paso1`) antes de
aplicar 0084 en local.

## 12. Pendientes y riesgos

- Prueba de acceso real (paquete A): hasta entonces, modo simulado. Las consultas GAQL se escriben contra la documentación
  v26; los nombres de campo pueden necesitar ajuste tras la primera respuesta real.
- **Necesita a Enric:** (1) excepción de `iam.disableServiceAccountKeyCreation` si la consola no deja crear la clave;
  (2) añadir la cuenta de servicio a la MCC con acceso de lectura; (3) `notifyMember` en el núcleo para avisar a Eury
  (protocolo de decisión); (4) no activar `SIM` en producción; (5) si se quiere el *developer token*, pegarlo en Ajustes.
- `ads_goals`, `ads_clients` y `ads_findings` en Ads y no en el núcleo: candidatos a unificar.
- Grupos de recursos de PMax en `ads_ad_group_policy_daily`: la consulta de `asset_group` se añade tras la prueba de acceso
  (la tabla ya admite `entity_kind = 'asset_group'`).
- Caducidad de certificado y dominio a 14 días (PRO-06): paso 2 o 5.
- Todo lo marcado [verificar en v26] en la auditoría R5.

## Auditoría R5: qué se hizo con cada hallazgo

| Hallazgo | Qué decía | Qué se hizo |
|---|---|---|
| G1 | No distingue «sin filas» de «cero» | §3.1: `ads_daily_coverage` con consulta de control; cero solo en días cubiertos; reglas con ventana. Construido en el paso 1 |
| G2 | Regla 12 contradice 5.1 | §6.1 reescrita (clics, binomial negativa, 8 semanas, fecha de conversión, banda de clics, umbral calibrado en sombra, ≥ 30 conversiones); §6.2 precedencia |
| G3 | Interrupciones con un día de retraso | `ads.latido` horario y `ads_hourly_campaign` (construidos en el paso 1); reglas 1 y 4 sobre horas y programación; MED-00 del latido 2 h |
| I1 | Autenticación: riesgos y reserva | §1: política de la organización (pendiente de Enric), escritura con otra cuenta de servicio, D sustituye a B como reserva, la MCC la toca Enric, *developer token* siempre que esté guardado, error literal en «Probar conexión» |
| I2 | Avisos solo a Enric | §6.4: `notifyOwner` en sombra; `notifyMember` como pendiente del núcleo; clave con episodio; «encolado»; días laborables y festivos; tope por persona; hallazgo 15 sin duplicar con `reportError` |
| I3 | Faltan procesos | §6.5: `ads.evaluar`, `ads.landing` y tarea `ads avisos` (paso 2) |
| I4 | Falsos positivos en reglas 1, 2, 4, 6, 8 | §6: reglas tomadas de PRO-01/05/07/08/13 con columna de ventana y cobertura; sin rama de facturación inventada |
| I5 | Columnas que la API no rellena | `ads_landing_urls`, `ads_budgets`, `ads_ad_group_policy_daily`, sin `recommended_budget`, objetivo de puja de las tres fuentes, acciones por `resource_name`, conversiones por fecha de conversión |
| I6 | Historial de cambios | Único por `event_resource_name`, `timestamptz` + texto original, cursor −1 día, `LIMIT 10000` con continuación, `cambios` > 7 días crítica, `client_type` tal cual, autores con dominios y correos de la agencia |
| I7 | «No comprobado» y cabecera | `ads_rule_runs`; un hallazgo solo se resuelve con fuentes sanas; `account_id` nullable + `scope`; único parcial; CHECK de `kind` |
| I8 | Objetivo provisional sesgado | §7: coste total / conversiones totales; mínimo 15 conversiones |
| I9 | Cupo mal contado | §4: frecuencias separadas (estructura diaria, métricas 4×, latido horario), ~1.175 al día, día del Pacífico, `RESOURCE_EXHAUSTED` frente a `RESOURCE_TEMPORARILY_EXHAUSTED`, histórico sin cortar en tramo vacío, Basic para pasos 3-4 |
| I10 | Campañas eliminadas | §3.2: la consulta de métricas da de alta la campaña si no existe |
| I11 | SIM en producción | §3.4: `simulated`, sin vínculos ni avisos, banda, no se activa con cuentas reales, se oculta al cambiar; producción como pendiente de Enric |
| I12 | Granularidad futura | Red/dispositivo en tabla de extensión que nunca se suma; nivel en `ads_clients` (por cliente); MED-06 en el paso 5; aviso de retirada de versión en Salud |
| M1 | `tenant_id` en todas | Hecho |
| M2 | Únicos e índices | Hecho (§3.2-3.3) y `numeric(14,4)` en conversiones |
| M3 | Ámbito de los procesos | `scopeType: 'cuenta'` con `scopeId` = id de `ads_accounts` |
| M4 | «07:00 la principal» | Tarea del planificador con comprobación de reloj a las 06:30 de Madrid |
| M5 | `wireApp()` | `registerAdsCapabilities()` en `lib/app-wiring.ts` |
| M6 | Nodo del mapa inexistente | Nodo nuevo `ads` (built) |
| M7 | Auditoría de secretos | Expresión ampliada con `credentialsEncrypted` y `developerTokenEncrypted`; `client.ts` nunca pone token ni JWT en errores |
| M8 | Validación de la clave | §8 |
| M9 | Vínculo con la ficha | §4.1 |
| M10 | `customer_client` | Filtra `manager` y `test_account`; las no activas se guardan sin seguir |
| M11 | Moneda | Reglas y Cartera en la moneda de la cuenta |
| M12 | Qué es «caída» | Regla 3 (§6) |
| M13 | «Encargar» en el paso 2 | §6.6 |
| M14 | Copia antes de migrar | §11 (hecha) |
| M15 | Foto de estado | `observations` + `worst_primary_status`; políticas: la peor del día |
| M16 | Pruebas de contrato | §9: no cuentan como GOO-07 hasta sustituirlas por la primera respuesta real |

# 04 — API de Google Ads y cambios de plataforma 2024-2026

**Investigador:** ingeniero especialista en la API de Google Ads (Claude, 28 nov 2026)
**Fuentes principales:** developers.google.com/google-ads/api (referencia v26, guías, release notes, deprecations),
blog Ads Developer (developers.google.com/ads/blog), support.google.com/google-ads, blog.google.
**Limitación de la sesión:** el presupuesto de búsquedas web de la sesión se agotó a mitad del trabajo; a partir de ahí
solo se leyeron páginas oficiales por URL directa. Lo que no se pudo comprobar está marcado **[NO VERIFICADO]**.

---

## Resumen (lo más importante en 15 líneas)

1. **Ya no hace falta «token de desarrollador».** Google retiró los developer tokens el **9 sep 2026**: el nivel de acceso
   (Test → Explorer → Basic → Standard) pertenece ahora al **proyecto de Google Cloud** que posee el cliente OAuth o la
   cuenta de servicio. El bloqueo que tenemos apuntado («falta el token de la MCC») hay que replantearlo: lo que falta es un
   **proyecto de Cloud con acceso Explorer o Basic** (Basic requiere verificación de marca, revisión automática en minutos).
2. **Cuotas:** Explorer = 2.880 operaciones/día en cuentas reales (suficiente para empezar a leer 25 cuentas); Basic = 15.000/día;
   Standard = ilimitado. La paginación no gasta cuota. La API es gratuita.
3. **Recomendación de autenticación: cuenta de servicio** añadida como usuario en la MCC. No le afectan la exigencia de
   MFA (abr 2026) ni de passkey (ago 2026) para nuevos refresh tokens, y no depende de un empleado.
4. Versión vigente: **v26 (14 oct 2026)**, minors v26.1 y v26.2; cada versión mayor vive ~13 meses; calendario de 3-4 mayores al año.
5. **Auction Insights sigue SIN estar en la API** (los campos `metrics.auction_insight_*` existen en v26 pero la referencia
   dice «This metric is not publicly available»). Sí están todas las métricas de cuota de impresiones (IS, perdida por presupuesto
   y por ranking, top, absolute top, exact match IS, click share).
6. **Términos de búsqueda de PMax** ya se pueden leer (`campaign_search_term_view`, desde v21), y AI Max tiene su vista propia
   (`ai_max_search_term_ad_combination_view`: término + titular + landing).
7. **Historial de cambios:** `change_event` (30 días, con valor antiguo/nuevo y usuario) y `change_status` (90 días, solo «qué cambió»).
   Hay que guardarlo nosotros a diario para tener más historia.
8. **Estado de Smart Bidding** legible: `bidding_strategy_system_status` (LEARNING_NEW, LIMITED_BY_BUDGET, LIMITED_BY_DATA,
   MISCONFIGURED_CONVERSION_SETTINGS…). Es oro para el «porqué» de las alertas.
9. **Conversiones offline:** desde el **15 jun 2026** la API de Google Ads no acepta nuevos usuarios de `UploadClickConversions`
   (incluido Enhanced Conversions for Leads): los nuevos deben usar la **Data Manager API**. Afecta a la idea de subir leads
   cualificados de GoHighLevel.
10. **Cambios de plataforma que afectan al diseño:** campañas de Búsqueda con ACA o concordancia amplia a nivel de campaña
    **migradas automáticamente a AI Max desde sep 2026**; DSA se retira y migra en **feb 2027**; anuncios solo de llamada
    retirados (no se crean desde ene 2026, dejan de servir feb 2027); segmentación manual por idioma eliminada en Búsqueda (sep 2026);
    no se crean nuevas Smart Campaigns (sep 2026); datos diarios/horarios solo 37 meses (jun 2026).
11. **Frescura:** clics/impresiones casi en tiempo real (actualización horaria); términos de búsqueda y geográficos al día
    siguiente; **cuota de impresiones con ~2-3 días de retraso**; click share 3 días; conversiones no last-click ~1 día.
12. **MCP oficial de Google Ads** (open source, oct 2025): lectura con GAQL + unas pocas escrituras (activos, etiquetas) con
    «proponer y confirmar». No puede pausar, pujar ni tocar presupuestos.
13. **Ads Advisor** (agente Gemini dentro de Google Ads, dic 2025): resúmenes, diagnóstico, políticas y aplicar cambios con
    aprobación, solo dentro de la interfaz y cuenta a cuenta. No hay API para él.
14. Google Ads Scripts siguen siendo útiles como complemento (gratis, sin acceso de Cloud), pero 30 min y 50 cuentas por
    ejecución MCC; para 25+ cuentas con IA y base de datos propia, la API es la opción principal.

---

## 1. Acceso a la API

### 1.1 El fin del developer token (9 sep 2026) — cambio clave para nosotros

**Hecho documentado** ([Developer token](https://developers.google.com/google-ads/api/docs/api-policy/developer-token),
[Access levels](https://developers.google.com/google-ads/api/docs/api-policy/access-levels),
[Deprecations](https://developers.google.com/google-ads/api/docs/deprecations)):

- Los developer tokens se **retiraron el 9 sep 2026**. El nivel de acceso de cada token se traspasó automáticamente a los
  proyectos de Cloud que lo usaron en los 90 días anteriores; un token nunca usado no se traspasó.
- El acceso lo determina ahora **el proyecto de Google Cloud dueño del client ID OAuth** (flujo de usuario) **o de la cuenta de
  servicio**. Enviar la cabecera `developer-token` es opcional y se ignora; Google avisa de que **una futura versión mayor
  empezará a rechazarla** → no enviarla en código nuevo.
- **Ya no hace falta una cuenta de administrador (MCC)** para obtener acceso; la MCC solo sirve para gestionar varias cuentas
  (nuestro caso).
- El «API Center» de la MCC queda en solo lectura. Las solicitudes se hacen en la página **Google Ads API Overview de la Cloud Console**.
- Excepción: la **App Conversion Tracking API** aún necesita token del API Center (no nos afecta).
- Google puede **revocar el acceso tras 90 días seguidos sin uso**.
- Error típico: en v25+ un proyecto en nivel Test que llama a una cuenta real devuelve
  `CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION` (antes `ACTION_NOT_PERMITTED`).
- Problema conocido: algunos proyectos ascendidos después del 9 sep 2026 reciben `AUTHORIZATION_ERROR` en producción;
  arreglo en despliegue; solución temporal: pedir Explorer en un proyecto nuevo.
- Problema conocido: proyectos con verificación de marca pero en prueba gratuita o con facturación suspendida pueden ser
  rechazados para Basic/Explorer (solución: quitar la facturación si el proyecto solo usa la API, o pasar a cuenta de pago).

**Consecuencia práctica para Kijutech:** la memoria del proyecto dice «falta el token de desarrollador de la MCC». Eso está
**obsoleto**: lo que hay que hacer es (1) crear o elegir un proyecto de Google Cloud de la agencia, (2) habilitar la Google Ads
API (queda en Test), (3) pedir **Explorer** (revisión automática «en la mayoría de los casos»), (4) completar la **verificación
de marca** del proyecto y pedir **Basic** (revisión automática en minutos tras la verificación, según el blog
[A new onboarding experience](https://developers.google.com/ads/blog/posts/2026/09/new-onboarding-experience-for-google-ads-api)).
Si alguien de la agencia llegó a tener un token con uso en 2026, su nivel ya está en algún proyecto de Cloud: comprobarlo antes.

### 1.2 Niveles de acceso

| Nivel | Cuentas | Operaciones/día | Cómo se obtiene | Revisión |
|---|---|---|---|---|
| **Test** | Solo cuentas de prueba (no sirven anuncios) | 15.000 | Automático al habilitar la API en el proyecto | — |
| **Explorer** | Prueba + reales | **2.880 en reales**, 15.000 en prueba | Desde la página Overview, si Google lo ofrece | «Automated review and approval in most cases» |
| **Basic** | Prueba + reales | 15.000 | Desde Explorer + **verificación de marca** del proyecto | Automática (minutos) |
| **Standard** | Prueba + reales | **Ilimitadas** | Desde Basic, «Start application» | **Manual, ~10 días hábiles**; auditoría, puede pedir demo y «Required Minimum Functionality» |

Fuente: [Access levels](https://developers.google.com/google-ads/api/docs/api-policy/access-levels).
Notas:
- **Explorer restringe**: creación y vinculación de cuentas, gestión de usuarios, **servicios de planificación** (Keyword Planner,
  Reach Planner…), facturación y pagos, y aprobaciones multiparte. → Para usar `KeywordPlanIdeaService` necesitamos **Basic**.
- La ventana diaria es **deslizante de 24 h**.
- Explorer existe desde oct 2025 ([blog](https://developers.google.com/ads/blog/posts/2025/10/explorer-access-is-now-available-for)).

**¿Qué cuenta como «operación»?** Cada petición `Search`/`SearchStream` cuenta como 1 operación; cada operación de un mutate
cuenta como 1; las páginas siguientes con `next_page_token` válido **no cuentan**
([Quotas](https://developers.google.com/google-ads/api/docs/best-practices/quotas)). Cálculo: 25 cuentas × ~40 consultas GAQL
por sincronización diaria = 1.000 operaciones; con 3 sincronizaciones intradía ligeras (10 consultas) = +750. **Explorer
(2.880) alcanza para leer**; Basic da margen para backfills, simulaciones y escritura.

### 1.3 OAuth, cuenta de servicio, MCC y cabeceras

- **Token de acceso OAuth 2.0** (Bearer), válido 1 hora; las librerías lo refrescan
  ([Call structure](https://developers.google.com/google-ads/api/docs/concepts/call-structure)). Alcance:
  `https://www.googleapis.com/auth/adwords`.
- **`login-customer-id`**: obligatorio cuando se accede a una cuenta cliente **a través de una MCC**; debe ser el ID de la MCC sin
  guiones. Si se omite → `USER_PERMISSION_DENIED`. No hace falta en `ListAccessibleCustomers`.
- **`linked-customer-id`**: solo para socios con «product link» (no es nuestro caso).
- **Cuenta de servicio** ([Service accounts](https://developers.google.com/google-ads/api/docs/oauth/service-accounts)):
  se crea en Cloud, se descarga la clave JSON y **se añade su email como usuario en Google Ads** (Admin → Acceso y seguridad),
  sin delegación de dominio. Un mismo email puede estar en **máximo 20 cuentas** → añadirla **a la MCC** y llegar a las
  cuentas cliente por la jerarquía. Ventaja explícita: «no está atada a las credenciales de un empleado».
- **MFA y passkeys:** desde el 21 abr 2026 los nuevos refresh tokens exigen segundo factor
  ([blog MFA](https://developers.google.com/ads/blog/posts/2026/04/multi-factor-authentication-requirement)); desde el
  5 ago 2026 exigen **passkey** (no valen SMS ni TOTP) y puede haber 7 días de espera de seguridad para un passkey nuevo
  ([blog passkey](https://developers.google.com/ads/blog/posts/2026/07/passkey-authentication-requirement-for)).
  **Las cuentas de servicio no se ven afectadas** y Google las recomienda para aplicaciones desatendidas.
- **Aprobaciones multiparte (MPA)** desde el 27 jul 2026: invitar, cambiar permisos o quitar usuarios puede crear una
  `MultiPartyAuthReview` pendiente que otro administrador debe aprobar
  ([blog MPA](https://developers.google.com/ads/blog/posts/2026/06/multi-party-approvals-in-google-ads-api)); desde el
  7 dic 2026 cambian detalles (invitación diferida, error `STALE_MULTI_PARTY_AUTH_REQUEST`, resolución en bloque de 100)
  ([blog](https://developers.google.com/ads/blog/posts/2026/11/upcoming-changes-to-multi-party)). Solo afecta a la gestión de
  usuarios; nosotros no la necesitamos.
- **Piloto «Secure API Access to Manager Accounts»** (ago 2026): permite restringir operaciones sensibles (cuentas, usuarios,
  facturación) de una jerarquía MCC a una lista de proyectos de Cloud aprobados
  ([blog](https://developers.google.com/ads/blog/posts/2026/08/google-ads-api-pilot-secure-api-access)). Interesante para
  seguridad de la agencia; no necesario.

### 1.4 Cuotas y límites técnicos

De [Quotas](https://developers.google.com/google-ads/api/docs/best-practices/quotas):
- Máx. **10.000 operaciones por petición mutate** (`TOO_MANY_MUTATE_OPERATIONS`).
- `AccountBudget`/facturación: 1 operación por petición; esperar **12 h** entre cambios de presupuesto de cuenta del mismo cliente;
  solo cuentas con **facturación mensual (monthly invoicing)**.
- Mensaje gRPC máx. 64 MB en librerías; exceso → `RESOURCE_EXHAUSTED`.
- `IN` de GAQL: máx. 20.000 valores.
- **Keyword Planner** (`GenerateKeywordIdeas`, `GenerateKeywordHistoricalMetrics`, `GenerateKeywordForecastMetrics`): **1 petición/s por
  cuenta (CID)**; Planning Service 1 QPS.
- `UploadClickConversions` / `UploadCallConversions` / `UploadConversionAdjustments`: 2.000 por petición.
- `campaign_search_term_insight` usado con mucha frecuencia puede dar `RESOURCE_EXHAUSTED`
  ([PMax criterion reporting](https://developers.google.com/google-ads/api/performance-max/campaign-criterion-reporting)).
- No hay QPS fijo publicado para `Search`; los límites de tasa son dinámicos (error `RESOURCE_TEMPORARILY_EXHAUSTED`, reintento con
  backoff exponencial) **[detalle del QPS NO VERIFICADO en esta sesión]**.
- Desde ago 2025 las respuestas vacías de `Search`/`SearchStream` traen `query_resource_consumption` y `field_mask`
  ([blog](https://developers.google.com/ads/blog/posts/2025/07/upcoming-changes-to-search-and)) → el parser debe tolerarlo.

### 1.5 Coste

La API no tiene coste por llamada (no hay tarifa publicada; la propia documentación de inicio no menciona precios). El único coste
es nuestra infraestructura. **[La gratuidad es conocimiento general del sector; la página de inicio no lo dice explícitamente.]**

### 1.6 Versiones y retirada

De [Sunset dates](https://developers.google.com/google-ads/api/docs/sunset-dates):

| Versión | Publicada | Retirada |
|---|---|---|
| v23 (.1-.3) | 28 ene 2026 | feb 2027 |
| v24 (.1-.2) | 22 abr 2026 | may 2027 |
| v25 (.1-.2) | 22 jul 2026 | ago 2027 |
| **v26** (.1 28 oct, .2 11 nov) | **14 oct 2026** | **nov 2027** |
| v27 | ene 2027 (previsto) | feb 2028 |

Desde sep 2025 Google publica **versiones mayores cada trimestre y minors mensuales**
([blog](https://developers.google.com/ads/blog/posts/2025/09/more-frequent-releases-coming-for)). Cada mayor dura ~13 meses →
**hay que subir de versión al menos una vez al año**; si usamos el cliente Node no oficial (`google-ads-api` de Opteo) hay que
vigilar que siga el ritmo **[estado de librerías Node NO VERIFICADO; Google no tiene librería oficial para Node/TypeScript; sí
REST]**. Recomendación: usar **REST** (`googleads.googleapis.com/v26/customers/{id}/googleAds:searchStream`) desde Node con
`fetch` y un pequeño cliente propio con contador, como hicimos con ClickUp.

**Retención de datos** (desde 1 jun 2026): datos diarios/semanales/horarios **37 meses**; mensuales/trimestrales/anuales 11 años
([Deprecations](https://developers.google.com/google-ads/api/docs/deprecations); y `segments.date` admite como mucho 37 meses atrás,
[Segmentation](https://developers.google.com/google-ads/api/docs/reporting/segmentation)).

---

## 2. Informes (GAQL): recursos clave

Reglas generales de GAQL ([Segmentation](https://developers.google.com/google-ads/api/docs/reporting/segmentation)):
- Si se selecciona un segmento de fecha (`segments.date/week/month/quarter/year`), el `WHERE` necesita un rango finito.
- Todo segmento usado en `WHERE` debe estar en `SELECT` (salvo los de fecha).
- Seleccionar cualquier `segments.keyword.*` **excluye DSA, Shopping y PMax** de los resultados.
- `search_term_view` está segmentado implícitamente por grupo de anuncios: el mismo término aparece en varias filas.
- La API permite varios segmentos a la vez (la UI uno solo).

### 2.1 Cuenta, campaña, grupo, palabra clave

| Recurso | Para qué | Notas |
|---|---|---|
| `customer` | Zona horaria (`customer.time_zone`), moneda, `optimization_score`, `conversion_tracking_setting`, `auto_tagging_enabled`, estado | Métricas a nivel cuenta, incluida la cuota de impresiones |
| `customer_client` (desde la MCC) | Listar todas las cuentas cliente de la jerarquía con `level`, `manager`, `status` | Base para descubrir las 25+ cuentas |
| `campaign` | Estado, `primary_status` y `primary_status_reasons` (por qué no sirve), tipo de canal, estrategia de puja, `ai_max_setting`, presupuesto, fechas, `bidding_strategy_system_status` | Métricas de rendimiento + IS |
| `campaign_budget` | Importe, `delivery_method`, presupuesto compartido, `recommended_budget_amount_micros` | |
| `ad_group` | Estado, CPC/CPA objetivo, `primary_status` | No devuelve datos de PMax |
| `keyword_view` | Rendimiento por palabra clave + **IS** + **histórico de QS** | Ver 2.2 |
| `ad_group_criterion` | Palabra clave (texto, concordancia, estado, puja, `quality_info`, `system_serving_status` p. ej. «low search volume», `approval_status`), negativas de grupo, audiencias, ubicaciones | |

### 2.2 Nivel de calidad (Quality Score)

- **Foto actual**: `ad_group_criterion.quality_info` con 4 campos (referencia
  [QualityInfo v26](https://developers.google.com/google-ads/api/reference/rpc/v26/AdGroupCriterion.QualityInfo)):
  `quality_score` (1-10, puede venir vacío si Google no tiene datos suficientes), `creative_quality_score` (relevancia del anuncio),
  `post_click_quality_score` (experiencia en la landing) y `search_predicted_ctr` (CTR esperado). Los tres componentes son
  «buckets»: `BELOW_AVERAGE`, `AVERAGE`, `ABOVE_AVERAGE`.
- **Histórico**: métricas `metrics.historical_quality_score`, `historical_creative_quality_score`,
  `historical_landing_page_quality_score`, `historical_search_predicted_ctr`, seleccionables en `keyword_view`
  ([keyword_view v26](https://developers.google.com/google-ads/api/fields/v26/keyword_view)). Según el foro oficial solo funcionan
  desde `keyword_view` (no desde campaña ni grupo). **Se pueden segmentar por `segments.date` para reconstruir la serie diaria
  [práctica habitual en el sector; la compatibilidad exacta no se pudo leer en la referencia en esta sesión → NO VERIFICADO]**.
- **Recomendación:** guardar a diario `quality_info` en nuestra base (es barato) para tener historia propia aunque la métrica
  histórica falle o cambie.

### 2.3 Términos de búsqueda

| Recurso | Cobertura | Notas |
|---|---|---|
| `search_term_view` | Búsqueda (Search) por **grupo de anuncios**; incluye `search_term_view.status` (ADDED, EXCLUDED, NONE…) y `segments.search_term_match_type` | **Excluye PMax** |
| **`campaign_search_term_view`** (v21, ago 2025) | Términos a nivel **campaña**, para **Búsqueda y PMax**, con coste | Recomendado por Google en lugar de `search_term_view` cuando se quiere PMax ([PMax reporting](https://developers.google.com/google-ads/api/performance-max/reporting); [blog v21](https://developers.google.com/ads/blog/posts/2025/08/google-ads-api-v19-release)). Si se añade un segmento de keyword, **desaparece PMax** |
| `customer_search_term_insight` / `campaign_search_term_insight` | **Categorías** de búsqueda (insights), no términos sueltos; útil para PMax y para el volumen oculto | Empezar por customer y bajar a campaign; uso frecuente → `RESOURCE_EXHAUSTED`. Desde el 3 mar 2025 `segments.search_subcategory` vuelve vacío ([blog](https://developers.google.com/ads/blog/posts/2025/01/google-ads-api-and-google-ads-scripts)) |
| **`ai_max_search_term_ad_combination_view`** (v21) | AI Max: combinación **término de búsqueda + titular + landing** | «El informe más granular de AI Max» |
| Segmento `segments.search_term_match_source` (enum `SearchTermMatchSource`) | Dice **de dónde salió el emparejamiento**: palabra clave, **AI Max broad match**, **AI Max keywordless**, DSA, PMax, feed vertical | Clave para separar «lo que trajo mi palabra clave» de «lo que trajo la IA de Google» ([enum v25](https://developers.google.com/google-ads/api/reference/rpc/v25/SearchTermMatchSourceEnum.SearchTermMatchSource)); valores cambian entre versiones |

**Umbrales de privacidad:** Google omite los términos «sin suficiente actividad de consulta»
([Ayuda: informe de términos](https://support.google.com/google-ads/answer/2472708?hl=en)); en los insights se agrupan en «otras
consultas». **Qué porcentaje de coste queda oculto:** Google no lo publica. Estudios de agencias tras el cambio de sep 2020
hablaron de que se dejó de ver en torno a un 20-30 % del gasto de búsqueda de media, con mucha variación por cuenta, y Google
amplió parcialmente la visibilidad en 2023 **[cifras NO VERIFICADAS en esta sesión; ver informe 07 de comunidad]**. **Se puede
medir en cada cuenta**: coste total de la campaña (`campaign`) − suma de coste de `search_term_view` en el mismo periodo = coste
sin término visible. Proponemos guardarlo como KPI («% de gasto invisible»).

### 2.4 Anuncios y recursos (RSA, activos)

- `ad_group_ad`: anuncio (RSA: titulares, descripciones, pins, rutas, final URLs), `ad_strength`, `policy_summary`
  (`approval_status`, `review_status`, `policy_topic_entries`), estado y `primary_status`.
- `ad_group_ad_asset_view`: rendimiento **por activo dentro de cada anuncio** con impresiones, clics, coste, conversiones,
  CTR, etc. y campos `performance_label` (BEST/GOOD/LOW/LEARNING/PENDING), `pinned_field`, `field_type`, `source`
  (anunciante o generado automáticamente), `policy_summary`
  ([ad_group_ad_asset_view v26](https://developers.google.com/google-ads/api/fields/v26/ad_group_ad_asset_view)).
  Nota: la v23 retiró «métricas agregadas de etiqueta de rendimiento de activos» para Búsqueda y Display
  ([release notes](https://developers.google.com/google-ads/api/docs/release-notes)); `performance_label` sigue en la vista por
  anuncio en v26. **[Alcance exacto de esa retirada NO VERIFICADO.]**
- `ad_group_ad_asset_combination_view`: combinaciones de activos servidas (solo impresiones) **[NO VERIFICADO en v26]**.
- `asset`, `campaign_asset`, `ad_group_asset`, `customer_asset`: enlaces de sitio, textos destacados, llamada, imágenes,
  formularios, mensajes (desde v23 Messenger/Zalo; v26 LINE y SMS).
- Métricas de pins: `metrics.asset_pinned_total_count` y `asset_pinned_as_*` (referencia de métricas v26).
- **Ya no se pueden compartir anuncios entre grupos** (`AD_SHARING_NOT_ALLOWED`, v23).

### 2.5 Performance Max

([PMax reporting](https://developers.google.com/google-ads/api/performance-max/reporting),
[campaign reporting](https://developers.google.com/google-ads/api/performance-max/campaign-reporting))
- `campaign` segmentado por **`segments.ad_network_type`** = informe **por canal** (Búsqueda, YouTube, Display, Discover, Gmail,
  Maps…). Activado para PMax en **v23** (ene 2026); para Demand Gen el desglose YOUTUBE/MAPS/DISCOVER/GMAIL llegó en v20.
  También `segments.ad_using_product_data` y `ad_using_video`.
- `asset_group` (ad strength, rendimiento global y por canal), `asset_group_asset`, `asset_group_top_combination_view`,
  `asset_group_signal`.
- `performance_max_placement_view`: dónde salieron los anuncios (YouTube, webs, apps), **solo impresiones**; segmentable por
  `ad_network_type` desde v24.2.
- `campaign_search_term_view` para términos; `location_view` para ubicaciones.
- `ad_group`/`ad_group_ad` **no devuelven nada** de PMax.

### 2.6 Landing pages, geografía, horarios, demografía

- `landing_page_view` (URL final configurada, `unexpanded_final_url`) y `expanded_landing_page_view` (URL final **expandida**
  real, con parámetros). Con AI Max/«Final URL expansion» Google manda tráfico a páginas no configuradas: hay que leer la vista
  expandida, no la configurada ([Ayuda Final URL expansion](https://support.google.com/google-ads/answer/16230205?hl=en)).
- `geographic_view` (por **ubicación física o de interés** según `location_type`) y `user_location_view` (ubicación física real
  del usuario, con `targeting_location` que dice si estaba dentro de la segmentación). `matched_location_interest_view` (v23)
  para ubicaciones de interés de AI Max.
- `ad_schedule_view` (rendimiento por franja programada) y segmentos `segments.hour`, `segments.day_of_week`.
- `age_range_view`, `gender_view`, `parental_status_view`, `income_range_view`; en PMax hay exclusiones de edad (2025), género
  (v24) e ingresos (v26.2).
- `location_view` (criterios de ubicación de la campaña).

### 2.7 Historial de cambios

| | `change_event` | `change_status` |
|---|---|---|
| Ventana | **Últimos 30 días** | **Últimos 90 días** |
| Límite | `LIMIT` obligatorio, **máx. 10.000 filas** por consulta (paginar por fecha) | `LIMIT` máx. 10.000 |
| Filtro obligatorio | `change_event.change_date_time` | `change_status.last_change_date_time` |
| Detalle | `old_resource` / `new_resource`, `changed_fields`, **`user_email`**, **`client_type`** (UI, API, scripts, recomendaciones automáticas…) | Solo qué recurso cambió (ADDED/CHANGED/REMOVED), **sin valores**; solo el último cambio del periodo |
| Huecos | No cubre cambios de **Google Ads Editor**; no todo cambio tiene entrada | Más tipos de recursos (Google los amplió desde 2025) |
| Retraso | hasta 3 min | hasta 3 min |

Fuentes: [Change event](https://developers.google.com/google-ads/api/docs/change-event),
[Change status](https://developers.google.com/google-ads/api/docs/change-status),
[blog 2025](https://developers.google.com/ads/blog/posts/2025/03/improved-change-tracking-in-google-ads).
**Los cambios aplicados automáticamente por suscripciones de recomendaciones** se ven en `change_event` con
`client_type = GOOGLE_ADS_RECOMMENDATIONS_SUBSCRIPTION`
([Recommendations](https://developers.google.com/google-ads/api/docs/recommendations)) → detectar «Google ha tocado la cuenta
solo». La interfaz web enseña hasta 2 años de historial, la API no → **hay que guardar `change_event` cada día**.

### 2.8 Recomendaciones y nivel de optimización

([Recommendations](https://developers.google.com/google-ads/api/docs/recommendations))
- Recurso `recommendation` (≈60 tipos: `CAMPAIGN_BUDGET`, `KEYWORD`, `USE_BROAD_MATCH_KEYWORD`, `TARGET_CPA_OPT_IN`,
  `RESPONSIVE_SEARCH_AD`, `SITELINK_ASSET`, `PERFORMANCE_MAX_OPT_IN`…). Algunos traen `impact` (métricas base y potenciales).
- Nuevos en 2026: subir presupuesto en Búsqueda (v26), subir tCPA / bajar tROAS cuando no entran en subastas (v25.2),
  «optimizar para clientes nuevos» (v26.1).
- `ApplyRecommendation` y `DismissRecommendation`: hasta 100 por petición; errores de ciclo de vida
  (`RECOMMENDATION_INVALIDATED`…).
- `RecommendationSubscription`: **autoaplicar** tipos (activar/desactivar por API).
- `metrics.optimization_score` (cuenta y campaña) y `optimization_score_uplift`.
- Hay tipos **solo de interfaz**: no salen en la API.

### 2.9 Conversiones

- `conversion_action`: nombre, tipo, categoría, **`status`**, `primary_for_goal`, `counting_type`, ventanas de clic y de
  visualización, modelo de atribución, `include_in_conversions_metric`. Sin un endpoint de «estado de la etiqueta» completo:
  se infiere con `metrics.all_conversions` por acción y día (la UI muestra «Sin conversiones recientes / Inactiva»
  **[campo de estado de diagnóstico de etiqueta en API NO VERIFICADO]**).
- `customer_conversion_goal` / `campaign_conversion_goal`: qué objetivos optimiza cada campaña.
- Segmentos de conversión: `segments.conversion_action`, `conversion_action_name`, `conversion_action_category`,
  **`conversion_lag_bucket`**, `conversion_or_adjustment_lag_bucket`; solo combinan con métricas de conversión.
- Métricas por fecha de conversión: `conversions_by_conversion_date`, `conversions_value_by_conversion_date` (útil para
  alertas de «hoy no hay leads», porque `conversions` se atribuye al **día del clic**).
- **Diagnóstico de subidas offline**: `offline_conversion_upload_client_summary` (tasas de éxito y pendientes, alertas,
  resúmenes diarios y por job) y `offline_conversion_upload_conversion_action_summary`
  ([Upload clicks](https://developers.google.com/google-ads/api/docs/conversions/upload-clicks)).
- v26: configuración unificada de Enhanced Conversions; se elimina `enhanced_conversions_for_leads_enabled`; nueva categoría
  **`MESSAGE_LEAD`** (lead por mensaje, p. ej. WhatsApp) — relevante para nuestros clientes.

### 2.10 Pujas y simuladores

- `bidding_strategy` (carteras), `accessible_bidding_strategy`, `campaign.bidding_strategy_type`, `campaign.target_cpa`,
  `maximize_conversions.target_cpa_micros`, etc.
- **Estado de Smart Bidding**: `campaign.bidding_strategy_system_status` / `bidding_strategy.status`, enum
  [BiddingStrategySystemStatus v26](https://developers.google.com/google-ads/api/reference/rpc/v26/BiddingStrategySystemStatusEnum.BiddingStrategySystemStatus):
  `LEARNING_NEW`, `LEARNING_BUDGET_CHANGE`, `LEARNING_COMPOSITION_CHANGE`, `LEARNING_CONVERSION_SETTING_CHANGE`,
  `LEARNING_CONVERSION_TYPE_CHANGE`, `LEARNING_SETTING_CHANGE`, `LIMITED_BY_BUDGET`, `LIMITED_BY_CPC_BID_CEILING/FLOOR`,
  `LIMITED_BY_DATA`, `LIMITED_BY_INVENTORY`, `LIMITED_BY_LOW_PRIORITY_SPEND`, `LIMITED_BY_LOW_QUALITY`,
  `MISCONFIGURED_CONVERSION_SETTINGS`, `MISCONFIGURED_CONVERSION_TYPES`, `MISCONFIGURED_SHARED_BUDGET`,
  `MISCONFIGURED_STRATEGY_TYPE`, `MISCONFIGURED_ZERO_ELIGIBILITY`, `MULTIPLE_*`, `PAUSED`, `UNAVAILABLE`.
  → Esto **es** el «mensaje de Smart Bidding» de la UI, legible por máquina.
- `campaign.primary_status_reasons` complementa: p. ej. `BUDGET_CONSTRAINED`, `BIDDING_STRATEGY_LEARNING`,
  `MOST_ADS_UNDER_REVIEW`, `HAS_ADS_DISAPPROVED`… **[lista exacta de valores en v26 NO VERIFICADA]**.
- **Simuladores**: `campaign_simulation`, `ad_group_simulation`, `ad_group_criterion_simulation`, `bidding_strategy_simulation`
  con tipos CPC_BID, TARGET_CPA, TARGET_ROAS, BUDGET, PERCENT_CPC_BID, TARGET_IMPRESSION_SHARE; devuelven puntos (puja/presupuesto
  → clics, coste, conversiones, impresiones estimadas) de los últimos ~7 días **[la guía de simulaciones dio 404 en esta sesión;
  detalle de tipos por recurso de conocimiento previo, VERIFICAR en la referencia]**.
- v22: métricas de «Smart Bidding Exploration» por tiempo para tROAS.

### 2.11 Cuota de impresiones (Impression Share)

Disponibles (campaña, grupo, keyword_view, cuenta) según [keyword_view v26](https://developers.google.com/google-ads/api/fields/v26/keyword_view):
`search_impression_share`, `search_budget_lost_impression_share`, `search_rank_lost_impression_share`,
`search_top_impression_share`, `search_absolute_top_impression_share`, `search_budget_lost_top_impression_share`,
`search_budget_lost_absolute_top_impression_share`, `search_rank_lost_top_impression_share`,
`search_rank_lost_absolute_top_impression_share`, `search_exact_match_impression_share`, `search_click_share`.
Además `top_impression_percentage` y `absolute_top_impression_percentage` (proporción de tus impresiones arriba).
Para Shopping: `search_*` equivalentes y, desde v23, cuotas perdidas por presupuesto/ranking de Shopping. Notas:
- Valores <10 % se informan como 0,0999 (y >90 % como 0,9001) **[convención conocida; la referencia lo dice para Auction Insights,
  confirmarlo para IS]**.
- **No se suman**: hay que guardar el valor al nivel que se quiera mostrar (no agregar de keyword a campaña).
- Retraso: ver §5.

### 2.12 Auction Insights (competencia en subasta)

**Estado a nov 2026: NO disponible por API para cuentas normales.** La referencia v26 incluye
`metrics.auction_insight_search_impression_share`, `..._overlap_rate`, `..._outranking_share`, `..._position_above_rate`,
`..._top_impression_percentage`, `..._absolute_top_impression_percentage` y el segmento `segments.auction_insight_domain`, pero
cada métrica dice textualmente **«This metric is not publicly available.»**
([Metrics v26](https://developers.google.com/google-ads/api/fields/v26/metrics)). En el foro oficial lo describen como
restringido a cuentas en lista blanca ([hilo 2025](https://groups.google.com/g/adwords-api/c/xhwhOAA5854/m/c-l_gKHhAwAJ)); un
blog reporta `METRIC_ACCESS_DENIED` al consultarlo en v24 (ago 2026) ([Lucid Vitals](https://lucidvitals.com/blog/google-ads-auction-insights),
anécdota). Los Scripts tampoco lo ofrecen ([foro Scripts](https://groups.google.com/g/adwords-scripts/c/4QiVuPttrgI)).
**Alternativas:** (a) **informe programado en la UI** de Google Ads (Informes → Auction Insights → programar envío por email/CSV)
y que nuestro sistema lea ese correo o archivo; (b) descarga manual semanal; (c) aproximarlo con nuestras propias señales:
`search_rank_lost_impression_share` sube + CPC medio sube + `top_impression_percentage` baja = más presión competitiva;
y cruzarlo con la **SERP de DataForSEO** (anuncios que aparecen para las palabras del cliente), que ya tenemos.

### 2.13 Otras áreas

- **Planificador de palabras clave**: `KeywordPlanIdeaService.GenerateKeywordIdeas` (ideas + volumen mensual, competencia, puja
  alta/baja de la parte superior), `GenerateKeywordHistoricalMetrics`. 1 petición/s por CID; **requiere Basic** (Explorer
  restringe servicios de planificación). v24 simplificó las métricas de previsión
  ([blog](https://developers.google.com/ads/blog/posts/2026/04/simplifying-keyword-forecast-metrics-in)).
- **Facturación**: `InvoiceService.ListInvoices` (desde v23 con coste por campaña y tasas regulatorias), `account_budget`,
  `billing_setup`. **Solo para cuentas con facturación mensual (invoicing)**; las de tarjeta/pagos automáticos no tienen facturas
  por API **[comportamiento con pagos automáticos NO VERIFICADO al detalle]**.
- **Alertas de cuenta** («tu método de pago ha fallado», «cuenta suspendida»): **no hay recurso de notificaciones** en la API.
  Se infiere: `customer.status`, campañas con `primary_status_reasons` de cuenta, gasto cayendo a 0
  **[NO VERIFICADO: no se encontró recurso de alertas]**.
- **Políticas**: `ad_group_ad.policy_summary`, `asset` policy, `ad_group_criterion.approval_status`/`disapproval_reasons`;
  exenciones con `exempt_policy_violation_keys` en el mutate.
- **Experimentos**: `experiment`, `experiment_arm`; tipos nuevos en v24.1 (`ADOPT_AI_MAX`, `ADOPT_BROAD_MATCH_KEYWORDS`,
  `OPTIMIZE_ASSETS`, `PMAX_REPLACEMENT_SHOPPING`) y v24.2 (`COMPARE_CAMPAIGNS`), con métricas de control/tratamiento y
  **campos de confianza** ([blog](https://developers.google.com/ads/blog/posts/2026/05/announcing-expanded-experiment)).
- **Lift**: Brand/Conversion Lift (v25.1) y **Search Lift** (v26, 15 métricas nuevas).
- **Benchmarks** (v23+): comparativas con percentiles (orientado a YouTube **[aplicabilidad a Búsqueda NO VERIFICADA]**).

---

## 3. Acciones (mutate): qué se puede y qué no

**Se puede por API** (todas con `validate_only` para simular sin aplicar, y `partial_failure`):

| Acción | Servicio / recurso |
|---|---|
| Pausar / activar campaña, grupo, anuncio, palabra clave | `CampaignService`, `AdGroupService`, `AdGroupAdService`, `AdGroupCriterionService` (campo `status`) |
| Añadir negativas en grupo, campaña | `AdGroupCriterionService` / `CampaignCriterionService` con `negative=true` |
| **Listas de negativas compartidas** | `SharedSetService` (tipo `NEGATIVE_KEYWORDS`), `SharedCriterionService`, `CampaignSharedSetService` (también en **PMax desde ago 2025**) |
| Negativas en PMax a nivel campaña | `CampaignCriterion` `KEYWORD` negativo, **hasta 10.000 por campaña** ([PMax criteria](https://developers.google.com/google-ads/api/performance-max/create-campaign-criteria)); v20 |
| Exclusiones de marca (PMax, AI Max) | `CampaignCriterion` con `brand_list` negativo |
| Presupuestos | `CampaignBudgetService` (importe, compartido) |
| Pujas y objetivos | CPC de keyword/grupo, tCPA/tROAS de campaña o cartera (`BiddingStrategyService`), cambio de estrategia |
| Anuncios RSA | Crear RSA nuevo (los RSA **no se editan**: se crea uno nuevo y se pausa el viejo; sí se puede mutar `status`) **[regla de inmutabilidad de RSA: conocimiento general; desde v24 el «responsive video ad info» es mutable, RSA no consta]** |
| Recursos (enlaces de sitio, textos, llamada, imágenes, formularios, mensajes) | `AssetService` + `CampaignAssetService` / `AdGroupAssetService` / `CustomerAssetService` |
| Horarios | `CampaignCriterion` `AD_SCHEDULE` (+ ajuste de puja si no es Smart Bidding) |
| Ubicaciones geográficas, radio, exclusiones | `CampaignCriterion` `LOCATION`/`PROXIMITY` |
| Dispositivo (ajustes de puja; en PMax segmentación por dispositivo desde 2025) | `CampaignCriterion` `DEVICE` |
| Exclusiones de ubicación (Display/YouTube), IP | `CampaignCriterion` / `CustomerNegativeCriterion` (`PLACEMENT`, `IP_BLOCK`) |
| AI Max: activar/desactivar, text customization, final URL expansion, guías de texto, marcas, URL incluidas | `Campaign.ai_max_setting`, `asset_automation_settings`, `text_guidelines` (25 exclusiones de términos, 40 restricciones de mensajes) ([AI Max getting started](https://developers.google.com/google-ads/api/docs/campaigns/ai-max-for-search-campaigns/getting-started)) |
| Experimentos | `ExperimentService` (crear, programar, `PromoteExperiment`, `EndExperiment`) |
| Recomendaciones | aplicar, descartar, suscribir autoaplicación |
| Conversiones offline y ajustes | `UploadClickConversions`, `UploadCallConversions`, `UploadConversionAdjustments` — **con la restricción del 15 jun 2026 (ver §4.6)** |
| Etiquetas | `LabelService`, `*LabelService` (útil para marcar «tocado por el agente») |
| Seasonality adjustments / exclusiones de datos | `BiddingSeasonalityAdjustment`, `BiddingDataExclusion` (p. ej. excluir días con la etiqueta rota) |
| Crear campañas completas (Búsqueda, PMax, Demand Gen) | Sí (desde sep 2026 **no** Smart Campaigns nuevas) |

**No se puede (o no conviene) por API** — solo interfaz u otras herramientas:
- **Leer Auction Insights** (ver §2.12).
- **Ads Advisor** / asistentes de Gemini (solo UI).
- Algunas **recomendaciones solo de interfaz**.
- **Diagnóstico de la etiqueta** como lo muestra la UI («etiqueta inactiva»), y diagnóstico de Consent Mode **[NO VERIFICADO]**.
- **Vincular** GA4, Search Console, Merchant Center, YouTube: en general por UI o por la API de Analytics Admin / Merchant
  **[NO VERIFICADO caso a caso]**.
- **Políticas de cuenta**: verificación del anunciante, apelaciones de suspensiones (UI/formularios).
- **Cambios de facturación** con pagos automáticos.
- Crear **anuncios solo de llamada** (retirados) y **DSA nuevos** a partir de su retirada (feb 2027).
- **Segmentación manual por idioma** en Búsqueda/AI Max/PMax en Búsqueda (eliminada sep 2026).
- El **MCP oficial** no puede pausar, pujar ni tocar presupuestos (ver §4.9).

---

## 4. Cambios de plataforma 2024-2026 que afectan al diseño

### 4.1 AI Max for Search

- Lanzado en 2025 (API v21 con `ai_max_setting.enable_ai_max`); sale de beta en 2026. Funciones: **search term matching**
  (palabras tratadas como amplia + «keywordless»), **text customization** (texto generado) y **final URL expansion** (Google
  elige la landing). Controles: marcas incluidas/excluidas, ubicaciones de interés a nivel grupo, guías de texto, URL incluidas
  (page feed), desactivar matching por grupo (`ai_max_ad_group_setting.disable_search_term_matching`).
- Google afirma +7 % de conversiones a CPA similar con todas las funciones (dato interno de Google, no auditado)
  ([blog.google](https://blog.google/products/ads-commerce/dsa-upgrade-to-ai-max-2026/)).
- **Migración automática:** desde **sep 2026** las campañas de Búsqueda con **recursos creados automáticamente (ACA)** pasan a AI Max
  con matching + text customization; las que usan **concordancia amplia a nivel de campaña** pasan con matching. **DSA**: retirada y
  migración automática aplazadas a **feb 2027** (con las 3 funciones activas). Google no describe forma de excluirse.
  Campos de solo lectura `Campaign.aca_migration_date_time` y `broad_match_migration_date_time` (v25.1+) → **podemos detectar qué
  campañas de nuestros clientes fueron migradas y cuándo**, y comparar antes/después.
- `Campaign.keyword_match_type` está deprecado. Con AI Max activado las keywords se comportan como amplia salvo que se desactive
  el matching del grupo.
- Informe: `ai_max_search_term_ad_combination_view` + `search_term_match_source` + `expanded_landing_page_view`.

### 4.2 Performance Max

- **Informes por canal** (`ad_network_type`): UI desde 2025, API desde v23 (ene 2026).
- **Negativas a nivel de campaña** (v20, hasta 10.000) y **listas de negativas compartidas** (ago 2025)
  ([blog](https://developers.google.com/ads/blog/posts/2025/08/unlocking-enhanced-performance-max)).
- **Exclusiones de marca** (`brand_list` negativo), exclusión de edad (2025), género (v24), ingresos (v26.2), segmentación por
  dispositivo (2025).
- **Términos de búsqueda** en `campaign_search_term_view` (v21).
- Placements con `performance_max_placement_view` (solo impresiones).
- Activos de marca (nombre, logo) a nivel de campaña desde jul 2025 si hay brand guidelines.
- URL options a nivel de asset group (v25.2); `GeneratePMaxDraftCampaign` convierte Smart Campaigns en borradores PMax.

### 4.3 Demand Gen

- Sustituyó a Discovery (2024). Desglose por canal YouTube/Maps/Discover/Gmail (v20), selección de canales, Maps como canal
  (v24.2), presupuesto mínimo **5 USD/día** desde 1 abr 2026, ajustes de estacionalidad (beta v26.2), optimización a conversiones
  view-through (v24). Para negocios locales de leads tiene un papel menor que Búsqueda/PMax.

### 4.4 Smart Bidding: mensajes y estado de aprendizaje

Ver §2.10. Legible por API: estado de aprendizaje y su causa, limitaciones (presupuesto, datos, inventario, calidad) y
configuraciones erróneas de conversión. Ajustes de estacionalidad y exclusiones de datos también por API.

### 4.5 Consent Mode v2 y conversiones modeladas

- Consent Mode v2 (parámetros `ad_user_data` y `ad_personalization`) es obligatorio para tráfico del EEE desde **mar 2024**
  para seguir usando funciones de medición/remarketing con datos de usuarios europeos **[fecha de conocimiento general; la página
  de ayuda leída es de 2021]**.
- Modelado de conversiones: requiere implementación correcta y un umbral de **700 clics de anuncios en 7 días** por país y
  dominio; las conversiones modeladas **aparecen mezcladas en la columna «Conversiones»** y alimentan la puja; los usuarios con
  consentimiento convierten 2-5× más que los que no ([Ayuda consent mode](https://support.google.com/google-ads/answer/10548233?hl=en)).
- **Implicación:** en clientes pequeños españoles (pocos clics) **no hay modelado** → las conversiones que faltan por rechazo de
  cookies simplemente desaparecen. Nuestro cruce con **GoHighLevel** (leads reales) permite medir el hueco.
- En subidas por API, `consent.ad_user_data` es «muy recomendado» (sin él, las conversiones pueden no atribuirse).

### 4.6 Conversiones mejoradas para leads, subida offline y Data Manager API

- Enhanced Conversions for Leads: email/teléfono con hash SHA-256 (normalizados) junto al `gclid`; hasta 5 identificadores
  ([Upload clicks](https://developers.google.com/google-ads/api/docs/conversions/upload-clicks)).
- **Restricciones en cascada a la API de Google Ads**:
  - 2 feb 2026: nuevos usuarios no pueden enviar **IP ni session attributes**.
  - 1 abr 2026: nuevos usuarios bloqueados en **Customer Match**.
  - **15 jun 2026**: nuevos usuarios bloqueados en **`UploadClickConversions` (offline e ECfL)**, error
    `CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE`; solo siguen quienes subieron entre el 17 dic 2025 y el 15 jun 2026
    ([blog](https://developers.google.com/ads/blog/posts/2026/05/changes-to-offline-click-conversion),
    [Deprecations](https://developers.google.com/google-ads/api/docs/deprecations)).
- **Data Manager API** ([developers.google.com/data-manager](https://developers.google.com/data-manager/api)): «el nuevo estándar»
  para enviar datos propios (conversiones, audiencias) a Google Ads, GA, DV360, CM360, SA360; las funciones futuras saldrán «solo
  ahí». Admite también la dirección postal en ECfL (la API de Ads no). → **Para subir a Google Ads los leads cualificados/ventas de
  GoHighLevel, nuestro camino es la Data Manager API**, no la API de Ads. **[Autenticación, cuotas y estado GA de la Data Manager
  API NO VERIFICADOS en esta sesión.]**
- **Google Ads Data Manager** (en la UI) es otra cosa: conectores sin código (HubSpot, Sheets, BigQuery, Salesforce, CSV…) para
  subir datos propios. Si GoHighLevel no está entre los conectores, la API es la vía **[lista actual de conectores NO VERIFICADA]**.
- **CRM como conector:** GoHighLevel tiene integración propia de conversiones offline con Google Ads **[NO VERIFICADO]**; comprobar
  si ya cubre esto antes de construir nada.

### 4.7 Agentes de Gemini en Google Ads («Ads Advisor»)

- Anunciado el 12 nov 2025, desplegado en dic 2025 a cuentas en inglés y luego global
  ([blog.google](https://blog.google/products/ads-commerce/ads-advisor-and-analytics-advisor/)). Funciones: recomendaciones (p. ej.
  añadir sitelinks en PMax) **aplicables con aprobación**, generación de keywords y recursos, **resúmenes y explicación de cambios de
  rendimiento** («por qué bajó…»), diagnóstico de rechazos y preparación de arreglos.
- Límites: **solo dentro de la UI**, cuenta a cuenta, sin API, sin memoria del contrato/servicios/CRM del cliente, sin mirar SEO,
  GBP, leads reales ni landing propia. **Nuestro diferencial**: vista multi-cuenta, priorización por € en riesgo, cruce con CRM, SEO,
  GA4, Clarity y ficha del cliente, y registro de decisiones.
- **[Estado en español y en 2026 NO VERIFICADO.]**

### 4.8 Concordancias

- Desde 2021 la concordancia de frase absorbió a la amplia modificada; desde 2024-2025 Google empuja la amplia + Smart Bidding;
  en 2026 el ajuste «broad match a nivel de campaña» se migra a AI Max (§4.1). Exact match sigue existiendo pero con variantes
  cercanas (mismo significado). La recomendación `KEYWORD_MATCH_TYPE` está deprecada a favor de `USE_BROAD_MATCH_KEYWORD`.
- `search_exact_match_impression_share` sigue disponible: útil para ver si perdemos subastas de la consulta exacta.

### 4.9 API + MCP oficial

- **Google Ads MCP Server** open source (oct 2025; [blog](https://developers.google.com/ads/blog/posts/2025/10/open-source-google-ads-api-mcp-server),
  [guía](https://developers.google.com/google-ads/api/docs/developer-toolkit/mcp-server), [GitHub](https://github.com/googleads/google-ads-mcp)).
  Herramientas: `list_accessible_customers`, `search` (GAQL estructurado), metadatos de recursos; escritura **limitada** a crear
  recursos (texto, imagen, vídeo, sitelinks, callouts, snippets), subir vídeo y etiquetas, con flujo **proponer → checksum →
  confirmar**. **No** puede crear/pausar campañas, grupos, anuncios, presupuestos ni pujas. Local (stdio, Python) o remoto en
  Cloud Run (lo despliega uno). Hay «skills» de agente (`google/skills/skills/ads`).
- **Developer Assistant** (plugin para Claude Code y Antigravity, v4.0 ago 2026; «no es producto oficial soportado»): valida GAQL,
  genera código, depura conversiones offline. **Útil para nuestro desarrollo**, no para producción.
- **Valoración para nosotros:** el MCP sirve para exploración ad hoc con Claude; para el agente de producción es mejor nuestra
  propia capa (sincronización a PostgreSQL + herramientas propias con permisos), porque necesitamos histórico, cruces y control de
  escrituras con aprobación.

### 4.10 Funciones retiradas u obsoletas (no diseñar en torno a ellas)

| Función | Estado |
|---|---|
| Posición media | Retirada (2019); sustituida por top/absolute top IS y % |
| Audiencias similares (similar audiences) | Retiradas (2023); listas «lookalike» solo en Demand Gen (cambios abr 2026) |
| Anuncios de texto expandidos (ETA) | No se crean desde 2022; los existentes solo se pausan/activan |
| Concordancia amplia modificada | Absorbida por frase (2021) |
| Ajustes de puja con Smart Bidding | Ignorados salvo dispositivo −100 % (y algunos casos) **[detalle por estrategia NO VERIFICADO]** |
| Anuncios solo de llamada | No se crean desde 1 ene 2026; dejan de servir y desaparecen de la API en **feb 2027** |
| `CallAd` (v23) | Eliminado de la API |
| DSA | Retirada y migración a AI Max en **feb 2027** |
| Smart Campaigns | No se crean nuevas desde 23 sep 2026 |
| Segmentación manual por idioma en Búsqueda | No soportada desde sep 2026 |
| Compartir anuncios entre grupos | Eliminado (ene 2026) |
| `segments.search_subcategory` en insights | Vacío desde mar 2025 |
| Datos diarios > 37 meses | No disponibles desde jun 2026 |
| SKAGs (un grupo por keyword) | No es una función sino una táctica; obsoleta en la práctica por variantes cercanas y AI Max (opinión de sector) |

---

## 5. Retrasos y calidad de datos

([Ayuda: frescura de datos](https://support.google.com/google-ads/answer/2544985?hl=en))

| Dato | Cuándo está listo (para un domingo, hora de San Francisco) | Lectura para España (~+9 h) |
|---|---|---|
| Clics, impresiones, % top, conversiones **last-click** | Refresco **horario** (objetivo 1 h) | Casi tiempo real |
| Conversiones **no last-click** (data-driven) | Lunes 15:00 | Martes de madrugada |
| Ubicaciones automáticas, **geográfico**, **términos de búsqueda** | Lunes 06:00 | Lunes tarde |
| **Cuota de impresiones**, top/absolute top IS, Auction Insights de Búsqueda | **Miércoles 16:00** | Jueves 01:00 |
| IS de Shopping | Viernes 02:00 | Viernes |
| Alcance | Lunes 11:00 | Lunes noche |

- **Search click share: 3 días de retraso**. Métricas competitivas: actualización diaria.
- Importaciones de GA4: ~12 h last-click, ~24 h otros modelos.
- **Los números cambian días después**: tráfico inválido descontado, conversiones tardías, ajustes de facturación de fin de mes.
- **Retraso de conversión** (conversion lag): las conversiones se atribuyen al **día del clic**; un lead que llega 3 días después del
  clic «rellena» el pasado. Por eso una alerta de «2-3 días sin convertir» debe (a) usar `conversions_by_conversion_date` o
  (b) corregir con el desfase típico de la cuenta (`conversion_lag_bucket`) y (c) **comparar con leads reales del CRM**.
- **Conversiones fraccionarias**: con atribución basada en datos (DDA) una conversión se reparte entre clics/campañas → valores como
  0,37; no redondear; contar «leads» enteros desde el CRM o con `all_conversions` por acción.
- **Conversiones subidas offline** aparecen en la fecha de impresión del clic original; last-click hasta 3 h, otros modelos más.
- **Zona horaria de la cuenta** (`customer.time_zone`): todas las fechas de la API están en la zona de la cuenta; no se puede
  cambiar después **[inmutabilidad: conocimiento general]**. Normalizar en nuestra base guardando la zona de cada cuenta.
- **Umbrales de privacidad** en términos de búsqueda: ver §2.3 (medir el % de gasto invisible por cuenta).
- **Cuota de impresiones**: con ~2-3 días de retraso, **una alerta de hoy no puede apoyarse en la IS de ayer**; usar la IS hasta
  hace 3 días como contexto y señales rápidas (impresiones, CPC, posición top %) para el día corriente.
- **Datos de cambios**: hasta 3 min (change_event/status).

---

## 6. Google Ads Scripts frente a la API

| | Google Ads Scripts | Google Ads API |
|---|---|---|
| Acceso | Desde la propia cuenta/MCC; **no requiere acceso de Cloud** | Proyecto de Cloud con nivel Explorer/Basic/Standard |
| Coste | Gratis | Gratis (infra propia) |
| Lenguaje | JavaScript (Apps Script) en servidores de Google | Cualquiera (REST/gRPC) en nuestro servidor |
| Informes | `AdsApp.search()` con GAQL (mismos recursos que la API, misma limitación de Auction Insights) | GAQL completo |
| Escritura | Sí (`AdsApp.mutate`, selectores, bulk uploads) | Sí, más completa |
| Límites | **30 min** por ejecución (60 min en MCC con `executeInParallel` + callback); **50 cuentas** por ejecución MCC; 250 scripts autorizados por cuenta; iteradores 50.000; `withIds` <10.000; logs 100 KB; bulk upload 50 MB / 1M filas | Cuotas de operaciones/día por nivel |
| Programación | Cada hora como mínimo (horaria/diaria/semanal/mensual) **[frecuencia mínima: conocimiento general]** | La que queramos |
| Integración con nuestra base, IA, Telegram | Indirecta (UrlFetch a nuestro endpoint, Sheets) | Directa |
| Autenticación | La del usuario que autoriza; también exige MFA/passkey (2026) | Cuenta de servicio (sin passkey) |

Fuente límites: [Scripts limits](https://developers.google.com/google-ads/scripts/docs/limits).

**Cuándo usar cada uno:**
- **API** como columna vertebral: sincronización diaria a PostgreSQL, histórico, IA, cruces con SEO/CRM/GA4, cola de acciones con
  aprobación, auditoría de cambios. Es la que nos da todo lo del brief.
- **Scripts** como **puente o red de seguridad**: (a) mientras no tengamos acceso Explorer/Basic, un script MCC puede exportar cada
  noche GAQL a un endpoint nuestro (gratis, sin aprobación de Google) — **solución provisional**; (b) «interruptores de emergencia»
  dentro de Google (p. ej. pausar si el gasto del día supera X) que funcionan aunque nuestro servidor caiga.

---

## 7. Tabla: dato que queremos → recurso/campo de la API → disponible → notas

| Dato que queremos | Recurso / campo | Disponible | Notas |
|---|---|---|---|
| Lista de cuentas de la MCC | `customer_client` (desde la MCC) | Sí | `login-customer-id` = MCC |
| Coste, clics, impresiones, CTR, CPC por día | `campaign`/`ad_group`/`keyword_view` + `segments.date` | Sí | Horario; 37 meses de diario |
| Conversiones y coste por lead | `metrics.conversions`, `cost_per_conversion` | Sí | Atribuidas al día del clic; fraccionarias con DDA |
| Conversiones por fecha real de conversión | `conversions_by_conversion_date` | Sí | Mejor para alertas «hoy no hay leads» |
| Conversiones por acción (formulario, llamada, WhatsApp) | `segments.conversion_action(_name/_category)` | Sí | Solo con métricas de conversión; categoría `MESSAGE_LEAD` en v26 |
| Retraso de conversión | `segments.conversion_lag_bucket` | Sí | Para corregir alertas |
| Estado de cada acción de conversión | `conversion_action.status`, `primary_for_goal` | Parcial | Diagnóstico de etiqueta tipo UI no confirmado |
| Cuota de impresiones y perdida (presupuesto/ranking) | `search_impression_share`, `search_budget_lost_*`, `search_rank_lost_*` | Sí | ~2-3 días de retraso; no sumable |
| Parte superior / absoluta | `search_top_impression_share`, `search_absolute_top_impression_share`, `top_impression_percentage` | Sí | |
| Exact match IS, click share | `search_exact_match_impression_share`, `search_click_share` | Sí | Click share 3 días de retraso |
| **Auction Insights** (competidores, solapamiento, por encima) | `metrics.auction_insight_*` | **No** | «Not publicly available»; usar informe programado de la UI o SERP de DataForSEO |
| Nivel de calidad actual y 3 componentes | `ad_group_criterion.quality_info.*` | Sí | Puede venir vacío |
| Histórico de QS | `metrics.historical_*` en `keyword_view` | Sí (probable con `segments.date`) | Verificar segmentación; guardar foto diaria propia |
| Términos de búsqueda (Búsqueda) | `search_term_view` | Sí | Por grupo; umbrales de privacidad |
| Términos de búsqueda PMax | `campaign_search_term_view` | Sí (v21+) | Nivel campaña; sin segmentos de keyword |
| Categorías de búsqueda (PMax/insights) | `customer_/campaign_search_term_insight` | Sí | Cuidado con `RESOURCE_EXHAUSTED` |
| Términos de AI Max con titular y landing | `ai_max_search_term_ad_combination_view` | Sí | Solo segmento fecha [no verificado] |
| Origen del emparejamiento (keyword vs IA) | `segments.search_term_match_source` | Sí | Valores varían por versión |
| % de gasto con términos ocultos | Cálculo propio: coste campaña − Σ coste términos | Parcial (derivado) | Google no lo publica |
| Rendimiento de titulares/descripciones RSA | `ad_group_ad_asset_view` | Sí | Con coste y conversiones; `performance_label` |
| Fuerza del anuncio | `ad_group_ad.ad_strength` | Sí | |
| Rechazos de anuncios/recursos | `policy_summary` | Sí | |
| Rendimiento PMax por canal | `campaign` + `segments.ad_network_type` | Sí (v23+) | |
| Placements de PMax | `performance_max_placement_view` | Parcial | Solo impresiones |
| Asset groups PMax | `asset_group`, `asset_group_asset`, `asset_group_top_combination_view` | Sí | |
| Landing pages reales (incl. expansión de URL) | `expanded_landing_page_view`, `landing_page_view` | Sí | Leer la expandida con AI Max |
| Geografía (física vs interés) | `user_location_view`, `geographic_view` | Sí | Términos geo al día siguiente |
| Hora y día de la semana | `segments.hour`, `segments.day_of_week`, `ad_schedule_view` | Sí | |
| Dispositivo y red (Search Partners) | `segments.device`, `segments.ad_network_type` | Sí | |
| Edad, sexo, ingresos | `age_range_view`, `gender_view`, `income_range_view` | Sí | |
| Historial de cambios con valores y usuario | `change_event` | Parcial | 30 días, 10.000 filas, sin Editor |
| Qué cambió (más tiempo) | `change_status` | Sí | 90 días, sin valores |
| Cambios hechos por Google (autoaplicados) | `change_event.client_type` | Sí | `GOOGLE_ADS_RECOMMENDATIONS_SUBSCRIPTION` |
| Recomendaciones de Google y nivel de optimización | `recommendation`, `metrics.optimization_score` | Parcial | Algunas solo en UI |
| Estado de Smart Bidding (aprendizaje, limitado) | `campaign.bidding_strategy_system_status` | Sí | Enum completo arriba |
| Por qué una campaña no sirve | `campaign.primary_status(_reasons)` | Sí | |
| Simulaciones de puja/presupuesto | `campaign_simulation`, `ad_group_criterion_simulation`, … | Sí | Detalle de tipos a verificar |
| Fecha de migración a AI Max | `campaign.aca_migration_date_time`, `broad_match_migration_date_time` | Sí (v25.1+) | |
| Volumen de búsqueda e ideas | `KeywordPlanIdeaService` | Sí (nivel Basic) | 1 req/s por CID |
| Facturas | `InvoiceService` | Parcial | Solo facturación mensual |
| Alertas de cuenta (pago fallido, suspensión) | — | No (inferir) | `customer.status`, gasto a 0 |
| Experimentos y su significancia | `experiment`, `experiment_arm` | Sí | Confianza desde v24.1 |
| Diagnóstico de subidas offline | `offline_conversion_upload_client_summary` | Sí | |
| Subir leads cualificados del CRM | `UploadClickConversions` | **No para nuevos** (desde 15 jun 2026) | Usar **Data Manager API** |
| Consentimiento / conversiones modeladas | — | No separable | Mezcladas en «Conversiones» |
| Recomendaciones y diagnósticos de Ads Advisor | — | No | Solo UI |

---

## Ideas para nuestro módulo

1. **Desbloquear el acceso ya** (sin «token»): proyecto de Cloud de Kijutech → Explorer (lectura de las 25 cuentas cabe en
   2.880 ops/día) → verificación de marca → Basic. **Cuenta de servicio** añadida a la MCC (Estándar o Admin solo si hace
   falta). Actualizar la memoria y `PENDIENTES-ENRIC.md`: lo que Enric tiene que hacer es crear/verificar el proyecto y añadir el
   email de la cuenta de servicio a la MCC, no pedir un token.
2. **Cliente REST propio** `lib/ads/google-ads-client.ts` con contador de operaciones diarias por proyecto (ventana 24 h), reintentos
   con backoff ante `RESOURCE_EXHAUSTED`, `validate_only` para simulaciones, sin cabecera `developer-token`, versión configurable
   (aviso automático 60 días antes del sunset).
3. **Almacén histórico propio** (`ads_*` en PostgreSQL): diario por campaña/grupo/keyword/término/activo/landing/geo/hora,
   foto diaria de QS, IS, `bidding_strategy_system_status`, `primary_status_reasons`, y **`change_event` cada noche** (la API solo
   da 30 días). Re-sincronizar los últimos 3-7 días cada vez (las conversiones y la IS llegan tarde).
4. **Motor de «porqué»**: una caída de conversiones se explica cruzando, en este orden: cambios recientes (`change_event`,
   quién y qué) → estado de Smart Bidding (aprendizaje, limitado) → `primary_status_reasons` → IS perdida por presupuesto vs
   ranking (con 3 días de desfase) → CPC/top % (presión competitiva) → rechazos de política → landing (web caída, velocidad,
   cambios en la web desde el módulo SEO) → **leads reales en GoHighLevel** (¿es un problema de medición o de negocio?) →
   cookies/consentimiento.
5. **Alertas conscientes del retraso**: «2-3 días sin convertir» calculado con `conversions_by_conversion_date` + desfase
   típico de la cuenta, y confirmado contra el CRM antes de molestar.
6. **KPI «% de gasto invisible»** por cuenta (coste sin término visible) y **«% de tráfico traído por la IA de Google»**
   (`search_term_match_source` AI Max/PMax vs keyword) con su CPA comparado.
7. **Vigilancia de AI Max**: detectar migraciones automáticas (campos `*_migration_date_time`), comparar 28 días antes/después,
   revisar landings elegidas por final URL expansion contra el mapa de páginas del SEO (¿manda tráfico a páginas sin formulario,
   al blog, a páginas caídas?).
8. **Detector de «Google tocó la cuenta»**: `change_event` con `client_type` de recomendaciones autoaplicadas + lista de
   suscripciones activas (`recommendation_subscription`), con propuesta de desactivarlas.
9. **Auction Insights por la puerta de atrás**: informe programado en la UI por email a un buzón de la agencia → lo leemos y
   guardamos semanalmente; complementado con anuncios de competidores vistos en la SERP de DataForSEO.
10. **Escrituras con aprobación**: cola de acciones (negativas, pausas, pujas, presupuestos) siempre con `validate_only` primero,
    etiqueta «agente-kijutech» en lo que toquemos, y registro propio. Las «líneas rojas» del CLAUDE.md (cambios en cuentas
    reales de clientes) exigen el OK de Enric.
11. **Conversiones del CRM a Google Ads** vía **Data Manager API** (no la API de Ads), con hash SHA-256 correcto y consentimiento;
    antes comprobar si la integración nativa de GoHighLevel ya lo hace.
12. **Usar el MCP oficial y el Developer Assistant solo para desarrollo** (explorar GAQL), no como base del agente.
13. **Script de emergencia** en la MCC (gratis): tope de gasto diario y aviso, independiente de nuestro servidor.

## Lo que nadie hace bien (huecos detectados)

- **Explicar la causa con datos de fuera de Google Ads**: Ads Advisor y las herramientas del mercado solo miran la cuenta.
  Nadie cruza de serie con leads reales del CRM, caídas de la web, cambios de la landing, velocidad o posiciones SEO.
- **Tratar bien el retraso de datos**: la mayoría de alertas compara «ayer» sin corregir el conversion lag ni el retraso de la
  cuota de impresiones, y generan falsas alarmas.
- **Medir lo que Google esconde**: % de gasto sin término visible, % de tráfico emparejado por IA, landings elegidas por Google.
- **Historial de cambios largo y explicado**: la API solo da 30 días con detalle; casi nadie lo guarda y lo usa para «antes/después».
- **Auction Insights automatizado**: al no estar en la API, casi ninguna herramienta lo integra; quien lo haga (aunque sea vía
  informe programado) tendrá ventaja.

## Lo no verificado (resumen)

- QPS de `Search` y comportamiento exacto de límites de tasa dinámicos.
- Compatibilidad de `metrics.historical_quality_score` con `segments.date` en v26.
- Detalle de tipos de simulación por recurso (guía con 404).
- Alcance exacto de la retirada de «aggregate asset performance labels» en v23.
- Recurso de alertas de cuenta (no encontrado; se asume que no existe).
- Data Manager API: autenticación, cuotas, conectores de la UI (Google Ads Data Manager) y si GoHighLevel tiene integración nativa.
- Porcentaje medio de gasto oculto por privacidad en términos de búsqueda (cifras de agencias 2020-2023).
- Fecha y alcance de Consent Mode v2 (mar 2024) y estado de Ads Advisor en español.
- Librería cliente para Node/TypeScript (no hay oficial; estado de la de Opteo).
- Facturas por API con pagos automáticos; vinculación de GA4/GSC por API.

## Fuentes

Oficiales (Google):
- Sunset dates: https://developers.google.com/google-ads/api/docs/sunset-dates
- Release notes: https://developers.google.com/google-ads/api/docs/release-notes
- Deprecations: https://developers.google.com/google-ads/api/docs/deprecations
- Developer token (retirada): https://developers.google.com/google-ads/api/docs/api-policy/developer-token
- Access levels: https://developers.google.com/google-ads/api/docs/api-policy/access-levels
- Quotas: https://developers.google.com/google-ads/api/docs/best-practices/quotas
- Call structure (cabeceras): https://developers.google.com/google-ads/api/docs/concepts/call-structure
- Service accounts: https://developers.google.com/google-ads/api/docs/oauth/service-accounts
- Segmentation: https://developers.google.com/google-ads/api/docs/reporting/segmentation
- Change event: https://developers.google.com/google-ads/api/docs/change-event
- Change status: https://developers.google.com/google-ads/api/docs/change-status
- Recommendations: https://developers.google.com/google-ads/api/docs/recommendations
- Upload click conversions: https://developers.google.com/google-ads/api/docs/conversions/upload-clicks
- AI Max getting started: https://developers.google.com/google-ads/api/docs/campaigns/ai-max-for-search-campaigns/getting-started
- PMax reporting: https://developers.google.com/google-ads/api/performance-max/reporting
- PMax campaign reporting: https://developers.google.com/google-ads/api/performance-max/campaign-reporting
- PMax criterion reporting: https://developers.google.com/google-ads/api/performance-max/campaign-criterion-reporting
- PMax criteria: https://developers.google.com/google-ads/api/performance-max/create-campaign-criteria
- Metrics v26: https://developers.google.com/google-ads/api/fields/v26/metrics
- keyword_view v26: https://developers.google.com/google-ads/api/fields/v26/keyword_view
- ad_group_ad_asset_view v26: https://developers.google.com/google-ads/api/fields/v26/ad_group_ad_asset_view
- QualityInfo v26: https://developers.google.com/google-ads/api/reference/rpc/v26/AdGroupCriterion.QualityInfo
- BiddingStrategySystemStatus v26: https://developers.google.com/google-ads/api/reference/rpc/v26/BiddingStrategySystemStatusEnum.BiddingStrategySystemStatus
- SearchTermMatchSource v25: https://developers.google.com/google-ads/api/reference/rpc/v25/SearchTermMatchSourceEnum.SearchTermMatchSource
- MCP server: https://developers.google.com/google-ads/api/docs/developer-toolkit/mcp-server — GitHub https://github.com/googleads/google-ads-mcp
- Scripts limits: https://developers.google.com/google-ads/scripts/docs/limits
- Data Manager API: https://developers.google.com/data-manager/api
- Blog Ads Developer (índice): https://developers.google.com/ads/blog — en particular:
  - https://developers.google.com/ads/blog/posts/2026/09/new-onboarding-experience-for-google-ads-api
  - https://developers.google.com/ads/blog/posts/2026/06/multi-party-approvals-in-google-ads-api
  - https://developers.google.com/ads/blog/posts/2026/11/upcoming-changes-to-multi-party
  - https://developers.google.com/ads/blog/posts/2026/07/passkey-authentication-requirement-for
  - https://developers.google.com/ads/blog/posts/2026/04/multi-factor-authentication-requirement
  - https://developers.google.com/ads/blog/posts/2026/08/google-ads-api-pilot-secure-api-access
  - https://developers.google.com/ads/blog/posts/2026/05/changes-to-offline-click-conversion
  - https://developers.google.com/ads/blog/posts/2026/01/announcing-v23-of-google-ads-api
  - https://developers.google.com/ads/blog/posts/2025/10/announcing-v22-of-google-ads-api
  - https://developers.google.com/ads/blog/posts/2025/08/google-ads-api-v19-release (v21)
  - https://developers.google.com/ads/blog/posts/2025/06/announcing-v20-of-google-ads-api
  - https://developers.google.com/ads/blog/posts/2025/08/unlocking-enhanced-performance-max
  - https://developers.google.com/ads/blog/posts/2025/03/improved-change-tracking-in-google-ads
  - https://developers.google.com/ads/blog/posts/2025/01/google-ads-api-and-google-ads-scripts
  - https://developers.google.com/ads/blog/posts/2025/07/upcoming-changes-to-search-and
  - https://developers.google.com/ads/blog/posts/2025/10/open-source-google-ads-api-mcp-server
- Ayuda Google Ads: frescura de datos https://support.google.com/google-ads/answer/2544985?hl=en ; términos de búsqueda
  https://support.google.com/google-ads/answer/2472708?hl=en ; consent mode https://support.google.com/google-ads/answer/10548233?hl=en ;
  Final URL expansion https://support.google.com/google-ads/answer/16230205?hl=en
- blog.google: DSA → AI Max https://blog.google/products/ads-commerce/dsa-upgrade-to-ai-max-2026/ ; Ads Advisor
  https://blog.google/products/ads-commerce/ads-advisor-and-analytics-advisor/

No oficiales (anécdota/opinión, usadas solo como contraste):
- Foro Google Ads API sobre Auction Insights: https://groups.google.com/g/adwords-api/c/xhwhOAA5854/m/c-l_gKHhAwAJ
- Foro Scripts sobre Auction Insights: https://groups.google.com/g/adwords-scripts/c/4QiVuPttrgI
- Lucid Vitals (prueba v24, ago 2026): https://lucidvitals.com/blog/google-ads-auction-insights

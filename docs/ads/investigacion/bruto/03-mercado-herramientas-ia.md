# 03 — Mercado de herramientas para Google Ads: foco en IA y agentes (2024-2026)

Investigación del 28 nov 2026. Cubre plataformas enterprise, agentes de IA para PPC, herramientas de nicho, scripts de la comunidad y la
tendencia del mercado. Optmyzr, Adalysis, Opteo y TrueClicks quedan para el otro informe (solo se citan para comparar).

**Limitaciones de esta investigación (honestidad):** el límite de búsquedas web de la sesión se agotó antes de terminar. Quedaron SIN
investigar a fondo: precios de feeds (DataFeedWatch, Channable), Hyros/Factors/LeadsRx, Adobe Advertising, Smartly en Google, Adzooma/
Acquisio/WordStream actuales y herramientas españolas. Varias páginas de Search Engine Land devolvieron 403 y solo pude ver el titular o
resúmenes secundarios. La mayoría de las comparativas de agentes de IA son **vendor blogs** (Groas, Ryze, Markifact, Optmyzr, Lunio...):
cada cifra de rendimiento es afirmación del vendedor salvo que diga lo contrario.

---

## 0. Resumen ejecutivo

1. **La tendencia 2025-2026 es clara: reglas → recomendaciones → agentes conversacionales → agentes con acción y aprobación.** Casi todos
   los jugadores (Google, Optmyzr, Skai, Semrush, Ryze, Markifact...) han lanzado en 2026 un «agente» o un conector MCP. Pero la mayoría
   son **chat sobre los datos + sugerencias**, no vigilancia autónoma con diagnóstico causal.
2. **Google ha movido ficha:** Ads Advisor (nov 2025) → **Ask Advisor** (GML, 20 may 2026), un agente Gemini unificado Ads+Analytics+Merchant
   Center, en beta, solo cuentas en inglés. Quien lo ha probado (Jyll Saskin Gales) lo describió como «un becario que acaba de sacarse
   la certificación de Google Ads»: diagnostica mal, cita interfaces obsoletas, no hace cambios (versión de nov 2025).
3. **MCP oficial de Google (oct 2025, Apache-2.0):** solo 3 herramientas de lectura (GAQL) + escrituras mínimas (assets, etiquetas).
   **No puede** crear/pausar campañas, anuncios, presupuestos ni pujas. Es una tubería de datos sin lógica de optimización.
4. **Noticia crítica para Kijutech:** desde el **9-10 sep 2026 los developer tokens se han retirado**. El acceso ahora es por **proyecto de
   Google Cloud** (Test/Explorer/Basic/Standard) y se solicita desde la página «Google Ads API Overview» de Cloud Console, **sin necesitar
   cuenta de administrador (MCC)**; Basic Access es automático en minutos tras verificar la marca del proyecto. Lo que el módulo marca como
   «falta el token de desarrollador de la MCC» probablemente ya no es el requisito. **Verificar con Enric y Google** (ver §8).
5. **Segunda noticia crítica:** desde el 15 jun 2026 las **importaciones de conversiones offline** (y «enhanced conversions for leads») salen de
   la Google Ads API hacia la **Data Manager API**; quien no las usaba antes recibe `CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE`. Si queremos
   enviar leads de GoHighLevel a Google Ads, hay que diseñarlo contra la Data Manager API desde el principio.
6. **Los agentes autónomos de pago (Groas, Albert, Pixis) tienen pruebas independientes casi nulas.** Lo independiente apunta a: supervisión,
   límites de gasto, puntuación de confianza (Nils Rooijmans: autoañadir negativas solo por encima del 85 %), registro de auditoría y filtro
   determinista previo (scripts/SQL) antes del LLM.
7. **Las pruebas independientes de AI Max** (Smarter Ecommerce, 250+ campañas retail: ROAS ~35 % menor; Mantica, 4 meses: 100 $ vs 44 $ por
   conversión en frase; Brainlabs 23 tests) apoyan una vigilancia que **audite lo que Google automatiza** (términos de búsqueda, expansión de URL).
   Google reconoce un cambio de 14 % → 7 % en su cifra de mejora (según Rework, secundario, no verificado).
8. **Hueco libre:** nadie combina (a) datos de Ads con (b) ficha de cliente, SEO/landing, CRM de leads y calidad de lead, y (c) diagnóstico
   causal con aviso y propuesta aprobable, **en español y a precio de agencia**. Es exactamente lo que ya tiene el ecosistema de Kijutech.

---

## 1. Plataformas enterprise

### 1.1 Search Ads 360 (SA360) — Google
- **Qué hace distinto:** gestión multimotor (Google, Microsoft Advertising, Yahoo Japón), **portfolio bidding entre motores y campañas**,
  medición unificada con **Floodlight** (varios modelos de atribución, microconversiones que alimentan puja y presupuesto), informes de RSA
  más granulares por activos. Fuente (Adswerve, partner de Google): https://adswerve.com/blog/ai-in-search-ads-how-sa360-builds-on-google-ads-for-enterprise-growth
- **2026:** Google dijo que los betas de Google Ads llegarán a SA360 a la vez; nueva **Home con Gemini** que combina insights y sugiere acciones
  (Marketing Platform Drop, oct 2026); el 20 ago 2026 añadió prueba de presupuesto/objetivo multicampaña y herramienta de previsión
  (según resultados de búsqueda; no he leído la página original). Fuentes: https://ppc.land/search-ads-360/ y
  https://blog.google/products/marketingplatform/360/google-marketing-platform-drop-october/
- **Precio:** no público, enterprise. **Para nosotros:** irrelevante por coste y escala, pero marca qué considera Google «estado del arte»:
  puja por cartera, previsión, medición propia.

### 1.2 Skai (ex Kenshoo)
- Plataforma omnicanal (búsqueda, social, retail media; Amazon, Walmart, Criteo, Google, Microsoft, Meta). IA **Celeste** (recomendaciones),
  **Skai Studio** (13 may 2026): «sistema operativo nativo de agentes», **escuadrones de agentes** que monitorizan, diagnostican causa raíz,
  ajustan presupuestos y avisan; límites definidos por la organización y **puntos de aprobación humana** en cualquier paso; «Agent-Ready
  Optimization» para empezar asistido e ir cediendo decisiones. Beta en verano 2026. Conector MCP para agentes propios del cliente
  («Agent Connect»). Fuente: https://ppc.land/skai-claims-first-agent-native-marketing-os-amid-ai-agent-rush/
- Precio no público; según Rework (secundario) tarifa plana anual personalizada desde 2026. Hubo ~100 despidos (~20 % plantilla) en jun 2026
  según un resultado de búsqueda (no verificado en fuente primaria).
- **Crítica/dudas:** el propio artículo plantea si el agente dará mejoras medibles o reempaqueta lo anterior. **Es el diseño conceptual más
  parecido a lo que queremos (detectar → diagnosticar → notificar → aprobar), pero para anunciantes de retail media, no para agencias de leads locales.**

### 1.3 Marin Software
- **Ya no es un jugador estable:** capítulo 11 el 1 jul 2025, plan de reorganización confirmado el 29 ago 2025, comprada por Kaxxa Holdings
  (ESW Capital). Antes había anunciado disolución. Fuentes: https://searchengineland.com/marin-software-shutting-down-454228 ,
  https://ng.investing.com/news/sec-filings/marin-software-completes-bankruptcy-reorganization-cancels-existing-shares-93CH-2094558
- Funciones previas relevantes: previsión por campaña (BI Connect, T1 2025), «Cross-Strategy Allocation», soporte de Google Portfolios.
  https://www.marinsoftware.com/whats-new-in-marin/q1-2025. **Lección:** no depender de proveedores enterprise de nicho; riesgo de continuidad.

### 1.4 Smartly y Adobe Advertising
- **Smartly:** foco social (Meta, TikTok, Pinterest, Snapchat, YouTube); Predictive Budget Allocation entre canales; mínimo reportado 4.000-5.000 $/mes
  (Rework, secundario). No es una herramienta de Google Ads Search. https://resources.rework.com/tools/ai-agents/best-ai-agents-for-paid-ads-2026
- **Adobe Advertising:** NO INVESTIGADO (se agotó el límite de búsquedas). No afirmo nada.

### 1.5 Qué enseñan las enterprise
Modelos de puja propios con señales externas (SA360 Floodlight), **previsión y asignación de presupuesto por cartera**, y ahora «escuadrones
de agentes con barandillas». Lo que Google está copiando dentro de Google Ads: **campaign total budgets** (66 % menos ajustes manuales según
Google), **demand-led pacing** (gasto hacia días de mayor demanda sin pasar el tope mensual) y **journey-aware bidding (beta)**, que aprende de
conversiones biddable y no biddable (llamadas, formularios) cuando se sigue todo el recorrido del lead.
Fuente: https://blog.google/products/ads-commerce/bidding-budgeting-google-marketing-live-2026/ (cifras de Google, no verificadas por terceros).

---

## 2. Agentes y herramientas de IA para PPC (lo más nuevo)

### 2.1 Agentes de Google
| Producto | Qué es | Estado | Fuente |
|---|---|---|---|
| **Ads Advisor** (nov 2025) | Asistente Gemini dentro de Google Ads; solo instrucciones, no cambia nada | Predecesor | https://askstudies.blogspot.com/2025/11/googles-new-ads-advisor-ai-is-put-to.html (copia de SEL) |
| **Ask Advisor** (GML 20 may 2026) | Agente unificado Ads + Analytics + DV360 + Merchant Center; proactivo; puede montar campañas desde Merchant Center; cambios importantes requieren aprobación | Beta global, **solo cuentas en inglés** | https://ppc.land/googles-ask-advisor-unifies-ads-analytics-and-commerce-in-one-ai-agent/ |
| **Dashboards en Google Ads** (ago 2026) | Visualizaciones desde texto | Beta, inglés | https://blog.google/products/ads-commerce/google-ads-analytics-ai-updates/ |
| **MCP oficial** (oct 2025, v0.0.6) | Servidor open source, lectura GAQL + escrituras parciales | GA | https://developers.google.com/google-ads/api/docs/developer-toolkit/mcp-server |
| **AI Max for Search** | Coincidencia ampliada de términos, personalización de texto y expansión de URL final; por defecto en campañas Search nuevas (según Rework) | GA; DSA se retira en sept 2026 y se funde en AI Max | https://blog.google/intl/es-es/google-marketing-live-2026/ |

- Prueba de Ads Advisor (Jyll Saskin Gales, 24 h): acertó al aconsejar desactivar Display y Search Partners en campañas nuevas, pero
  **diagnosticó mal el rendimiento**, citó «Herramientas y configuración > Conversiones» (interfaz obsoleta) y sus pasos de implementación fallaron.
  Ginny Marvin (Google Ads Liaison) dijo que coincidía con su valoración. (Opinión de experta; resumen secundario.)
- **Importante para nosotros:** Ask Advisor solo funciona en inglés y no conoce la ficha del cliente, el CRM ni la landing. Google tiene incentivo
  de ingresos distinto al del anunciante (opinión de Nils Rooijmans, en el podcast de Optmyzr, ver 2.3).
- Estudio WordStream (ppc.land): ante 45 preguntas PPC, **el 20 % de las respuestas de IA generalista eran erróneas** (AI Overviews 26 %, ChatGPT 22 %,
  Meta AI 20 %, Perplexity 13 %, Gemini 6 %): datos obsoletos (CPC mejorado, anuncios de texto), CTR mal comparado, palabras clave demasiado amplias.
  https://ppc.land/one-in-five-ai-responses-for-ppc-strategy-contain-inaccuracies-study-finds/ **Implicación: un agente con LLM sin datos propios ni
  base de conocimiento actualizada fabrica sabiduría obsoleta. Hace falta base de reglas verificadas y datos reales de la cuenta.**

### 2.2 Agentes comerciales de terceros
| Herramienta | Qué promete | Qué hace según fuentes | Autonomía | Precio | Evidencia |
|---|---|---|---|---|---|
| **Optmyzr Sidekick** (5.0 ene 2026, 6.0 después) | Agente PPC multi-plataforma (Google, Microsoft, Amazon, Meta, Yahoo) | Chat consciente de la pantalla, explica cambios, informes, acciones «desde el chat», perfil de IA, **conector MCP** para usar Sidekick desde Claude/ChatGPT con su lógica | Asistida; aprobación no descrita en la fuente que pude leer | Optmyzr: desde ~209-389 $/mes según gasto (Rework, secundario); oferta Black Friday 45 % | Todo vendor. Sin reseña independiente. https://www.optmyzr.com/blog/optmyzr-sidekick-a-ppc-agent-built-for-your-workflow/ |
| **Groas** | «Primer servicio de gestión de Google Ads totalmente autónomo»: red de agentes IA 24/7 + gestor humano; deshacer por acción | Pujas, presupuestos, procesado de términos; estrategia la lleva un humano | Alta | 999 $/mes hasta 15.000 $ de gasto (según Ryze, competidor) | Artículo patrocinado en SEL («lo expresado es del patrocinador»). **Cero medición independiente.** Cifras «35-50 % de mejora» solo de su blog. https://searchengineland.com/groas-introduces-a-fully-autonomous-approach-to-google-ads-management-474345 (403 al leer) |
| **Ryze AI** | Gestión de Google Ads con IA; propone pujas, presupuestos, palabras clave, negativas | Resumen semanal de 20 min, pacing, Shopping/PMax, «Sidekick» NL; **MCP** con 150+ herramientas (8 lectura/6 escritura en Google) | Según Toolradar: aplica tras aprobación; según Ryze: ejecución autónoma. **Contradictorio** | 89 $/mes (plan Ads) hasta 1.499 $; Groas dice «~500 $» (competidor) | Mezcla de vendor y competidores. https://toolradar.com/tools/ryze-ai |
| **PPC.io (Stewart Dunlop)** | 96-116 herramientas gratis + «Agents» (lista de espera) | Agentes de gasto desperdiciado y auditoría semanal, **solo lectura vía OAuth**; scripts para exportar datos «listos para IA» | Solo lectura | Starter 59 $/mes (8 cuentas), 179 $/mes otro tier; consultoría 3.000 $/mes (cifras inconsistentes) | https://ppc.io/agents/wasted-spend-agent |
| **Semrush Ads AI Agent** | Chat «asesor continuo» dentro del Advertising Toolkit | Conecta Google Ads, analiza datos en vivo y compara con benchmarks/competidores de la industria; recomienda, **no ejecuta** (se aplica por otra herramienta) | Ninguna | No indicado en la página | https://ja.semrush.com/kb/1623-ads-ai-agent |
| **Markifact** | MCP hospedado para Claude/ChatGPT | 60+ operaciones; **toda escritura requiere aprobación**; p. ej. añadir negativas, cambiar presupuesto | Asistida, aprobación explícita | Pro 79 $/mes, Team 249 $/mes (su propio blog) | https://www.markifact.com/blog/google-ads-mcp-servers (autocomparativa) |
| **Adspirer** | Plugin/MCP lectura+escritura para Claude/ChatGPT | Aprobación de Google Ads API a nivel agencia anunciada; 39 o 400+ herramientas (cifras contradictorias) | Confirmaciones en acciones relevantes | 0-199 $/usuario/mes | https://www.adspirer.com/docs/knowledge-base/why-not-official-google-ads-mcp |
| **GoMarble** | MCP gratis (MIT) | `list_accounts`, `run_gaql`, `run_keyword_planner`; **sin escritura**; último commit visible dic 2025 | Ninguna | Gratis | Markifact (competidor) |
| **Albert.ai** | IA autónoma multicanal (~90 % del universo biddable) | Auto-optimiza diseño de campaña y reasigna gasto | La más alta de la lista | Presupuesto a medida | Sin reseñas recientes independientes; FAQ de abril 2023 (Madgicx, competidor) |
| **Pixis** | Prism: asistente NL, agentes, creatividades en Meta+Google | — | Media | A medida | G2 4,6/57 reseñas (Madgicx, secundario) |
| **Madgicx** (Meta, para comparar) | Optimizador de presupuesto autónomo dentro de un tope; «AI Marketer» con aprobación en un clic | — | Mixta | ~45-99 $/mes | Solo Meta |
| **Triple Whale / Northbeam** (e-commerce) | Moby con automatizaciones con barandillas / atribución + incrementalidad | — | Media / ninguna | 219-749 $ / 1.500-3.500 $ al mes | https://resources.rework.com/tools/ai-agents/best-ai-agents-for-paid-ads-2026 |
| **Open source en Claude Code (claude-ads, Daniel Agrici)** | Auditoría 250+ comprobaciones multiplataforma | Cada comprobación termina en pass/fail/unknown/not_applicable; **«unknown» nunca se adivina**; cobertura de evidencia ≥80 % = graduada, 60-79 % provisional, <60 % insuficiente | Ninguna (lectura) | Gratis | https://raw.githubusercontent.com/AgriciDaniel/claude-ads/main/README.md (los 12 perfiles de puntuación están desactivados) |

No pude comprobar Adsgency ni Bïrch/Revealbot (límite de búsquedas) → **no verificado**.

### 2.3 Lo que dicen los expertos independientes
- **Nils Rooijmans** (podcast PPC Town Hall de Optmyzr): agentes = «becarios con una confianza aterradora». Recomienda: **un agente, un trabajo** (empezó por
  negativas); **puntuación de confianza** y umbral (autoañade negativas por encima del 85 %, con log y resumen por correo, y espera a un humano por debajo);
  **SOPs claras y contexto del cliente**; **registro de auditoría**; **primera pasada determinista** (scripts filtran antes del LLM, controla coste y foco);
  modelos baratos para tareas simples; modelos abiertos en su VPS para que los datos del cliente no lleguen a un proveedor. Errores observados: «car insurance
  near me» bien marcado porque el cliente no tiene oficinas, pero proponía negar «Kia K3» asumiendo que coches baratos no interesan. Se le escapan límites de
  pujas en estrategias de cartera. Fuente: https://www.optmyzr.com/ppctownhall/can-ai-agents-really-manage-google-ads-accounts/ (anécdotas, sin precisión medida).
- **Mike Rhodes (Ads to AI / 8020agent):** 8020agent.com, herramienta gratuita de informes (jul 2025), «hace el 80-90 %»; comunidad Ads to AI 799 €/año;
  curso con 40+ «skills» para Claude Code; su script de PMax se atribuye a «16.600+ agencias» (cifra de terceros, no verificada). Fuente: https://mikerhodes.pages.dev/
- **Scandiweb, TripleDart, Stormy.ai** (blogs de agencias): patrón común «Claude audita por MCP → genera scripts personalizados con los datos de la cuenta» y
  scripts «guardarraíl» contra sobregasto. Un caso (vendor, no verificado) monitoriza pacing de 50 cuentas. https://scandiweb.com/blog/ai-agent-bites-10-automating-ppc-audits-with-claude-and-mcp/
- **Riesgo documentado de agentes autónomos:** KickPoint y Search Engine Land advierten que un agente con una premisa errónea puede gastar días sin que nadie lo
  note. Un caso de competidor: ajustes de presupuesto hacia clics baratos de baja calidad de lead subieron el coste por trabajo reservado un 11 % (anécdota con interés).

### 2.4 Qué hay de verdad y qué no (síntesis)
- **Hay:** chat sobre datos, auditorías puntuales, recomendaciones priorizadas, MCP con escritura aprobada, informes automáticos.
- **Casi no hay (en producción y verificado):** vigilancia continua con **diagnóstico causal** («tu CPA subió porque X competidor entró en la subasta / porque
  perdiste cuota por ranking / porque la landing cayó»), conocimiento del **negocio** (margen, zona, servicios), cruce con **leads reales del CRM**.
- Casi todo se vende con cifras no verificadas; ninguna fuente independiente midió a Groas, Albert o Ryze.

---

## 3. Herramientas de nicho que cubren huecos

### 3.1 Fraude de clics
| Herramienta | Notas | Precio (listado) |
|---|---|---|
| ClickCease (CHEQ) | Google, Meta, Microsoft; «Pixel Guard» (afirma mantener señales de bot fuera de Smart Bidding/PMax), «Lead Shield» puntúa envíos de formulario y escribe en CRM; «2.000+ pruebas por visitante» | 99 $/mes (≈84 $ anual) |
| ClickPatrol | Mejor valorado en la propia tabla de ClickCease (9,3/10 vs 8,5) | ≈63-65 $/mes (anual), 124 $ con Meta+Microsoft |
| Fraud Blocker | **Corta la protección al alcanzar el límite de clics** | 79 $/mes (63 $ anual) |
| ClickGuard | — | 89 $/mes |
| TrafficGuard | Prueba de 30 días | 49 $/mes |
| Lunio | Enterprise; cobertura PMax declarada; dato propio: en retail, IVT con AI Max pasó de 2,46 % a 5,28 % en 6 meses (115 M clics, metodología no descrita) y 8,51 % de presupuesto desperdiciado de media | Con venta; estimado 500 €+/mes |
Fuente: https://www.clickcease.com/blog/clickcease-vs-competitors-2026/ (página de ventas de ClickCease; sesgo). Lunio: https://www.lunio.ai/blog/how-ai-agents-are-reclaiming-advertisers-wasted-spend.
**Crítica:** la Google Ads API no expone las IP de los clics; estas herramientas dependen de un píxel propio en la web y excluyen IP (límite de 500 IP por cuenta;
dato que recuerdo de la documentación de Google, **no verificado aquí**). En PMax y AI Max su control es limitado. Para negocios locales con presupuestos pequeños el
beneficio incremental es discutible; detectar el síntoma sí es posible con datos propios (ver §9).

### 3.2 Seguimiento de llamadas y calidad de lead
- **CallRail:** ~50-55 $/mes; transcripción y análisis de llamadas. **WhatConverts:** ~30 $/mes base, 90-150 $ realista, planes agencia; resumen de IA de leads;
  **CallTrackingMetrics:** ~79 $/mes más cargo por número. CTM se orienta a call centers; WhatConverts a agencias y atribución de leads; Invoca a enterprise.
  Fuente: https://www.callrail.com/blog/best-call-tracking-software (de CallRail, sesgo) y https://costbench.com/compare/whatconverts-vs-callrail/.
- **No pude verificar** cómo envían estas herramientas conversiones offline a Google Ads, ni Hyros, Factors o LeadsRx.
- **Conversiones offline:** Google llama «heredado» a la importación estándar y recomienda **enhanced conversions for leads** (con email/teléfono hasheados, mediana
  +10 % de conversiones frente a solo GCLID, dato de Google). Conectores listados: Zapier, Salesforce, HubSpot. Desde 15 jun 2026 el camino es la **Data Manager API**.
  https://developers.google.com/ads/blog/posts/2026/05/changes-to-offline-click-conversion y https://support.google.com/google-ads/answer/14274408
- Recomendación de Google para captación de leads: usar el objetivo «lead cualificado» o «lead convertido», no solo «lead enviado». Eso conecta con la propuesta de
  journey-aware bidding de §1.5.

### 3.3 Landings
- **Unbounce:** Smart Traffic (IA que deriva cada visita a la variante con más probabilidad de convertir; ~50 visitas para empezar; «+30 %» es cifra del vendor),
  Dynamic Text Replacement (cambiar titular según la keyword). Plan Optimize ≈199-249 $/mes (fuentes discrepan). **Instapage AdMap:** mapa visual anuncio → landing
  para «message match» a escala; requiere planes altos; sin Smart Traffic. Ambos con bloqueo de proveedor (sin exportar HTML/CSS).
  https://instapage.com/features/admap/ y comparativas de terceros (itechguides, Hackceleration).
- **Lo relevante:** el «message match» es un problema de **pantalla de diagnóstico**, no de builder. Nosotros ya tenemos rastreador y contenido de la web del cliente; el cruce
  anuncio ↔ landing (el «Landing Page + Ad Mismatch Detector» de PPC.io es un script que solo compara temas) se puede hacer con **embeddings** que ya tenemos.

### 3.4 Feeds (e-commerce)
**No investigado por límite de búsquedas.** Solo consta, vía scripts, que el pausado de productos sin stock y la frecuencia de actualización del feed se resuelven con
scripts gratuitos (ver §4). DataFeedWatch y Channable: pendiente.

### 3.5 Competencia
- **Adthena:** inteligencia de subasta enterprise, precio a medida, 4,4/5 en G2. **SpyFu:** ~29-39 $/mes (fuentes discrepan), PPC y SEO de la competencia.
  **Semrush Advertising Toolkit:** desde ~139,95 $/mes (plan base de Semrush), datos de coste, copy y histórico de anuncios; **«datos, no optimización»**.
  **Auction Insights nativo** es gratis pero limitado (sin datos por término ni histórico largo en la interfaz). https://www.g2.com/products/adthena/pricing
- Hueco: nadie traduce «competidor X subió en cuota» a una acción para un CPC concreto de un cliente local en España. Estas herramientas son USA-céntricas.

### 3.6 Informes de cliente
- **Swydo:** desde 69 $/mes (10 fuentes, usuarios ilimitados), resúmenes de IA en todos los planes con 4 prompts (Resumen, Logros, Problemas, Recomendaciones) en varios idiomas;
  **AgencyAnalytics:** desde 59 $ (5 clientes); su precio por cliente subió de ~10 a ~20 $ en mayo 2025 (Hackceleration); IA «Ask AI»; **DashThis:** desde 54 $ por 3 dashboards;
  **Looker Studio:** gratis con conectores de pago. https://swydo.com/blog/best-ai-reporting-tools/ (de Swydo, sesgo). **Crítica:** informan, no diagnostican; su IA cuenta qué pasó, no por qué.

### 3.7 Herramientas españolas/europeas
Casi nada verificado. Capterra España lista Optmyzr (4,7/5, 184 reseñas) y Acquisio (3,9/5, 41); Cyberclick menciona Adzooma, Acquisio, WordStream, Marin, Skai, Optmyzr y Adalysis
(sin precios) https://www.cyberclick.es/numerical-blog/ppc-en-la-era-de-la-ia-plataformas-para-optimizar-tus-campanas. **No encontré una alternativa europea directa a Optmyzr.**
Adsmurai se cita sin datos. Esto sugiere que el hueco «español, centrado en leads de servicios locales» está desatendido (no verificado de forma exhaustiva).

---

## 4. Google Ads Scripts y librerías de la comunidad

Los scripts siguen siendo el **motor de detección barato** del sector; los agentes de IA modernos los usan como primera pasada. Reglas útiles (algunas umbrales vienen de un blog de Groas,
vendor, así que son orientativos).

### 4.1 Lista de scripts más recomendados y qué detectan
**Alertas y salud de cuenta**
- **Detector de anomalías de cuenta** (Google, oficial): cambios inusuales de rendimiento entre cuentas. Umbrales sugeridos por Groas: gasto +30 % sobre media diaria, conversiones −40 %, mínimo 50 $ de gasto.
- **Change History Alerts** (Nils Rooijmans): cambios en la cuenta, incluidos **recomendaciones autoaplicadas** y accesos desconocidos. Muy útil para un agente: responde «¿qué cambió?».
- **Disapproved Ads / Disapproved Products / Past Violations Alerts** (Nils): anuncios y productos rechazados, reportados cada mañana.
- **Broken Link Checker** (Google) y **MCC Report Link Checker** (adsscripts.com): URLs finales con error; comprobar primero las de más gasto, semanal o diario si el equipo web publica a menudo.
- **Check for Redirects** (Nils).
- **Report Missing RSA Ad Groups** (Nils): grupos sin anuncio adaptable.
- **Conversion Action Health Check** (Stewart Dunlop, PPC.io): etiquetas con cero conversiones, desajustes de recuento, nombres duplicados, problemas de atribución.
- **Conversion lag watchdog** (Groas): compara el mismo rango en dos momentos; si los datos de hace 7 días aún cambian >15 %, la ventana es demasiado corta. **Idea que aplica directo a nuestras alertas «sin convertir en 2-3 días»: no alertar sin tener en cuenta el retardo de conversión.**

**Presupuesto**
- **Daily Budget Overdelivery Alerts** y **Monthly Budget Spend Alert** (Nils). **Budget pacing** (Groas): proyecta el gasto de fin de mes con gasto acumulado y días transcurridos; avisa solo si la proyección se desvía ±10 % del objetivo.
- **Daily Budget Check:** campañas limitadas por presupuesto con sugerencia de aumento.
- **Performance Degradation Agent** (Stewart): declives lentos, media 7 días frente a línea base de 30.

**Palabras clave y términos de búsqueda**
- **N-gram analyses** (Nils / Search Engine Land): agrupan términos por fragmentos («gratis», «empleo», «DIY»). Umbrales de Groas: informacionales con >25 $ y 0 conversiones; dudosos con >50 $ (150 $ si la cuenta gasta 20.000 $/mes); navegacionales que nunca convierten. Ventaja: negar **patrones**, no consultas sueltas.
- **Negative Keyword Suggestions** (Nils): términos con clics y sin conversiones. **Negative Keyword Conflicts**, **Negative Keyword Gap Finder** (Stewart). **Make Exact Match Exact:** variantes cercanas de coincidencia exacta que desperdician gasto.
- **Trending Search Terms**, **PMax Trending Search Categories** (Nils), **Monitor Close Variants** (Nils).
- **Wasted Spend Forensics** (Stewart): cero conversión y CPA alto por varias dimensiones, con totales.
- **Lin Rodnitzky Ratio** (Nils), **Search Partner ROAS Alerts** (Nils; el brief pedía Search Partners: este es el que existe), **High CPC Bid Alerts** (Nils).
- **Quality Score history logger** (Groas): guarda semanalmente el Nivel de Calidad y sus componentes para palabras con >100 $ de gasto en 30 días, **para investigar caídas con una línea temporal**. Quality Score Tracker (Stewart), Quality Score Analysis (Karooya).
- **A/B Testing Statistical Significance** (Stewart).

**Performance Max**
- **PMax Insights Script** (Mike Rhodes): activos, señales de audiencia, categorías de búsqueda. **PMax Non-Converting Search Terms Alert**, **PMax Placement Exclusion Suggestions** (Nils). **PMax Brand Traffic Analyzer** (smec). **PMax asset-group exporter** (Groas): «los totales de campaña pueden esconder un grupo de activos con el 70 % del gasto y la mitad del ROAS». Google dice que los scripts **no pueden crear** campañas PMax.

**E-commerce:** out-of-stock pauser (FreeAdWordsScripts), Revenue Maximiser Tiering, Gross Profit Analysis, 7/14/28/90 Day ROI lookback (Jack Felsted), clasificación Stars/Cash Cows/Question Marks/Dogs (Stewart).

**Agencia/MCC:** MCC Performance Dashboard, MCC Account Health Dashboard (cuentas puntuadas 0-100 por conversiones, eficiencia, CTR, pacing y cuota de impresiones), **Competitor Alert Agent** (cambios en cuota de impresiones, solapamiento y posición de competidores), Execute in Parallel on 50+ Accounts Using Labels (FreeAdWordsScripts).

Fuentes: https://ppc.io/blog/google-ads-scripts , https://nilsrooijmans.com/google-ads-scripts/ (solo títulos), https://groas.com/post/9-google-ads-scripts-still-worth-running.md , documentación de Google
https://developers.google.com/google-ads/scripts/docs/examples . Brainlabs: no pude leer su página de scripts (404 en la URL probada) → **no verificado** qué publica hoy.

### 4.2 Scripts que se «borraron» (conocimiento valioso, según Groas)
Ajustes manuales de puja por hora/dispositivo (duplican Smart Bidding salvo <30 conversiones/mes), scripts de posición por palabra clave, rotadores de anuncios con
pausa a 100 impresiones (muestra demasiado pequeña; mejor juzgar a ≥1.000 impresiones por conversiones), auto-negadores de un solo término, informes PDF semanales sin abrir,
duplicadores de tipo de concordancia. **Opinión de un vendor; coincide con el consenso general y con la regla de PPC.io «no hacer pausas por CTR con poca muestra».**

### 4.3 Límites de los scripts
Se ejecutan por MCC pero con límite de tiempo y de operaciones, no tienen contexto de negocio, y las hojas de cálculo no escalan a 25+ cuentas con histórico. Nuestro sistema (PostgreSQL con histórico diario)
supera eso. Muchos están desactualizados; revisar la fecha del último cambio del código.

---

## 5. Comparación con Optmyzr / Adalysis / Opteo (solo para situar)
- Optmyzr es el único del grupo clásico que ha convertido su motor de reglas en **agente consumible desde Claude/ChatGPT por MCP**, con argumento «el MCP de Google solo da datos; nosotros damos qué hacer con ellos».
  Su afirmación: las recomendaciones de plataforma optimizan los valores por defecto de Google, no tus objetivos.
- Resto (Rework, secundario): Adalysis 149 $/mes hasta 50.000 $ de inversión; Opteo solo Google Ads; Adzooma, WordStream, Acquisio de menor peso en 2026.

---

## 6. Tendencia 2025-2026

1. **Etapa 1 (hasta 2023): reglas** (Optmyzr, scripts, Google Rules): si X entonces Y. Frágiles, sin contexto.
2. **Etapa 2 (2023-2025): recomendaciones y auditorías** (Opteo, Adalysis, optimization score de Google). Se aceptan o no.
3. **Etapa 3 (2025-26): chat sobre los datos + MCP.** Google MCP (oct 2025), Ads Advisor (nov 2025), Sidekick, Semrush Ads AI Agent, Ryze, Markifact, Adspirer. El diferencial está en la lógica que acompaña a los datos.
4. **Etapa 4 (2026): agentes con barandillas y aprobación.** Skai Studio, Ask Advisor, Groas (autónomo + humano). Aún en beta o con evidencia débil.
5. **Contra-tendencia clara:** los profesionales independientes piden **determinismo primero, LLM para lo ambiguo, confianza explícita, auditoría**. Los vendors que prometen «totalmente autónomo» carecen de pruebas independientes.
6. **Google automatiza más y da menos visibilidad** (AI Max, PMax, DSA absorbido), y las pruebas independientes sobre AI Max son negativas en eficiencia (Smarter Ecommerce: ROAS ~35 % menor sobre 250+ campañas retail, AI Max 5 % del gasto de las campañas donde se activa; Mantica: 100,37 $ por conversión vs 43,97 $ en frase y 52,69 $ en exacta; Brainlabs 23 tests, según resumen secundario: conversiones −38 % y CPL casi el doble;
   https://ppc.land/independent-tests-show-ai-max-underperforms-traditional-match-types/). Hay casos positivos publicados por Google. Mercado a favor de **auditar lo que Google automatiza**.
7. **Plomería de datos cambiante:** desaparición de developer tokens (sep 2026), conversiones offline a Data Manager API (jun 2026), MCP oficial v0.0.6 aún inmaduro. Quien construya sobre la API debe vigilar esto.

---

## 7. Lo que nadie hace bien (huecos)

1. **Diagnóstico causal automatizado y explicado**: casi todos listan síntomas («CPA subió 30 %»); nadie ata de forma fiable el síntoma a una causa comprobable (cuota perdida por ranking vs presupuesto, nuevo competidor en Auction Insights, cambio de la landing, cambio de pujas hecho por alguien, retardo de conversión, estacionalidad, rechazo de anuncio, caída del seguimiento).
2. **Cruce con el negocio**: margen, servicios prioritarios, zona, horarios, capacidad. Nils lo identifica como la ventaja duradera humana («hacer las preguntas correctas al cliente»). Nadie lo guarda como ficha estructurada que lea el agente.
3. **Calidad de lead real**: pocos cierran el círculo Ads → CRM (GoHighLevel) → conversión offline → decisión. Los que lo hacen (CallRail, WhatConverts, Hyros) no son agentes y no diagnostican.
4. **Cruce con SEO y landing**: nadie combina Search Console (consultas orgánicas ya ganadas), velocidad, páginas caídas del rastreador y Quality Score para decidir «esta palabra se gasta en PPC pero ya es nº1 orgánico» o «esta landing cayó el martes».
5. **Idioma y mercado**: Ask Advisor solo en inglés; benchmarks USA-céntricos; casi sin oferta española.
6. **Honestidad epistémica**: pocos admiten «no sé / dato insuficiente»; solo claude-ads (de código abierto) distingue «unknown» de «fail» y reporta la cobertura de evidencia por separado.
7. **Escalado «por excepción» para 25+ cuentas**: la mayoría de herramientas muestran una tabla de cuentas con semáforos, no un resumen priorizado por impacto económico.

---

## 8. Datos de acceso a la API que afectan al módulo (verificar antes de diseñar)

- **Developer tokens retirados el 9-10 sep 2026.** Acceso ahora por proyecto de Cloud (Test, Explorer, Basic, Standard). Los niveles se transfirieron según actividad de los 90 días previos; proyectos sin actividad quedan en «Test Account Access». La v25 devuelve `CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION` si un proyecto de prueba llama a cuentas de producción. Para nuevas solicitudes: verificación de marca del proyecto obligatoria; Basic revisado en minutos, sin cuenta MCC. Solicitudes pendientes el 10 sep se cerraron y hubo que reenviarlas.
  Fuentes: https://ppc.land/google-drops-developer-tokens-from-ads-api-access-decisions/ , https://developers.google.com/ads/blog/posts/2026/09/new-onboarding-experience-for-google-ads-api , https://developers.google.com/google-ads/api/docs/concepts/no-developer-token
  **Qué no se sabe:** cuotas por nivel, si el acceso de lectura con una MCC existente de la agencia sigue necesitando credenciales OAuth del propietario de cada cuenta (probable), y el límite de operaciones de Basic. Mirar la documentación de Basic Access antes de diseñar el volumen de GAQL (25+ cuentas × consultas diarias).
- **Conversiones offline** solo por Data Manager API para nuevos adoptantes desde 15 jun 2026.
- El MCP oficial se puede ejecutar en solo lectura (`labels:false`, `assets:false`) y propone/confirma las escrituras con `validate_only=True` + checksum: **patrón de propuesta-y-confirmación reutilizable** en nuestro diseño.

---

## 9. Ideas para nuestro módulo

1. **Arquitectura recomendada: «determinista primero, IA al final».** Un motor de detección en SQL/TypeScript sobre un histórico diario propio (campañas, grupos, palabras clave, términos de búsqueda, cuota de impresiones, cuota perdida por presupuesto/ranking, Auction Insights, cambios, rechazos). El LLM solo recibe las **excepciones ya filtradas** más el contexto de la ficha, y redacta el diagnóstico. (Cumple la directiva de IA del repo: no usar completado donde baste un algoritmo; Haiku para clasificar términos, Sonnet/Opus para diagnóstico.)
2. **Catálogo de detectores a partir de los scripts probados:** anomalías en gasto/conversiones con **ajuste por retardo de conversión**, pacing proyectado ±10 %, rechazos de anuncios, enlaces rotos (ya tenemos rastreador y vigilancia de páginas caídas: usarlos en vez de un script), cambios en el historial (incluidas recomendaciones autoaplicadas), registro histórico de Quality Score, n-gramas de términos sin conversión, grupos de activos de PMax que acaparan gasto, conversión cuya etiqueta dejó de disparar, términos nuevos de AI Max.
3. **Diagnóstico causal por árbol de causas** (nadie lo hace): ante «sin convertir 2-3 días» comprobar en orden: (a) seguimiento/etiqueta/CRM, (b) rechazos y estado de campaña, (c) presupuesto limitado/cuota perdida por presupuesto, (d) cuota perdida por ranking y cambio en Auction Insights, (e) landing caída o más lenta (cruce con SEO), (f) cambio en la cuenta (historial de cambios/recomendación aplicada), (g) estacionalidad y retardo, (h) volumen demasiado bajo para concluir. Mostrar la causa **con evidencia y con «no concluyente»** cuando falten datos (copiar el «unknown» y la cobertura de evidencia de claude-ads).
4. **Puntuación de confianza y niveles de acción** como Nils: sugerir siempre; autoaplicar solo categorías de bajo riesgo aprobadas por el equipo (p. ej. negativas ≥85 %), con log, deshacer y resumen; **todo cambio en cuenta real es línea roja del CLAUDE.md**, por lo que la primera versión es solo propuesta (patrón propose/confirm del MCP oficial).
5. **Ficha del cliente como contexto del agente** (servicios, zona, horarios, margen, presupuesto, competidores) y listas de exclusión por negocio («no tenemos oficinas en…»), para evitar errores tipo «car insurance near me».
6. **Cierre del círculo de leads:** GoHighLevel → conversión de lead cualificado → Google Ads vía **Data Manager API** (no la Google Ads API); cruzar CPL del anunciante con calidad real del lead; alertar sobre campañas con CPL bajo pero baja calidad.
7. **Cruces únicos con el SEO:** palabra pagada con posición orgánica 1-3 estable (candidata a pausar o bajar puja con test), caídas de la landing (velocidad/CrUX/páginas caídas) antes de culpar a las pujas, consultas de Search Console nuevas como candidatas a palabras clave o negativas, coincidencia anuncio ↔ landing con embeddings.
8. **Auditar lo que Google automatiza:** informe de AI Max/PMax con términos de búsqueda, expansión de URL final, categorías y grupos de activos; comparativa de CPA por tipo de concordancia dentro de la misma campaña (a partir de los resultados de Smarter Ecommerce y Mantica).
9. **Resumen de portfolio «por excepción»** para 25+ cuentas: ranking por impacto económico (€ desperdiciados o € de oportunidad), no semáforos.
10. **Informe semanal para el equipo y el cliente** en español con causas, no solo números (hueco frente a Swydo/AgencyAnalytics).
11. **Detección de fraude/tráfico no válido con datos propios** antes de comprar ClickCease/Lunio: picos de clics sin conversión por IP/ubicación/horario (los clics con GCLID no dan IP: depende de nuestras visitas, Clarity y Analytics 4), y cruzar con Clarity.
12. **Exponer los datos por MCP/API interno** (conector propio de solo lectura) para que Claude consulte las cuentas y la ficha; el movimiento del mercado (Skai Agent Connect, Optmyzr MCP) apunta a ello.
13. **Base de conocimiento actualizada** de la plataforma (qué está obsoleto: CPC mejorado, posición media, anuncios de texto, DSA) para que el LLM no repita sabiduría vieja (estudio de WordStream: 20 % de errores).
14. **Antes de construir, decidir con el protocolo de decisión de CLAUDE.md** (3 puntos de vista, 3 alternativas incluyendo «usar el MCP oficial + scripts + Claude Code» y «contratar Optmyzr/Sidekick») la elección de comprar vs construir. Esta investigación sugiere que el valor de construir está en los cruces con ficha/SEO/CRM, no en reimplementar reglas ya disponibles.

---

## 10. Lo no verificado

- Rendimiento real de Groas, Albert, Pixis, Ryze, Sidekick: solo cifras del propio vendor o de competidores.
- Precios de Optmyzr (rangos de Rework), Albert/Pixis/Adthena/Skai (a medida), Ryze (89 $ vs «~500 $»), PPC.io (cifras inconsistentes), Unbounce (199 vs 249 $), SpyFu (29 vs 39 $).
- Fecha exacta de GML y detalle de Ask Advisor más allá de ppc.land y SEL (algunas páginas de SEL devolvieron 403).
- Que la retirada del developer token dispense de una cuenta MCC para obtener acceso Basic: ppc.land lo indica, pero hay que confirmarlo en la documentación de Google y en la consola.
- Brainlabs: qué scripts publica hoy; Search Partners: solo el script «Search Partner ROAS Alerts» de Nils (inferido por título).
- Adobe Advertising, Smartly en Google, DataFeedWatch, Channable, Hyros, Factors, LeadsRx, Adsgency, Bïrch/Revealbot, herramientas españolas: no investigados (límite de búsquedas).
- Límite de 500 IP excluidas por cuenta y no exposición de IP en la API: memoria del investigador, no verificado en esta sesión.
- «Google revisó 14 % → 7 %» y «claims de 65 % de entrega» (Rework): secundarios.

## 11. Lista de fuentes
- MCP oficial Google Ads: https://developers.google.com/google-ads/api/docs/developer-toolkit/mcp-server ; https://github.com/googleads/google-ads-mcp ; https://developers.google.com/ads/blog/posts/2025/10/open-source-google-ads-api-mcp-server
- Retirada de developer tokens: https://ppc.land/google-drops-developer-tokens-from-ads-api-access-decisions/ ; https://developers.google.com/ads/blog/posts/2026/09/new-onboarding-experience-for-google-ads-api ; https://developers.google.com/google-ads/api/docs/concepts/no-developer-token
- Conversiones offline → Data Manager API: https://developers.google.com/ads/blog/posts/2026/05/changes-to-offline-click-conversion ; https://support.google.com/google-ads/answer/14274408
- Ask Advisor / GML 2026: https://ppc.land/googles-ask-advisor-unifies-ads-analytics-and-commerce-in-one-ai-agent/ ; https://blog.google/products/ads-commerce/google-ads-analytics-ai-updates/ ; https://blog.google/products/ads-commerce/bidding-budgeting-google-marketing-live-2026/ ; https://blog.google/intl/es-es/google-marketing-live-2026/
- Prueba de Ads Advisor: https://askstudies.blogspot.com/2025/11/googles-new-ads-advisor-ai-is-put-to.html (copia del artículo de SEL: https://searchengineland.com/googles-new-ads-advisor-ai-is-put-to-the-test-464663)
- SA360: https://adswerve.com/blog/ai-in-search-ads-how-sa360-builds-on-google-ads-for-enterprise-growth ; https://ppc.land/search-ads-360/
- Skai: https://ppc.land/skai-claims-first-agent-native-marketing-os-amid-ai-agent-rush/
- Marin: https://searchengineland.com/marin-software-shutting-down-454228 ; https://ng.investing.com/news/sec-filings/marin-software-completes-bankruptcy-reorganization-cancels-existing-shares-93CH-2094558 ; https://www.marinsoftware.com/whats-new-in-marin/q1-2025
- Optmyzr: https://www.optmyzr.com/blog/optmyzr-sidekick-a-ppc-agent-built-for-your-workflow/ ; https://www.optmyzr.com/blog/optmyzr-ai-beats-chatgpt-claude-for-google-ads/ ; https://www.optmyzr.com/ppctownhall/can-ai-agents-really-manage-google-ads-accounts/
- Groas: https://searchengineland.com/groas-introduces-a-fully-autonomous-approach-to-google-ads-management-474345 ; https://searchengineland.com/human-vs-machine-what-happens-when-groas-runs-your-google-ads-481736 (patrocinado)
- Ryze / MCPs: https://toolradar.com/tools/ryze-ai ; https://www.markifact.com/blog/google-ads-mcp-servers ; https://www.markifact.com/blog/official-google-ads-mcp-vs-alternatives ; https://www.adspirer.com/docs/knowledge-base/why-not-official-google-ads-mcp
- PPC.io: https://ppc.io/ ; https://ppc.io/agents/wasted-spend-agent ; https://ppc.io/blog/google-ads-scripts
- Semrush Ads AI Agent: https://ja.semrush.com/kb/1623-ads-ai-agent
- Mike Rhodes: https://mikerhodes.pages.dev/
- Auditoría con Claude: https://scandiweb.com/blog/ai-agent-bites-10-automating-ppc-audits-with-claude-and-mcp/ ; https://raw.githubusercontent.com/AgriciDaniel/claude-ads/main/README.md
- Comparativa de agentes: https://resources.rework.com/tools/ai-agents/best-ai-agents-for-paid-ads-2026
- Precisión de IA en PPC: https://ppc.land/one-in-five-ai-responses-for-ppc-strategy-contain-inaccuracies-study-finds/
- AI Max: https://ppc.land/independent-tests-show-ai-max-underperforms-traditional-match-types/ ; https://ppc.land/googles-ai-max-for-search-campaigns-deliver-meh-results-industry-tests-reveal/
- Fraude de clics: https://www.clickcease.com/blog/clickcease-vs-competitors-2026/ ; https://www.lunio.ai/blog/how-ai-agents-are-reclaiming-advertisers-wasted-spend
- Llamadas: https://www.callrail.com/blog/best-call-tracking-software ; https://costbench.com/compare/whatconverts-vs-callrail/
- Landings: https://instapage.com/features/admap/
- Competencia: https://www.g2.com/products/adthena/pricing
- Informes: https://swydo.com/blog/best-ai-reporting-tools/
- Scripts: https://nilsrooijmans.com/google-ads-scripts/ ; https://groas.com/post/9-google-ads-scripts-still-worth-running.md ; https://developers.google.com/google-ads/scripts/docs/examples
- España: https://www.cyberclick.es/numerical-blog/ppc-en-la-era-de-la-ia-plataformas-para-optimizar-tus-campanas

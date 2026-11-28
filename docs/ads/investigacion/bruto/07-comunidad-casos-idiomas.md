# 07 · Comunidad profesional, idiomas y casos publicados (28 nov 2026)

## Aviso de alcance y límites reales de esta investigación (leer primero)

- **Reddit no se pudo leer.** `reddit.com`, `old.reddit.com` y los espejos (redlib/libreddit) devolvieron 403/bloqueo o no resolvían. El buscador tampoco permite filtrar por reddit.com. Lo que cito de r/PPC viene **de resúmenes del buscador** (títulos y extractos de hilos), no de lectura propia de los comentarios. Todo lo de Reddit va marcado como *anécdota de foro, no verificada de primera mano*. Recomendación: que una persona (o un navegador real) lea los hilos citados.
- **El presupuesto de búsquedas de la sesión se agotó** (límite de 200 compartido) cuando faltaban portugués/Brasil y la comunidad oficial en español. Esos dos apartados quedan **flojos**.
- Varias páginas de Search Engine Land, Capterra y G2 devolvieron 403; de ellas solo hay el resumen del buscador.
- Lo más sólido de este archivo: páginas leídas enteras de Nils Rooijmans (comunidad neerlandesa/PPC con scripts y agentes), Optmyzr PPC Town Hall, Digiday, ppc.land, cadencias de agencias, y casos publicados leídos y **auditados por incoherencias internas**.

## Resumen (12 líneas)

1. Los dolores de agencias con muchas cuentas son siempre los mismos: **pacing de presupuesto, informes, cambios manuales repetitivos y errores de presupuesto**. Datos de encuesta (Fluency 2025, >75 agencias EEUU): 35 clientes por account manager de media, 55 % hace pacing a mano y 42 % con hojas de cálculo, 69 % quiere reducir trabajo manual y errores.
2. El **lead basura/spam** (PMax, AI Max, Display, Search Partners) es el problema número 1 de lead gen. La solución consensuada: **medir leads cualificados desde el CRM (importación offline) y proteger el formulario** (reCAPTCHA, doble opt-in, validación servidor). Google admite que sus filtros de tráfico inválido «no previenen leads inválidos por sí solos».
3. **Cambio de API con fecha pasada:** desde el 15 jun 2026 las subidas de conversiones offline / conversiones mejoradas para leads migran a la **Data Manager API** y se bloquean en la Google Ads API (según ppc.land y la ayuda de Google; verificar antes de construir).
4. Los expertos usan **umbrales de gasto relativos al CPA objetivo** (1,5x–3x CPA sin conversión) en vez de «N clics»; «3 clics sin conversión» es destructivo con ciclos largos.
5. Con **AI Max** las agencias denuncian: expansión de consultas que no se puede desactivar, informes pobres, CPA 2-3x en tests de algunas agencias (Mediassociates) y contra «+14 % conversiones al mismo CPA» de Google. Datos independientes: Smarter Ecommerce (250+ campañas retail) +13 % ingresos mediana, 0 % de ROAS neto, solo 22 % de campañas cerca de su ROAS objetivo.
6. Los profesionales avanzados (Nils Rooijmans) llegan a la misma arquitectura que nuestro módulo: **scripts deterministas para monitorizar + IA con confianza y registro + aprobación humana**; los agentes son «becarios con una confianza aterradora».
7. Casos publicados: la mayoría son marketing. Los creíbles tienen **un cambio concreto de medición** (offline → cualificado) o de **estructura/negativas/geografía**. Casi todos tienen cifras internamente incoherentes; ver sección 6.
8. No hay una comunidad española/latam equivalente a r/PPC accesible por búsqueda; las referencias en español son blogs de agencias y la documentación de Google. Alemania: la rutina matinal del SEA-Manager (onlinemarketing.de) y los scripts de anomalías de Google son lo más útil.
9. Organización de agencias (consultoras, no estudios independientes): pods de 7-10 cuentas, revisión de términos diaria o semanal, informes automáticos en <30 min, alertas por mensaje en vez de informe mensual.

---

## 1. Reddit (r/PPC, r/googleads): lo que se pudo recuperar

**Metodología:** extractos de buscador, sin lectura directa. Nivel de evidencia: *anécdota de foro*.

### 1.1 Agencias con muchas cuentas
- Hilo «Managing over 150 accounts and feeling burned out» (r/PPC, ~may 2025): https://redlib.ssps.io/r/PPC/comments/1kwkvu7/managing_over_150_accounts_and_feeling_burned_out (espejo; no se pudo abrir). Según el resumen: una nueva persona pasó de 30 a 150 cuentas en seguimiento de pacing; los especialistas se separan por plataforma (Google / Meta / TikTok+Snapchat). Un comentarista dice haber llevado 90 cuentas de Google con pacing «casi automático», con ajustes más o menos mensuales y usando las **reglas automáticas de Google Ads** (si-esto-entonces-aquello). Otro aconseja **preguntar en la entrevista por la carga de clientes**.
- Hilo «Managing PPC when juggling multiple clients» (r/PPC, oct 2025): https://libreddit.winscloud.net/r/PPC/comments/1o27glh/managing_ppc_when_juggling_multiple_clients (403; solo título).
- Hilo «Adalysis vs Optimyzr vs Opteo» (r/PPC, 20 ene 2025): https://redlib.hyperreal.coffee/r/PPC/comments/1i5paca/adalysis_vs_optimyzr_vs_opteo . Pocos comentarios; una agencia dice usar Adalysis y que le simplificó el flujo. Evidencia muy débil.
- Opiniones sobre herramientas (resumen de reseñas que citan Reddit): Optmyzr se alaba por la flexibilidad de reglas, se critica el coste que sube con cliente y gasto («un gasto mensual considerable al añadir clientes»), la curva de aprendizaje (Capterra: «no es para el novato») y una interfaz anticuada; una reseña de G2 señala que las herramientas de pujas están pensadas para CPC manual cuando el mercado va con Smart Bidding. Fuente: https://www.tryatria.com/blog/optmyzr-reviews y https://www.capterra.com/p/156308/Optmyzr/reviews/ (la de Capterra dio 403). Opteo: «victorias rápidas guiadas» para equipos pequeños (posicionamiento de vendedor). Adalysis: monitorización y alertas.
- Artículo de un competidor (Cotera) afirma que un equipo dejó Optmyzr porque «la vista termina en los datos de plataforma» y no ve ingresos post-conversión: https://cotera.co/articles/optmyzr-alternative-google-ads . **Es marketing de un competidor**; la idea (las herramientas de reglas no ven calidad real del lead) es coherente con el resto.

### 1.2 Spam / calidad de leads en PMax (r/PPC, 13 ene 2025: «How to stop spam leads in PMax»)
Hilo: https://redlib.ssps.io/r/PPC/comments/1i0gf8x/how_to_stop_spam_leads_in_pmax/ (no se pudo abrir). Según el resumen del buscador:
- Un comentarista atribuye el spam a **Search Partners**, que no se puede apagar dentro de PMax (obsoleto parcialmente: en 2026 Google dejó apagar Search Partners/Display a algunos anunciantes de PMax, ver https://ppc.land/google-lets-some-pmax-advertisers-switch-off-search-partners-and-display/ ).
- «Si puedes evitar que la etiqueta de conversión se dispare con envíos de spam, puedes y debes probar PMax» → reCAPTCHA invisible.
- «Hacer funcionar PMax para lead gen sin datos de conversiones offline es muy difícil… el sistema trae mucho spam».
- Crear audiencias a partir de MQL/SQL/Closed-Won y **subir los leads basura como lista de supresión**.
- Diagnóstico: **pausar PMax unos días y ver si los leads cesan**.
- Opiniones enfrentadas: «pausa PMax y concéntrate en Search» frente a «acepta el spam si hay pocos leads legítimos»; «Display siempre dará spam».
- Otra anécdota: en una campaña «appliance repair» con AI Max se sirvieron anuncios para «obgyn near me» (citado por el buscador; hilo no localizado).

### 1.3 «Las conversiones cayeron de golpe»
No se encontró un hilo de Reddit utilizable. La secuencia que repite todo el mundo (SEL, Google, comunidad Shopify):
1. **Medición primero:** ¿la acción de conversión sigue activa y dispara? (Tag Assistant). Cambios de consentimiento/cookies banner, conversiones mejoradas.
2. **Cambios recientes** (web, checkout, formulario, objetivos de conversión, estrategia de puja).
3. **Retraso de conversión** (hasta 90 días): comparar periodos equivalentes.
4. Clics estables y conversiones bajan → landing/oferta; CTR cae → competencia/fatiga.
Fuentes: https://support.google.com/google-ads/answer/12076786 , https://support.google.com/google-ads/answer/12077891 , https://community.shopify.com/t/577674 , https://searchengineland.com/ppc-diagnostics-low-conversions-450710 (403, solo extracto).

### 1.4 Errores de juniors (no se encontró hilo de Reddit; fuentes de blogs)
Cuentas con ajustes inconsistentes (campañas creadas en épocas distintas), piloto automático (revisar una vez al mes), pujas por conversión sin datos de conversión, no mirar los términos de búsqueda, ignorar actualizaciones. Fuentes: https://www.expertia.ai/career-tips/common-mistakes-to-avoid-for-new-ppc-managers-95941i , https://searchengineland.com/ppc-mistakes-hiding-ad-accounts-459538 (403). Nivel: opinión.

---

## 2. Comunidad oficial de Google Ads, PPC Chat, LinkedIn/X

- **Comunidad oficial** (lista de hilos leída, 20 títulos): https://support.google.com/google-ads/threads?hl=en . Temas por frecuencia: (1) **cero o pocas impresiones aunque «elegible»** (la más común: Grants, App, Search; a veces con «Ad Preview: no keywords matched»), (2) **verificación del anunciante / suspensiones / «falsa suspensión» / políticas** (incluida publicidad política en la UE), (3) **facturación y presupuesto** (se cobra más que el presupuesto elegido, gasto por encima del diario), (4) campañas «pendientes», (5) acceso a la cuenta/passkeys, (6) **discrepancias de conversión** (pedidos Shopify vs conversiones). Muchos dicen **no poder contactar con soporte**. Es lo que preguntan anunciantes pequeños, no agencias; aun así sirve de lista de **fallos de entrega** a vigilar (estado de la campaña, «elegible limitado», verificación).
- Google anunció que los agentes de soporte dejarán de responder en el foro de desarrolladores de la API y que se cerrarán nuevos mensajes durante 2026 (https://ads-developers.googleblog.com/2025/12/sunsetting-google-ads-api-google-ads.html). Afecta al foro de la API, no está confirmado para la comunidad general.
- **PPC Chat / X / LinkedIn:** no se pudo localizar un resumen de PPC Chat 2026. Tendencias de 2026 en la prensa: AI Max sale de beta el 15 abr 2026 y **DSA se depreca y migra a AI Max** (migración automática desde septiembre; por defecto: DSA conserva las 3 funciones; ACA 2; broad match solo «search term matching») según https://www.searchenginejournal.com/rundowns/inside-ai-max-pmax-smart-bidding-how-ppc-managers-regain-control/ ; 53 % de profesionales dice que su trabajo es más difícil que hace 2 años y 65 % culpa a la caja negra (dato de ALM Corp citado en una sección patrocinada; **poco fiable**).
- Digiday (13 directivos de agencias): ninguno retira dinero de Google por la caja negra; piden un **«kill switch» manual**; el informe granular de Search desaparece a medida que las consultas son conversacionales; «cuanto más autónomos son los sistemas, la confianza se convierte en el producto» (John Geletka): https://digiday.com/marketing/trust-becomes-the-product-marketers-grapple-with-googles-new-suite-of-ai-powered-ad-agents/ . Nuevos agentes de Google: **Ask Advisor** (Gemini, configura campañas e insights).

### 2.1 Agentes de IA en PPC según los profesionales (muy relevante)
Optmyzr PPC Town Hall con Nils Rooijmans y Fred Vallaeys: https://www.optmyzr.com/ppctownhall/can-ai-agents-really-manage-google-ads-accounts/ (leído entero).
- Puede: sugerir **negativas con puntuación de confianza (>85 % las añade y envía registro por correo; <85 % espera feedback en una hoja)**; juzgar relevancia por intención **sin esperar 100 clics sin conversión** (regla de su script antiguo); explicar cada sugerencia; criticar landings; detectar contradicciones del cliente en sus correos.
- No puede de forma fiable: conocer la estrategia del cliente, estar al día de la plataforma, **detectar restricciones (olvidó el límite de puja de las estrategias de cartera)**, entender el negocio (un juez marcó bien «car insurance near me» sin oficinas locales, pero quiso excluir «Kia K3» creyendo que no interesaba; el cliente sí los aseguraba).
- Fallos: **sobreconfianza** («interns with terrifying confidence»: su respuesta más segura fue «sube presupuestos y cambia ROAS»), **demasiado contexto degrada el razonamiento**, **costes de tokens** (ej. 10 $ por un solo análisis de términos si se pasa un millón por un modelo caro).
- Fiabilidad: SOPs, ingeniería de contexto, conectores con registro, privacidad y responsabilidad. Cliente: documento de 23 preguntas + 1 hora de llamada.
- Complementa: https://www.digitalapplied.com/blog/build-paid-media-ppc-management-agent-2026 (arquitectura leída: lectura GAQL programada → reglas deterministas → borrador → aprobación fuera de la API; **nunca auto-aplicar** presupuesto, tCPA/tROAS ni «usar broad match»; el `change_event` es solo retrospectivo, máx. 30 días; los cambios auto-aplicados pueden reactivarse solos; cuotas: Explorer 2.880 ops/día en producción, Basic 15.000/día, Standard sin tope diario).

---

## 3. Otros idiomas

### 3.1 Países Bajos (comunidad Nils Rooijmans) — lo más aprovechable
Fuente directa leída: https://nilsrooijmans.com/daily/author/nils (boletín diario de un consultor neerlandés con 20+ años; agencia remota; scripts y agentes). Prácticas concretas (opinión de experto con experiencia, no estudios):
1. **Qué cambiar al heredar una cuenta** (AMA 17 jun 2026): desactivar **recomendaciones auto-aplicadas** (pueden añadir broad match y expansión de Display), apagar Search Partners, **ubicación «Presencia» y no «Presencia o interés»**.
2. **Caso «15 leads → 6»** (AMA 16 sep 2026): cliente de 5-6 k$/mes, tCPA 300 $ con presupuesto limitado daba 20-30 leads cualificados (CPA real ≈220). El equipo bajó tCPA a 220 «como pidió Google» y cayó a 6 leads en dos semanas por subir los CPC. Arreglo: **tCPA de cartera con límite de CPC máximo**; tCPA al valor aceptable por el negocio; coger 10 semanas de términos convertidos (conv ≥ 1), **límite de CPC en el percentil 90-95**; cuando vuelva a ~20 conv/mes, bajar tCPA y subir límite en **pasos de 10-20 %**. PS: un script que detecte CPC atípicos frente a la media lo habría visto la primera semana. → **Alerta tipo: «cambio de objetivo + CPC al alza + conversiones a la baja».**
3. **«Nail it before you scale it»** (25 may 2026): arreglar medición (SQL y ventas, no formularios), mover gasto de PMax a **exacta** en términos que convierten; tCPA de cartera con límites; tras 2 semanas y 30 SQL quitar el límite inferior y poner el superior al 50 % del tCPA.
4. **Orden de herramientas** (webinar jun 2026): reglas → scripts → flujos con IA → agentes. Scripts como guardarraíles de los agentes; **agentes con acceso de solo lectura primero**, revisar sugerencias exportadas, ampliar permisos poco a poco; **registrar cada cambio sugerido, su razonamiento y cómo deshacerlo**; separar marca exacta y frase en campañas distintas; evitar Target Impression Share.
5. Scripts para vigilar caídas de conversión, historial de cambios y disponibilidad de la web (AMA 27 may 2026); código determinista dentro de las skills del agente (límites de caracteres, duplicados).
6. **Identidad inconsistente → -80 % de clics y conversiones** (2 jun 2026): suspensión de Merchant Center por verificación de identidad incompleta; coherencia de razón social/dirección/teléfono entre Merchant, facturación de Ads, pie de la web, registro.
7. Exactas pueden salir ahora en AI Overviews/AI Mode (23 nov 2026): revisar términos de búsqueda de exactas/frase «que no habrías elegido»; no se puede optar por salir solo de eso.
8. Editor: pegar una audiencia en «Observación» a una campaña por defecto «Targeting» la convierte en Targeting y **reduce el alcance** (20 abr 2026).
- Otras comunidades neerlandesas: evento «SEA Borrel / PPC Drinks» (Ámsterdam, jun 2026). Un caso Emerce: PMax 7.316 € → 260 leads a 28,14 €/lead, **sin dato de leads válidos** (https://www.emerce.nl/?p=5005071; solo extracto). No hay evidencia en neerlandés de prácticas ausentes en inglés.

### 3.2 Alemania (SEA)
- Rutina matinal del gestor SEA de onlinemarketing.de (artículo antiguo, términos como «Optimization Score de AdWords» y «anuncios de texto ampliados»: **obsoleto en parte**): https://onlinemarketing.de/news/morgenroutine-11-sinnvolle-massnahmen-sea-manager . Lo que sigue vigente: revisar términos y sitios nuevos desde la última comprobación («¿dónde se desperdicia presupuesto?»); detectar anomalías (coste, impresiones, CTR, tasa de conversión); **mirar un periodo largo antes de concluir, con estacionalidad, y llevar un registro de cambios por cuenta**; **definir el umbral de tolerancia** (cuándo un elemento sin conversiones ya no merece más oportunidades) y antes de pausar **comprobar en Analytics si ayuda a otras conversiones, midiendo microconversiones**; comparar canales en Analytics; **campañas nuevas, revisión diaria hasta estabilizarse; las optimizadas pueden quedar días sin tocar porque el mayor riesgo es la sobreoptimización**; **no lanzar campañas nuevas en viernes**; revisar rápidamente alertas (tarjeta caducada).
- Script oficial de Google «Account Anomaly Detector»: compara las estadísticas del día con el **mismo día de la semana histórico** y avisa por correo si se desvían; pensado para ejecución horaria; solo usa datos hasta las 16:00 porque las estadísticas pueden retrasarse hasta 3 h: https://developers.google.com/google-ads/scripts/docs/solutions/account-anomaly-detector?hl=de . **Muy aprovechable como diseño de la detección de anomalías.**
- OMT (agencia): el audit es una revisión que va más allá del monitoreo mensual: https://omt.de/google-ads/google-ads-audit . No se encontró contenido de Bloofusion/PPC-Blog/OMR por la búsqueda (no significa que no exista).
- Un matiz europeo relevante: **un tribunal austriaco dictaminó que reCAPTCHA requiere consentimiento** (citado por ppc.land): hay que tenerlo en cuenta al proteger formularios en España/UE.

### 3.3 Francia
- Léa Gueniffet (consultora SEA) en Blog du Modérateur: https://www.blogdumoderateur.com/google-ads-conseils-concrets-lea-gueniffet/ . Casos con cifras (testimonio de consultora, no auditados): landing con >50 % del rendimiento (B2B pasó del 4 % al 8 % de conversión, el doble de leads por euro); **Consent Mode V2 + CRM + tracking server-side**; SaaS B2B que optimizó con HubSpot sobre **clientes firmados** → CAC -30 %; cliente con **80 % del gasto en PMax (35.000 €/mes)**: tras reestructurar Search, CPL -15 % en 3 meses; **pyme B2B cuyos leads se redujeron a la mitad en 6 meses por dos competidores agresivos** (se diagnostica con Auction Insights, cuotas de impresión, Similarweb, Semrush); **Search Max/AI Max: más volumen, CPL en fuerte aumento sin valor incremental**.

### 3.4 España / Latinoamérica
- **No se encontró** una comunidad accesible por búsqueda (Forobeta, Telegram, newsletters). Lo hallado: la comunidad oficial de Google Ads en español (≈590.000 miembros según su página), rankings de agencias (Marketing4eCommerce: Adsmurai, Making Science, Elogia) y blogs de agencias (Cyberclick, Team Lewis, Hackceleration) que repiten consejos genéricos: ajustar cada semana o pocos días, convención de nombres, revisión continua de términos y listas de negativas, informes con CPA/ROI.
- Cyberclick: «Cuánto cuesta una agencia Google Ads en España en 2026» y «Cómo saber si tu agencia PPC optimiza bien» (indicadores: CPA, ROI, valor por campaña): https://www.cyberclick.es/numerical-blog/como-saber-si-tu-agencia-ppc-esta-optimizando-bien-tus-campanas (solo extracto).
- **Adsmurai** (agencia/tecnología española) publica casos con cifras:
  - Claudio Galeno (educación): **Value Based Bidding con conversiones offline** (matrículas importadas desde el CRM): lead→matrícula +27 %, CPL -17 %, ROAS +103 % en el resumen y +150 % en el texto (incoherente; y una cita dice que «los costes de leads han aumentado»). https://www.adsmurai.com/es/case-studies/claudio-galeno-pujas-optimizadas
  - Quadis (automoción): coste por conversión -44 %, leads +127,5 % con PMax y Demand Gen (solo extracto): https://www.adsmurai.com/es/case-studies/quadis-google
- **Portugal/Brasil:** sin datos propios (búsqueda agotada). Lo único: páginas de Google Brasil que repiten que al elegir objetivos de lead «lead cualificado / convertido / reserva / presupuesto» **se activan protecciones contra tráfico inválido para lead gen**, y sugieren excluir **errores ortográficos de marca y tráfico en otros alfabetos** (https://business.google.com/br/accelerate/resources/articles/performance-max-best-practices-for-lead-generation/).
- ¿Prácticas locales ausentes en inglés? **No se halló ninguna.** Lo que sí tiene peso local en España: **RGPD / Consent Mode v2 obligatorio para el EEE**, reCAPTCHA y consentimiento, y WhatsApp como conversión (sin fuente específica; no verificado).

---

## 4. Rutinas y umbrales concretos que citan los profesionales

| Regla | Valor | Fuente / nivel |
|---|---|---|
| Término de búsqueda sin conversión | marcar al gastar **2-3x CPA objetivo**; 1,5-2x «sube en la cola de revisión»; 3x en 90 días como disparador en modo crecimiento | Optmyzr https://www.optmyzr.com/blog/google-ads-keywords-not-converting/ ; SEL; Expert Beacon (opinión) |
| Muestra mínima | no excluir rutinariamente con <20 clics o <1x CPA salvo intención claramente errónea; «3 clics sin conversión» es destructivo con ciclo largo | Groas (vendedor; opinión) |
| Pujas inteligentes | ≥15 conv en 30 días a nivel de cuenta (Google, lead gen), 30 para evaluar tCPA y 50 para tROAS | Google Ads Help; SEJ |
| Cambio de objetivos | ±20 % por cambio máximo; 10-14 días de espera; no cambios de objetivo/presupuesto seguidos | digitalapplied; Swydo (opinión) |
| Objetivos iniciales | 10-15 % más conservadores que el rendimiento actual; ROAS = 100 ÷ margen % de punto de equilibrio + 10-15 % | Swydo |
| Fase de aprendizaje | PMax 2-3 semanas (60-90 días para optimizar); AI Max 10-14 días | Swydo (opinión) |
| Llamada cualificada | umbral 90 s – 3 min según ciclo («una llamada de 20 s es un colgado») | SEJ (sección patrocinada por CTM) |
| Conversión: ventana | ideal ≤7 días tras la interacción (choca con leads cualificados tardíos) | Google, vía ppc.land |
| Subida de conversiones | diaria si es posible; GCLID válido 90 días | Google Ads Help |
| Estructura | ≥3 RSA por grupo; ubicación «Presencia» para locales; archivar campañas pausadas >90 días; palabras clave con 0 impresiones >90 días fuera; QS ≤3 revisar | digitalapplied (opinión) |
| Presupuesto | 70 % probado / 20 % optimización / 10 % test | Swydo (opinión) |
| PMax para leads | preparado con **30 conversiones de calidad en 30 días**, CRM sincronizado y Search probado; a 6 conv de calidad volver a Maximizar Conversiones tras fase manual | https://www.ppcstack.io/p/pmax-the-spam-magnet (opinión de newsletter) |
| Waste típico en auditorías | 18-27 % del gasto | digitalapplied (afirmación sin metodología) |

Chequeos diarios de alto valor (consenso): entrega y avisos (facturación, desaprobados, campañas paradas, presupuestos que se agotan pronto, entradas inesperadas en el historial de cambios), **medición** (caída a cero, subida inexplicable de la tasa de conversión, leads duplicados, fallos de subida offline, destinos de llamada/formulario rotos) → *la regla de oro: una anomalía provoca investigación, no un cambio automático* (https://oneppcagency.co.uk/google-ads/optimisation/). Semanal: comparación con periodo equivalente y mismo periodo del año anterior, **separar marca de no marca**, términos, **comparación con CRM (calidad por campaña/palabra/ubicación/dispositivo/landing/fase de venta; velocidad de respuesta; llamadas perdidas)**. Mensual: conciliación gasto ↔ leads cualificados/ingresos con explicación de diferencias esperadas. Trimestral: prueba de punta a punta de cada conversión primaria, Consent Mode, deduplicación.

---

## 5. Cómo organizan las agencias el trabajo con 20-50 cuentas

Fuentes: Saas Hero (https://www.saashero.net/uncategorized/google-ads-agency-team-structure/, leído entero, consultora), ppc.land/Fluency (https://ppc.land/agencies-target-83-increase-in-client-capacity-as-automation-reshapes-adops-workflows/, encuesta), ppc.io (https://ppc.io/blog/how-many-google-ad-accounts-one-person-manage, vendedor), Swydo, MeasureU.
- **Ratios:** especialista PPC ≈ 6-12 cuentas activas antes de caer la calidad; AM con especialista 7-10 por pod; si el AM también ejecuta, 4-6; «8-15 por gestor» solo con medición sólida; 30+ por AM «con plantillas, automatización y QA» (afirmación). Por gasto: 20-30 cuentas si gastan 500-5.000 €/mes; 10-15 si 5.000-50.000; 3-5 si >50.000 (ppc.io; estimaciones de autor). **La complejidad pesa más que el gasto** (un cliente de 3 k$ consumió más que uno de 30 k$). Regla práctica del autor: capacidad real = teórica x 0,7 y dejar ~20 % sin planificar; contratar al 70 % de capacidad.
- **Fluency 2025:** 35 clientes/AM de media (objetivo de las agencias: 64); 46 h/mes en cambios de campaña por cliente (>25 % del tiempo); 55 % pacing manual, 42 % hojas de cálculo, 40 % usa varias herramientas; lanzamiento medio 3,18 días; montaje de cuenta 76 h; **69 % quiere reducir trabajo manual y errores, especialmente de presupuesto**.
- **Estructura a 25-50 clientes:** 3-4 pods (AM + especialista + analista + creativo/CRO), director de servicios al cliente; **un rol de QA dedicado a los 40-50 clientes**.
- **Cadencias:** reunión de pod semanal; **llamada estratégica con el cliente quincenal**; sesión mensual entre pods; términos de búsqueda diarios en carga normal y semanales si hay sobrecarga; onboarding 2-4 semanas de acompañamiento.
- **Documentación:** SOPs, plantillas de campaña, **checklist de QA previo al lanzamiento** (medición, pacing, landing), listas de negativas compartidas por vertical a nivel MCC, **marco de escalado con autoridad de decisión explícita**.
- **Informes:** dashboards automáticos (Looker Studio) bajan de 2-4 h a <30 min por cliente; traducir a resultados de negocio («al cliente rara vez le importa la cuota de impresión»); **terminar cada informe con acciones**; avisos automáticos al cliente en vez de esperar al informe mensual (Swydo).
- **Qué cuenta mirar hoy (priorización):** no se halló un método documentado. Las agencias lo resuelven con un panel único matutino (caso Optmyzr/The PPC Pros) y alertas por excepción; SEL estima ~200 chequeos diarios con 15 cuentas y que «los diarios acaban semanales y los semanales mensuales» porque nadie los hace a mano (extracto de buscador, https://searchengineland.com/ppc-management-checklist-daily-weekly-monthly-reviews-393344). **No hay SLAs publicados con cifras**; solo se menciona la comprobación de presupuesto/gasto cada 72 h en un SOP no identificado.

---

## 6. Casos publicados con cifras (credibilidad)

Todos autodeclarados. Cada uno lo he auditado para ver qué cambio concreto causó la mejora.

**Más creíbles (con cambio concreto y cadena de datos):**
1. **Workshop Digital, PMax B2B** (https://www.workshopdigital.com/case-studies/how-performance-max-cut-cpl-and-doubled-mqls/): con optimización por envíos crudos, **8 de 9 leads (89 %) eran spam** (6-13 nov 2025). Cambio: UTMs y campos ocultos con GCLID → Salesforce → **subida offline de MQL y clientes** como conversión. Resultado: +110 % MQL, ~-43 % gasto, **-73 % coste por lead cualificado, 0 % spam** en dos ventanas cortas. Limitaciones: ventanas de medición cortas, pausa por impago en medio, es B2B (nómina), premio del propio sector.
2. **Visionary Marketing, clínica de implantes (UK)** (https://visionary-marketing.co.uk/case-studies/dental-implant-clinic-ppc): una campaña «dentist» con ~80 % de conversiones de revisiones de bajo valor; se **separa en implantes/estética/general, landing de implantes (25+ antes/después, plazos, precios 3.500-12.000 £), llamadas con números dinámicos por campaña, radio 5 → 30 millas solo en implantes, audiencias in-market 40+, excluir pacientes**. Resultado declarado: CPL 124 → 42 £, 23 → 185 consultas en 117 días, formulario 4 % → 11 %, 49 consultas completas. **Incoherencias:** título 142 consultas/32 £/185 k£ frente a cuerpo 185/42/240 k£; «-86 %» no cuadra (124→42 es -66 %); baseline 95 vs 124. Se queda como **receta (segmentar por valor de tratamiento + geografía por servicio + separar llamadas)**, no como cifra fiable.
3. **GDT, techador comercial (EEUU)** (https://blackadstips.blogspot.com/2026/03/how-gdt-improved-benton-roofings-google.html): auditoría con ~40 % de gasto desperdiciado; **500+ negativas** (bricolaje/reparación residencial), reestructura a términos comerciales, **seguimiento de llamadas dinámico + formularios**, geografía a polos comerciales, landings comerciales, tCPA un 30 % por debajo del histórico, test de CTA. CPL 280 → 134 $ en 120 días, leads 12 → 42, conv 0,9 → 2,9 %. La mejora de fase 1 (negativas + seguimiento) fue el mayor salto. Vendedor de alquiler de cuentas; sin datos subyacentes; cifras de leads pequeñas (12 → 42).
4. **Claudio Galeno (Adsmurai, ES)**, ver 3.4: VBB con matrículas offline. Dirección creíble; cifras incoherentes.
5. **Datos propios de un despacho (Attorney at Work)** (https://www.attorneyatwork.com/building-law-firm-ppc-strategy/): 3,3 M$ de gasto Google Ads + LSA en 2025; **juzgar por coste por caso firmado, no por lead**. Tabla: PI CPL 284 $, lead→caso 7 %; penal CPL 60 $, lead→caso 2 %; quiebra CPL 201 $, 10 %. Google Ads: 60 % presupuesto, 76 % leads, 49,7 % casos; LSA: 40 % presupuesto, 24 % leads, 50,3 % casos. **La asignación de casos a canal es débil** (25 % de los despachos atribuye menos de un cuarto de sus casos). Los costes por caso firmado no reconcilian con CPL/tasa (284/0,07 ≈ 4.057 ≠ 468) → usar solo la *lección*: **CPL bajo puede esconder CAC alto**, p. ej. penal.

**Marketing con poca fiabilidad:** Groas (vende IA autónoma; sus posts de bufetes se contradicen entre sí en gasto y reducción: «-44 % CPL, doble tasa de conversión de admisión» frente a «mitad de coste por consulta cualificada en 60 días»), casos de Contra/Fueler de freelancers («-34 % CPL», «+150 % leads con 2.100 $»), Pixel Crayons (-35 % sin cifras base), Firestarter (coste por reserva 504,63 → 330 $ interanual, white label), Dentalfone (CPA 40 → 25 $, <10 → 30-35 llamadas/mes), LocaliQ, etc. Útiles solo como confirmación del patrón.

**Patrón común de lo que produjo la mejora (de los casos creíbles):** (a) **cambiar la conversión que optimiza el algoritmo** (de formulario crudo a lead cualificado/cliente) — mayor efecto y mayor evidencia; (b) **segmentar por valor del servicio** y no tratar todos los leads igual (implante vs revisión); (c) **negativas y exclusión de intención equivocada** (bricolaje, residencial, empleo) + seguimiento de llamadas; (d) **geografía por servicio**; (e) tCPA/pujas **solo después** de limpiar la señal. Los casos de PMax para B2B recomiendan empezar por Search y pasar a PMax tras 30 conversiones de calidad.

**Datos independientes sobre AI Max (para no creerse a Google):** Smarter Ecommerce marzo 2026, 250+ campañas retail: ingresos +13 % mediana, ROAS neto 0 %, 22 % de campañas cerca del ROAS objetivo; AI Max reciclaba cobertura de broad match «hasta el 63 % de las veces»; en una cuenta, términos de marca de la competencia fueron el 69 % de las impresiones (https://news.designrush.com/google-ai-max-search-ads-budget-oversight); Lunio: 5,28 % de tráfico inválido en búsquedas retail con AI Max frente a 3,07 % en Search estándar en T2 2026 (retail, vendedor de detección, https://ppc.land/google-ads-filters-miss-fake-leads-so-advertisers-must-add-3-form-checks/); Brad Geddes: texto automatizado atrajo búsquedas B2C en B2B y se paró el test a las 3 semanas; Mediassociates: CPA «2-3 veces» el de Search (Digiday). Los matices de Google: +14 % conversiones a CPA similar (dato interno 2025, no independiente).

---

## 7. Lead basura: lo que dice Google y lo que falta

- Google: sus filtros no previenen leads inválidos «por sí solos» (corren después de servir el anuncio); la calidad del lead es «responsabilidad compartida»; recomienda **reCAPTCHA, doble opt-in y validación servidor** (dominios de correo, formato de teléfono). **No aclara** si las conversiones inválidas se excluyen de lo que aprende Smart Bidding, ni qué evento reportar como conversión con doble opt-in. Los créditos por actividad inválida (informe publicado el 1 jun 2026) cubren Search y PMax, no quitan el lead del CRM. (https://ppc.land/google-ads-filters-miss-fake-leads-so-advertisers-must-add-3-form-checks/)
- Encuesta Lunio (131 directivos): 51 % ve el riesgo de que la puja automática optimice hacia «convertidores no humanos»; 22,9 % cita el tiempo de ventas perdido en formularios falsos; solo 5,3 % usa una herramienta específica. (Vendedor.)
- Pasar de «Envío de formulario» a objetivos de lead **cualificado/convertido** activa protecciones de lead gen en Google (Google Brasil/EMEA).
- Una anécdota ilustra la raíz: «la IA optimiza al menor coste por clic y por lead, y los leads baratos suelen ser no cualificados»; PMax para tejados atrajo buscadores de empleo (ppcstack, anécdota sin cifras).

---

## 8. Ideas para nuestro módulo

1. **Diagnóstico causal por árbol, no por lista de alertas.** Seguir el orden que repite toda la comunidad: ¿entrega? (estado, facturación, desaprobados, «limitada por presupuesto») → ¿medición? (conversión primaria activa, saltos a cero o al alza, duplicados, subidas offline fallidas, **cruce con GA4 y con GoHighLevel**) → ¿cambio propio? (historial de cambios + **registro de cambios de la web que ya tenemos en SEO**) → ¿retraso de conversión? (comparar solo con ventanas maduras) → ¿mercado? (Auction Insights, cuota perdida por ranking/presupuesto, CPC de subasta) → ¿landing? (PageSpeed/CrUX/página caída del módulo SEO) → ¿estacionalidad? (Search Console de la marca, mismo periodo del año anterior). Cada alerta debe salir **con su causa más probable y con la evidencia**.
2. **Detección de anomalías contra el mismo día de la semana** (diseño del Account Anomaly Detector de Google) ajustada al retraso de datos (no comparar con horas incompletas) y a la **madurez de conversiones** (marcar los últimos N días como «inmaduros» según el retraso medio de cada cliente).
3. **Umbrales relativos al CPA objetivo del cliente y a su ciclo**, no «N clics»: ya tenemos ficha con propuesta de valor, contrato y objetivos. Disparar a 1,5x, 2x, 3x del CPA con zero conversión; no actuar con <20 clics salvo intención claramente errónea; y **antes de pausar comprobar conversiones asistidas y microconversiones** (consejo alemán). Con clasificación de intención por LLM pequeño (Haiku) de la consulta frente a la ficha del cliente (servicios, zona) — el caso «car insurance near me» sin oficinas — **con puntuación de confianza (≥85 % propone con prioridad; <85 % pregunta)**, siguiendo a Rooijmans.
4. **Calidad real del lead como columna de primera clase:** cruzar clic/GCLID → lead en GoHighLevel → cualificado/cita/venta. Un «CPL aparente vs CPL cualificado» por campaña/keyword/dispositivo/landing, y **porcentaje de spam** (hilo, teléfono falso, correo desechable). Alerta cuando «muchas conversiones + poco cierre» durante 90 días (digitalapplied) o cuando el spam supera un porcentaje. **Subir la calidad a Google** vía Data Manager API (migración desde el 15 jun 2026; verificarlo antes de diseñar).
5. **Semáforo de «control antes de escalar»:** no sugerir subir presupuesto/objetivos hasta que medición y calidad estén sanas; reflejar el patrón de los casos creíbles (arreglar señal → luego pujas).
6. **Protección contra el error clásico «bajar tCPA como pide Google»:** si el objetivo baja y los CPC suben mientras las conversiones caen en los 7-14 días siguientes, alerta con la receta de Rooijmans (límite de CPC por percentil 90-95 de términos convertidos, pasos de 10-20 %).
7. **Revisión de recomendaciones auto-aplicadas y de ajustes heredados** como comprobación automática en cada cuenta: auto-apply activo, Search Partners, «presencia o interés», expansión de Display, URL expansion/Text customization de AI Max, **migración DSA → AI Max** (comprobar qué funciones quedaron encendidas por defecto), los ajustes que **reaparecen solos**.
8. **Registro de cada sugerencia: qué, por qué, cómo deshacer, quién aprobó** (piden las agencias; el `change_event` solo da 30 días retrospectivos → **archivar nosotros** el historial de cambios de cada cuenta), y modo **solo lectura primero**, escritura con aprobación; nunca auto-aplicar presupuesto/tCPA/broad match.
9. **Priorización diaria «qué cuenta mirar hoy»** por impacto esperado x confianza (el módulo calcula un «riesgo en euros»): gasto en riesgo + desviación sobre el patrón del mismo día + madurez de datos + tamaño de la cuenta. La agencia pasa de 3 días/semana de revisión a atender solo las excepciones.
10. **Informe al cliente con acciones**: lenguaje de negocio (leads cualificados, CPA real, coste por cliente), 3 hechos + 3 acciones, avisos por Telegram al equipo y plantilla para el cliente; tareas a ClickUp con prioridad.
11. **Estructura por valor y por geografía** (patrón implante/revisión): detectar campañas que mezclan servicios de distinto valor en el mismo CPA objetivo y proponer separación; cruzar con el valor de cada servicio de la ficha.
12. **RGPD:** comprobar Consent Mode v2 y pérdida de conversiones por consentimiento; considerar doble opt-in/validación en servidor en vez de solo reCAPTCHA (consentimiento en la UE).
13. **Costes de IA:** clasificación de términos con modelo pequeño y por lotes, deduplicación y reglas deterministas antes de llamar a un modelo; Opus/Fable solo para el diagnóstico final y la redacción. (Directiva de optimización de IA del proyecto: no usar IA para lo que resuelve un algoritmo.)

## 9. Lo que nadie hace bien

- **Causa, no síntoma:** las herramientas (Optmyzr, Opteo, Adalysis, TrueClicks) alertan de «qué» y proponen cambios; casi ninguna explica «por qué» cruzando **competencia, cuota perdida, cambio en la web, retraso de conversión, estacionalidad y calidad del lead** en una sola explicación. (Hueco inferido de reseñas y de la queja «solo ven datos de plataforma»; no verificado producto a producto.)
- **Calidad del lead de punta a punta para negocios locales** con CRM pequeño (GoHighLevel): las herramientas asumen Salesforce/HubSpot; spam y cierre rara vez entran en el panel.
- **Madurez de datos y retraso de conversión** por cliente: casi todas las reglas tratan los últimos días como completos.
- **Detección de regresiones de configuración que reaparecen** (auto-apply, expansión) y **registro de cambios propio** más allá de 30 días.
- **Priorización entre 25+ cuentas** con un único «riesgo en euros»; el estándar es un panel y listas.
- **Seguimiento de las dos medidas que Google no aclara**: si el spam entra en el aprendizaje de Smart Bidding y qué evento se reporta con doble opt-in.
- **Agentes con confianza calibrada** y límites de plataforma (límite de puja de cartera) conocidos.

## 10. Lo no verificado

- Todo lo de Reddit (extractos de buscador); comentarios literales no leídos.
- Cualquier detalle de G2/Capterra/SEL (403).
- La fecha 15 jun 2026 de la migración de conversiones offline a Data Manager API (ppc.land + ayuda de Google vía buscador): confirmar en https://support.google.com/google-ads/answer/14274408 .
- Todos los casos son autodeclarados; los porcentajes de varios no cuadran con sus cifras.
- Las cifras de capacidad por gestor (ppc.io, Saas Hero) son estimaciones de autor o vendedor.
- Foros de Forobeta, Telegram, YouTube en español, Portugal/Brasil, Bloofusion/PPC-Blog/OMR: no hay datos propios.
- «53 % / 65 % de profesionales» (ALM Corp, sección patrocinada).
- SLAs de agencia: no hay cifras publicadas.

## 11. Fuentes (URL)

- ppc.io capacidad: https://ppc.io/blog/how-many-google-ad-accounts-one-person-manage
- Fluency/ppc.land: https://ppc.land/agencies-target-83-increase-in-client-capacity-as-automation-reshapes-adops-workflows/
- Saas Hero (pods): https://www.saashero.net/uncategorized/google-ads-agency-team-structure/
- Spam y formularios (ppc.land): https://ppc.land/google-ads-filters-miss-fake-leads-so-advertisers-must-add-3-form-checks/
- PMax spam (ppcstack): https://www.ppcstack.io/p/pmax-the-spam-magnet
- SEJ PMax leadgen: https://www.searchenginejournal.com/performance-max-lead-generation-advanced-strategies-and-pitfalls/525632/
- Control AI Max/PMax (SEJ): https://www.searchenginejournal.com/rundowns/inside-ai-max-pmax-smart-bidding-how-ppc-managers-regain-control/
- Digiday AI Max: https://digiday.com/media-buying/as-industry-anticipates-ai-search-ads-buyers-scrutinize-googles-ai-max
- Digiday agentes: https://digiday.com/marketing/trust-becomes-the-product-marketers-grapple-with-googles-new-suite-of-ai-powered-ad-agents/
- DesignRush AI Max: https://news.designrush.com/google-ai-max-search-ads-budget-oversight
- Optmyzr Town Hall (agentes): https://www.optmyzr.com/ppctownhall/can-ai-agents-really-manage-google-ads-accounts/
- Agente PPC (arquitectura): https://www.digitalapplied.com/blog/build-paid-media-ppc-management-agent-2026
- Auditoría de 100 puntos: https://www.digitalapplied.com/blog/google-ads-audit-checklist-100-items
- Rutina por cadencia: https://oneppcagency.co.uk/google-ads/optimisation/
- Swydo checklist: https://swydo.com/blog/google-ads-optimization-checklist/
- AgencyAnalytics checklist: https://agencyanalytics.com/blog/ppc-management-checklist
- MeasureU: https://measureu.com/resources/google-search-ads-optimization/
- Nils Rooijmans (NL): https://nilsrooijmans.com/daily/author/nils
- Rutina SEA (DE): https://onlinemarketing.de/news/morgenroutine-11-sinnvolle-massnahmen-sea-manager
- Account Anomaly Detector: https://developers.google.com/google-ads/scripts/docs/solutions/account-anomaly-detector?hl=de
- Blog du Modérateur (FR): https://www.blogdumoderateur.com/google-ads-conseils-concrets-lea-gueniffet/
- Adsmurai (ES): https://www.adsmurai.com/es/case-studies/claudio-galeno-pujas-optimizadas ; https://www.adsmurai.com/es/case-studies/quadis-google
- Comunidad Google Ads: https://support.google.com/google-ads/threads?hl=en
- Casos: https://www.workshopdigital.com/case-studies/how-performance-max-cut-cpl-and-doubled-mqls/ ; https://visionary-marketing.co.uk/case-studies/dental-implant-clinic-ppc ; https://blackadstips.blogspot.com/2026/03/how-gdt-improved-benton-roofings-google.html ; https://www.attorneyatwork.com/building-law-firm-ppc-strategy/
- Reseñas de herramientas: https://www.tryatria.com/blog/optmyzr-reviews ; https://cotera.co/articles/optmyzr-alternative-google-ads
- Umbrales de términos: https://www.optmyzr.com/blog/google-ads-keywords-not-converting/
- Ayuda de Google (offline/leads): https://support.google.com/google-ads/answer/14274408 ; https://support.google.com/google-ads/answer/13775965

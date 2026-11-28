# 02 — Disección de las herramientas líderes de gestión y optimización de Google Ads

**Investigación del 28 nov 2026.** Fuentes: webs públicas, centros de ayuda (Optmyzr, Adalysis, Opteo, TrueClicks), changelogs
y precios. **Limitaciones de esta investigación (importante):** G2, Capterra, GetApp, TrustRadius, Software Advice y Reddit
devolvieron 403 o bloquearon la lectura automática, y el presupuesto de búsquedas web de la sesión se agotó a mitad del trabajo.
Por eso la parte de **reseñas reales** es más débil que la de funciones: lo que digo de reseñas sale de lo que las propias webs
citan (notas medias) y de conocimiento previo marcado como **no verificado**. La disección de funciones, umbrales y flujos sí
está leída página a página en la documentación oficial.

## Resumen (lo esencial en 15 líneas)

1. **Adalysis** es la que mejor documenta su lógica: 100+ controles diarios con **umbrales por defecto publicados** (p. ej.
   palabra clave sin conversiones tras 150 clics en 30 días; término de búsqueda a negativo con 0 conversiones y >150 clics en
   90 días; a positivo con ≥2 conversiones en 90 días; CPC o CPA que sube >30 % 7 días vs 30 días; socios de búsqueda con CPA
   >25 % peor; móvil vs ordenador con >30 % de diferencia y ≥10 conversiones en cada uno). Es la referencia para copiar umbrales.
2. **Optmyzr** es la más amplia (436 artículos de ayuda, 16 áreas): Rule Engine (motor de reglas «si-entonces» con datos
   externos desde Google Sheets y **similitud semántica IA término↔palabra clave con escala 0-100**), PPC Investigator (árbol de
   métricas + 3 mayores causas positivas y negativas), Budget Monitors, auditoría con ~80 «widgets», Sidekick (IA que propone
   cambios vía «Change Requests» con aprobación) y MCP/conector para Claude.
3. **Opteo** es la más simple y la más querida por usabilidad: 64 «Improvements» de un clic con **etiqueta de impacto anual**
   (p. ej. «Reallocate £X/year»), ventana de datos **adaptativa** (empieza corta y se alarga hasta tener datos suficientes según
   la tasa de conversión del grupo de campañas), alertas de anomalía que **aprenden la variabilidad normal** de cada cuenta, y un
   «Agent» de IA. Publica poca lógica numérica: casi todo es «comparado con su grupo de campañas».
4. **TrueClicks** es gratis hasta 50.000 $/mes de inversión (encaja con Kijutech), separa **Monitorización diaria** (cosas rotas)
   de **Recomendaciones semanales** (buenas prácticas) e **Insights**; ordena por «impacto en la puntuación»; auto-aplica higiene
   (listas de negativas por nombre de campaña, exclusión de canales infantiles, etc.). Tiene asistente IA con Claude y Gemini.
5. Ninguna cruza Google Ads con **CRM (calidad real del lead)**, **landing/velocidad/cambios en la web**, **Business Profile** o
   **posiciones orgánicas** del mismo cliente; ninguna da un diagnóstico narrado del tipo «esta campaña lleva 3 días sin convertir
   porque perdiste cuota por ranking frente a X». Ese es nuestro hueco.
6. **Subastas (Auction Insights)**: la API de Google Ads no las da; TrueClicks las importa con un informe programado a Google
   Sheets. Dato práctico para nuestro diseño.

---

## 1. Opteo

### 1.1 Ficha
- **Qué es:** se presenta ahora como «AMM, Agentic Marketing Manager»: «Performance marketing software for the AI era»
  ([opteo.com](https://opteo.com/)). Londres (Reino Unido). Plataformas: Google Ads, Microsoft Ads, Meta, LinkedIn, TikTok.
- **Año de fundación:** no lo dice su web. SourceForge pone 2013 ([sourceforge](https://sourceforge.net/software/product/Opteo/));
  un artículo patrocinado en SEJ la describe ya en feb 2018 ([SEJ](https://www.searchenginejournal.com/how-opteo-helps-automate-routine-adwords-tasks/232585/)).
  **No verificado** el año exacto.
- **Precios** ([opteo.com/pricing](https://opteo.com/pricing)), nov 2026:

| Plan | Precio | Cuentas | Inversión/mes | Refresco | «Tokens» IA |
|---|---|---|---|---|---|
| Basic | 129 $/mes | 10 | 25.000 $ | 24 h | ~25 M |
| Professional | 249 $/mes | 25 | 100.000 $ | 12 h | ~50 M |
| Agency | 499 $/mes | 75 | 250.000 $ | 12 h | ~100 M |
| Enterprise | a medida | — | — | — | — |

  Anual = 2 meses gratis. Soporta MCC. **Para Kijutech (25+ cuentas) sería el plan Agency (~499 $/mes).**
- **Éxito:** «thousands of agencies and businesses»; notas que cita su web: Capterra 4,8/5 (112 reseñas), GetApp 4,9/5 (114),
  G2 4,5/5 (40). Clientes citados: Booking.com, Deliveroo, Hotjar, Le Creuset ([opteo.com/pricing](https://opteo.com/pricing)).

### 1.2 Organización de la herramienta
Documentación en 13 colecciones ([opteo.com/docs](https://opteo.com/docs)): Getting Started, **Agent**, **Opteo MCP**, API &
Integrations, **Improvements** (64 artículos), **Issues** (13), **Alerts** (10), **Toolkit**, **Budget Management**,
**Performance**, Accounts, Impact Statistics, Billing.

Pantallas principales por cuenta: **Improvements** (cola de mejoras de un clic) → **Issues** (cosas que impiden que los anuncios
salgan) → **Alerts** → **Performance** (Dashboard, Trends, Segments, Scorecard 0-100) → **Toolkit** (N-Gram Finder, Account
Manager, edición masiva, RSA Writer, experimentos de puja) → **Agent** (chat). Vista multi-cuenta con «Linked Accounts»
(MCC compartidas con el equipo, asignación masiva de equipo) ([changelog](https://changelog.opteo.com/)).

**Flujo revisar → aplicar → descartar:** cada Improvement se revisa, se «empuja» (push) a la cuenta, o se descarta y puede
restaurarse ([Push, dismiss and restore](https://opteo.com/docs/en/articles/18347719-push-dismiss-and-restore-improvements)).
El empuje es asíncrono (se puede seguir con otra mientras se aplica). Cada mejora muestra el rango de datos usado («using data
from the last 30 days»). Las Issues se pueden **asignar a miembros del equipo**, volver a comprobar, ignorar y restaurar
([Issues](https://opteo.com/docs/en/collections/18818692-issues)). Registro: los cambios de ajustes del algoritmo quedan en un
**Changelog** de la cuenta.

### 1.3 Catálogo completo de «Improvements» (64 artículos de ayuda, nov 2026)
Fuente: subcolecciones de [Improvements](https://opteo.com/docs/en/collections/110203-improvements).

**Palabras clave (Keywords, 8)**
1. Classify Search Term — término que activa anuncios y aún no es palabra clave ni negativa: el usuario elige añadirlo como
   palabra clave o negativa, texto y concordancia; muestra palabra que lo activó, rendimiento y vista previa de la SERP
   ([doc](https://opteo.com/docs/en/articles/11768255-classify-search-term)).
2. Pause Keyword — «ha gastado mucho convirtiendo muy poco comparado con su grupo de campañas, o nada»
   ([doc](https://opteo.com/docs/en/articles/11769301-pause-keyword)).
3. Adjust Keyword Bid — puja según rendimiento frente a CPA/ROAS objetivo; no propone cambio si la puja se cambió hace poco
   (solo usa datos desde el último cambio).
4. Fix Keyword Conflicts — negativas que bloquean palabras clave positivas.
5. Replace Broad Keyword — amplia que rinde «muy por debajo de su grupo» (gasto, conversiones, CPA/ROAS) → pausa la amplia y
   crea la misma en frase en el mismo grupo ([doc](https://opteo.com/docs/en/articles/11758623-replace-broad-keyword)).
6. Pause Duplicate Keyword.
7. Add Industry Negative — añade una palabra en frase a una lista compartida a nivel de cuenta.
8. Reduce Campaign Keyword Bids — bajar pujas cuando el presupuesto está limitado.

**Negativas (3)**
9. Apply Negative List.
10. **Add Location Name as Negative** — términos que mencionan un lugar que la campaña no segmenta («flores Canadá» para una
    floristería en Italia) → negativa en frase con el nombre del lugar; muestra ahorro estimado
    ([doc](https://opteo.com/docs/en/articles/11769371-add-location-name-as-negative)). **Muy relevante para negocios locales.**
11. Add N-Gram Negative.

**Exclusiones (12)**
12. Exclude Age Range, Gender, Income Range or Parental Status (pensado para Smart Bidding, donde no hay ajustes de puja).
13-18. Exclusiones LinkedIn (cargo, antigüedad, función, sector, empresa, tamaño).
19. Exclude Country. 20. Exclude State. 21. Exclude Location. 22. Exclude Device.
23. Exclude Website, YouTube or Mobile App Placements.

**Ajustes (Adjustments, 28)** — los de Google Ads:
24. Adjust Ad Group Targets (acercar CPA/ROAS del grupo a la media de la campaña).
25. Adjust Location Bid. 26. Adjust Demographic Bids. 27. Adjust Device Bid.
28. Reduce N-Gram Bids. 29. Fix Below First Page Bid. 30. **Raise Budget Cap** (campañas buenas limitadas por presupuesto).
31. Disable Locations of Interest («presencia o interés» → solo presencia). 32. Disable Search Partners. 33. Disable Display
    Network. 34. Disable Text Customization (textos generados por Google). 35. Disable Optimized Targeting.
    Más equivalentes para Microsoft Ads (socios, expansión de URL final, recomendaciones autoaplicadas, activos autogenerados de
    texto/imagen, ubicaciones de interés), Meta (retoques de imagen/vídeo/texto, overlays, plataformas) y LinkedIn (expansión de
    audiencia, rotación optimizada, entrega offsite, ubicación permanente).

**Higiene (2):** Add Frequency Cap; Apply Exclusion List to Campaigns.
Históricas o en otras colecciones: mejoras de Shopping (grupos de productos), pujas por horario (ad schedule), test de anuncios
(pausar perdedor con significancia, comparando solo periodos en que ambos anuncios corrieron) ([SEJ 2018](https://www.searchenginejournal.com/how-opteo-helps-automate-routine-adwords-tasks/232585/)),
Fix Broken Links & Sitelinks, Add Callout/Sitelink Extensions. Alguna ha pasado a «Issues».

**Lógica documentada (poca, pero interesante):**
- **Ventana de datos adaptativa:** «empieza con un rango corto y solo pasa a uno más largo si aún no hay datos suficientes». El
  umbral de «suficiente» depende de **con qué frecuencia convierten campañas similares**: si el grupo convierte ~1 de cada 10
  clics, una palabra con 3 conversiones en 10 clics aún no tiene clics suficientes para juzgarse
  ([doc](https://opteo.com/docs/en/articles/12301289-how-opteo-chooses-the-date-range-for-an-improvement)). Cada sección tiene un
  **Minimum Date Range** configurable (más largo para cuentas estacionales o de poco volumen).
- **Grupos de campañas (Campaign Groups):** agrupación automática o manual con **objetivo de CPA/ROAS y acciones de conversión
  por grupo**; casi todas las mejoras comparan contra «su grupo» ([changelog](https://changelog.opteo.com/)).
- **Algorithm Settings** por cuenta (compartidos por el equipo), secciones: pujas y pausa de palabras; sustitución de amplias;
  exclusión de segmentos (con **Protected Segments**); pujas/exclusiones por ubicación, demografía y dispositivo; socios de
  búsqueda; topes de presupuesto y pujas de campaña; clasificación de términos; negativas y pujas por n-gramas (con **Protected
  Terms**, p. ej. la marca). Se pueden rellenar «con IA» eligiendo resultado (p. ej. «Reduce») y agresividad (Cautious /
  Balanced / Aggressive). **No hay ajuste de retraso de conversión** (dicen que se lo comentes al Agent)
  ([doc](https://opteo.com/docs/en/articles/15922578-algorithm-settings-overview)).
- **«Checks Completed»:** cada grupo de mejoras muestra cuántos elementos revisó (p. ej. «1.240 checks») y cuándo. Mucho
  revisado y nada propuesto = «miré y todo está bien» ([doc](https://opteo.com/docs/en/articles/18347721-checks-completed-and-impact-tags-explained)).
- **Etiquetas de impacto anualizado:** «Reallocate £X/year», «Add N Conversions/year», «Add £X Conv. Value/year», «Add N
  Clicks/year», «Rebalance £X/year», «Classify £X/year»; o de propósito: «Control Ad Creative», «Prevent Automated Changes»,
  «Exclude Irrelevant Traffic». Son estimaciones para priorizar. **No documentan cómo ordenan la cola.**
- **Excluir campañas** de Improvements, informes y toolkit.

### 1.4 Issues, Alerts, presupuesto y rendimiento
- **Issues** (problemas que impiden que los anuncios salgan): anuncio rechazado, palabra clave rechazada, **enlace roto**,
  campaña vacía, grupo vacío, **faltas de ortografía**, (Meta) conjunto que no sale del aprendizaje. Puede **redactar el arreglo**
  (nueva URL final, anuncio que cumple la política) ([Issues](https://opteo.com/docs/en/collections/18818692-issues), [home](https://opteo.com/)).
- **Alerts** (email, Slack, en la app; silenciables por cuenta):
  - **Unexpected Changes:** coste, clics e impresiones. «Opteo no usa reglas fijas»: aprende lo normal de cada cuenta y su
    variabilidad habitual (más tolerancia en cuentas que oscilan mucho). Mira primero la cuenta y luego campañas, y **lista las
    campañas más probablemente responsables**. No repite alerta del mismo indicador en **4 días**
    ([doc](https://opteo.com/docs/en/articles/11431557-unexpected-changes-alerts)).
  - **Zero Conversions:** una acción de conversión **seleccionada** con **0 conversiones 4 días seguidos** con impresiones los 4
    días; revisión cada 24 h; no avisa si esa acción suele tener muy pocas conversiones, si hubo un día con 0 impresiones o si ya
    avisó hace poco. Avisa del falso positivo de acciones con retraso (visitas a tienda)
    ([doc](https://opteo.com/docs/en/articles/18339463-zero-conversions-alerts)).
  - **Zero Impressions**, **Budget** (va a gastar de menos / de más / ya se pasó, con proyección a fin de mes; requiere
    presupuesto mensual; no avisa el último día del mes), **Performance Records** (récords) ([Alerts](https://opteo.com/docs/en/collections/19807878-alerts)).
  - Desde la portada: alerta de **acción de conversión que se para** ([home](https://opteo.com/)).
- **Pause Spend When Over Budget:** pausa el gasto antes de pasar el presupuesto mensual, con aviso y opción de cancelar
  ([changelog](https://changelog.opteo.com/)).
- **Performance:** Scorecard 0-100, Dashboard, Trends, Segments (mejores y peores segmentos).
- **Toolkit:** N-Gram Finder (palabras que rinden mal en varias campañas → negativas con ahorro estimado), Account Manager
  (edición masiva), exclusión automática de ubicaciones, oportunidades de palabras clave etiquetadas por IA, RSA Writer (con
  «ad score»), **Bidding Experiments** (crea y vigila experimentos de estrategia de puja con «confidence score»).

### 1.5 IA: Agent y MCP
- **Agent:** chat que lee datos en tiempo real de la cuenta (y de otras cuentas vinculadas para comparar), conoce el contexto
  configurado (objetivos, presupuesto, competidores, GA4), busca en la web, hace análisis por lotes, audita términos, escribe
  anuncios, e **investiga causas de cambios** cuando se le pide. Hace cambios **solo en la cuenta de la conversación y con
  aprobación** (estado «Response Required»). Prompts guardados y **Team Prompts** / «skills» compartidos (pacing de presupuesto,
  auditoría de términos, renovar RSA) ([Agent overview](https://opteo.com/docs/en/articles/12968321-agent-overview)).
- **Opteo MCP** (23 artículos): conectar Claude/ChatGPT a Opteo. No documentan qué modelo usa el Agent.

### 1.6 Lo que se elogia y lo que se critica (Opteo)
- Elogio (según su web y conocimiento previo, **reseñas no leídas directamente**): rapidez, interfaz muy limpia, «abrir, revisar,
  empujar», buen soporte por chat.
- Crítica habitual (**no verificado en esta sesión**, conocimiento previo de foros): las recomendaciones son «cajas negras»
  (no publican umbrales), muchas mejoras son de cuentas con pujas manuales y pierden valor con Smart Bidding, poco útil para
  cuentas muy pequeñas, y el precio sube con el número de cuentas.

---

## 2. Adalysis

### 2.1 Ficha
- **Qué es:** plataforma de auditoría, test de anuncios, presupuestos y rendimiento para Google Ads, Microsoft Ads y (desde
  2025-26) Meta. Adalysis Ltd, Londres ([pricing](https://adalysis.com/pricing/)). **Cofundada por Brad Geddes** (autor de
  «Advanced Google AdWords») — conocimiento previo, **no verificado en esta sesión**.
- **Clientes:** «2,000+ growing businesses»; premios: 2× «Best Search Technology of the Year», 2× «Best PPC Management
  Software Suite» ([pricing](https://adalysis.com/pricing/)).
- **Precios:** por tramos de inversión mensual (el selector no se pudo leer). Terceros citan «desde 149 $/mes»
  ([comparativa Optmyzr](https://www.optmyzr.com/blog/best-google-ads-tools/)). **Todos los planes: cuentas de Google y
  Microsoft ilimitadas y usuarios ilimitados**; prueba de 30/45/60 días; facturación en USD o EUR; descuento 10 % semestral,
  15 % anual. Incluye: 100+ controles de auditoría, alertas personalizadas, acciones automáticas, 9 monitores de rendimiento
  predefinidos, 40+ herramientas, informes marca blanca (Looker Studio).

### 2.2 Organización de la herramienta
- La **primera pantalla tras iniciar sesión es «Audit & budget»**: vista multi-cuenta con alertas por cuenta y estado de
  presupuesto; «Find accounts by alert type» para ver qué cuentas tienen un problema concreto; otra vista multi-cuenta de
  **Performance** ([audit overview](https://docs.adalysis.com/tools/audit/audit-overview.md)).
- Menús: **Tools** (Audit, Performance, Budget, Reporting, Ad testing, Bidding, Quality score, Campaign builder) y **Manage**
  (Campaigns, Ad groups, Ads/RSA, Keywords, Search terms, Placements, Landing pages, Products, Labels). Integraciones: **MCP
  server** (desde oct 2026 puede **hacer cambios con vista previa y aprobación**), GA4, Merchant Center, Slack, Zapier, Teams,
  Google Chat, **webhooks firmados** ([índice](https://docs.adalysis.com/llms.txt), [Q3/4 2026](https://docs.adalysis.com/product/product-updates/q3-4-2026.md)).
- Ajustes de cuenta: equipo, notificaciones (elegir hora y zona horaria, y para cada aviso email, Slack, ambos o ninguno),
  etiquetas de cuenta, filtros, **acciones de conversión** («conversion sets»), estructura, **notas**, historial de cambios,
  «Checklist for teams», «Workflows», «Onboarding a new account».
- **Flujo:** alerta → contexto, análisis y acción recomendada → aplicar en la propia herramienta (pausar, añadir negativa, subir
  puja…) → o **auto-resolver** (regla que lo aplica sola cada día) → o desactivar la alerta permanente o temporalmente.
  Prioridades: **Critical** («arréglalas ya»), **Error**, **Recommendations**. Desde el 18 nov 2026 la pantalla de alertas está
  **ordenada por impacto**, con favoritos. Informe de auditoría en PDF con varios rangos de fechas.

### 2.3 Catálogo de alertas prebuilt (con umbrales por defecto cuando están documentados)
Fuente: [Prebuilt alert list](https://docs.adalysis.com/llms.txt) y cada página enlazada. Se revisan **a diario** (algunas,
semanalmente). Todos los umbrales son editables por cuenta, y aplicables a varias cuentas o «Global» (cuentas futuras).

**Cuenta:** ajustes de autoaplicación de Google activados; recomendaciones de Google; cuenta que ya no está activa.

**Campañas:**
- **Tráfico de socios de búsqueda con CPA bastante mayor:** CPA de socios **>25 %** peor que el de Google Search, últimos
  **30 días**; autorresolver = excluir socios o etiquetar ([doc](https://docs.adalysis.com/tools/audit/prebuilt-alert-list/campaigns/search-partner-traffic.md)).
- **Móvil vs ordenador Coste/conv.:** diferencia **≥30 %**, mínimo **10 conversiones en cada dispositivo**, **30 días**, sin
  tabletas ([doc](https://docs.adalysis.com/tools/audit/prebuilt-alert-list/campaigns/mobile-vs-desktop-cost-conv..md)).
- Segmentación por ubicación del usuario (presencia vs interés); segmentación de red (Display en Search); ajuste de concordancia
  amplia a nivel de campaña; creación automática de textos; imágenes y vídeos autogenerados; campañas sin ubicación;
  **expansión de URL final sin reglas de URL**; **PMax y AI Max sin exclusiones de marca** (estas 5 últimas, 7 nov 2026).

**Grupos de anuncios:** sin anuncios; con un solo anuncio; demasiados anuncios; sin palabras clave; demasiadas palabras clave.

**Anuncios:**
- **CTR en caída:** caída **>30 %**, **7 días vs 30 días**, mínimo **25 clics en 7 días y 100 en 30**; excluye campañas que
  cambiaron de estrategia de puja en el periodo ([doc](https://docs.adalysis.com/tools/audit/prebuilt-alert-list/ads/ads-with-a-falling-ctr.md)).
- Activos de RSA rechazados (y se pueden arreglar dentro de Adalysis); **faltas de ortografía**; anuncios no totalmente
  aprobados; rechazados (texto, imagen); URLs no seguras (http).

**Palabras clave:**
- **Pocas conversiones:** **0 conversiones y 150 clics en 30 días**; autorresolver = pausar o bajar puja ([doc](https://docs.adalysis.com/tools/audit/prebuilt-alert-list/keywords/keywords-with-poor-conversions.md)).
- **CPC al alza:** **>30 %**, **7 vs 30 días**, sin cambios de puja recientes, solo pujas manuales ([doc](https://docs.adalysis.com/tools/audit/prebuilt-alert-list/keywords/keywords-with-a-rising-cpc.md)).
- **CPA al alza:** **>30 %**, **7 vs 30 días**, sin cambios de puja, solo manuales; causas a mirar: CPC al alza (QS, competencia,
  segmentación) o tasa de conversión a la baja ([doc](https://docs.adalysis.com/tools/audit/prebuilt-alert-list/keywords/keywords-with-a-rising-cpa.md)).
- ROAS a la baja; duplicadas o parecidas (también **entre campañas**, oct 2026); conflictos con negativas; concordancia
  incorrecta; amplia modificada (obsoleta desde 2021); URL final no segura; **relevancia del anuncio baja (QS)**; rechazadas.
- **Potencial de más cuota de impresiones:** CPA **≤ la mitad de la media del grupo** y **cuota de impresiones < 70 %**; excluye
  palabras con cambios de puja en el periodo ([doc](https://docs.adalysis.com/tools/audit/prebuilt-alert-list/keywords/keywords-with-potential-for-higher-impression-share.md)).
- **Palabras de mucho volumen con caída de QS:** **>100 impresiones en 30 días** y tendencia negativa de QS; semanal; con
  historial de los 3 subfactores ([doc](https://docs.adalysis.com/tools/audit/prebuilt-alert-list/keywords/high-volume-keywords-with-a-quality-score-drop.md)).

**Negativas:** campañas sin negativas; negativas repetidas en grupos (subirlas a campaña o lista); listas compartidas a nivel de
campaña; uso incorrecto de amplia modificada.

**Términos de búsqueda:**
- **Nuevas palabras clave desde términos:** **≥2 conversiones en 90 días**, excluye las ya existentes; opcional exigir CPA/ROAS
  objetivo; autorresolver = añadir en exacta ([doc](https://docs.adalysis.com/tools/audit/prebuilt-alert-list/search-terms/new-keywords-from-search-terms.md)).
- **Negativas desde términos:** **0 conversiones y >150 clics en 90 días** (o coste en lugar de clics); Search y Shopping por
  separado; avisa de conflictos con positivas; autorresolver eligiendo nivel (grupo/campaña) y concordancia ([doc](https://docs.adalysis.com/tools/audit/prebuilt-alert-list/search-terms/negative-keywords-from-search-terms.md)).
- **Negativas desde n-gramas**; **términos duplicados** (servidos desde 2+ grupos, umbral de impresiones) ([doc](https://docs.adalysis.com/product/inside-adalysis/better-search-term-alerts-all-signal-no-noise.md)).

**Nivel de calidad:** grupos con problemas de QS (prioridad = QS ponderado por impresiones × coste de 30 días, fórmula propia).

**Ubicaciones (Display/PMax):** ubicaciones con malas conversiones; exclusión de apps móviles; exclusión de etiquetas de
contenido sensible.

**Landing pages:** **URLs rotas**; landing de DSA rotas; landings que necesitan mejora (por «experiencia en la página de
destino» del QS); **landings con malas conversiones: 0 conversiones y 150 clics en 90 días**, mostrando las palabras clave que
llevan tráfico agrupadas por su nota de experiencia de landing ([doc](https://docs.adalysis.com/tools/audit/prebuilt-alert-list/landing-pages/landing-pages-with-poor-conversions.md)).

**Extensiones (activos):** no totalmente aprobadas; rechazadas; nueva pantalla de cobertura de activos por tipo de campaña.

**Sugerencias de puja:** sugerencias por palabra clave; pujas por debajo del mínimo recomendado; **recordatorios para revisar un
cambio de estrategia de puja**; sugerencias para grupos de productos.

**Shopping y productos (13 nuevas con Merchant Center, 23 nov 2026):** grupos de productos con bajo rendimiento; «Everything
else» con bajo retorno; productos rechazados; **sin stock**; con bajo y alto rendimiento; «con potencial»; **precio por encima
del benchmark**; «venderían más con precio más bajo»; limitados con gasto; perdiendo ventas; perdiendo impresiones; coste al alza
y conversiones a la baja; ganando ventas; cambios en el catálogo.

**PMax:** alertas de activos; de grupos de activos; grupos de ficha con bajo rendimiento; **términos de búsqueda PMax** (descarga
semanal de **90 días** y cruce con las palabras de Search): ya existen como palabra clave en Search; **añadir como palabra clave si
>3 conversiones**; **añadir como negativa si >150 clics y 0 conversiones** ([doc](https://docs.adalysis.com/tools/audit/prebuilt-alert-list/pmax-campaigns/search-term-alerts.md)).

**Alertas personalizadas:** filtros sobre cualquier métrica (desde jul 2026 con métricas «padre», fórmulas y multiplicadores; desde
oct 2026 con **conjuntos de conversiones y métricas/eventos de GA4**), con plantillas, y **CPA/ROAS de referencia** por cuenta
usables en filtros y alertas (ago 2026). **Alertas sobre conjuntos de conversiones** revisadas cada noche (nov 2026).

### 2.4 Rendimiento: monitores y Performance Analyzer (análisis de causa)
- **Monitores de rendimiento:** condición sobre métrica (sube/baja X % o X valor, o por encima/debajo de un valor), alcance
  (cuenta, campaña, nombre, etiqueta, tipo), frecuencia (diaria L-D o L-V, semanal, mensual), comparación (ayer, 3/7/14/30/60/90
  días, semana pasada, este mes, mes pasado) **frente a periodo anterior o mismo periodo del año anterior**, **mínimo** (p. ej.
  solo si coste > 1.000), segunda condición «Y», prioridad **alta o estándar**. Métricas: coste, impresiones, clics, CTR, CPC,
  conversiones, tasa de conv., coste/conv., valor, ROAS, **% impr. parte superior, % impr. parte superior absoluta, cuota de
  impresiones y cuota perdida por ranking y presupuesto**. **5 monitores globales por defecto**: gasto parado, subida de gasto,
  caída de conversiones, caída de impresiones, caída de clics. Cada alerta tiene botón **«Root cause»** que abre el Analyzer
  ([doc](https://docs.adalysis.com/tools/performance/how-to-create-performance-monitors.md)).
- **Performance Analyzer:** compara dos periodos (anterior, año anterior o a medida), con conversiones o «todas las
  conversiones». Diagrama de flujo de métricas en **3 etapas: antes del clic (volumen de búsqueda, impresiones, cuota,
  posición) → clic (CTR, CPC) → conversión**; colores verde/naranja/gris («sin cambio significativo»); columna de **factores
  que influyen** con sugerencias; cada caja abre las campañas afectadas y baja a grupo/activo/palabra; **historial de cambios
  de Google Ads** encima del diagrama; banda de **conjuntos de conversiones**; **comparación con GA4** en los mismos periodos;
  **«Explain with AI»** global y por métrica; descarga en PDF. Ejemplo de la doc: conversiones −15 % semana a semana → caída de
  CTR → peor posición → mejorar relevancia, revisar términos, testar anuncios o mejorar la landing
  ([doc](https://docs.adalysis.com/tools/performance/root-cause-analysis-with-the-performance-analyzer.md)).
- **Explain with AI** también en: alertas de rendimiento, comparación GA4, presupuestos que van por debajo, tests de anuncios
  (propone el siguiente anuncio y lo crea) y QS (12 semanas) ([doc](https://docs.adalysis.com/tools/performance/explain-with-ai.md)).
- **Cuota de impresiones:** **«Budget boost alert» cuando la cuota perdida por presupuesto supera el 10 % tres días seguidos**,
  con estimación de lo que se ganaría con más presupuesto los próximos 30 días; la perdida por ranking se ataca con QS
  ([doc](https://docs.adalysis.com/tools/performance/impression-share-analysis.md)).
- Segmentos: ubicaciones coincidentes vs segmentadas, hora de la semana, programación.

### 2.5 Presupuestos
Pacing con gasto hasta ayer; colores gris (sin objetivo), azul (por debajo), naranja (por encima), verde (dentro del margen,
**5 % por defecto**, opciones 5-25 %); pacing lineal (1.000 $ → 500 $ el día 15). Alertas de pacing diarias; **alertas de umbral
de gasto cada hora** (p. ej. al 80 % del objetivo; o «el día 15 no llegó al 50 %»). **Auto manage**: ajusta cada día los
presupuestos diarios para acercarse al objetivo sin pasarse (avisa de que Google puede gastar hasta 2× el diario). **Auto
pause**: pausa al llegar a un % del objetivo (1-100, ej. 95 %) y reactiva el día 1. Grupos de presupuesto, calendarios a medida,
objetivos futuros y arrastre (rollover), recomendaciones de presupuesto diario, analítica, cargas masivas
([pacing](https://docs.adalysis.com/tools/budget/pacing.md)).

### 2.6 Test de anuncios (su origen y su punto fuerte)
Tests automáticos en cada grupo (o multi-grupo por patrón o etiqueta, activos de RSA, tamaño de imagen), cada día; niveles de
confianza **80/85/90/95/99 %**; umbrales por defecto 0 clics/0 impresiones/0 conversiones, confianza 80 %, 7 días; umbrales por
campaña prevalecen sobre los de cuenta; **pausa automática del perdedor**; proyección de mejora; «fecha de activación del anuncio»
para comparar periodos justos ([thresholds](https://docs.adalysis.com/tools/ad-testing/faqs/ad-testing-thresholds.md),
[confidence](https://docs.adalysis.com/tools/ad-testing/faqs/ad-testing-confidence.md)). No documenta el test estadístico.

### 2.7 Nivel de calidad
QS de 1-10 por palabra; cuenta, campaña y grupo **ponderados por impresiones**; desglose en CTR esperado, relevancia y landing;
histórico; lista de grupos «en orden de prioridad» (QS ponderado × coste 30 días); explicación IA de 12 semanas
([doc](https://docs.adalysis.com/tools/quality-score/tutorial-review-and-improve-your-quality-scores.md)).

### 2.8 Novedades 2025-2026 relevantes
MCP server (sep 2026) que **ya puede hacer cambios con vista previa y aprobación** (oct 2026); integración GA4 (sep 2026);
pantalla de **términos de AI Max** con solapes y n-gramas, añadir como palabra/negativa y activar/desactivar AI Max en bloque
(ago 2026); landings automáticas de PMax/AI Max/DSA; experimentos de campaña; Demand Gen; paridad total con Microsoft; notificaciones
a Zapier/Teams/Google Chat/webhook ([Q3/4 2026](https://docs.adalysis.com/product/product-updates/q3-4-2026.md)).

### 2.9 Elogios y críticas (Adalysis)
- Elogio (conocimiento previo, **no verificado**): test de anuncios y auditoría de referencia, umbrales transparentes y
  editables, precio por inversión con cuentas y usuarios ilimitados, soporte rápido.
- Crítica (**no verificado**): interfaz densa, curva de aprendizaje, muchas alertas «ruidosas» si no se ajustan umbrales,
  menos automatización «inteligente» que Optmyzr.

---

## 3. Optmyzr

### 3.1 Ficha
- **Fundada** el 9 ago 2013; CEO **Frederick Vallaeys** (uno de los 500 primeros empleados de Google, ~10 años «AdWords
  evangelist»), cofundadora Geetanjali Tyagi ([company](https://www.optmyzr.com/company/)). Cita **5.300 M$ de inversión
  gestionada** (página About). Oficinas/empleos en Hyderabad, Caracas, Santiago de Chile ([llms.txt](https://www.optmyzr.com/llms.txt)).
  Sin rondas ni adquisiciones encontradas. Benchmarks propios sobre 20.000+ cuentas de Google Ads (2026).
- **Plataformas:** Google Ads, Microsoft, Amazon, Meta, LinkedIn, Yahoo! Japan.
- **Precios** ([pricing](https://www.optmyzr.com/pricing/)): planes **Essentials / Premium / Enterprise** por tramos de inversión
  (25K, 50K, 75K, 150K, 250K, 350K, 500K, 500K+). La página no mostró las cifras; terceros: «desde 208 $/mes» (anual)
  ([best tools](https://www.optmyzr.com/blog/best-google-ads-tools/)). Anual −30 %. Diferencias: Rule Engine semanal/mensual
  (Essentials) vs diario (Premium) vs **horario** (Enterprise); Shopping/PMax solo desde Premium; IA y MCP limitados en Essentials;
  soporte 24 h / 6 h / 4 h; servicio de configuración 199 $/h. Campaign Automator aparte desde 249/mes. Prueba 14 días.
- **Notas:** G2 4,6/5, Capterra 4,6/5 (según su web).

### 3.2 Organización
Ayuda con **436 artículos en 16 áreas** ([help](https://help.optmyzr.com/)): IA, monitorización multiplataforma, **Audits &
Insights** (43), Optmyzr Express, términos y palabras clave, anuncios y campañas, **pujas y presupuestos** (30), **Rule Engine**
(58), Shopping (34), informes (40), **workflows y operaciones masivas**, **Enhanced Scripts** (22), utilidades.
- **Vista multi-cuenta:** All Accounts Dashboard con métricas y alertas; **Portfolios** (agrupar cuentas para rendimiento,
  alertas, presupuestos y workflows).
- **Alertas:** tipos Metric, Budget (una cuenta), Budget (multi-cuenta), Rule Engine y **Anomaly**; tendencia de 4 semanas con
  objetivo y desviación; **posponer 1, 7 o 28 días**; Slack y Microsoft Teams ([alerts](https://help.optmyzr.com/en/articles/3075016-view-your-alerts)).
  Además un script «Anomaly Detector» que revisa la cuenta cada hora.
- **Workflows:** «Account Blueprints» / «AI Blueprints» (listas de tareas recurrentes por cuenta, generables con un prompt),
  integración con Slack, Trello, CRMs; **Change Reviews** (cambios propuestos por Sidekick que otro compañero aprueba).
- **Informes:** multiplataforma, plantillas, widgets, **marca blanca**, envío programado; widget «PPC Narrator» (texto IA que
  explica cambios entre dos periodos).

### 3.3 Componentes principales
**a) PPC Investigator (análisis de causa raíz)** ([guía](https://help.optmyzr.com/en/articles/3075363-ppc-investigator-about-user-guide)):
- Eliges métrica, periodo y comparación (mismo número de días inmediatamente anterior).
- **Cause Chart:** cada métrica depende de otras; parte del **tráfico elegible (Search Query Volume = impresiones que la cuenta
  podría haber recibido)** para distinguir si la caída es de demanda o de conversión; árbol impresiones → clics/CTR → CPC → tasa
  de conversión → conversiones/CPA. Visualización en **treemap** con % de cambio.
- **Root Cause Analysis:** **3 mayores contribuyentes positivos y 3 negativos** al cambio; cada uno desglosable en
  subcontribuyentes (palabra, grupo, red, dispositivo y combinaciones palabra+dispositivo, red+grupo).
- **Historial de cambios** al pasar por el reloj de cada contribuyente (quién cambió qué). La API de Google Ads solo da **30
  días** de historial; más allá, solo lo que Optmyzr guardó desde que conectaste la cuenta.
- No publica la fórmula de contribución ni el umbral de «significativo». Conversiones personalizadas sin cause chart.

**b) Rule Engine** (motor de reglas sin código) ([colección](https://help.optmyzr.com/en/collections/1798716-rule-engine)):
- Alcances: cuenta, campaña, grupo, palabra, término (por grupo), anuncio, ubicación, producto, ajustes de puja (geo, dispositivo,
  edad, género), presupuestos, historial de cambios. Operadores, **expresiones a medida**, variables, **pares clave-valor**,
  rangos de fechas a medida, **datos externos desde Google Sheets** (p. ej. llamadas o conversiones del CRM por ID de palabra
  clave o grupo) y listas externas ([external data](https://help.optmyzr.com/en/articles/3076073-connecting-external-data-in-rule-engine)).
- Acciones: cambiar puja/presupuesto/objetivo, pausar/activar, añadir palabra o negativa, etiquetar, informe, alerta (email,
  Slack, Teams). Modo vista previa (sugerencias) o automático con frecuencia según plan.
- **Excluir cambios recientes** (hoy, desde ayer, 7, 14, 30, 60 días) para que una regla no reaccione a sus propios cambios ni a
  los de otra estrategia del mismo nivel ([doc](https://help.optmyzr.com/en/articles/3305117-how-to-exclude-recent-changes-in-rule-engine)).
- **Similitud de intención IA término↔palabra clave** (similitud de palabras, orden y semántica; escala implícita 0-100):
  **≥85 muy relevante, 60-84 algo, ≤20 no relevante**. Reglas de ejemplo: similitud ≥85 y conversiones >0 → añadir palabra;
  similitud ≤20 y gasto > límite → negativa; en marca, excluir intención de competidores. Recomiendan usarla como **filtro
  secundario** tras las condiciones de rendimiento ([doc](https://help.optmyzr.com/en/articles/13428310-search-term-and-keyword-intent-similarity-using-ai)).
- **Estrategias predefinidas** ([doc](https://help.optmyzr.com/en/articles/3076050-pre-built-strategies)): ajustes de dispositivo
  por grupo y por CPA objetivo; excluir apps sin conversiones; **Find New Cities** (ciudades nuevas en 14 días vs periodo
  anterior); **Find Expensive Cities** (CPA > media de campaña, o sin conversiones con clics suficientes para esperar una);
  CPC/CPA objetivo por país/región/ciudad; recuento de anuncios por grupo; informe de anuncios rechazados; anuncios con CTR en
  caída; auditar Maximizar conversiones para decidir la siguiente estrategia; **términos sin conversión con Smart Bidding**
  (negativa si CTR menor que su palabra clave, o 0 conversiones con coste > CPA típico de la campaña); Optimizar tCPA y tROAS;
  ubicaciones automáticas; excluir ubicaciones de empleo; **Find Expensive Keywords / Ad Groups / Product Groups** (CPA mayor de
  lo típico o sin conversiones con clics suficientes); reducir huecos de puja (puja máx. muy por encima del CPC medio); regla de
  Kirk Williams para Shopping; palabras con subida de coste; **variantes cercanas frente a su palabra**; componentes de QS (y
  pausar QS < 3); **términos nuevos (impresiones en 7 días y ninguna en los 7 anteriores)** y en declive; términos que rinden
  (añadir palabra tras comprobar duplicados); excluir ubicaciones PMax de juegos e infantiles por palabras («game», «kids»…);
  pujar a primera página; **identificar recomendaciones autoaplicadas por Google** (desde el historial de cambios).

**c) Auditoría (Account Structure Audit, ~80 widgets para Google Ads)** ([lista](https://help.optmyzr.com/en/articles/3075410-list-of-available-widgets-for-google-ads)):
grupos caros con QS bajo (top X % de gasto con QS < X); pocos/demasiados anuncios o palabras; grupos con palabras activas sin
anuncios; anuncios duplicados; URLs http; DKI; anuncios con la misma URL; tipos de campaña activos; **campañas que pierden >1 %
de cuota por presupuesto**; reparto de estrategias de puja (coste, CPA, ROAS 30 días); **Smart Bidding con pocas conversiones**;
texto/imágenes/vídeos generados por Google activados; socios de búsqueda; Display en Search; **AI Max activado** y **AI Max sin
exclusiones**; presencia vs interés; sin programación horaria; todos los países; negativas (campañas sin negativas, conteo,
**negativas en conflicto**); **palabras que convierten y pierden cuota por ranking**; reparto de concordancias y su rendimiento;
**seguimiento de conversiones** (estado, importación offline, informes de llamadas, **posible sobreconteo si conversiones =
clics**, **posible infraconteo si tasa de conversión anormalmente baja**, modelos last-click); distribución por concordancia del
término; QS y subfactores; **activos que faltan por campaña** (sitelinks, callouts, llamada, precio, promoción, fragmentos,
ubicación…), activos automáticos; grupos de mucho gasto con pocos activos (por defecto <1 en el top 20 %); PMax (expansión de URL
sin reglas, sin exclusiones de marca, sin negativas, **sin señal de audiencia o solo genérica**, pocos titulares/imágenes/logos);
RSAs (pocos titulares, fijados a una posición, textos cortos, activos «Low», «Poor» ad strength, duplicados).

**d) Presupuestos** ([cuándo usar cada uno](https://help.optmyzr.com/en/articles/8503739-optmyzr-budget-tools-when-to-use-them)):
Budget Monitors por cuenta o portafolio con alertas al **50/75/90/100 %**; automatización desactivada por defecto («nada pasa
solo si no lo activas»); pausa al llegar al objetivo y reactiva al inicio del ciclo; ajuste automático del diario (reparto
uniforme, por día de la semana o adelantado); reparto entre cuentas de un portafolio (proporcional, igual, por rendimiento);
ciclos semanal/mensual/trimestral; **Spend Projection** (histórico, día de la semana, estacionalidad, con resumen IA); **Reallocate
and Optimize Budgets** con simulador y límites de desplazamiento; script de límites flexibles por cuenta/campaña/grupo/palabra/anuncio.

**e) Otras herramientas:** Quality Score Tracker (QS diario ponderado por impresiones, «Top Movers» con umbrales de cambio 0,5
campaña / 1 grupo / 2 palabra) ([doc](https://help.optmyzr.com/en/articles/3075103-quality-score-tracker-user-guide)); Landing
Page Analysis; **Geo Heatmap**; **Hour of Week**; **PPC Vertical Benchmarks**; Traffic Segments y **Traffic Segment Scorer** (el
humano puntúa segmentos 1-5 → reglas de valor de conversión, VBB); Keyword Lasso, Negative Keyword Finder, N-gramas, Traffic
Sculptor, Pause Non-Converting Keywords, Keyword De-Duper, One Word Keywords; A/B test de anuncios con titulares IA; **Optmyzr
Express** (optimizaciones rápidas: añadir anuncios que faltan, arreglar anuncios con problemas); Campaign Automator (campañas
desde feed/inventario); **ajuste por meteorología**; **Web Page Audience Fit Analyzer** (encaje de la landing con la audiencia);
Enhanced Scripts para Google Ads (22 guías).

**f) IA: Sidekick y MCP** ([Sidekick](https://help.optmyzr.com/en/articles/12505157-optmyzr-sidekick-about-user-guide)):
explica la pantalla, resume informes, detecta tendencias, analiza términos y propone positivas/negativas, responde sobre QS,
competidores y benchmarks del sector, crea informes (PDF o enlace) y **alertas de portafolio** por chat, gráficos. Lee datos de
Optmyzr y hace **consultas de solo lectura en directo** a Google, Microsoft, Meta y LinkedIn. **Cambios solo mediante «Change
Requests»**: borrador que muestra exactamente qué se aplicará, aprobación en el chat o envío a un compañero; queda en «Change
Reviews»; funciona en Slack. Perfiles de IA (organización, usuario, cuenta) compartidos con el equipo. Idiomas: inglés, alemán,
**español**, francés, japonés. **MCP** y **Conector para Claude** (directorio de Anthropic) con datos de Google Ads y GA4,
auditorías, benchmarks y competidores. Usan ML propio en ajustes geo y de audiencia (modelo que combina tendencias del sector con
datos de la cuenta) ([ML/IA](https://help.optmyzr.com/en/articles/8418939-machine-learning-artificial-intelligence-in-optmyzr-s-tools)).

### 3.4 Elogios y críticas (Optmyzr)
- Elogio (conocimiento previo + testimonios de su web): la más potente y flexible, Rule Engine sin igual, gran contenido
  educativo, soporte, algunos clientes la usan >10 años; casos: Colewood Digital 2.900 h ahorradas en 2024, B&S Media 2.500 h.
- Crítica (**no verificado en esta sesión**): curva de aprendizaje alta, «demasiadas herramientas», interfaz menos moderna,
  precio por tramos de inversión que sube rápido, funciones clave (Shopping/PMax, reglas diarias) solo en planes altos.

### 3.5 «PPC Signal» / «Signal by Optmyzr»
No encontré ningún producto con ese nombre (ni en la web de Optmyzr, su llms.txt, ni su ayuda). Lo más parecido: «PPC Insights»,
las alertas «Anomaly» y el widget «PPC Narrator». **Probablemente no existe con ese nombre** (no verificado del todo porque se
agotaron las búsquedas).

---

## 4. TrueClicks

### 4.1 Ficha
- **Fundada en 2017** por veteranos de agencia, cofundadores Wijnand Meijer (CEO) y Ales Sturala (CTO); beta privada otoño 2017,
  disponible en 2020; **4.800 M$ anuales de inversión conectada**; 15+ premios ([about](https://www.trueclicks.com/about)).
  Clientes citados: Danone (ahorro del 3,6 % de la inversión), Adidas, Dentsu, Rentokil; 150+ reseñas en G2/Capterra/GetApp
  ([home](https://www.trueclicks.com/)).
- **Precios** ([pricing](https://www.trueclicks.com/pricing)): **gratis hasta 50.000 $/mes de inversión** (todas las funciones,
  usuarios del mismo dominio); 249 $/mes hasta 100K; 349 $ hasta 200K; 449 $ hasta 300K… hasta 4.999 $ por 10 M$. **Usuarios,
  cuentas de Google y Microsoft ilimitados en todos los planes.** Prueba 30 días. SEPA en EUR.
- Asistente IA gratis hoy; **créditos de pago desde el 4T 2026**.

### 4.2 Organización y funciones
Módulos: Auditoría, **Monitorización**, Optimización (arreglos en bloque, «Post changes to Google Ads»), Pacing de presupuesto,
**Seguimiento de KPI frente a objetivos**, Automatización (auto-apply), asistente IA, MCP, integraciones (Google Sheets, Looker
Studio, Teams, Slack), gestión de tareas, **Custom Attributes** (datos propios por cuenta) ([help](https://help.trueclicks.com/en/)).

- **Biblioteca de controles** ([check library](https://help.trueclicks.com/en/articles/18457595-about-the-check-library)): tres
  familias — **Monitoring** (cosas rotas: seguimiento caído, rechazos, URLs rotas, errores de estructura) **a diario**;
  **Recommendations** (desvíos de buenas prácticas, puntuación 0-100 % por control, por categorías: estructura, palabras clave,
  Shopping…) **semanal**; **Insights** (patrones a mirar: **desperdicio por n-gramas, calidad del texto de anuncios, productos
  que dejan de mostrarse, caídas de QS, competidores nuevos**) semanal. Prioridades Critical/High/Medium/Low; **la misma comprobación
  puede tener distinta prioridad en cada cuenta según la métrica del resumen**; estado «Need input» (requiere datos del usuario),
  «Passed», «Not applicable». Columna **Days** (cuántos días lleva fallando, hasta «30+»); flechas de cambio (doble = cambio
  significativo); **Impact = cuánto sube la puntuación TrueClicks de la cuenta si se arregla**, y se ordena por impacto. «100+
  best practices».
- **Alertas de rendimiento** ([doc](https://help.trueclicks.com/en/articles/7269040-performance-alerts-explained)): 4 monitores
  por defecto — **caída de impresiones ≥70 % ayer vs mismo día de la semana anterior**; **caída de clics ≥70 %** igual; **coste
  ±30 % en 7 días vs media de las 3 semanas anteriores**; **cuota perdida por presupuesto >20 % con ≥1.000 impresiones**. Tipos
  «fluctuation» y «threshold»; aplicables a muchas cuentas a la vez.
- **Objetivos (target monitoring):** de volumen (coste, conversiones, valor, clics: con pacing) y de eficiencia (ROAS, CPA, CPC);
  presupuestos importados de Google/Microsoft; importación de objetivos desde Sheets/Excel ([doc](https://help.trueclicks.com/en/articles/8966104-target-monitoring-introduction)).
- **Auto-apply** (modo vista previa o automático, historial de 30 días) ([doc](https://help.trueclicks.com/en/articles/5323994-trueclicks-auto-apply-changes)):
  descartar automáticamente recomendaciones de Google; solo personas en las ubicaciones segmentadas; desactivar Display
  Expansion en Search; socios de búsqueda; rotación de anuncios; **segmentación de idioma y ubicación a partir del nombre de la
  campaña**; **aplicar listas de negativas y de exclusión de ubicaciones según el nombre de la campaña**; negativas para palabras
  exactas pausadas; prevención de desperdicio (canales infantiles, webs de baja calidad, fuentes externas de exclusión para
  YouTube/Display/apps, idiomas, palabras prohibidas). Copiable en bloque a muchas cuentas.
- **Asistente IA** (beta): lenguaje natural → consultas a Google Ads, Microsoft, Meta; **modelos Gemini y Claude** con
  «entrenamiento y guía propios»; activable por cuenta; **skills subibles** ([specs](https://help.trueclicks.com/en/articles/12952466-trueclicks-ai-assistant-specifications)).
- **Subastas (Auction Insights):** la API no las da; se crea en Google Ads (a nivel MCC) un informe «Auction insights: Search»
  con campaña, ID y semana, últimos 30 días, **guardado en Google Sheets con refresco automático semanal**, compartido con su
  cuenta de servicio; un control «Auction Insight for AI» analiza competidores (ignora los de cuota < 10 %) y el asistente
  responde «quién tiene más cuota y cómo cambió por semana» ([doc](https://help.trueclicks.com/en/articles/17673896-how-to-set-up-auction-insights-for-ai)).
  **Esto es directamente reutilizable por nosotros.**

### 4.3 Elogios y críticas (TrueClicks)
- Elogio (conocimiento previo, **no verificado**): gratis para agencias pequeñas, vista de MCC muy rápida, controles «de
  higiene» que ahorran tiempo, puntuación fácil de enseñar al cliente.
- Crítica (**no verificado**): más auditoría/monitorización que optimización profunda; pocas recomendaciones de puja; la
  puntuación de buenas prácticas puede premiar cosas que no mueven resultados.

---

## 5. Herramientas secundarias

### 5.1 Adzooma
Operada por Clicktech Solutions Ltd (Reino Unido). Auditorías con puntuación de salud y arreglos priorizados (Google, Meta,
Microsoft), «oportunidades» de un clic, **30 alertas predefinidas** (CPA, CPC, gasto), pacing, informes PPC+SEO+web, PMax toolkit,
ad copy, horarios. Cifras propias: 48 M de informes gratuitos, 17.000 M$ de inversión analizada, 23 M de mejoras sugeridas
([adzooma.com](https://www.adzooma.com/)). **Precios:** Free (3 alertas, informes mensuales, oportunidades limitadas, cuentas
ilimitadas), Silver 69 $/mes (10 alertas, semanal), Gold 179 $/mes (ilimitadas, diario) ([pricing](https://www.adzooma.com/pricing)).
Enfoque PYME/«freemium»; la nota 4,7 de su web está fechada en 2020. Valor para nosotros: el modelo de «oportunidades» simples
para no expertos (como Eury).

### 5.2 WordStream (LocaliQ)
WordStream fue comprada por Gannett (2018) y hoy vive dentro de **LocaliQ, parte de USA TODAY Co.** (la web de LocaliQ ya no
nombra WordStream; wordstream.com devolvió 403) ([localiq.com](https://www.localiq.com/)). Lo que queda visible: herramientas
gratuitas (**Google Ads Performance Grader**, herramienta IA de textos) y servicio gestionado para negocio local. El software
WordStream Advisor («20-Minute Work Week»: lista de tareas semanal) — **según conocimiento previo, dejó de venderse a nuevos
clientes; no verificado**. Lección: la «lista de tareas de 20 minutos por semana» fue el concepto más copiado del sector para
pymes.

### 5.3 Karooya
Herramienta centrada en **negativas por n-gramas** para Google y Bing (dice haber ahorrado >20 M$), y sobre todo en **Amazon
Attribution + Google Ads** (ventas de Amazon atribuidas a palabras de Google, etiquetas por ACoS, puja por cartera hacia
ACoS/ROAS). Precio por semestre según inversión (300-2.000 $/6 meses por atribución) ([karooya.com](https://www.karooya.com/)).
Poco relevante para lead gen salvo la idea de n-gramas.

### 5.4 Shape.io
**shape.io redirige a NinjaCat** (página «PPC budget management»): pacing automático que reparte presupuesto diario, protección
de sobregasto, alertas de CPA, gasto, clics y conversiones, recomendaciones de presupuesto
([NinjaCat](https://www.ninjacat.io/marketing-performance-management-platform/ppc-budget-management)). La redirección sugiere
que **NinjaCat compró Shape**; fecha **no verificada**. Shape era conocida por pacing de presupuestos multi-cuenta para agencias.

---

## 6. Qué datos extraen y cómo los relacionan (síntesis)

| Herramienta | Datos de Google Ads | Otras fuentes | Cruces destacados |
|---|---|---|---|
| Opteo | Rendimiento por palabra, término, segmento, ubicación, dispositivo, demografía, n-grama; ajustes de campaña; QS | GA4 (contexto del Agent), web (búsqueda del Agent), Meta/LinkedIn/TikTok/Microsoft | Todo se compara con el **grupo de campañas** y su objetivo CPA/ROAS; ventana adaptativa según tasa de conversión del grupo; impacto anualizado |
| Adalysis | Todo lo anterior + historial de QS diario, cuota de impresiones y top/abs top, historial de cambios, términos de PMax y AI Max, Merchant Center | **GA4** (comparación en el Analyzer, métricas y eventos en filtros), Merchant Center, Meta, Microsoft | Árbol de métricas en 3 etapas con historial de cambios encima; QS ponderado por impresiones × coste; términos PMax ↔ palabras de Search; landing con malas conversiones ↔ nota de landing del QS |
| Optmyzr | Todo + volumen de búsqueda elegible, historial de cambios cacheado, recomendaciones autoaplicadas | **Google Sheets externos (CRM, llamadas)**, meteorología, feeds, Amazon, Meta, LinkedIn, benchmarks de 20.000 cuentas | Investigator: contribución por entidad y combinación; similitud semántica término↔palabra; ML geo con tendencias del sector; QS diario |
| TrueClicks | Estructura, ajustes, rechazos, URLs, n-gramas, QS, productos | **Auction Insights vía Sheets**, objetivos desde Sheets/Excel, Custom Attributes | Prioridad del control según métrica de la cuenta; días que lleva fallando; impacto en la puntuación |

**Nadie integra de serie:** CRM con calidad del lead (venta cerrada, lead basura), llamadas reales (duración, si se contestó),
Search Console (consultas orgánicas de la misma palabra), Business Profile (llamadas y rutas), velocidad/Core Web Vitals o
cambios recientes en la landing, ni datos del negocio (horario de atención, capacidad, temporada).

---

## 7. Lo que les falta (huecos), con foco en agencias de lead gen local en España

1. **Calidad del lead.** Todas optimizan a «conversiones» de Google Ads. Un formulario de spam cuenta igual que una venta.
   Optmyzr permite meter datos de CRM a mano vía Google Sheets; ninguna se conecta a un CRM (GoHighLevel) por API para cruzar
   «palabra clave → lead → cita → venta». Para lead gen local es la diferencia entre optimizar bien y optimizar al revés.
2. **Diagnóstico narrado de verdad.** Opteo y Adalysis avisan «0 conversiones en 4 días» o «−15 % de conversiones», y Adalysis/
   Optmyzr tienen árbol de causas, pero el usuario tiene que abrirlo e interpretarlo. Nadie entrega «Campaña Fontanería Madrid:
   0 leads en 3 días (lo normal: 2/día). Causa probable: cuota perdida por ranking del 18 % → 41 % desde el martes; en subastas
   aparece un competidor nuevo con 35 % de cuota; tu CPC máximo no cambió. Opciones: …».
3. **Web y landing del propio cliente.** Adalysis detecta URLs rotas y landings con 0 conversiones; Optmyzr tiene un analizador
   de encaje. Nadie cruza **cambios recientes en la web, caídas de velocidad, formulario roto o página caída** con la caída de
   conversión. Nosotros ya tenemos rastreador, registro de cambios, PageSpeed/CrUX y vigilancia de caídas.
4. **Negocio local:** solo Opteo tiene «nombre de ubicación como negativa»; nadie mira **radio vs zona real de servicio de la
   ficha del cliente**, horario de apertura vs programación de anuncios (llamadas fuera de horario), ni la ficha de Google
   Business Profile (reseñas, llamadas). Las extensiones de ubicación y llamada se auditan solo como «¿existe?».
5. **Idioma y mercado español.** Todas son en inglés (Sidekick admite español en el chat). Negativas «de sector» y n-gramas
   en inglés; nada sobre términos típicos españoles de baja intención («gratis», «curso», «trabajo de», «oposiciones», «segunda
   mano», «wallapop», «milanuncios»…), ni festivos/puentes regionales en la detección de anomalías.
6. **Retraso de conversión.** Opteo dice expresamente que no lo ajusta. Para leads offline (llamada → cita días después) las
   alertas de «0 conversiones» y las pausas dan falsos positivos.
7. **Subastas.** La API no las da; solo TrueClicks las importa (vía Sheets). Casi nadie usa «quién entró en la subasta» como causa.
8. **Smart Bidding y AI Max.** Muchas mejoras (pujas por palabra, dispositivo) sirven para pujas manuales. Con tCPA/Maximizar
   conversiones lo que importa es: objetivo correcto, volumen de conversión, señal de conversión limpia, periodo de aprendizaje,
   términos de AI Max/PMax. Adalysis y Optmyzr empiezan a cubrirlo (pantalla de términos AI Max, alertas de AI Max sin exclusiones).
9. **Cuentas pequeñas.** Umbrales tipo «150 clics sin conversión» o «≥10 conversiones por dispositivo» casi nunca se cumplen en
   cuentas locales de 500-2.000 €/mes; Opteo resuelve parte con la ventana adaptativa. Falta estadística bayesiana / agrupación
   entre cuentas parecidas (mismo sector) para decidir con pocos datos.
10. **Memoria del porqué.** Ninguna guarda «por qué hicimos este cambio y qué pasó después» como base de conocimiento por cliente
    (Adalysis tiene notas sueltas; Opteo, changelog de ajustes).
11. **Reseñas:** no se pudieron leer directamente (bloqueo 403); las críticas listadas son conocimiento previo.

---

## 8. Tabla comparativa de capacidades

Leyenda: ✔ = sí, documentado · ~ = parcial / limitado · ✘ = no · ? = no verificado

| Capacidad | Opteo | Adalysis | Optmyzr | TrueClicks | Adzooma | WordStream/LocaliQ | Karooya | Shape (NinjaCat) |
|---|---|---|---|---|---|---|---|---|
| Vista multi-cuenta / MCC | ✔ | ✔ (pantalla inicial) | ✔ (portafolios) | ✔ | ✔ | ? | ~ | ✔ |
| Auditoría con controles predefinidos | ~ (Issues + mejoras) | ✔ 100+ diarias | ✔ ~80 widgets | ✔ 100+ | ✔ | ~ (Grader) | ✘ | ✘ |
| Umbrales publicados y editables | ✘ (solo agresividad) | ✔ | ✔ (reglas) | ~ | ~ | ✘ | ✘ | ? |
| Recomendaciones de un clic | ✔ (64 tipos) | ✔ | ✔ | ✔ | ✔ | ~ | ~ | ✘ |
| Impacto estimado / priorización | ✔ (€/año) | ✔ (orden por impacto, nov 26) | ~ | ✔ (impacto en puntuación) | ~ | ✘ | ✘ | ✘ |
| Ventana de datos adaptativa | ✔ | ✘ | ~ (rangos a medida) | ✘ | ✘ | ✘ | ✘ | ✘ |
| Motor de reglas propio | ✘ | ~ (alertas + autorresolver) | ✔ (Rule Engine) | ~ (auto-apply) | ~ | ✘ | ✘ | ~ |
| Datos externos (CRM, hojas) | ~ (Agent: archivos) | ~ (GA4) | ✔ (Sheets) | ✔ (Sheets, atributos) | ✘ | ✘ | Amazon | ? |
| GA4 | ~ (Agent) | ✔ | ✔ | ✘? | ✔ (seguimiento) | ? | ✘ | ? |
| Anomalías con línea base propia | ✔ (aprende variabilidad) | ~ (monitores %) | ✔ (Anomaly) | ~ (monitores fijos) | ~ | ✘ | ✘ | ~ |
| Alerta «0 conversiones» con supresión inteligente | ✔ (4 días) | ✔ (monitor) | ✔ | ~ | ✔ | ✘ | ✘ | ✘ |
| Análisis de causa raíz | ~ (campañas responsables; Agent) | ✔ (Analyzer 3 etapas + IA) | ✔ (Investigator) | ✘ | ✘ | ✘ | ✘ | ✘ |
| Historial de cambios junto a la causa | ✘ | ✔ | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ |
| Cuota de impresiones (perdida presup./ranking) | ~ | ✔ (budget boost) | ✔ | ✔ (monitor) | ? | ? | ✘ | ✘ |
| Subastas (Auction Insights) | ✘ | ✘ | ~ (competidores) | ✔ (vía Sheets) | ✘ | ✘ | ✘ | ✘ |
| Nivel de calidad histórico ponderado | ✘ | ✔ | ✔ | ~ (Insight) | ✘ | ✘ | ✘ | ✘ |
| Términos → positivas/negativas | ✔ | ✔ (umbrales) | ✔ (+ similitud IA) | ~ | ✔ | ~ | ✔ | ✘ |
| N-gramas | ✔ | ✔ | ✔ | ✔ (Insight) | ? | ✘ | ✔ | ✘ |
| Términos PMax / AI Max | ? | ✔ | ✔ (auditoría) | ? | ~ | ✘ | ✘ | ✘ |
| Negativas por nombre de ubicación | ✔ | ✘ | ~ (Find Expensive Cities) | ✘ | ✘ | ✘ | ✘ | ✘ |
| Test de anuncios con significancia | ~ | ✔ (80-99 %) | ✔ | ✘ | ~ | ✘ | ✘ | ✘ |
| Landing: rotas / malas conversiones | ✔ (rotas) | ✔ (ambas) | ✔ (análisis) | ✔ (rotas) | ✘ | ✘ | ✘ | ✘ |
| Pacing de presupuesto | ✔ | ✔ | ✔ | ✔ | ✔ | ? | ✘ | ✔ |
| Pausa / ajuste automático por presupuesto | ✔ | ✔ | ✔ | ? | ✘ | ✘ | ✘ | ✔ |
| Higiene automática (socios, Display, presencia) | ✔ (mejoras) | ✔ (autorresolver) | ✔ (reglas) | ✔ (auto-apply) | ~ | ✘ | ✘ | ✘ |
| Asistente IA que lee datos | ✔ Agent | ✔ Explain with AI + MCP | ✔ Sidekick + MCP | ✔ (beta, Claude/Gemini) | ? | ~ | ✘ | ? |
| IA que propone cambios con aprobación | ✔ | ✔ (MCP) | ✔ (Change Requests) | ? | ✘ | ✘ | ✘ | ✘ |
| Asignar tareas al equipo | ✔ (Issues) | ~ (checklist/notas) | ✔ (Blueprints, Trello) | ✔ (task management) | ✘ | ✘ | ✘ | ✘ |
| Notificaciones Slack/Teams/email | ✔ | ✔ (+Chat, webhook) | ✔ | ✔ | ✔ | ? | ✘ | ✔ |
| Informes al cliente marca blanca | ~ | ✔ (Looker) | ✔ | ~ (Looker) | ✔ | ✔ | ✘ | ✔ |
| Calidad real del lead (CRM) | ✘ | ✘ | ~ (manual) | ✘ | ✘ | ✘ | ✘ | ✘ |
| Cruce con web/SEO/GBP del cliente | ✘ | ✘ | ✘ | ✘ | ~ (SEO aparte) | ✘ | ✘ | ✘ |
| Precio aprox. para 25 cuentas, < 50K $/mes | ~499 $ | ~149+ $? | ~208+ $? | **0 $** | 0-179 $ | servicio | — | ? |

---

## 9. Ideas para nuestro módulo

1. **Catálogo de detectores con umbrales explícitos y editables por cuenta** (copiando la transparencia de Adalysis), con valores
   por defecto de partida: palabra/término sin conversión tras **150 clics (30 d palabra / 90 d término)** → pero **escalado al
   CPA objetivo del cliente** (p. ej. «gasto ≥ 2-3× CPA objetivo sin conversión»), porque en cuentas locales 150 clics es mucho;
   término a positiva con **≥2 conversiones en 90 d y CPA ≤ objetivo**; CPC/CPA/CTR que cambian **>30 % 7 d vs 30 d** con mínimo
   de clics; socios **>25 %** peor CPA; móvil vs ordenador **>30 %** con mínimo de conversiones; cuota perdida por presupuesto
   **>10 % 3 días seguidos** con estimación de ganancia; palabras con CPA ≤ ½ de la media y cuota < 70 % → subir.
2. **Ventana de datos adaptativa** (idea de Opteo): no juzgar una entidad hasta que sus clics superen lo necesario según la tasa de
   conversión de su grupo (p. ej. clics ≥ k / tasa de conversión del grupo); para cuentas pequeñas, usar **datos agregados de
   cuentas del mismo sector** de nuestra cartera como «prior» (enfoque bayesiano). Nadie lo hace.
3. **Línea base por cuenta para anomalías** (como Opteo): aprender la variabilidad normal por día de la semana; incluir
   **festivos y puentes españoles por comunidad**; supresiones inteligentes (Opteo: 4 días sin conversiones con impresiones todos
   los días; no avisar si la acción suele tener pocas; no repetir en 4 días).
4. **Diagnóstico «con el porqué» automático**, no bajo demanda: cuando salta una alerta, el agente recorre el árbol de Adalysis/
   Optmyzr (volumen elegible → impresiones → cuota y su pérdida por presupuesto/ranking → posición → CTR → CPC → tasa de conversión)
   + **historial de cambios** (guardar el nuestro desde el día 1, la API solo da 30 días) + **subastas** (informe programado a
   Google Sheets como TrueClicks) + **cambios en la web y velocidad** (SEO) + **leads del CRM**, y escribe el mensaje para Telegram.
5. **Calidad del lead desde GoHighLevel**: conversión «de verdad» por campaña/palabra (lead válido, cita, venta) y alerta
   «la campaña convierte barato pero sus leads no cierran». Hueco total del mercado.
6. **Cola de propuestas con impacto en euros/año** (Opteo) + **estado y días abierta** (TrueClicks) + **asignación a una persona**
   (Opteo Issues) + **aprobar / descartar / restaurar**; cada propuesta enlaza a los datos y al rango usado. Los cambios del agente
   vía bandeja con **vista previa y aprobación** (Sidekick Change Requests, Adalysis MCP), y registro del motivo + resultado a
   las 2-4 semanas (memoria por cliente).
7. **Detectores de negocio local:** términos con **nombres de lugares fuera de la zona de servicio** de la ficha del cliente (Opteo);
   presencia vs interés; radio vs zona real; programación vs horario de apertura (de la ficha / GBP); llamadas perdidas; extensiones
   de ubicación y llamada; **negativas de baja intención en español** y por sector.
8. **Higiene automática configurable** (TrueClicks auto-apply / Adalysis autorresolver): descartar recomendaciones autoaplicadas
   de Google, Display en Search, socios, presencia, listas de negativas por patrón de nombre de campaña, exclusión de apps/canales
   infantiles; primero en «vista previa», luego automático.
9. **Similitud semántica término↔palabra clave↔servicios del cliente** con los **embeddings que ya tenemos** (mapa de palabras
   del módulo SEO): es exactamente la regla de Optmyzr (≥85 añadir, ≤20 negativa) pero además contra la ficha de servicios.
   Barato (sin completado).
10. **Smart Bidding / AI Max / PMax:** detectores de pocas conversiones para la estrategia, objetivo mal puesto, periodo de
    aprendizaje, términos de AI Max/PMax ya existentes como palabra en Search, sin exclusiones de marca, expansión de URL sin
    reglas, señales de audiencia genéricas.
11. **Retraso de conversión** por acción (medido con nuestro histórico) para no dar falsos «0 conversiones».
12. **Vista multi-cuenta para Eury** como pantalla inicial (Adalysis «Audit & budget»): una fila por cliente con críticos, pacing,
    CPL vs objetivo, días sin lead, última revisión humana. Sustituye la ronda L-X-V.

## 10. Lo que nadie hace bien

- Cruzar **Ads × CRM × web × SEO × GBP** del mismo cliente (todas ven solo la plataforma de anuncios y, como mucho, GA4).
- Explicar **automáticamente** y en lenguaje llano la causa de una caída, con evidencia, sin que el usuario abra un árbol.
- Juzgar con **pocos datos** (cuentas locales pequeñas) de forma estadísticamente sensata.
- **Calidad del lead** como métrica de optimización.
- **Español y mercado local español** (festivos, términos, zonas).
- **Memoria de decisiones**: por qué se hizo cada cambio y si funcionó.
- **Subastas** como causa (la API no las da; casi nadie monta el informe programado).

## 11. Lo no verificado

- Precios exactos de Adalysis y Optmyzr (las páginas no mostraron las cifras; se usan cifras de terceros).
- Año de fundación de Opteo (SourceForge dice 2013) y cofundación de Adalysis por Brad Geddes (conocimiento previo).
- Adquisición de Shape.io por NinjaCat (deducida de la redirección; fecha desconocida).
- Estado de WordStream Advisor (posible cierre a nuevos clientes).
- Todas las críticas y elogios de usuarios (G2, Capterra, TrustRadius, Reddit bloqueados; búsquedas agotadas).
- Fórmulas internas: contribución en PPC Investigator, prioridad en Adalysis QS, umbrales de Opteo, test estadístico de Adalysis.
- Existencia de «PPC Signal / Signal by Optmyzr» (no encontrado).

## 12. Fuentes

**Opteo:** https://opteo.com/ · https://opteo.com/pricing · https://opteo.com/docs · https://opteo.com/docs/en/collections/110203-improvements ·
https://opteo.com/docs/en/collections/15249723-adjustments · https://opteo.com/docs/en/collections/18589024-exclusions ·
https://opteo.com/docs/en/collections/10796030-keywords · https://opteo.com/docs/en/collections/18589262-negatives ·
https://opteo.com/docs/en/collections/110265-hygiene · https://opteo.com/docs/en/collections/10796074-how-to-use-improvements ·
https://opteo.com/docs/en/articles/12301289-how-opteo-chooses-the-date-range-for-an-improvement ·
https://opteo.com/docs/en/articles/15922578-algorithm-settings-overview ·
https://opteo.com/docs/en/articles/18347721-checks-completed-and-impact-tags-explained ·
https://opteo.com/docs/en/articles/11768255-classify-search-term · https://opteo.com/docs/en/articles/11758623-replace-broad-keyword ·
https://opteo.com/docs/en/articles/11769301-pause-keyword · https://opteo.com/docs/en/articles/11769371-add-location-name-as-negative ·
https://opteo.com/docs/en/collections/18818692-issues · https://opteo.com/docs/en/collections/19807878-alerts ·
https://opteo.com/docs/en/articles/11431557-unexpected-changes-alerts · https://opteo.com/docs/en/articles/18339463-zero-conversions-alerts ·
https://opteo.com/docs/en/articles/18339464-budget-alerts · https://opteo.com/docs/en/collections/18819036-agent ·
https://opteo.com/docs/en/articles/12968321-agent-overview · https://changelog.opteo.com/ ·
https://www.searchenginejournal.com/how-opteo-helps-automate-routine-adwords-tasks/232585/ · https://sourceforge.net/software/product/Opteo/

**Adalysis:** https://docs.adalysis.com/llms.txt · https://adalysis.com/pricing/ · https://docs.adalysis.com/tools/audit/audit-overview.md ·
https://docs.adalysis.com/tools/audit/prebuilt-alert-list/keywords/keywords-with-poor-conversions.md ·
https://docs.adalysis.com/tools/audit/prebuilt-alert-list/keywords/keywords-with-a-rising-cpc.md ·
https://docs.adalysis.com/tools/audit/prebuilt-alert-list/keywords/keywords-with-a-rising-cpa.md ·
https://docs.adalysis.com/tools/audit/prebuilt-alert-list/keywords/keywords-with-potential-for-higher-impression-share.md ·
https://docs.adalysis.com/tools/audit/prebuilt-alert-list/keywords/high-volume-keywords-with-a-quality-score-drop.md ·
https://docs.adalysis.com/tools/audit/prebuilt-alert-list/search-terms/negative-keywords-from-search-terms.md ·
https://docs.adalysis.com/tools/audit/prebuilt-alert-list/search-terms/new-keywords-from-search-terms.md ·
https://docs.adalysis.com/tools/audit/prebuilt-alert-list/campaigns/search-partner-traffic.md ·
https://docs.adalysis.com/tools/audit/prebuilt-alert-list/campaigns/mobile-vs-desktop-cost-conv..md ·
https://docs.adalysis.com/tools/audit/prebuilt-alert-list/ads/ads-with-a-falling-ctr.md ·
https://docs.adalysis.com/tools/audit/prebuilt-alert-list/landing-pages/landing-pages-with-poor-conversions.md ·
https://docs.adalysis.com/tools/audit/prebuilt-alert-list/pmax-campaigns/search-term-alerts.md ·
https://docs.adalysis.com/product/inside-adalysis/better-search-term-alerts-all-signal-no-noise.md ·
https://docs.adalysis.com/tools/performance/how-to-create-performance-monitors.md ·
https://docs.adalysis.com/tools/performance/root-cause-analysis-with-the-performance-analyzer.md ·
https://docs.adalysis.com/tools/performance/explain-with-ai.md · https://docs.adalysis.com/tools/performance/impression-share-analysis.md ·
https://docs.adalysis.com/tools/budget/pacing.md · https://docs.adalysis.com/tools/ad-testing/faqs/ad-testing-thresholds.md ·
https://docs.adalysis.com/tools/ad-testing/faqs/ad-testing-confidence.md ·
https://docs.adalysis.com/tools/quality-score/tutorial-review-and-improve-your-quality-scores.md ·
https://docs.adalysis.com/product/product-updates/q3-4-2026.md

**Optmyzr:** https://www.optmyzr.com/pricing/ · https://www.optmyzr.com/llms.txt · https://www.optmyzr.com/company/ · https://help.optmyzr.com/ ·
https://help.optmyzr.com/en/articles/3075363-ppc-investigator-about-user-guide ·
https://help.optmyzr.com/en/articles/3075410-list-of-available-widgets-for-google-ads ·
https://help.optmyzr.com/en/articles/3076050-pre-built-strategies · https://help.optmyzr.com/en/articles/3305117-how-to-exclude-recent-changes-in-rule-engine ·
https://help.optmyzr.com/en/articles/13428310-search-term-and-keyword-intent-similarity-using-ai ·
https://help.optmyzr.com/en/articles/3076073-connecting-external-data-in-rule-engine ·
https://help.optmyzr.com/en/articles/8503739-optmyzr-budget-tools-when-to-use-them ·
https://help.optmyzr.com/en/articles/14608243-budget-control-center-user-guide ·
https://help.optmyzr.com/en/articles/12505157-optmyzr-sidekick-about-user-guide ·
https://help.optmyzr.com/en/articles/8418939-machine-learning-artificial-intelligence-in-optmyzr-s-tools ·
https://help.optmyzr.com/en/articles/3075016-view-your-alerts · https://help.optmyzr.com/en/articles/3075103-quality-score-tracker-user-guide ·
https://www.optmyzr.com/blog/best-google-ads-tools/

**TrueClicks:** https://www.trueclicks.com/ · https://www.trueclicks.com/pricing · https://www.trueclicks.com/about · https://help.trueclicks.com/en/ ·
https://help.trueclicks.com/en/articles/18457595-about-the-check-library · https://help.trueclicks.com/en/articles/7269040-performance-alerts-explained ·
https://help.trueclicks.com/en/articles/5323994-trueclicks-auto-apply-changes ·
https://help.trueclicks.com/en/articles/12952466-trueclicks-ai-assistant-specifications ·
https://help.trueclicks.com/en/articles/17673896-how-to-set-up-auction-insights-for-ai ·
https://help.trueclicks.com/en/articles/8966104-target-monitoring-introduction

**Otras:** https://www.adzooma.com/ · https://www.adzooma.com/pricing · https://www.karooya.com/ ·
https://www.ninjacat.io/marketing-performance-management-platform/ppc-budget-management · https://www.localiq.com/

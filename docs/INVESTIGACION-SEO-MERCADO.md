# Investigación de mercado SEO y replanteo del plan

**Fecha:** 2026-11-26 · **Estado:** propuesta para Enric (cambia el orden de la lista cerrada, así que necesita su OK) · **Fuentes:** tres investigaciones en paralelo del 26 nov:
- repositorios abiertos de auditoría técnica;
- repositorios de SEO con IA;
- herramientas comerciales y agencias.

Las URLs están al final. **[NV]** = sin verificar.

## 1. Conclusión en cinco frases
1. **Ningún repositorio ni herramienta hace lo que queremos de punta a punta.** El mercado está repartido:
   - técnico: Screaming Frog, Sitebulb, SEOnaut;
   - contenido: Surfer, Clearscope;
   - local: Local Falcon, BrightLocal;
   - IA: Peec, Profound, Elmo;
   - informes: AgencyAnalytics;
   - «autopilot»: OTTO.

   Lo que vale la pena copiar son **técnicas sueltas**, no un producto.
2. **En técnico vamos bien encaminados.** Nos faltan unas 15 comprobaciones baratas, sobre todo típicas de WordPress (sección 3). Ninguna necesita IA.
3. **Lo que más pesa para una pyme local es lo que aún no tenemos:**
   - geo-grid del mapa;
   - reseñas;
   - posiciones con paquete local y AI Overviews;
   - un informe que el cliente entienda.

   Y **los datos cuestan muy poco**: con DataForSEO todo el paquete de serie sale por unos 1,5-2 $ por proyecto y mes, dentro del tope de 5 $. **Desde el 1 jul 2026 los enlaces (Backlinks) ya no exigen suscripción mínima**, lo que desbloquea la parte 6.
4. **Donde podemos ser mucho mejores que todos** es en lo que solo tiene una agencia con datos propios:
   - priorizar por rentabilidad (clics en juego × valor del servicio / horas reales del equipo);
   - medir si lo que hicimos funcionó, con honestidad («no concluyente» si no hay tráfico);
   - aprender de cientos de intervenciones entre clientes;
   - diagnosticar caídas sabiendo qué tocó el equipo esa semana.

   SearchPilot necesita webs enormes; Semrush, Ahrefs y OTTO no saben qué hizo la agencia.
5. **Hay cosas que conviene NO hacer**, aunque estén de moda:
   - llms.txt (el 97 % nunca se leen, según Ahrefs);
   - reescribir «para GEO» (en C-SEO Bench, NeurIPS 2025, pesa más el SEO clásico);
   - enjambres de 20 agentes;
   - redes neuronales de grafos (GNN) para el enlazado;
   - tests A/B de SEO en pymes (no hay tráfico);
   - notas GEO de 0 a 100;
   - analizar registros del servidor.

## 2. Principios que adoptamos (se aplican a todas las partes)
| Principio | De dónde sale | Qué cambia en nuestro código |
|---|---|---|
| **Prioridad = clics en juego × valor de negocio × certeza / horas reales** | houtini-ai/seo-audit; nuestras horas reales por tipo | El plan de mejora deja de ordenar por gravedad y peso, y ordena por rentabilidad |
| **Cada recomendación lleva: por qué, de qué depende y cómo comprobaremos que funcionó** | claude-seo | La «hipótesis» de cada encargo gana «cómo verificaremos» y una fecha de medición |
| **Medición honesta**: antes y después frente a páginas de control sin tocar, con banda de incertidumbre y «no concluyente» si no hay datos | CausalImpact y SearchPilot, adaptados a pymes | Parte 7 |
| **Determinista por defecto; la IA solo para juicio y síntesis, marcada «para verificar»** | houtini, SiteOne, OpenCMO | Ya es nuestra directiva; se escribe como regla |
| **Instantáneas comparables y datos en bruto guardados** (rastreos, respuestas de la IA, mediciones) | Elmo, advertools, Lighthouse CI | Ya lo hacemos con los rastreos y la velocidad; se extiende a las posiciones y la IA |
| **El tope se comprueba antes de gastar** y los campos de DataForSEO se recortan | Limelit, MCP oficial de DataForSEO | `canSpend` ya existe; se usa en toda llamada de pago |
| **Un pipeline fijo con un orquestador**, no un enjambre | OpenCMO | Parte 8 |

## 3. Lo que nos faltaba y no estaba en la lista
**Técnico, sin IA** (de SEOnaut, SiteOne, advertools y Unlighthouse). Se añade a la parte 1, tanda 2:
- `<title>`, meta description o canonical **duplicados en la misma página** y metas dentro del `<body>`. Es típico del choque entre Yoast o Rank Math y el tema. Canonical relativo o distinto entre el HTML y la cabecera.
- **Sitemap con URLs canonicalizadas a otra o bloqueadas por robots.**
- **Datos que no coinciden entre páginas:** teléfonos `tel:`, códigos postales y emails. Amplía nuestro NAP.
- **Enlaces a dominios de pruebas o a localhost** que quedan tras una migración.
- **Soft 404:** páginas que responden 200 pero están vacías (archivos o búsquedas de WordPress).
- **Nofollow interno hacia páginas indexables**, páginas sin enlaces de salida y páginas con demasiados enlaces.
- **robots.txt frente a los rastreadores de IA** (GPTBot, Google-Extended, PerplexityBot…) y `nosnippet`/`max-snippet` restrictivos: afectan a AI Overviews.
- **Detectar la tecnología** (CMS, plugin SEO, plugin de caché), para que las instrucciones de cada encargo sean concretas: «en Rank Math → …».
- **Nota por grupo de Salud con aviso si baja** frente al rastreo anterior (SiteOne).
- **Registro de cambios entre rastreos:** título, canonical, H1, palabras, schema, URLs nuevas y URLs que ya no salen. Va como **registro de cambios** (un evento informativo con fecha), no como hallazgo, y es la base del asistente de migraciones.
- **Vigilancia de las páginas de dinero** (la portada y las 5 con más clics) cada pocas horas: título, noindex, canonical y la huella del contenido. Es como Conductor Monitoring y es barato.

**Demanda (parte 2):**
- Grupos de palabras por embeddings, **validando con la SERP los que importan** (3 o más URLs compartidas en el top 10).
- Intención según la SERP real.

**Contenido (parte 3):**
- **Brief guiado por perspectivas** a partir de la SERP real (idea de STORM, sin redacción automática).
- **Enlazado interno por coseno de embeddings y PageRank** sobre `crawl_links`.
- Mapa de redirecciones por embeddings (Screaming Frog), para migraciones.

**Visibilidad en IA (parte 5)**, con el método de Elmo y Limelit:
- preguntas fijas repetidas;
- respuestas guardadas en bruto;
- preguntas de marca excluidas del dato principal;
- `n` visible y muestras pequeñas marcadas;
- detección por texto y modelo juez solo si hay ambigüedad;
- dominios citados clasificados.

**Local (parte 4):**
- **Reseñas del cliente y de la competencia con DataForSEO** (todas, no solo 5 como Places), con borrador de respuesta para aprobar cuando Business Profile lo permita.
- Geo-grid con la SERP de Maps (unos 0,15 $ por 7×7 y 5 palabras, frente a unos 12 $ en Local Falcon).

**Medir (parte 7):**
- Diagnóstico de caídas en capas: anomalía de datos de Google → core update → cambios entre rastreos y lo que hizo el equipo → competencia.
- **Aprendizaje entre clientes:** resultado medio por técnica, con controles.

## 4. Cinco perspectivas sobre el orden
1. **SEO local senior.** A una pyme le importa salir en el mapa de su zona y sus reseñas. Hoy eso es lo que menos tenemos, así que la parte local debería subir.
2. **Dueño de la agencia (Enric, negocio).** Lo que retiene al cliente es un informe mensual que explique el trabajo y el resultado. Lo que ahorra horas es priorizar bien y no repetir trabajo. Por tanto, informe y prioridad por rentabilidad, pronto.
3. **Ingeniero de datos y costes.** Las posiciones (con paquete local y AI Overview) son la serie temporal que alimenta el informe, el diagnóstico y el «¿funcionó?». Cuanto antes empiecen a guardarse, antes habrá historia (no se puede recuperar el pasado).
4. **Cliente final.** Entiende «sales 3.º en el mapa en Sabadell y 9.º en Terrassa», «tienes 4,6 estrellas y tu competidor 4,8» y «este mes hicimos X y te trajo Y». No entiende «hreflang sin vuelta».
5. **Junior del equipo que ejecuta.** Necesita instrucciones concretas para la herramienta que usa el cliente (plugin, tema) y saber qué hacer primero. Detectar la tecnología y ordenar por rentabilidad le ayudan más que 20 reglas nuevas.

**Coinciden en:**
- (a) empezar a **guardar posiciones** cuanto antes;
- (b) subir **local** y el **informe**;
- (c) meter ya la **prioridad por rentabilidad** y el «**cómo verificaremos**»;
- (d) cerrar el técnico con lo barato y concreto de WordPress, sin alargarlo.

## 5. Plan replanteado (propuesta)
| # | Parte | Qué incluye | Motivo del orden |
|---|---|---|---|
| ✅ | 0 y 1 (tanda 1) | Hecho | — |
| **1** | **Técnico, tanda 2 (ampliada)** | `fetchPublic` blindado, enlaces externos rotos, robots (recursos, sitemap, rastreadores de IA), etiquetas duplicadas, soft 404, nofollow interno, staging y localhost, datos incoherentes entre páginas, detección de CMS y plugins, nota por grupo, registro de cambios entre rastreos y vigilancia de las páginas de dinero | Cierra el técnico «al nivel de Screaming Frog o SEOnaut para WordPress» |
| **2** | **Prioridad por rentabilidad + «cómo verificaremos»** (nueva, pequeña) | El plan ordena por clics en juego × valor × certeza / horas reales; cada encargo lleva cómo y cuándo se medirá | Cambia la calidad de todo lo que viene después; casi sin coste |
| **3** | **Posiciones y visibilidad** (antes la 5) | Seguimiento semanal de las palabras del plan con paquete local, AI Overview y AI Mode; cuota de visibilidad; panel de preguntas a la IA (método Elmo/Limelit); Bing cuando haya clave | La historia no se puede recuperar: hay que empezar a guardarla ya |
| **4** | **Local completo** (antes la 4, sube) | Geo-grid, reseñas propias y de la competencia (DataForSEO), categorías, citas, páginas de zona | Lo que más valora una pyme local |
| **5** | **Demanda y palabras** (antes la 2) | Volumen y estacionalidad, palabras nuevas, intención y grupos validados con la SERP, dificultad y valor por tema | Base del contenido |
| **6** | **Medir y explicar** (antes la 7, sube) | «¿Funcionó?» honesto, diagnóstico de caídas en capas, informe mensual al cliente (trabajo + resultado, con aprobación), aprendizaje entre clientes | Para entonces ya habrá posiciones y mediciones guardadas |
| **7** | **Contenido** (antes la 3) | Inventario, contenido que pierde tráfico, brief por perspectivas, nota frente a los que ganan, enlazado interno por embeddings + PageRank, comprobación tras publicar | — |
| **7b** | **WordPress** (antes la 3b) | Publicar con aprobación: títulos, schema, enlaces y redirecciones a un clic (OTTO, pero aprobado) | Necesita el contenido |
| **8** | **Autoridad** (antes la 6) | Perfil de enlaces, huecos frente a la competencia, enlaces rotos hacia el cliente, con DataForSEO Backlinks sin suscripción | Desbloqueada |
| **9** | **Orquestar y aprender** (antes la 8) | Jefe de SEO con un pipeline fijo, cadencias y cerebro de I+D | — |
| — | **Migraciones de web** | Usa el registro de cambios, los embeddings para el mapa de redirecciones y una copia del HTML de las páginas clave | Puede adelantarse cuando haga falta |

**Lo que no se hace:**
- llms.txt;
- reescritura GEO;
- enjambres de agentes;
- GNN;
- tests A/B en pymes;
- registros del servidor;
- notas GEO de 0 a 100;
- copia completa de la web;
- dependencias nuevas (extruct, validadores, Chromium) sin preguntar.

## 6. Sin verificar
- Los resultados que prometen las herramientas comerciales (OTTO, Falcon AI…).
- Los precios de Peec, Profound, BrightLocal y Whitespark.
- El precio de LLM Mentions de DataForSEO.
- La cobertura de las reseñas de DataForSEO en España.
- La cobertura de directorios españoles para las citas.
- Las estrellas de algunos repositorios: unas salen de la página de temas de GitHub y otras de la API.

## 7. Supervisión independiente
La hizo un subagente Opus 5.5 con esfuerzo alto el 26 nov. Buscó fallos en las secciones 1 a 5. Los aceptamos todos.

**Graves:**
- **G1. «Prioridad por rentabilidad» ya está hecha en un 80 %.** El plan ya multiplica por el valor del tema, los clics posibles y el esfuerzo. Lo que falta no se puede calcular todavía:
  - las horas reales: ClickUp solo mide el tiempo laboral entre «Empezar» y «Hecho»;
  - la certeza: dependería del aprendizaje, así que la dependencia es circular;
  - el valor del tema: **50 de 52 fichas no tienen servicios**.

  → Queda en «cómo y cuándo se verifica» dentro de la hipótesis del encargo. La certeza, provisional por técnica.
- **G2. Falta dar de alta la cartera.** Solo CM Ibérica está completa. El informe, la medición, el aprendizaje y el coste real dependen de tener 15-30 proyectos con GSC, ficha completa y competencia confirmada. → Nueva parte, antes de las posiciones.
- **G3. Las SERP en bruto ocupan 15-40 GB al año** y el `pg_dump` previo a cada despliegue lo arrastra. → Se guardan filas compactas. El bruto, comprimido, en una tabla aparte con retención corta y fuera del dump del despliegue.
- **G4. Seguir posiciones antes de la parte de demanda necesita una semilla explícita:** temas de GSC + servicio × zona de la ficha + marca, 50 como máximo, editable. Matiz: GSC ya guarda 16-24 meses de posición media. Lo que sí se pierde si no lo guardamos es el paquete local, AI Overview, la competencia y el geo-grid.

**Medios:**
- **M1.** El coste es una fórmula, no 1,5-2 $. Lo multiplican el dispositivo, el idioma (ca/es) y las poblaciones; el AI Overview y AI Mode se cobran aparte. El panel de IA semanal no cabe en el tope: va mensual y bajo demanda. Hay que usar la cola asíncrona de DataForSEO, porque la de directo cuesta unas 3 veces más.
- **M2.** «Backlinks sin suscripción» se marca **[NV]**: sale de una sola página. Activarlo es línea roja 2, y hay que validar su cobertura en 3 webs pequeñas españolas.
- **M3.** La medición y el aprendizaje estaban sobrevendidos:
  - páginas de 5-50 clics al mes: se miden impresiones y posición, agrupando por proyecto;
  - hacen falta unas 50 intervenciones por técnica para detectar un efecto del 20 %, es decir, 6-12 meses;
  - hay que corregir la regresión a la media y el contagio a las páginas de control;
  - la fecha real de la intervención sale del registro de cambios, no de «hecho» en ClickUp;
  - vuelve la comprobación tras el encargo;
  - se dirá «tendencia» y no «aprendizaje».
- **M4.** Se habían caído la **atribución a contactos** (eventos clave de GA4) y la **previsión**. Vuelven.
- **M5.** Lo que exigiría un SEO local senior:
  - vigilar los cambios en la ficha de Google (nombre, categoría, horario, «cerrado», ediciones sugeridas);
  - detectar spam de la competencia en Maps;
  - **conseguir** reseñas (enlace o QR y ritmo frente a la competencia), no solo leerlas;
  - **detectar un WordPress hackeado** (búsquedas japonesas o de farmacia en GSC, URLs basura en el sitemap);
  - seguimiento por coordenadas y por idioma;
  - regla contra las **páginas puerta** en las páginas de zona.
- **M6.** La vigilancia de las páginas de dinero compara campos estructurados (título, noindex, canonical, H1 y texto principal normalizado), no la huella del HTML.
- **M7.** El registro de cambios necesita su propia tabla y su propio protocolo de decisión.

**Menores:**
- Posible sobreingeniería: brief tipo STORM, PageRank, nota por grupo, AI Mode semanal. Se deciden en su parte.
- La lista crece en unas 20 piezas: Enric aprueba las piezas, no solo el orden.
- **La tanda 2 se parte en 2a, 2b y 2c.**

## 8. Plan final propuesto (tras la supervisión)
| # | Parte | Qué incluye |
|---|---|---|
| 1 | **Técnico 2a + verificación** | `fetchPublic` blindado, columna `facts`, robots contra Googlebot (recursos, sitemap, rastreadores de IA), enlaces externos rotos; cada encargo lleva «cómo y cuándo se verifica» |
| 2 | **Alta de la cartera** | Lista de comprobación del proyecto (GSC, web, ficha con servicios, zona y coordenadas, competencia), semáforo «proyecto incompleto» y ayuda para completarlo. Es **trabajo de Enric y del equipo** con poco código: 15-30 proyectos |
| 3 | **Informe mensual v1** | GSC, GA4 (con contactos) y trabajo hecho en el mes, en borrador; se envía solo con aprobación. Se enriquece después |
| 4 | **Posiciones (semilla mínima)** | Orgánico, paquete local y AI Overview por coordenadas e idioma; filas compactas; cola asíncrona; volumen solo de las palabras que se siguen |
| 5 | **Local** | Geo-grid mensual, reseñas propias y de la competencia, vigilancia de la ficha, spam en Maps, conseguir reseñas, citas, páginas de zona con la regla anti-páginas puerta |
| 6 | **Técnico 2b + 2c** | Reglas WordPress (metas duplicadas, soft 404, staging, nofollow, sitemap frente a canonical, datos incoherentes, rastreadores de IA, tecnología, web hackeada) + registro de cambios con su tabla + páginas de dinero |
| 7 | **Demanda** | Amplía la semilla; volumen, intención y grupos validados con la SERP; valor por tema |
| 8 | **Medir y explicar** | «¿Funcionó?» con la comprobación tras el encargo y la fecha real, diagnóstico de caídas en capas, atribución y previsión |
| 9 | **Contenido → WordPress** | Brief, nota, enlazado interno (heurística primero), contenido que pierde tráfico; publicar con aprobación |
| 10 | **Autoridad** | Tras verificar el precio y la cobertura en 3 webs reales y con el OK de Enric |
| 11 | **Orquestar, panel de IA mensual y tendencias entre clientes** | Cuando haya unas 50 intervenciones por técnica |
| — | **Migraciones** | En cualquier momento después de la parte 6 |

## Fuentes principales
- **Auditoría:**
  - github.com/StJudeWasHere/seonaut (`internal/issues/errors/errors.go`)
  - github.com/janreges/siteone-crawler
  - github.com/eliasdabbas/advertools
  - github.com/harlan-zw/unlighthouse
  - github.com/GoogleChrome/lighthouse-ci
  - github.com/lycheeverse/lychee
  - github.com/adobe/structured-data-validator
- **IA:**
  - github.com/houtini-ai/seo-audit
  - github.com/AgriciDaniel/claude-seo
  - github.com/elmohq/elmo
  - github.com/limelit-co/open
  - github.com/study8677/OpenCMO
  - github.com/stanford-oval/storm
  - github.com/martech-engineer/WebKnoGraph
  - arxiv.org/abs/2506.11097 (C-SEO Bench)
  - ahrefs.com/blog/llmstxt-study
- **Mercado:**
  - dataforseo.com/pricing (y su cambio de precios del 1 jul 2026)
  - developers.google.com/maps/billing-and-pricing/pricing
  - searchatlas.com/otto-pixel
  - conductor.com/docs/monitoring
  - screamingfrog.co.uk/seo-spider-23
  - localfalcon.com (precios)
  - brightlocal.com/reputation-manager
  - semrush.com/kb/1493-ai-visibility-toolkit
  - searchpilot.com (cómo analizan)

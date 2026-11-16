# Investigación: cómo lo hacen las agencias, los expertos y el mercado (para Estrategia viva)

**Fecha:** 15 nov 2026. **Pedida por:** Enric, antes de validar `docs/DISENO-ESTRATEGIA-VIVA.md`.
**Método:** tres investigaciones en paralelo con unas 70 fuentes en total:
1. procesos y cadencias de agencias y expertos;
2. mercado de herramientas y agentes IA de SEO;
3. metodología para medir el impacto.

**Límites de la investigación:**
- Las fuentes son sobre todo de EE. UU. y Reino Unido. Hay algunas de Alemania (Sistrix, Peec AI en Berlín), Austria (Otterly), Israel (Similarweb), Francia (Botify) y Singapur (Ahrefs).
- No se encontraron fuentes sólidas de prácticas propias de Países Bajos, nórdicos, Australia, Japón o Corea. No se puede afirmar que allí se trabaje distinto.
- Muchas fuentes son de los propios fabricantes, que venden la cadencia que recomiendan.
- **[NV]** = no verificado en la fuente primaria.

## 1. Conclusión principal

1. **Lo que queremos construir no existe en el mercado.** Ninguna herramienta revisada conecta las recomendaciones con **las tareas reales de la agencia** (ClickUp), **las horas** y **el impacto medido de cada tarea**, ni aprende «qué funciona» con los datos de toda la agencia.
   - Revisadas: Search Atlas OTTO, Alli AI, BrightEdge, seoClarity, Botify, Semrush Copilot, Ahrefs Agent A, Similarweb, Conductor, Sistrix, SE Ranking, Peec, Otterly, Profound, SEOTesting, SearchPilot, AgencyAnalytics y Whatagraph.
   - SEOTesting.com y SearchPilot miden el impacto de cambios, pero solo de los que se anotan a mano y sin relación con el trabajo de la agencia.
   - **Es el diferencial real** y se alimenta de datos que ningún SaaS tiene.
2. **Los detectores de oportunidades son commodity:** Semrush Copilot los trae, y hay tutoriales con Claude y Search Console que los montan en un fin de semana. Se hacen con código barato y la IA solo redacta y prioriza, como ya preveía el diseño.
3. **El diseño v3 tenía cuatro errores de metodología que la investigación corrige:**
   - la trayectoria lineal de los objetivos;
   - el «antes/después» sin grupo de control;
   - avisos sin volumen mínimo ni estacionalidad;
   - no tener en cuenta las actualizaciones de Google ni los resúmenes de IA (AI Overviews).
4. **Faltaba la visibilidad en buscadores con IA** (AI Overviews, AI Mode, ChatGPT, Perplexity). Es lo que más está creciendo en el mercado, y conviene **integrarlo**, no construirlo.
5. **El modelo de «humano que aprueba» es una ventaja, no un límite.** Las herramientas que cambian la web solas mediante un píxel JS (OTTO, Alli AI) reciben críticas por romper webs, por los cambios que desaparecen al cancelar y por el riesgo de *cloaking* (enseñar a Google algo distinto que al usuario). Algunos agentes de BrightEdge actúan sin aprobación y sin forma documentada de deshacer.

## 2. Cadencias: qué recomiendan los expertos

| Proceso | Práctica más repetida | Fuente |
|---|---|---|
| Recoger datos (GSC, GA4, GBP) | Diario, asumiendo 2-3 días de retraso de Search Console | Fivetran, SEJ |
| **Posiciones de palabras clave** | **Semanal por defecto.** Diario solo 2-4 semanas tras publicar o para 3-5 palabras críticas. Incluso los vendedores de seguimiento diario admiten que el semanal da un valor estratégico similar y separa mejor tendencia y ruido | blckalpaca, Ranktracker [vendedor] |
| Salud técnica | Tres capas: **alertas continuas de lo crítico** (noindex, errores 5xx, web caída), **rastreo semanal** y auditoría completa trimestral o tras cada cambio importante | Ahrefs «Always-on audit», AgencyAnalytics |
| **Core Web Vitals** | Google usa **una media de 28 días** (CrUX). Mirarlos a diario no aporta; basta con una revisión semanal o mensual y una prueba tras cada despliegue | developer.chrome.com, Mueller vía SEJ |
| SEO local | Cuadrícula geográfica semanal; diario solo de unas pocas palabras en campaña. Las posiciones locales cambian según la hora del día | Whitespark (Joy Hawkins) |
| Competencia | Alertas de lo crítico; revisión mensual; análisis trimestral | Lilach Bullock, Pedowitz |
| Contenido que pierde tráfico | Revisión **trimestral** comparando con el año anterior | Ahrefs |
| Informes | Panel semanal (equipo), informe mensual (cliente), **revisión trimestral de estrategia (QBR)** y replanteo semestral | Pedowitz, AgencyAnalytics |

**Lo que cuestiona el diseño:**
- **Guardar a diario está bien; decidir a diario, no.** Google pide esperar unas semanas tras un cambio antes de evaluarlo.
- **No hay estándar publicado que adapte la frecuencia de vigilancia al plan del cliente.** Los paquetes se diferencian por horas y entregables. Nuestros «planes de seguimiento» van más allá de lo que se publica. No es un problema, pero las frecuencias iniciales son una propuesta razonada, no un estándar del sector.

## 3. Objetivos y KPIs

- **La trayectoria lineal es la trampa más citada.** El SEO tarda de 3 a 6 meses en notarse y crece a escalones (indexación, actualizaciones de Google). Con una línea recta, casi todos los objetivos saldrían «en riesgo» los primeros meses: falsas alarmas y pérdida de confianza en el sistema.
- **La línea de partida importa.**
  - Kevin Indig: usar el año pasado sin corregir es «crecimiento sobre crecimiento» e infla las previsiones. Propone dar la previsión como un **rango** y revisarla cada trimestre.
  - Google: mirar 16 meses para ver la estacionalidad, y comparar 3 meses con el periodo anterior y con el mismo del año previo.
- **Jerarquía de KPIs** (Aleyda Solis, Joy Hawkins): **negocio** (contactos, conversiones, ingresos) por encima de **clics**, y clics por encima de **posiciones**.
  - Joy Hawkins quitó las posiciones del informe mensual: no son precisas y no cubren todo el trabajo.
  - Google (Mueller, 2026): «impresiones y clics son la medida del éxito»; la posición en Search Console se distorsiona con los AI Overviews.
- **La posición media de Search Console no vale como KPI de impacto.** Cuando una página empieza a salir por consultas nuevas en posiciones bajas, su media *empeora* aunque esté mejorando.

## 4. Medir el impacto de cada tarea

- **El antes/después sin grupo de control demuestra que algo cambió, no qué lo causó** (SearchPilot). La estacionalidad, la demanda, las actualizaciones de Google, la competencia y los anuncios contaminan la comparación.
- **Método de referencia: CausalImpact** (Brodersen et al., Google, 2015). Construye «lo que habría pasado sin el cambio» con series de control. SearchPilot lo usó y luego lo sustituyó por un modelo propio.
- **El volumen manda.** Un test A/B real necesita unas **1.000 visitas orgánicas al día** por sección (SearchPilot). Casi ninguna página suelta de una pyme llega. Consecuencias:
  - el impacto de una tarea aislada suele ser ruido;
  - solo es fiable **agregado por tipo de tarea en toda la agencia**;
  - hay que comparar con **páginas de control** del mismo sitio (diferencia en diferencias).
- **Ventanas:**
  - **Cambios en una página existente** (títulos, enlaces internos): 30/60/90 días es razonable. Mejor en múltiplos de 7 (28/56/84), para neutralizar el día de la semana.
  - **Contenido nuevo y ficha de Google:** hacen falta **90-180 días**. Ahrefs (2025): solo el 1,74 % de las páginas nuevas llega al top 10 en un año.
  - La ventana debe empezar **cuando Google vuelve a rastrear la página** o aparece su primera impresión, no cuando se marca la tarea como hecha.
  - Hay que descartar los últimos 3 días de datos, que aún no son definitivos.
- **Actualizaciones de Google:** hay que anotarlas. El Google Search Status Dashboard publica las fechas; por ejemplo, la core update de noviembre de 2026 empezó el día 10. Si una medición se solapa con una actualización o con otra tarea en la misma página, hay que marcarla como no atribuible por separado.
- **Lenguaje correcto:** «señal compatible con…», no «causó».
- **Aprender entre clientes:** guardar el **tamaño del efecto con su intervalo de confianza y el número de casos**, no medias de porcentajes. Exigir un mínimo de casos antes de usarlo como aprendizaje y dar más peso a los casos limpios: con control y sin actualización de Google por medio.
- **Método de Indig:** un registro de cambios con fecha, **impacto estimado e impacto real**. Distingue las palancas con techo (títulos, enlazado interno, Core Web Vitals) de las que escalan (contenido, enlaces).

## 5. Trampas de los datos de Search Console y de los AI Overviews

- **Consultas anonimizadas:** no salen en las tablas pero sí cuentan en los totales. En el ejemplo de Google, 450 clics por consulta frente a 550 de total. Ahrefs estima que se oculta de media un 46 % [NV].
- **AI Overviews y AI Mode cuentan dentro de «Web».** Desde junio de 2026 hay un informe de IA aparte, solo con impresiones.
- **Efecto en los clics:**
  - Ahrefs: −34,5 % de CTR en la posición 1 (marzo de 2025) y −58 % (diciembre de 2025).
  - Seer Interactive: −61 % en consultas informativas.
  - Pew Research: 8 % de clics con resumen de IA frente a 15 % sin él.
  - Búsquedas sin clic: alrededor del 59 % en la UE (SparkToro 2024).
  - **Consecuencias:**
    - Comparar con el año anterior está sesgado a la baja.
    - Una tarea puede subir las impresiones y bajar los clics sin haber fallado.
    - El detector de «CTR bajo» dará falsos positivos si no se ajusta según haya AI Overview en la consulta.

## 6. Avisos de caídas (detección de anomalías)

- **Práctica recomendada:** separar tendencia, estacionalidad semanal y estacionalidad anual (STL) y aplicar un umbral robusto (mediana y MAD) a lo que queda. Hay fuentes de ingeniería de Expedia, Pinterest y Twitter sobre la fatiga de alertas con umbrales fijos.
- **Problemas de nuestra regla actual en Rendimiento** (7 días frente a la media de 4 semanas, umbral del 30 %):
  - **Volumen mínimo:** pasar de 10 a 6 clics ya es un −40 %. Hay mínimo, pero bajo.
  - **Estacionalidad anual y festivos:** no se tienen en cuenta.
  - **Actualizaciones de Google:** tampoco.
  - **Retraso de los datos:** no se distingue de una caída real.
- **Mejoras recomendadas:**
  - volumen mínimo mayor;
  - **confirmar la caída dos días seguidos**;
  - silenciar o anotar las alertas durante actualizaciones de Google y festivos;
  - comprobar antes que no es un retraso de Search Console.

## 7. Visibilidad en buscadores con IA

- Conviene medirla en 2026, **como tendencia y no como posición**. SparkToro con Gumshoe (enero de 2026, unas 3.000 ejecuciones del mismo prompt) halló menos de un 1 % de probabilidad de obtener la misma lista de marcas dos veces. La métrica útil es **con qué frecuencia aparece la marca en N ejecuciones**.
- **Opciones:**
  - **Gratis:** el informe de IA de Search Console (impresiones por página).
  - **De pago:** Peec AI (Berlín, desde unos 70 €/mes), Otterly (Austria, 29-489 $), Profound, Ahrefs Brand Radar, Semrush AI Visibility, Sistrix y SE Ranking. Todos los precios son [NV].
- **Recomendación de la investigación:** integrar la API de un proveedor en vez de construir un rastreador propio de prompts.

## 8. Fallos típicos de la gestión de cuentas SEO (que el sistema debe prevenir)

- **Recomendaciones que nunca se ejecutan.** El 56 % de los SEO dice que se implementa menos del 40 % de lo que recomiendan (encuesta informal de SERoundtable); en la encuesta de Aleyda Solis, entre el 40 % y el 60 %. → **Medir la tasa de ejecución** de lo propuesto.
- **Expectativas mal fijadas al principio.** → Metas en rango y curva con retraso.
- **Informes de actividad o de métricas de vanidad en vez de resultados.** → Primero el negocio, luego el trabajo y en anexo lo demás.
- **Horas contratadas que no se ven.** → Horas consumidas frente a contratadas.
- **Revisiones trimestrales que no se hacen,** asociadas a clientes descontentos (Wallaroo, anecdótico). → El guardián avisa a los 90 días sin revisión de estrategia.
- **Consejos genéricos de la IA.** A Semrush Copilot se le critica por básico, y en una prueba de WordStream todas las herramientas se contradijeron. → Evidencia obligatoria, deduplicación y calibración.

## 9. Fuentes principales

**Datos y metodología de Google**
- Google Search Central, caídas de tráfico: https://developers.google.com/search/docs/monitor-debug/debugging-search-traffic-drops
- Datos de rendimiento de Search Console: https://developers.google.com/search/blog/2022/10/performance-data-deep-dive
- Informe de IA de Search Console: https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports
- Anotaciones en los gráficos de Search Console: https://developers.google.com/search/blog/2025/11/custom-chart-annotations
- Metodología de CrUX (Core Web Vitals): https://developer.chrome.com/docs/crux/methodology/tools
- Google Search Status Dashboard: https://status.search.google.com/products/rGHU1u87FJnkP6W2GwMi/history
- CausalImpact (Brodersen et al., 2015): arXiv 1506.00356

**Medición del impacto y previsiones**
- SearchPilot, cómo funcionan las pruebas A/B de SEO: https://www.searchpilot.com/resources/blog/the-math-behind-searchpilot-how-seo-a/b-testing-actually-works
- SearchPilot, core updates: https://www.searchpilot.com/resources/blog/seo-testing-and-core-updates
- Kevin Indig, la línea de partida en las previsiones: https://www.growth-memo.com/p/the-baseline-problem-in-seo-forecasting
- Ahrefs, cuánto se tarda en posicionar: https://ahrefs.com/blog/how-long-does-it-take-to-rank/

**AI Overviews y clics**
- Ahrefs: https://ahrefs.com/blog/ai-overviews-reduce-clicks/
- Seer Interactive: https://www.seerinteractive.com/insights/aio-impact-on-google-ctr-september-2025-update
- Pew Research: https://www.pewresearch.org/short-reads/2025/07/22/google-users-are-less-likely-to-click-on-links-when-an-ai-summary-appears-in-the-results/
- SparkToro sobre listas de IA: https://searchengineland.com/ai-recommendation-lists-rarely-repeat-study-468076

**Herramientas del mercado**
- Search Atlas OTTO: https://searchatlas.com/otto-seo/
- BrightEdge Autopilot: https://brightedge.com/products/autopilot
- seoClarity: https://www.seoclarity.net/ai-seo/automate-seo-tasks
- Semrush Copilot: https://www.semrush.com/news/299521-get-ai-powered-seo-alerts-and-recommendations-with-semrush-copilot/
- Ahrefs (novedades de mayo de 2026): https://ahrefs.com/blog/new-features-may-2026/
- Similarweb, agente de estrategia SEO: https://www.similarweb.com/corp/ai/agents/seo-strategist
- Sistrix, índice de visibilidad: https://www.sistrix.com/support/handbook/seo/visibility-index/
- SEOTesting.com: https://seotesting.com/blog/google-search-console-annotations/

**Práctica de agencias y expertos**
- Ahrefs, auditoría siempre activa: https://ahrefs.com/blog/always-on-audit
- Ahrefs, decaimiento del contenido: https://ahrefs.com/blog/content-decay/
- Sterling Sky (Joy Hawkins), seguimiento local: https://www.sterlingsky.ca/local-rank-tracking/
- Aleyda Solis, informes SEO: https://speakerdeck.com/aleyda/seo-reporting-for-success-at-number-fos22
- Search Engine Land, priorizar tareas técnicas: https://searchengineland.com/prioritize-technical-seo-tasks-445412
- SERoundtable, encuesta sobre implementación: https://seroundtable.com/seo-recommendation-implementation-poll-31485.html
- Agencias con agentes Claude: https://scalably.io/blog/ai-agents-for-seo · https://www.brightlocal.com/learn/how-mike-forgie-runs-a-local-seo-agency-on-claude-code-and-why-he-keeps-everything-in-markdown/

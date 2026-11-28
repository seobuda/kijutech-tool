# 08 — Papers, publicaciones técnicas y técnicas avanzadas para un agente que optimiza Google Ads

**Autor:** investigador «científico de datos en publicidad de búsqueda» (subagente) · **Fecha:** 28 nov 2026
**Alcance:** literatura académica (arXiv, KDD/WWW/AAAI/EMNLP/COLING, Marketing Science), Google Research, documentación
técnica de Google Ads y blogs técnicos de empresas (Walmart, Adobe, Zalando, Uber, LinkedIn, Airbnb, Booking). Todo se
filtra con una pregunta: **¿sirve para cuentas de 10-300 €/día que buscan leads?**

Leyenda de fiabilidad: **[H]** hecho documentado (paper o documentación oficial leída o resumida de la fuente),
**[O]** opinión de experto o de proveedor, **[A]** anécdota de foro o post aislado, **[NV]** no verificado en esta sesión
(referencia conocida que no he podido reabrir; comprobar antes de citarla como hecho), **[P]** propuesta propia.

---

## Resumen (lo esencial en 15 líneas)

1. **El problema central de nuestras cuentas no es la falta de algoritmos, es la escasez de datos.** Con 1-5 conversiones
   al día por campaña, casi todo lo que publica Google o las grandes empresas (geo-experimentos, Conversion Lift, MMM)
   **no aplica** por umbral mínimo: Conversion Lift pide ~5.000 $ y ~1.000 conversiones por estudio; Meridian pide 2 años de
   datos semanales y idealmente 50+ geos. Hay que diseñar para pocos datos desde el principio.
2. **La herramienta que más valor da es el «encogimiento» bayesiano (shrinkage / empirical Bayes)**: estimar la tasa de
   conversión de un término o palabra pidiendo prestada información a su grupo, campaña, cuenta y **sector** (tenemos 25+
   cuentas: es una ventaja que ninguna herramienta de una sola cuenta tiene). Paper de referencia: DHEB de Adobe.
3. **Decidir con probabilidades, no con umbrales fijos**: «40 clics sin conversión» no significa nada sin el CPA objetivo
   y el CPC. Con CPA objetivo 40 € y CPC 2 € (CR objetivo 5 %), la probabilidad de 0 conversiones en 40 clics si el término
   fuese bueno es 12,9 %; en 60 clics, 4,6 %. Esa cuenta es la que debe hacer el agente.
4. **Alertas «X días sin convertir» bien hechas = modelo de Poisson + retraso de conversión.** Si la campaña espera 2 conv/día,
   0 en 2 días tiene probabilidad 1,8 %; si espera 0,5/día, 0 en 3 días tiene 22 % (no es alarma). Y los últimos días siempre
   están incompletos por el retraso (conversion lag): hay que «completarlos» (nowcasting) antes de comparar.
5. **Explicar el porqué es descomposición matemática antes que IA**: conversiones = búsquedas × cuota de impresiones × CTR × CR;
   la variación se reparte en logaritmos entre los factores. El LLM solo redacta y cruza con contexto (cambios en la web,
   competencia en subastas, demanda en Search Console).
6. **Medir el efecto de lo que hace el agente** es el hueco más grande del mercado. Con 25 cuentas se puede **aleatorizar la
   aplicación de una recomendación** entre entidades parecidas y comparar (experimento propio de la agencia), además de
   CausalImpact (BSTS) con series de control y los experimentos nativos de Google Ads.
7. **No luchar contra Smart Bidding**: las palancas que quedan son objetivos, presupuestos, valores y calidad de los datos de
   conversión (leads cualificados del CRM), exclusiones de datos, ajustes de estacionalidad, negativas, estructura y
   creatividades. El reparto de presupuesto óptimo iguala el **CPA marginal** entre campañas, no el medio.
8. **Clasificar términos de búsqueda**: n-gramas + embeddings (ya los tenemos en SEO) + LLM pequeño solo para los dudosos,
   con la ficha del cliente como contexto. La literatura (eBay, Walmart) usa el LLM para **etiquetar** y un modelo barato
   para **servir**.
9. **Textos de anuncio con LLM**: los mejores resultados publicados combinan generación + filtro de reglas + juez LLM +
   «anclaje» en la landing (cada afirmación del anuncio debe estar en la página) + humano en el bucle.
10. **Agentes**: el patrón más seguro publicado es «el LLM propone parámetros, el código los recorta» (HOBA): límites duros
    de cambio, registro de cada acción con predicción previa, vuelta atrás automática y memoria basada en **resultados
    medidos**, no en lo que el agente cree que pasó (crítica «Honest Lying» a Reflexion/ExpeL).

---

## 1. Clasificación de términos de búsqueda e intención

### 1.1 Análisis de n-gramas (la base, barata y explicable)

- **Idea:** partir cada término de búsqueda en unigramas, bigramas y trigramas y sumar coste, clics, conversiones y valor
  por n-grama. Un n-grama como «gratis», «curso», «empleo», «segunda mano», «cómo hacer» o el nombre de otra ciudad acumula
  gasto repartido entre cientos de términos que, uno a uno, nunca llegan a ningún umbral. Es la técnica de mayor retorno
  para cuentas pequeñas porque **agrega volumen** donde no lo hay. [O] Search Engine Land describe el procedimiento y añade
  Levenshtein para fundir variantes casi idénticas y Jaccard para medir solapamiento entre conjuntos de n-gramas
  (https://searchengineland.com/advanced-semantic-techniques-ppc-seo-465526 — no se pudo abrir, 403; resumen del buscador).
- **Umbrales que circulan:** Adalysis propone filtrar n-gramas con >150 clics y 0 conversiones como candidatos a negativa
  [O] (https://adalysis.com/blog/n-gram-analysis-the-secret-to-scalable-search-term-management-in-google-ads/); otro
  proveedor pide 30-60 días de datos [O]. **Para nuestras cuentas, 150 clics es demasiado tarde** (a 2 € de CPC son 300 € de
  gasto); ver §2 para sustituir el umbral fijo por una probabilidad.
- **Riesgo documentado:** el bloqueo excesivo. Adalysis cuenta el caso de un anunciante que tuvo que quitar la negativa
  «wine» al lanzar un producto con vino [A]. Las negativas de concordancia amplia por n-grama deben revisarse contra el
  catálogo de servicios de la ficha del cliente.
- **Cuentas pequeñas:** aplica siempre; es el primer filtro. **Coste:** muy bajo (SQL + código). Herramientas: script de
  n-gramas de Nils Rooijmans (citado por RevenueHero, [A]), Pemavor recomienda pandas porque Google Ads Scripts se queda
  corto con volumen (https://www.pemavor.com/?p=26954) [O].

### 1.2 Embeddings + agrupación (clustering) semántica

- **Idea:** convertir cada término en un vector y agruparlos; un grupo entero se evalúa con su volumen sumado y se decide
  una vez (negativa a nivel de grupo, o nueva palabra clave). También permite medir la **distancia de cada término al
  catálogo de servicios** del cliente: si un término está lejos de todo lo que el cliente ofrece, es candidato a negativa
  antes de gastar.
- **Papers:**
  - Paper AAAI (workshop/symposium) sobre identificación de **consultas negativas**: presenta el problema como poco
    estudiado, agrupa consultas con embeddings de frases (InferSent) para **excluir de forma proactiva** palabras que no
    rinden antes de que acumulen coste, y se validó en despliegue real
    (https://ojs.aaai.org/index.php/AAAI-SS/article/download/42932/50492/47037) [H por resumen; el PDF devolvió bloqueo
    anti-bots, cifras no verificadas].
  - Walmart, «An Efficient Group-based Search Engine Marketing System for E-Commerce» (arXiv 2106.12700): con datos de SEM
    «muy escasos» por anuncio, representan anuncios con un Transformer, los **agrupan por geometría del embedding** y
    comparten la predicción de puja dentro del grupo; decenas de millones de pujas al día
    (https://arxiv.org/abs/2106.12700) [H]. Es la misma idea que el shrinkage de §2 pero usando semántica para decidir
    quién se parece a quién.
  - Patentes antiguas de identificación automática de negativas a partir de consultas fuera de tema
    (https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/8572115) [H, solo título/resumen].
- **Cuentas pequeñas:** aplica muy bien, porque **agregar** es lo que necesitan. Ventaja nuestra: el módulo SEO ya calcula
  embeddings y tiene el mapa de palabras; Search Console aporta términos orgánicos del mismo cliente que sirven como
  «vocabulario positivo». **Coste:** bajo (embeddings ~céntimos por miles de términos; HDBSCAN o aglomerativo en código).

### 1.3 LLM como clasificador

- **Lo que dice la literatura reciente:**
  - «In a Few Words: Comparing Weak Supervision and LLMs for Short Query Intent Classification» (arXiv 2504.21398, 2025):
    compara supervisión débil con LLM en la taxonomía de Broder (informacional, navegacional, transaccional) y **cuestiona
    la fiabilidad de los LLM generativos para clasificar consultas cortas**; publica código (https://arxiv.org/abs/2504.21398)
    [H, resumen; no leí las cifras].
  - eBay, «LLMDistill4Ads» (arXiv 2508.03628): las etiquetas generadas por un LLM entrenan un *cross-encoder* de relevancia
    que supera a modelos entrenados con clics o registros de búsqueda; luego se destila a un *bi-encoder* barato
    (https://arxiv.org/html/2508.03628v6) [H].
  - Walmart: destilación de un LLM de 7B a un modelo pequeño para relevancia en producción (arXiv 2505.07105,
    https://arxiv.org/html/2505.07105v1) [H]; y un clasificador <consulta, título de anuncio> de 3 clases (relevante,
    parcialmente relevante, irrelevante) con 89,43 % de precisión que dicen superar a GPT-4
    (https://ceur-ws.org/Vol-3843/paper_19.pdf) [H por resumen].
  - Walmart INSPIRE: etiquetas de intención estructuradas generadas por LLM para recuperación de productos patrocinados
    (https://ceur-ws.org/Vol-4250/paper762.pdf) [H por resumen].
- **Patrón que se repite:** **el LLM etiqueta, un modelo barato (o reglas) sirve.** Para nosotros, a escala de 25 cuentas, el
  volumen de términos nuevos por semana es de miles, no de millones: **sí podemos permitirnos el LLM directo**, pero solo sobre
  lo que no resuelven las capas baratas.
- **Productos de mercado:** Negator.io clasifica cada término como Relevante / No relevante / Competidor; plantillas n8n y
  repositorios con la API de OpenAI que proponen negativas; guías que piden a ChatGPT repartir en «negativa inmediata /
  revisar / mantener» con motivo y concordancia [A/O] (https://www.producthunt.com/posts/negator,
  https://n8n.io/workflows/15385). Ninguno usa la ficha del cliente ni el CRM.
- **Cuentas pequeñas:** aplica. **Coste:** Haiku a ~1-2 céntimos por lote de 100 términos con la ficha en caché de prompt
  [P, precio a confirmar con la skill de la API].

### 1.4 Propuesta de cascada de clasificación para nuestro agente [P]

1. **Reglas deterministas** (gratis): listas de n-gramas negativos por sector (empleo, formación, gratis, DIY, piezas,
   segunda mano), ciudades fuera de la zona de servicio de la ficha (lista de municipios del INE vs. radio/zonas del cliente),
   marcas de competidores (de la ficha y de las subastas), marca propia.
2. **Embeddings**: distancia coseno a (a) servicios de la ficha, (b) palabras clave activas, (c) términos orgánicos de GSC que
   llevan a páginas de servicio. Cerca de todo → relevante; lejos de todo → candidato a negativa; zona gris → paso 3.
3. **LLM pequeño (Haiku)** solo para la zona gris y los grupos nuevos, con la ficha del cliente y ejemplos de decisiones
   previas del equipo (few-shot desde nuestra memoria). Salida estructurada: etiqueta, motivo, nivel de negativa
   (término / grupo / campaña / lista compartida), concordancia sugerida.
4. **Rendimiento**: la etiqueta semántica se combina con la evidencia estadística de §2 (un término «relevante» que no
   convierte tras muchos clics es un problema de landing o de oferta, no de negativa).
5. **Comprobación de conflictos**: ninguna negativa propuesta puede bloquear una palabra clave activa ni términos que
   hayan convertido (en Google Ads o en el CRM). SEL documenta el uso de scripts que detectan negativas que bloquean
   palabras clave [O] (https://searchengineland.com/generative-ai-scripts-google-ads-optimization-453065).

**Nota de vigencia:** con AI Max for Search y la concordancia amplia, una parte creciente del tráfico **no se empareja con
ninguna palabra clave** (un análisis de agosto 2025 dice que menos de la mitad de los términos muestran palabra clave
asociada [A]) y los controles de marca fallan con variantes y faltas de ortografía (análisis de dic. 2025 [A])
(https://ppc.land/google-ads-gets-branded-search-controls-inside-ai-max/,
https://ppc.land/googles-ai-max-for-search-campaigns-deliver-meh-results-industry-tests-reveal/). La clasificación de
términos gana importancia, no la pierde. Los SKAG están obsoletos desde las variantes cercanas y la consolidación que
pide Smart Bidding.

---

## 2. Estimación con pocos datos: CR y CPA con volumen bajo

### 2.1 El problema, con números

- Martech (Search Engine Land) muestra con simulación que **hace falta muchísimo volumen para que la tasa de conversión
  observada de una palabra se parezca a la real**, y que con pocos datos es mejor heredar la tasa del grupo de anuncios
  (https://martech.org/coaxing-smarter-paid-search-bidding-decisions-sparse-conversion-data/) [O con simulación].
- Adobe (DHEB) mide en una cuenta real: ~90 % de los días sin clics por unidad de puja y ~98 % de los días con clics sin
  ingresos (https://ar5iv.labs.arxiv.org/html/1809.02213) [H]. Nuestras cuentas de leads son aún más escasas.

### 2.2 Empirical Bayes beta-binomial (la técnica que hay que implementar sí o sí)

- **Idea (3-5 líneas):** la tasa de conversión de cada término/palabra se modela como Beta(α, β). α y β se estiman con los
  datos del nivel superior (grupo, campaña, cuenta o sector) por método de momentos o máxima verosimilitud. La estimación
  «encogida» es `CR_post = (α + conv) / (α + β + clics)`. Con pocos clics, la estimación se queda cerca de la media del grupo;
  con muchos, manda el dato propio. Explicación accesible: https://skeptric.com/pooling-proportions-empirical-bayes/ [O];
  la referencia divulgativa clásica es David Robinson, *Introduction to Empirical Bayes* (béisbol) [NV].
- **Fuerza del prior** `m = α + β` = «clics equivalentes» que aporta el grupo. Valores típicos razonables: 20-200 clics
  según lo homogéneo que sea el grupo [P]. Se estima de los datos: si los términos de una campaña tienen CR muy parecidos,
  m sale grande.
- **CPA:** `CPA = CPC / CR`. El CPC es estable con pocos datos; el CR no. Se calcula la distribución posterior del CPA a
  partir de la de CR (muestreo de la Beta) y se da un intervalo creíble («CPA probable entre 28 y 95 €»).
- **Cuándo aplica:** siempre. **Coste:** muy bajo (fórmulas cerradas, SQL + TypeScript).

### 2.3 Jerárquico y dinámico: DHEB (Adobe, 2018)

- **Paper:** Yuan et al., «Dynamic Hierarchical Empirical Bayes: A Predictive Model Applied to Online Advertising», arXiv
  1809.02213 (https://arxiv.org/abs/1809.02213) [H, leído].
- **Qué hace:** predice ingresos por clic de cada unidad de puja (palabra + concordancia + grupo). En vez de fijar la
  jerarquía a mano, **elige con los datos** por qué variable partir en cada nivel (campaña, grupo, palabra, concordancia,
  día de la semana…) minimizando una pérdida de encogimiento jerárquico tipo CART; para de partir cuando el error de los
  hijos no baja lo suficiente respecto al padre. El posterior de cada nodo es el prior de sus hijos.
- **Fórmula clave:** la estimación es una media ponderada por precisión entre la media del padre y la estimación propia
  del nodo; los priors se estiman de los datos (μ₀ = Σingresos/Σclics, varianza ponderada por clics).
- **Resultados:** en simulación, solo gana la jerarquía verdadera fija; DHEB queda segundo y **la ventaja sobre la media
  histórica crece cuanto más escasos son los datos**. En datos reales (5.148 unidades de puja, 156 campañas) DHEB supera a
  media ponderada, regresión regularizada, Bayes de 2 y 3 niveles. Mucho más barato que el Bayes por muestreo (Stan).
  Reentrenar la jerarquía cada 4 días basta porque cambia poco.
- **Para nosotros:** la jerarquía natural es término → palabra → grupo → campaña → cuenta → **sector (varias cuentas)**.
  El nivel «sector» exige que las conversiones signifiquen lo mismo (un formulario de cerrajero ≠ una llamada de dentista).
  Normalizar por tipo de conversión de la ficha [P]. **Coste:** medio (una semana de trabajo de un científico de datos).

### 2.4 Otros papers de referencia

- Rutz, Bucklin y Sonnier (Journal of Marketing Research, 2012), «A latent instrumental variables approach to modeling
  keyword conversion in paid search advertising»: Bayes para CR y CTR de palabras con datos escasos, corrigiendo por la
  posición del anuncio (https://faculty.washington.edu/orutz/docs/Keywords_JMR_2012.pdf) [H por resumen].
- Blask et al. (2017), «Predicting conversion rates in paid search using sparse keyword-level data», tesis de Leuphana
  (https://pubdata.leuphana.de/bitstream/20.500.14123/558/1/Tobias_Blask_dissertation-2018-abgabe-1.pdf) [NV, solo índice].
- Encuesta «User Response Prediction in Online Advertising» (arXiv 2101.02342): resume técnicas de jerarquías
  usuario/anunciante/editor para escasez de conversiones (https://arxiv.org/pdf/2101.02342) [H, resumen].
- «Shrinkage Estimators in Online Experiments» (arXiv 1904.12918): encogimiento aplicado a resultados de experimentos con
  muchos tratamientos (https://arxiv.org/pdf/1904.12918) [H, título y resumen].

### 2.5 Decidir pausar o negativizar con datos escasos

- **Regla probabilística en vez de umbral fijo [P, matemática estándar]:** sea `CR*` = CPC medio / CPA objetivo (la CR
  mínima para cumplir el objetivo). Si un término tuviese de verdad `CR*`, la probabilidad de ver 0 conversiones en n clics
  es `(1 − CR*)^n`. Ejemplos:
  - CPA objetivo 40 €, CPC 2 € → CR* = 5 %. 20 clics: 36 %; 40 clics: 12,9 %; 60 clics: 4,6 %; 90 clics: 1 %.
  - CPA objetivo 100 €, CPC 4 € → CR* = 4 %. 50 clics: 13 %; 75 clics: 4,7 %.
  Regla útil: con ~`3 / CR*` clics sin conversión (equivalente a gastar **3 veces el CPA objetivo**), la probabilidad de que
  sea un término bueno baja a ~5 %. Los practicantes usan reglas de «gastado 2-3× el CPA objetivo sin convertir»: esto les
  da fundamento [O+P].
- **Versión bayesiana completa:** con el prior del grupo, `P(CR_término ≥ CR*)` se calcula directamente de la Beta
  posterior. Acción si < 10 % (negativa/pausa) y propuesta de «vigilar» si 10-30 % [P].
- **Coste de equivocarse (teoría de decisión):** pausar un término bueno cuesta las conversiones futuras perdidas;
  mantener uno malo cuesta el gasto futuro. Feit y Berman, «Test & Roll: Profit-Maximizing A/B Tests» (Marketing Science
  2019; arXiv 1811.00457) formalizan esto: el tamaño de prueba que maximiza beneficio es **mucho menor** que el de un test de
  hipótesis clásico, sobre todo con poblaciones pequeñas y respuesta ruidosa, y su regret es casi el de Thompson sampling
  (https://arxiv.org/abs/1811.00457) [H, resumen]. Es exactamente el caso de una cuenta pequeña: **no esperes a «significancia
  al 95 %»; decide minimizando pérdida esperada**.
- **Considerar el retraso:** antes de contar «0 conversiones», descontar los clics recientes cuyas conversiones aún no
  han tenido tiempo de llegar (ver §3.3). Y **contar conversiones del CRM** (GoHighLevel), no solo las de Google Ads.

### 2.6 Bandits y pruebas de anuncios

- **Thompson sampling:** cada variante tiene su posterior Beta; se reparte tráfico muestreando de las posteriores. JD.com
  (Comparison Lift, AAAI 2021, arXiv 2009.07899) reporta ~27 % más clics durante las pruebas frente a un A/B de reparto fijo
  (https://arxiv.org/pdf/2009.07899) [H, cifra de la propia empresa]. Thompson sobre árbol de componentes creativos para
  pocas impresiones por variante (arXiv 2103.01453) [H, resumen].
- **Límite práctico en Google Ads:** el agente **no controla la rotación** de los anuncios responsivos (RSA); Google ya
  hace su propio bandit sobre combinaciones de títulos. Donde sí podemos aplicar bandits/«test & roll»: (a) qué variante de
  landing recibe el tráfico (si la web es nuestra), (b) qué anuncio o recurso se mantiene/sustituye de forma secuencial,
  (c) experimentos de Google Ads entre campañas [P].
- **Qué medir en cuentas pequeñas:** en un grupo con 300 clics/mes y CR 5 % no hay datos para comparar CR entre anuncios
  (15 conversiones/mes). Usar **conversiones por impresión** (combina CTR y CR) con prior jerárquico, o CTR con la CR
  como métrica de protección [P]. Google admite 80 % de confianza como suficiente para pruebas «direccionales» según un
  podcast de Google Ads reseñado por PPC Land (https://ppc.land/google-says-80-confidence-is-good-enough-for-directional-ad-tests/) [O].
- **Experimentos nativos de Google Ads:** reparto por cookie (cada usuario ve una versión) o por búsqueda (más rápido en
  llegar a significancia, pero un usuario puede ver ambas); con listas de audiencia y reparto por cookie, recomiendan
  ≥10.000 usuarios en la lista. Google calcula intervalos con **jackknife sobre datos en cubos** y test de dos colas al 95 %
  (https://support.google.com/google-ads/answer/6261395, https://support.google.com/google-ads/answer/9232676) [H].
  Desde mayo de 2026 la API v24.1 amplía las funciones de experimentos
  (https://developers.google.com/ads/blog/posts/2026/05/announcing-expanded-experiment) [H, título; detalle NV].
  «Experiment Power» en Campaign Guidance indica la probabilidad de llegar a resultado significativo
  (https://support.google.com/google-ads/answer/15911255) [H].

---

## 3. Detección de anomalías en métricas publicitarias

### 3.1 Métodos robustos para series con estacionalidad semanal

- **Línea base por día de la semana (lo mínimo):** valor esperado = mediana de los últimos 4-8 mismos días de la semana;
  dispersión = MAD (desviación absoluta mediana). Robusto a picos. [P, práctica estándar]
- **STL robusta** (descomposición estacional-tendencia con LOESS): los atípicos quedan en el residuo y se detectan ahí
  (https://cran.r-project.org/web/packages/anomalize/vignettes/anomalize_methods.html) [H].
- **S-H-ESD de Twitter** (paquete AnomalyDetection): descomposición con **mediana** en vez de suavizado para la tendencia
  (el suavizado se «traga» las anomalías) + test ESD generalizado; pensado para métricas de negocio con tendencia y
  estacionalidad. Limitación conocida: **no detecta bien caídas estacionales ni señales planas** (ojo: «la campaña se paró»
  es una señal plana) (https://arxiv.org/pdf/1704.07706, https://www.sourceforge.net/projects/anomalydetection.mirror/) [H].
- **RobustSTL / descomposición robusta para métricas estacionales** (arXiv 2008.09245, Alibaba)
  (https://ar5iv.labs.arxiv.org/html/2008.09245) [H, título].
- **Prophet** (Taylor y Letham, 2017): regresión aditiva con estacionalidades y **calendario de festivos** configurable
  [NV]. Útil porque en España hay festivos nacionales, autonómicos y locales que hunden o disparan la demanda de
  servicios locales (puentes, agosto, Semana Santa). Nuestro sistema debería cargar los festivos por comunidad/municipio de
  cada cliente [P].
- **Holt-Winters para Poisson** (Evan Miller): bandas de confianza para métricas de bajo volumen; idea clave: **un 0 aislado
  es aceptable, muchos 0 seguidos no** (https://www.evanmiller.org/poisson.pdf) [H/O].

### 3.2 Bajo volumen: el caso de nuestras cuentas

- Renz et al., «Low-count time series anomaly detection» (arXiv 2308.12925): con conteos muy bajos, **los detectores estándar
  rinden apenas mejor que el azar**; suavizar la puntuación de anomalía mejora la precisión a costa de retraso. La relación
  señal/ruido de una Poisson es ∝ √λ (https://ar5iv.labs.arxiv.org/html/2308.12925) [H].
- **Consecuencia práctica [P]:** las conversiones diarias de una campaña de leads **no se vigilan día a día con bandas**; se
  vigilan con (a) test de rachas de ceros, (b) ventanas acumuladas (3, 7, 14 días) y (c) métricas de más volumen que
  adelantan el problema (impresiones, clics, CTR, CPC, cuota de impresiones, sesiones GA4, eventos de formulario).
- **Test de «X días sin convertir» [P, Poisson estándar]:** con tasa esperada λ conv/día (de la línea base ajustada por día
  de la semana y por retraso), `P(0 en k días) = e^(−λ·k)`.
  - λ = 2/día: 1 día 13,5 %; 2 días 1,8 %; 3 días 0,25 % → alarma clara al 2.º día.
  - λ = 1/día: 2 días 13,5 %; 3 días 5 %; 4 días 1,8 % → alarma al 3.º-4.º día.
  - λ = 0,5/día: 3 días 22 %; 6 días 5 % → «3 días sin convertir» es normal; no avisar.
  Esto resuelve exactamente el aviso que pide el brief («2-3 días sin convertir») sin falsas alarmas en cuentas pequeñas.
  Si los datos tienen más ceros de lo que da Poisson (sobredispersión), usar binomial negativa.
- **Rupturas estructurales:** CUSUM sobre CR o CPC, o detección bayesiana de puntos de cambio en línea (Adams y MacKay, 2007,
  «Bayesian Online Changepoint Detection») [NV]. Poisson-FOCuS (arXiv 2208.01494) detecta ráfagas y también **ausencias**
  de conteos en línea (https://arxiv.org/pdf/2208.01494) [H].

### 3.3 Retraso de conversión (conversion lag) y «nowcasting»

- **Paper fundacional:** Chapelle, «Modeling delayed feedback in display advertising», KDD 2014: las conversiones llegan
  hasta un mes después del clic; modelo conjunto de probabilidad de conversión y distribución del retraso (exponencial)
  (https://bibtex.github.io/KDD-2014-Chapelle.html) [H]. Extensiones: retraso no exponencial y periódico (NoDeF, Yoshikawa e
  Imai, arXiv 1802.00255), conversiones múltiples por clic (Badanidiyuru et al., 2021) [H, resumen].
- **Lo que da Google:** informes de retraso de conversión con **previsiones** de CPA/ROAS ajustadas por retraso (Search, PMax,
  App) y el segmento «Días hasta la conversión» (hasta 19 filas); Google recomienda que el periodo de un informe termine al
  menos 30 días antes para tener datos completos (https://support.google.com/google-ads/answer/9347141,
  https://support.google.com/google-ads/answer/6239119) [H]. Un responsable de Google recomienda **excluir los días con
  atribución incompleta** al evaluar (https://ppc.land/google-expert-warns-against-premature-campaign-evaluation-pitfalls/) [O].
- **Nowcasting simple [P]:** por cuenta y acción de conversión, estimar la curva acumulada `F(d)` = fracción de conversiones
  que ya se han registrado d días después del clic (de «días hasta la conversión» o, mejor, de la fecha de lead en el CRM
  frente a la fecha de clic vía GCLID). Conversiones esperadas finales de un día de edad d = `observadas / F(d)`; la
  incertidumbre crece cuando F(d) es pequeño. Ejemplo: si el 70 % de los leads llegan el mismo día del clic y el 90 % en 3
  días, el CPA de «ayer» está inflado ~30 %; un sistema ingenuo avisaría cada mañana.
- **Para leads:** el retraso clic→formulario suele ser corto (horas), pero el retraso **clic→lead cualificado / venta** en el
  CRM es de días o semanas, y las importaciones de conversiones offline llegan con retraso adicional. Hay que modelar cada
  acción por separado [P].

### 3.4 Cómo bajar las falsas alarmas (lo que hacen LinkedIn y similares)

- **ThirdEye (LinkedIn):** detección por reglas o modelos para reducir falsas alarmas, análisis de causa con **mapa de calor
  por dimensiones** frente a la línea base, calendario de festivos y despliegues en el mismo sitio, y **aprendizaje con la
  respuesta del usuario** a cada alerta (útil / no útil) (https://engineering.linkedin.com/blog/2019/01/introducing-thirdeye--linkedins-business-wide-monitoring-platfor,
  https://engineering.linkedin.com/blog/2020/monitoring-business-performance-data-with-thirdeye-smart-alerts) [H].
- **Recetas [P, basadas en lo anterior]:**
  1. **Materialidad**: avisar solo si el impacto estimado en € o en leads supera un mínimo por cuenta.
  2. **Persistencia**: exigir 2 de 3 periodos anómalos para métricas ruidosas.
  3. **Jerarquía**: detectar a nivel cuenta/campaña y bajar a grupo/palabra solo para explicar, no para avisar (evita la
     explosión de pruebas múltiples).
  4. **Control de falsos descubrimientos** (Benjamini-Hochberg) cuando se prueban cientos de series a la vez (25 cuentas ×
     campañas × métricas).
  5. **Supresión por contexto**: si el historial de cambios muestra que alguien cambió presupuesto/objetivo, la alerta
     cambia a «efecto de un cambio» y se evalúa como tal; festivos y periodo de aprendizaje de Smart Bidding se anotan.
  6. **Retroalimentación**: cada alerta lleva «útil / no útil / ya lo sabía»; ajustar umbrales por cuenta con eso.

---

## 4. Atribución causal de cambios: «¿por qué ha pasado?» y «¿funcionó lo que hicimos?»

### 4.1 Descomposición de la variación de un KPI (diagnóstico sin IA)

- **Identidades de búsqueda [P, estándar]:**
  - `Conversiones = Búsquedas elegibles × Cuota de impresiones × CTR × CR`
  - `Búsquedas elegibles ≈ Impresiones / Cuota de impresiones`; la cuota perdida se reparte en **por presupuesto** y
    **por ranking** (Google Ads las da por campaña).
  - `CPA = CPC / CR`; `Coste = Clics × CPC`.
- **Descomposición logarítmica (LMDI):** `Δln(Conv) = Δln(Búsquedas) + Δln(CI) + Δln(CTR) + Δln(CR)`; cada término es la
  parte del cambio atribuible a ese factor, y suman exactamente el total. Para el CPA: `Δln(CPA) = Δln(CPC) − Δln(CR)`.
  Con eso el agente puede decir: «Las conversiones bajaron un 30 %: −5 % por menos búsquedas, −20 % por menos cuota
  (perdida por ranking, porque el CPC de la competencia subió), −5 % por CR». Ejemplo de uso de LMDI en embudo:
  https://engineered.at/articles/answering-why-did-the-kpi-change-using-decomposition [O].
- **Mezcla frente a tasa (Kitagawa / Oaxaca-Blinder):** un CPA medio puede subir sin que ninguna campaña empeore, solo
  porque el gasto se movió a la campaña cara. `ΔKPI = Σ w₀·ΔKPI_i (efecto tasa) + Σ Δw·KPI_i,0 (efecto mezcla) + interacción`
  (https://us.fitgap.com/stack-guides/explaining-kpi-trends-with-mix-vs-rate-driver-decomposition) [O]. Papers recientes
  formalizan la atribución aditiva de cambios en medidas derivadas y árboles de métricas (arXiv 2604.26266, 2608.29735)
  [H, resumen; identificadores a verificar].
- **Herramienta de Google:** «Explicaciones» (Explanations) de Google Ads atribuye cambios significativos a causas
  (cambios de puja/objetivo, presupuesto, subastas, etc.), solo compara periodos iguales dentro de los últimos 90 días, no
  incluye «hoy» y solo salta con cambios significativos (https://support.google.com/google-ads/answer/9000655) [H]. Y una
  guía de diagnóstico de fluctuaciones por tipo de campaña (https://support.google.com/google-ads/answer/12266223) [H].
  **Útil como fuente adicional** si se puede leer por API (a comprobar), no como sustituto.
- **Cruces que solo nosotros tenemos [P]:**
  - **Demanda**: impresiones orgánicas de Search Console para las consultas equivalentes = serie de control de demanda
    (si bajan las dos, es demanda; si solo baja Ads, es nuestro).
  - **Landing**: GA4 (CR de la página), Clarity (errores, clics muertos), PageSpeed/CrUX, **registro de cambios en la web**
    y vigilancia de caídas del módulo SEO. Un CR que cae el mismo día que cambió el formulario es la causa más probable.
  - **Competencia**: informes de subastas (solapamiento, posición superior) + competidores de la ficha + SERP de DataForSEO.
  - **Calidad del lead**: CRM (GoHighLevel): si sube el volumen de formularios pero baja la tasa de cualificados, hay
    tráfico basura o spam.
  - **Local**: Google Business Profile (llamadas y rutas) como señal de demanda local.

### 4.2 CausalImpact (series temporales estructurales bayesianas, BSTS)

- **Paper:** Brodersen, Gallusser, Koehler, Remy y Scott, «Inferring causal impact using Bayesian structural time-series
  models», Annals of Applied Statistics 2015 (https://arxiv.org/abs/1506.00356) [H]. Generaliza diferencias en diferencias a
  series temporales: modela el contrafactual con series de control no afectadas, con selección bayesiana de controles. Caso
  de estudio: efecto de una campaña publicitaria en visitas. Paquete R CausalImpact (Google) y puertos en Python.
- **Supuestos críticos:** las series de control no deben verse afectadas por la intervención y su relación con la serie
  tratada debe ser estable tras la intervención (https://opensource.google/projects/causalimpact) [H].
- **Aplicación [P]:** medir el efecto de un cambio del agente (p. ej. reestructurar una campaña) usando como controles:
  impresiones GSC (demanda), otras campañas de la cuenta no tocadas y **cuentas del mismo sector y zona que no se tocaron**.
  Con pocas conversiones, aplicarlo a clics, coste e impresiones (más volumen) y solo de forma orientativa a conversiones.
- **Coste:** bajo-medio (librería existente; Python en un contenedor auxiliar o reimplementación ligera; pedir OK por
  dependencias nuevas).

### 4.3 Diferencias en diferencias y despliegue escalonado entre cuentas

- **Idea [P + literatura econométrica estándar]:** cuando el agente aplica el **mismo tipo de cambio** (p. ej. «añadir
  negativas de empleo», «subir objetivo de CPA un 15 %») en varias cuentas en fechas distintas, se tiene un diseño de
  adopción escalonada. Un estudio de eventos con estimadores robustos a efectos heterogéneos (Callaway y Sant'Anna 2021;
  Sun y Abraham 2021) [NV] estima el efecto medio del tipo de cambio. **Ninguna herramienta de una sola cuenta puede hacer
  esto; una agencia con 25+ cuentas sí.**
- **Mejor aún: aleatorizar [P].** Cuando haya N entidades elegibles para una recomendación de bajo riesgo (p. ej. 40 grupos de
  anuncios donde añadir un recurso), aplicarla en una mitad elegida al azar y dejar la otra como control durante 2-4
  semanas. Es un experimento de la agencia, no de Google; la unidad aleatorizada es la entidad. Es la forma más barata y
  honesta de saber qué recomendaciones del agente funcionan.

### 4.4 Experimentos de Google Ads, geo-experimentos e incrementalidad

- **Experimentos personalizados (drafts & experiments):** ver §2.6. Recomendables para cambios de estrategia de puja,
  concordancia amplia/AI Max (hay experimentos específicos de AI Max: https://support.google.com/google-ads/answer/16450159
  [H]), landing alternativa. Excluir el periodo de aprendizaje del análisis
  (https://services.google.com/fh/files/misc/smartbiddingbestpractices1s.pdf) [H].
- **Conversion Lift (Google):** ya disponible para Search y PMax; Google bajó el mínimo a ~5.000 $ (sep.-nov. 2025),
  introdujo metodología bayesiana, recomienda ≥1.000 conversiones en el estudio y ≥14 días (estudios más cortos con retraso
  largo pueden perder hasta 17 % de lift absoluto); se pide al representante de Google
  (https://ppc.land/google-lowers-incrementality-testing-threshold-to-5-000-for-advertisers/,
  https://support.google.com/google-ads/answer/12003020, https://searchengineland.com/google-opens-conversion-lift-to-search-and-performance-max-494195)
  [H]. **Para cuentas de 10-300 €/día: casi nunca aplicable** (1.000 conversiones de lead son meses o años).
- **Geo-experimentos (Google Research):** Time-Based Regression (Kerman, Wang, Vaver 2017) para pocos geos
  (https://research.google/pubs/estimating-ad-effectiveness-using-geo-experiments-in-a-time-based-regression-framework/),
  diseño de mercados emparejados con TBR (https://research.google/pubs/pub48983/), Trimmed Match y su diseño (Chen, Au,
  Longfils, Remy; arXiv 2105.07060) [H]. **GeoLift** (Meta, open source, control sintético), presupuesto calculado a partir
  del coste por conversión incremental, con el número de geos típicamente pequeño y potencia limitada
  (https://rdrr.io/github/facebookincubator/GeoLift/f/vignettes/GeoLift_Walkthrough.Rmd) [H]. Un proveedor desaconseja
  geo-tests en canales de poco presupuesto porque la señal se pierde en el ruido [O].
  **Para negocios locales de una ciudad: no aplicable.** Para un cliente multi-provincia con presupuesto alto: posible con
  provincias como unidades y semanas de duración.
- **MMM (Meridian, Robyn, LightweightMMM):** Meridian es open source desde el 29 ene 2025, bayesiano, admite resultados de
  experimentos como priors, y Google pide como regla 2 años de datos semanales (modelo geo) o 3 (nacional), idealmente 50+
  geos (https://developers.google.com/meridian/docs/pre-modeling/amount-data-needed,
  https://blog.google/products/ads-commerce/meridian-marketing-mix-model-open-to-everyone/) [H]. LightweightMMM fue su
  predecesor (sustituido por Meridian) [NV]. **Para nuestras cuentas: no aplicable** (un solo canal relevante, poco
  presupuesto, sin geos). Forrester recuerda que solo es útil si la marca ya tiene experiencia con tests
  (https://www.forrester.com/blogs/is-googles-meridian-the-right-open-source-mmm-solution-for-you) [O].

### 4.5 Medir el efecto de una optimización hecha por el agente (protocolo propuesto) [P]

1. **Antes de actuar**, el agente registra: acción, entidad, hipótesis, métrica objetivo, **efecto esperado con intervalo**,
   ventana de evaluación (≥ ciclo de conversión + retraso p90), métricas de protección y criterio de vuelta atrás.
2. **Control**: el mejor disponible en este orden: experimento de Google Ads → aleatorización entre entidades de la
   agencia → controles sintéticos (CausalImpact con GSC, campañas y cuentas no tocadas) → antes/después con ajuste de
   estacionalidad (el más débil; marcarlo así).
3. **Evaluación automática** al cerrar la ventana, con datos completados por nowcasting. Resultado: «funcionó / no
   concluyente / perjudicó», con el intervalo.
4. **Memoria**: el resultado (no la narración del agente) alimenta la tasa de acierto por tipo de acción, sector y tamaño
   de cuenta; esa tasa es el prior de la siguiente recomendación (Bayes otra vez).

---

## 5. Reparto de presupuesto y puja

### 5.1 Curvas de respuesta y rendimiento marginal

- **Teoría:** Feldman, Muthukrishnan, Pál y Stein, «Budget Optimization in Search-Based Advertising Auctions» (ACM EC 2007,
  arXiv cs/0612052): repartir presupuesto entre palabras es NP-difícil en general, pero **estrategias simples** (pujar
  uniforme o aleatorizar entre dos pujas uniformes) logran ≥ (1−1/e) del óptimo (https://arxiv.org/abs/cs/0612052) [H].
  Versión estocástica con demanda incierta: Muthukrishnan, Pál y Svitkina (arXiv cs/0612072) [H]. Lección: **no hace falta
  sofisticación extrema en el reparto; hace falta no cometer errores gruesos.**
- **Marginal frente a medio:** Google define el CPA marginal como el coste de cada conversión adicional y advierte que las
  medias por segmento engañan (https://support.google.com/google-ads/answer/12850633) [H]. Con rendimientos decrecientes,
  el reparto óptimo **iguala el CPA marginal** entre campañas (condición de Lagrange): se mueve presupuesto de la campaña
  con CPA marginal más alto a la de más bajo hasta igualarlos [P, estándar].
- **Curva [P]:** `Conv(gasto) = a · gasto^b` con 0 < b < 1 (o curva de saturación tipo Hill). CPA marginal =
  `1 / (a·b·gasto^(b−1))` = CPA medio / b. Con b = 0,7, el CPA marginal es ~1,4× el medio: subir presupuesto en una campaña
  con CPA medio justo en objetivo empeora el CPA de las conversiones extra un 40 %.
- **De dónde sacar la curva con pocos datos:**
  1. **Simuladores de Google por API**: `campaign_simulation` con tipos BUDGET, TARGET_CPA, TARGET_ROAS (puntos con
     métricas previstas para distintos presupuestos u objetivos) (https://developers.google.com/google-ads/api/fields/v22/campaign_simulation) [H; campos de cada punto NV].
  2. **Cuota de impresiones perdida por presupuesto**: si es alta y el CPA es bueno, la curva está en zona casi lineal
     (más presupuesto ≈ mismo CPA) [O, práctica habitual].
  3. **Variación natural** del gasto diario (regresión de conversiones semanales sobre gasto) con prior jerárquico del sector
     para b [P].
- **Ritmo de cambio:** practicantes recomiendan subidas graduales (~10-20 %) y recuerdan que Smart Bidding **no mueve
  presupuesto entre campañas** por sí solo (https://searchengineland.com/ppc-budgeting-adjust-scale-optimize-data-452493)
  [O]. Optmyzr: cuando manda el presupuesto, la escasez fija la puja marginal; cuando manda el objetivo, lo fija el objetivo;
  subir presupuesto puede llevar a subastas más caras (https://www.optmyzr.com/blog/smart-bidding-budget-caps-guide/) [O].
- **Ejemplos industriales:** Zalando (bandits para pujas con valoración desconocida, arXiv 2304.00999; pujas con bucle de
  control cerrado para repartir gasto, https://engineering.zalando.com/posts/2024/09/even-ad-spend-on-zalando-homepage.html),
  Uber (Euclid: reparto automático de presupuesto por canal/país/ciudad y simulador de subastas,
  https://www.uber.com/blog/euclid-marketing-engineering, https://www.uber.com/en-GB/blog/unleashing-the-power-of-ads-simulation),
  Wayfair («Single Bid Calculator», https://aboutwayfair.com/careers/tech-blog/evolution-of-ads-bidding-at-wayfair), Airbnb
  (SEM a gran escala, SIGIR 2018, Wong, Collins, Venkataraman; geo-experimentos para incrementalidad) [H/NV]. Booking no
  publica su sistema de pujas; solo su lección general: medir cada modelo con experimentos controlados (KDD 2019,
  https://blog.acolyer.org/2019/10/07/150-successful-machine-learning-models/) [H]. Todo esto es escala grande; lo
  transferible es el patrón «calculadora de valor por conversión + reglas de reparto + experimentos».

### 5.2 Cómo trabajar con Smart Bidding (no contra él)

Palancas que quedan al agente/humano [H donde se cita, P donde no]:

1. **Qué se optimiza (la palanca más grande en lead gen):** acciones de conversión principales/secundarias, **valores por
   tipo de lead** y conversiones offline del CRM (lead cualificado, venta) con conversiones mejoradas para leads. Pujar a
   «formulario enviado» cuando la mitad son spam es entrenar al algoritmo para traer spam. Con GoHighLevel tenemos el dato.
2. **Objetivos (tCPA/tROAS)** y **presupuestos**: cambios espaciados y moderados; cada cambio grande reabre aprendizaje.
   Los simuladores de objetivo dan la curva (ver arriba).
3. **Calidad de datos:** **exclusiones de datos** solo para fallos de seguimiento (etiqueta rota, importación fallida), no
   para promociones; ajustes de estacionalidad para cambios de CR cortos y predecibles; Google dice que Smart Bidding ya
   gestiona la estacionalidad normal (https://support.google.com/google-ads/answer/10370710,
   https://support.google.com/google-ads/answer/9461281,
   https://developers.google.com/google-ads/api/docs/campaigns/bidding/data-exclusions) [H]. **Idea fuerte para nuestro
   agente: detectar caídas de seguimiento (conversiones a 0 con clics y sesiones normales, o divergencia Ads vs CRM) y
   proponer la exclusión de datos ese mismo día.** Las fuentes discrepan sobre cuánto esperar para rellenar datos (5 o 14
   días) [H, contradicción a resolver en la doc vigente].
4. **Estructura:** suficiente volumen por estrategia (consolidar campañas o usar estrategias de cartera); el umbral histórico
   de Google era ~15-30 conversiones/30 días para tCPA/tROAS [NV, verificar la doc vigente].
5. **Qué tráfico entra:** negativas, exclusiones de marca, ubicaciones, zonas; señales de audiencia; con AI Max, controles de
   marca y de URL.
6. **Smart Bidding Exploration** (mayo 2025, solo tROAS en Search): explora consultas antes fuera de alcance; Google dice
   +18 % categorías de consulta con conversión y +19 % conversiones (datos propios); se desactiva si el presupuesto limita
   (https://support.google.com/google-ads/answer/15489627, https://blog.google/products/ads-commerce/smart-bidding-exploration-ai/)
   [H, cifras de Google]. Poco relevante para leads sin valores.
7. **Herramienta nueva:** la guía de diagnóstico de Search menciona una «Bid Target Adjustment Tool» disponible desde el
   6 jul 2026 (https://support.google.com/google-ads/answer/12266223) [NV].

---

## 6. Generación y evaluación de anuncios con LLM

### 6.1 Generación

- **DeepGen (Microsoft/Bing Ads, EMNLP 2022 demo; arXiv 2208.03438):** sistema a escala web que genera anuncios y recursos
  de RSA para anunciantes de Bing, con modelos en paralelo que se pueden añadir o quitar y personalización en tiempo real
  (https://arxiv.org/abs/2208.03438v2) [H].
- **Reisenbichler, Reutterer y Schweidel, «Applying Large Language Models to Sponsored Search Advertising», Marketing
  Science 45(1), 2026:** marco **con humano en el bucle**; extrae palabras clave de los primeros resultados orgánicos y de la
  landing para guiar la generación, añade un **sistema de puntuación de contenido** y un **modelo de predicción de CPC**;
  supera a anuncios escritos por humanos y a los de LLM estándar (https://pubsonline.informs.org/doi/abs/10.1287/mksc.2023.0611;
  https://research.wu.ac.at/de/publications/applying-large-language-models-to-sponsored-search-advertising-2/) [H por
  resumen; magnitudes NV, tras muro de pago]. **Es el paper más cercano a lo que queremos hacer** (y usa SERP orgánica, que
  ya tenemos con DataForSEO).
- **CTOP, «CTR-Driven Ad Text Generation via Online Feedback Preference Optimization» (arXiv 2507.20227):** RAG con
  ejemplos de razonamiento + DPO con pares ponderados por ganancia de CTR y confianza; mejora CTR online en una tienda
  grande (https://arxiv.org/abs/2507.20227) [H]. Requiere reentrenar el modelo: **no aplicable para nosotros**; lo
  transferible es usar el historial de recursos que funcionaron como ejemplos.
- **MarketingFM (arXiv 2506.17863, workshop KDD 2025):** textos por palabra clave + **AutoEval**: reglas + LLM como juez,
  validado con A/B online; critica que el contenido es genérico y poco alineado con la landing
  (https://arxiv.org/abs/2506.17863v1) [H].
- **OKG / OMS (Sony, COLING 2025 Industry; arXiv 2412.03577 y 2507.02353):** agentes que generan palabras clave vigilando
  KPIs en línea (impresiones, clics, conversiones) y autoevaluando su calidad, sin datos de entrenamiento
  (https://aclanthology.org/2025.coling-industry.10.pdf, https://arxiv.org/abs/2507.02353) [H, resumen; cifras NV].
- **Interactor (arXiv 2606.15911):** RL agéntico para descripciones de anuncios en búsqueda patrocinada, con juez LLM de
  **coherencia con la landing** (https://arxiv.org/pdf/2606.15911) [H, resumen].

### 6.2 Evaluación antes de publicar

- **AdTEC (arXiv 2408.05906):** benchmark público de calidad de textos de anuncios de búsqueda (japonés, CyberAgent) con
  tareas de aceptabilidad, consistencia anuncio-landing, etc.; motivación: verificar con humanos cada texto es caro
  (https://arxiv.org/html/2408.05906v1) [H].
- **Juez de anclaje en la landing (Interactor):** cada afirmación del anuncio debe tener base explícita en la landing; si
  no, «Fail», aunque parezca razonable [H, resumen]. **Esto es lo que evita alucinaciones caras** («financiación 0 %»,
  «24 h» o «garantía 5 años» que el cliente no ofrece) [P].
- **Predicción de CTR antes de publicar:** los sistemas grandes entrenan modelos con millones de impresiones; nosotros no
  [P]. Alternativas viables: (a) **comparaciones por pares** con un juez LLM calibrado con las etiquetas de rendimiento de
  recursos (Bajo/Bueno/Mejor) y las impresiones/CTR históricos de las 25 cuentas; (b) reglas de sector (precio, urgencia,
  zona, prueba social) aprendidas de nuestro histórico; (c) lanzar y dejar que el bandit de Google y nuestras pruebas
  secuenciales decidan. Ser honestos: la precisión de un predictor así está por medir.
- **Estudios de campo sobre anuncios generados por IA [H]:** «AI in Disguise» (Taboola/Columbia/Harvard/TUM): en 4.633
  anuncios emparejados, sin desventaja de CTR para imágenes de IA; ganan cuando **no parecen de IA**
  (https://www.columbia.edu/~on2110/Papers/AI_in_disguise.pdf). Estudio en la Red de Display de Google: anuncios 100 % IA
  +19 % CTR frente al control humano; **etiquetar «generado por IA» bajó el CTR ~31,5 %**
  (https://the-decoder.com/telling-consumers-an-ad-is-ai-generated-cuts-clicks-by-31-percent-study-finds/) [H, vía prensa;
  publicación NV]. Son imágenes/display, no texto de búsqueda: transferibles con cautela.

### 6.3 Relevancia anuncio-landing

- Literatura: AdTEC (consistencia), MarketingFM (alineación), Interactor (anclaje), Reisenbichler et al. (usa la landing
  como fuente). [H]
- **Para nuestro módulo [P]:** el rastreador SEO ya tiene el texto de cada página. Puntuación de «sintonía» por grupo de
  anuncios = similitud de embeddings (palabras clave ↔ títulos ↔ H1/título/contenido de la landing) + juez LLM de anclaje +
  señales reales (porcentaje de rebote/scroll de Clarity, CR de la landing en GA4, velocidad CrUX). Es el componente
  «experiencia en la página de destino» del nivel de calidad hecho explícito y accionable.

---

## 7. Agentes de IA para marketing y publicidad (2024-2026)

### 7.1 Arquitecturas publicadas

- **Anthropic, «Building effective agents» (dic. 2024):** distinguir *workflows* (rutas de código predefinidas con LLM) de
  agentes (el modelo decide); empezar por lo más simple; patrón **evaluador-optimizador** cuando hay criterios claros de
  evaluación (https://www.anthropic.com/research/building-effective-agents) [H; la página avisa de que parte de las
  herramientas cambió].
- **Pixie (arXiv 2611.10016, MLDS 2025):** sistema multiagente para marketing digital (Meta, Google): agente orquestador +
  agentes por tarea + **agentes revisores/de conciliación**; usa guías de estrategia de expertos y documentación de modelos
  estadísticos propios; tareas: análisis de causas, informes, investigación y planificación; evaluado por expertos y por
  varianza de salidas; dicen que multiagente mejora a un solo agente (https://arxiv.org/abs/2611.10016) [H, resumen; sin
  cifras].
- **HOBA (arXiv 2607.24779):** agentes LLM jerárquicos que fijan **hiperparámetros** de puja, con salidas **recortadas de
  forma dura** para que la variabilidad del razonamiento no llegue a la ejecución (https://arxiv.org/pdf/2607.24779) [H,
  resumen]. **Es el patrón de seguridad a copiar.**
- **AdsWorldEngine (arXiv 2608.13833):** agente publicitario conversacional que coevoluciona orquestador y herramientas
  (https://arxiv.org/pdf/2608.13833) [H, título].
- **AdNanny (arXiv 2602.01563):** un solo LLM de razonamiento ajustado para todas las tareas offline de anuncios (incluida
  la relevancia consulta-anuncio) (https://arxiv.org/html/2602.01563v1) [H, título].
- **Google:** Marketing Advisor (agente en Chrome, GML 2025), Ads Advisor y Analytics Advisor dentro de los productos
  (desplegados a cuentas en inglés) y **Ask Advisor** (mayo 2026), agente transversal
  (https://blog.google/products/ads-commerce/ai-agents-marketing-advisor/, https://blog.google/products/ads-commerce/ask-advisor/,
  https://adexchanger.com/ai/google-rolls-out-chatbot-agents-for-marketers/) [H]. Competencia directa en «chat sobre la
  cuenta»; no en vigilancia multicuenta con contexto del cliente.

### 7.2 Evaluación de agentes

- **Business Arena (arXiv 2608.08621):** benchmark de agentes LLM en un mercado simulado con publicidad: un modelo pasó a
  presupuestos de prueba pequeños y podó campañas no rentables (ROI publicitario agregado 4,79); otro detectó retornos
  negativos pero **no ajustó presupuestos de forma consistente** (https://arxiv.org/pdf/2608.08621) [H, resumen]. Lección:
  detectar no es actuar bien; hay que evaluar la acción.
- **ToolEmu (ICLR 2024, arXiv 2309.15817):** emulador de herramientas con LLM para probar riesgos de agentes; 36 kits de
  herramientas de alto riesgo y 144 casos; **incluso el agente más seguro falla el 23,9 % de las veces** según el evaluador; el
  68,8 % de los fallos detectados fueron validados por humanos (https://arxiv.org/abs/2309.15817v2) [H]. Lección: antes de
  dejar actuar al agente, probarlo contra una cuenta simulada.
- **Propuesta de evaluación [P]:** (1) **conjunto de casos de oro** con revisiones históricas de Eury (qué vio, qué hizo) y
  casos sintéticos con fallo conocido (etiqueta rota, competidor nuevo, presupuesto agotado, landing caída); (2)
  **backtesting**: reproducir el agente sobre datos pasados y comparar su diagnóstico con lo que se supo después; (3) tasa de
  acierto de recomendaciones medida con §4.5; (4) tasa de alertas útiles (botón útil/no útil).

### 7.3 Riesgos y controles

- **Alucinación:** en textos (afirmaciones no presentes en la landing/ficha → juez de anclaje), en diagnóstico (causas
  inventadas → el LLM solo puede citar causas que el código haya calculado: descomposición, cambios, subastas).
- **Acciones irreversibles o caras:** límites duros en código (máx. % de cambio de presupuesto/objetivo por día y por
  semana, nunca superar el presupuesto mensual del contrato de la ficha, nunca pausar marca ni la única campaña activa),
  **simulación previa** (simuladores de Google, §5.1), aprobación humana por nivel de riesgo y **vuelta atrás automática** si
  las métricas de protección caen [P].
- **Memoria de lo que funcionó:** Reflexion (Shinn et al., 2023) guarda reflexiones en memoria episódica; ExpeL (Zhao et
  al.) destila «insights» de éxitos y fallos y los recupera (https://arxiv.org/html/2308.10144v3,
  https://www.arxiv.org/pdf/2303.11366v4) [H]. **Crítica clave:** «Honest Lying» (arXiv 2605.29463) muestra que estas
  memorias asumen que la reflexión es causalmente correcta; con señales ruidosas, una regla equivocada se atrinchera y se
  aplica a todo, y el agente puede concluir que algo «nunca funciona» y no volver a probarlo
  (https://arxiv.org/pdf/2605.29463) [H, resumen]. En publicidad, con datos ruidosos, esto es un riesgo real. **Solución
  [P]:** la memoria guarda **resultados medidos con su incertidumbre** (§4.5), con caducidad y con exploración mínima
  (seguir probando de vez en cuando lo que «no funcionó»), no conclusiones en prosa del agente.

---

## Ideas para nuestro módulo

1. **Motor estadístico propio antes que el LLM.** Una capa de código (`lib/ads/stats/`) con: beta-binomial jerárquico
   (término → … → sector), probabilidades de Poisson para rachas sin conversión, nowcasting por retraso, descomposición
   LMDI de KPIs y CPA marginal. El LLM solo **explica y prioriza** lo que esa capa calcula. Barato, explicable y testeable.
2. **«Prior del sector» multicuenta.** Con 25+ cuentas, crear perfiles de referencia por sector (CR, CPC, CTR, retraso de
   conversión, curva de presupuesto) normalizados por tipo de conversión. Una cuenta nueva o un término nuevo arranca con el
   prior del sector, no de cero. Nadie más tiene ese dato con la ficha de negocio al lado.
3. **Alerta «X días sin convertir» con probabilidad y causa.** Avisar cuando `P(0 conversiones en k días | lo esperado) < 2 %`
   (ajustado por día de la semana, festivos de la zona y retraso), y adjuntar la descomposición: demanda (GSC), cuota
   perdida (presupuesto/ranking), CPC/competencia (subastas), CTR, CR de la landing (GA4/Clarity), cambios en la web,
   seguimiento roto (Ads vs CRM).
4. **Detector de seguimiento roto** (conversiones caen a 0 o divergen del CRM con clics y sesiones normales) → propuesta de
   **exclusión de datos** para Smart Bidding el mismo día. Ahorra semanas de pujas envenenadas.
5. **Cascada de términos de búsqueda:** reglas de sector y zona → embeddings contra ficha/GSC → Haiku solo en zona gris →
   evidencia bayesiana → comprobación de conflictos → propuesta con nivel (término/lista compartida) y motivo.
6. **Optimización hacia leads cualificados:** usar GoHighLevel para importar conversiones offline con valor (lead
   cualificado, venta) y medir CPA de lead **cualificado** por término. Es la palanca más grande frente a Smart Bidding.
7. **Reparto de presupuesto entre campañas** de una cuenta igualando CPA marginal estimado (simuladores de Google + cuota
   perdida por presupuesto + prior del sector), con límites de cambio y dentro del presupuesto del contrato.
8. **Registro de acciones con predicción previa y evaluación posterior** (§4.5), y **experimentos de agencia aleatorizados**
   entre entidades para recomendaciones de bajo riesgo. Con el tiempo: tabla «qué funciona, en qué sector, con qué
   probabilidad».
9. **Generador de anuncios anclado:** ficha + landing rastreada + SERP orgánica/competidores (DataForSEO) → generación →
   reglas (límites de caracteres, políticas, sin afirmaciones no presentes) → juez de anclaje → comparación por pares con
   el histórico → humano aprueba.
10. **Puntuación de sintonía palabra-anuncio-landing** por grupo de anuncios, con señales reales (GA4, Clarity, CrUX).
11. **Evaluación del agente**: casos de oro de Eury, backtesting sobre histórico y botón útil/no útil en cada alerta.
12. **Elección de modelos (directiva de optimización de IA):** clasificación de términos y relevancia → embeddings + Haiku;
    diagnóstico multicausa → Sonnet sobre datos ya calculados; estrategia trimestral de cuenta → Opus ocasional. Detección
    de anomalías, shrinkage, nowcasting y reparto de presupuesto → **sin IA**.

## Lo que nadie hace bien (huecos de mercado)

- **Pocos datos.** Las herramientas de mercado aplican umbrales fijos («>150 clics sin conversión») pensados para cuentas
  grandes; no hay ninguna que use shrinkage jerárquico ni priors de sector entre cuentas para cuentas pequeñas.
- **Retraso de conversión en alertas.** Casi todas las alertas comparan «ayer» con la media, sin completar el retraso: falsas
  alarmas cada mañana, o alarmas tardías si se espera a datos completos.
- **Medir si las recomendaciones funcionan.** Google y terceros recomiendan, pero no publican la tasa de acierto de sus
  recomendaciones ni la miden por cuenta. El «Optimization Score» mide adopción, no efecto.
- **Explicar el porqué con datos fuera de Google Ads.** Explanations de Google solo ve Google Ads; no ve la landing caída,
  el formulario roto, el cambio en la web, la demanda orgánica ni la calidad del lead en el CRM.
- **Incrementalidad para pequeños.** Conversion Lift, geo-experimentos y MMM quedan fuera de su alcance; el diseño de
  experimentos aleatorizados **entre cuentas de una agencia** es un hueco real.
- **Memoria fiable.** Los agentes de marketing que se anuncian guardan «aprendizajes» en prosa; ninguno documenta memoria
  basada en efectos medidos con incertidumbre.

## Lo no verificado (comprobar antes de usarlo como hecho)

- Cifras internas de los papers que solo vi en resumen: AAAI de negativas, OMS/OKG, Pixie, Interactor, AdTEC, MarketingFM,
  Reisenbichler et al. (muro de pago), arXiv 2504.21398.
- Identificadores arXiv con numeración de 2026 (2604.26266, 2605.29463, 2606.15911, 2607.24779, 2608.08621, 2608.13833,
  2608.29735, 2611.10016): existen según el buscador, pero no abrí todos; comprobar fecha y contenido.
- Umbral de conversiones recomendado para tCPA/tROAS (15-30/30 días) y duración del periodo de aprendizaje: no confirmado
  en la doc vigente.
- Tiempo de espera para rellenar tras una exclusión de datos: dos páginas de Google dicen 5 y 14 días.
- Campos exactos de `TargetCpaSimulationPoint` / `BudgetSimulationPoint` en la API vigente; si Explanations se puede leer por
  API.
- «Bid Target Adjustment Tool» (6 jul 2026).
- Estudio de la Red de Display (+19 % CTR, −31,5 % con etiqueta IA): visto vía prensa; revista no verificada.
- Afirmaciones sobre AI Max (menos de la mitad de términos con palabra clave; «99 % de impresiones sin conversión» de Monks):
  anécdotas de practicantes, no estudios controlados.
- Referencias canónicas citadas de memoria: Prophet (Taylor y Letham 2017), Bayesian Online Changepoint Detection (Adams y
  MacKay 2007), Callaway-Sant'Anna 2021, Sun-Abraham 2021, David Robinson (empirical Bayes), LightweightMMM.
- Precios de modelos (Haiku) para el coste de clasificación: consultar con la skill de la API antes de presupuestar.

## Fuentes

**Clasificación de términos y relevancia**
- https://arxiv.org/abs/2504.21398 — Weak supervision vs LLM para intención de consultas cortas
- https://ojs.aaai.org/index.php/AAAI-SS/article/download/42932/50492/47037 — Identificación de consultas negativas (AAAI)
- https://arxiv.org/abs/2106.12700 — Walmart, SEM por grupos con embeddings
- https://arxiv.org/html/2508.03628v6 — eBay LLMDistill4Ads
- https://arxiv.org/html/2505.07105v1 — Walmart, destilación de LLM para relevancia
- https://ceur-ws.org/Vol-3843/paper_19.pdf — Walmart AdTech, clasificador consulta-anuncio
- https://ceur-ws.org/Vol-4250/paper762.pdf — Walmart INSPIRE
- https://arxiv.org/pdf/2407.14346 — Augmented Unity, contexto de consulta en búsqueda patrocinada
- https://adalysis.com/blog/n-gram-analysis-the-secret-to-scalable-search-term-management-in-google-ads/
- https://www.pemavor.com/?p=26954 — n-gramas en PPC
- https://searchengineland.com/advanced-semantic-techniques-ppc-seo-465526 (403 al abrir)
- https://searchengineland.com/generative-ai-scripts-google-ads-optimization-453065
- https://n8n.io/workflows/15385 · https://www.producthunt.com/posts/negator
- https://ppc.land/google-ads-gets-branded-search-controls-inside-ai-max/ · https://ppc.land/googles-ai-max-for-search-campaigns-deliver-meh-results-industry-tests-reveal/

**Pocos datos, shrinkage, pruebas**
- https://arxiv.org/abs/1809.02213 · https://ar5iv.labs.arxiv.org/html/1809.02213 — DHEB (Adobe)
- https://faculty.washington.edu/orutz/docs/Keywords_JMR_2012.pdf — Rutz, Bucklin, Sonnier 2012
- https://pubdata.leuphana.de/bitstream/20.500.14123/558/1/Tobias_Blask_dissertation-2018-abgabe-1.pdf
- https://arxiv.org/pdf/2101.02342 — encuesta de predicción de respuesta
- https://arxiv.org/pdf/1904.12918 — Shrinkage en experimentos online
- https://skeptric.com/pooling-proportions-empirical-bayes/
- https://martech.org/coaxing-smarter-paid-search-bidding-decisions-sparse-conversion-data/
- https://arxiv.org/abs/1811.00457 — Test & Roll (Feit, Berman)
- https://arxiv.org/pdf/2009.07899 — Comparison Lift (JD.com)
- https://arxiv.org/pdf/2103.01453 — Thompson sampling sobre creatividades compuestas
- https://support.google.com/google-ads/answer/6261395 · https://support.google.com/google-ads/answer/9232676 — experimentos
- https://support.google.com/google-ads/answer/15911255 — Campaign Guidance / Experiment Power
- https://developers.google.com/ads/blog/posts/2026/05/announcing-expanded-experiment
- https://ppc.land/google-says-80-confidence-is-good-enough-for-directional-ad-tests/

**Anomalías y retraso**
- https://arxiv.org/pdf/1704.07706 · https://www.sourceforge.net/projects/anomalydetection.mirror/ — S-H-ESD (Twitter)
- https://ar5iv.labs.arxiv.org/html/2008.09245 — descomposición robusta
- https://cran.r-project.org/web/packages/anomalize/vignettes/anomalize_methods.html
- https://ar5iv.labs.arxiv.org/html/2308.12925 — anomalías en series de bajo conteo
- https://www.evanmiller.org/poisson.pdf — Holt-Winters para Poisson
- https://arxiv.org/pdf/2208.01494 — Poisson-FOCuS
- https://bibtex.github.io/KDD-2014-Chapelle.html — Chapelle 2014, retraso de conversión
- https://arxiv.org/pdf/1802.00255.pdf — retraso no paramétrico
- https://support.google.com/google-ads/answer/9347141 · https://support.google.com/google-ads/answer/6239119 — retraso en Google Ads
- https://ppc.land/google-expert-warns-against-premature-campaign-evaluation-pitfalls/
- https://engineering.linkedin.com/blog/2019/01/introducing-thirdeye--linkedins-business-wide-monitoring-platfor
- https://engineering.linkedin.com/blog/2020/monitoring-business-performance-data-with-thirdeye-smart-alerts

**Causalidad, experimentos, incrementalidad**
- https://arxiv.org/abs/1506.00356 · https://opensource.google/projects/causalimpact — CausalImpact
- https://research.google/pubs/estimating-ad-effectiveness-using-geo-experiments-in-a-time-based-regression-framework/
- https://research.google/pubs/pub48983/ — TBR mercados emparejados
- https://ar5iv.labs.arxiv.org/html/2105.07060 — Trimmed Match Design
- https://rdrr.io/github/facebookincubator/GeoLift/f/vignettes/GeoLift_Walkthrough.Rmd — GeoLift
- https://ppc.land/google-lowers-incrementality-testing-threshold-to-5-000-for-advertisers/
- https://support.google.com/google-ads/answer/12003020 — Conversion Lift
- https://searchengineland.com/google-opens-conversion-lift-to-search-and-performance-max-494195
- https://blog.google/products/ads-commerce/meridian-marketing-mix-model-open-to-everyone/
- https://developers.google.com/meridian/docs/pre-modeling/amount-data-needed
- https://www.forrester.com/blogs/is-googles-meridian-the-right-open-source-mmm-solution-for-you
- https://support.google.com/google-ads/answer/9000655 — Explanations
- https://support.google.com/google-ads/answer/12266223 — fluctuaciones en Search
- https://support.google.com/google-ads/answer/16450159 — experimentos de AI Max
- https://engineered.at/articles/answering-why-did-the-kpi-change-using-decomposition
- https://us.fitgap.com/stack-guides/explaining-kpi-trends-with-mix-vs-rate-driver-decomposition
- https://arxiv.org/pdf/2604.26266 · https://arxiv.org/pdf/2608.29735 — atribución de cambios de métricas

**Presupuesto y puja**
- https://arxiv.org/abs/cs/0612052 — Feldman et al. 2007
- https://arxiv.org/abs/cs/0612072v2 — modelos estocásticos de presupuesto
- https://support.google.com/google-ads/answer/12850633 — CPA/ROI marginal
- https://developers.google.com/google-ads/api/fields/v22/campaign_simulation
- https://www.optmyzr.com/blog/smart-bidding-budget-caps-guide/
- https://searchengineland.com/ppc-budgeting-adjust-scale-optimize-data-452493
- https://support.google.com/google-ads/answer/10370710 · https://developers.google.com/google-ads/api/docs/campaigns/bidding/data-exclusions
- https://support.google.com/google-ads/answer/9461281 — ajustes de estacionalidad
- https://services.google.com/fh/files/misc/smartbiddingbestpractices1s.pdf
- https://support.google.com/google-ads/answer/15489627 · https://blog.google/products/ads-commerce/smart-bidding-exploration-ai/
- https://arxiv.org/abs/2304.00999 · https://engineering.zalando.com/posts/2024/09/even-ad-spend-on-zalando-homepage.html — Zalando
- https://www.uber.com/blog/euclid-marketing-engineering · https://www.uber.com/en-GB/blog/unleashing-the-power-of-ads-simulation — Uber
- https://aboutwayfair.com/careers/tech-blog/evolution-of-ads-bidding-at-wayfair — Wayfair
- https://dblp.dagstuhl.de/rec/conf/sigir/WongCV18.html — Airbnb SEM (SIGIR 2018)
- https://blog.acolyer.org/2019/10/07/150-successful-machine-learning-models/ — Booking (KDD 2019)

**Anuncios con LLM**
- https://arxiv.org/abs/2208.03438v2 — DeepGen (Bing)
- https://pubsonline.informs.org/doi/abs/10.1287/mksc.2023.0611 — Reisenbichler, Reutterer, Schweidel (Marketing Science 2026)
- https://arxiv.org/abs/2507.20227 — CTOP
- https://arxiv.org/abs/2506.17863v1 — MarketingFM
- https://arxiv.org/html/2408.05906v1 — AdTEC
- https://arxiv.org/pdf/2606.15911 — Interactor
- https://arxiv.org/html/2412.03577v1 · https://aclanthology.org/2025.coling-industry.10.pdf — OKG
- https://arxiv.org/abs/2507.02353 — OMS
- https://www.columbia.edu/~on2110/Papers/AI_in_disguise.pdf — AI in Disguise
- https://the-decoder.com/telling-consumers-an-ad-is-ai-generated-cuts-clicks-by-31-percent-study-finds/

**Agentes**
- https://www.anthropic.com/research/building-effective-agents
- https://arxiv.org/abs/2611.10016 — Pixie
- https://arxiv.org/pdf/2607.24779 — HOBA
- https://arxiv.org/pdf/2608.08621 — Business Arena
- https://arxiv.org/pdf/2608.13833 — AdsWorldEngine
- https://arxiv.org/html/2602.01563v1 — AdNanny
- https://arxiv.org/abs/2309.15817v2 — ToolEmu
- https://www.arxiv.org/pdf/2303.11366v4 — Reflexion · https://arxiv.org/html/2308.10144v3 — ExpeL
- https://arxiv.org/pdf/2605.29463 — Honest Lying (confabulación de memoria)
- https://arxiv.org/pdf/2311.07601 — LLM en publicidad online: oportunidades y retos
- https://blog.google/products/ads-commerce/ai-agents-marketing-advisor/ · https://blog.google/products/ads-commerce/ask-advisor/
- https://adexchanger.com/ai/google-rolls-out-chatbot-agents-for-marketers/

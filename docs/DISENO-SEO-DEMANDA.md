# Diseño · SEO parte 7: demanda

**Fecha:** 2026-11-27 · **Rama:** `feature/seo-demanda` · **Lista:** parte 7 de `docs/LISTA-CERRADA-SEO.md` («Amplía la semilla; volumen, intención y grupos validados con la SERP; valor por tema»).

## Lo que ya existe
- **Mapa de palabras** (`lib/seo/mapa/`), hecho sobre Search Console:
  - temas por página dominante o por parecido (embeddings);
  - valor de negocio de cada tema (`topicValue`: servicios, lo que no quiere y lo que prefiere);
  - temporada;
  - oportunidades (página nueva, elegir página, al alcance, CTR bajo);
  - canibalización por alternancia de páginas.
- **Posiciones** (`lib/seo/posiciones/`):
  - semilla de hasta 50 búsquedas, con origen `gsc`, `servicio_zona`, `marca` o `manual`;
  - volumen de Google Ads de las búsquedas seguidas, mensual;
  - SERP semanal con `top10` (dominios), `features`, paquete local y AI Overview.
- **Falta:**
  - lo que **nadie busca todavía en su web** (demanda sin impresiones): Search Console solo ve lo que ya sale;
  - el **volumen** de los temas;
  - la **intención** real;
  - **validar con Google** si dos temas son el mismo (o uno son dos).

## Piezas
1. **Intención por la SERP** (reglas, gratis), de la última comprobación de cada búsqueda seguida:
   - `local`: paquete local;
   - `transaccional`: anuncios de compra, «comprar» o «precio»;
   - `informacional`: fragmento destacado, «la gente también pregunta» o 4 o más de los 10 primeros dominios de información (wikipedia, blogs, medios);
   - `navegacional`: marca.
   - Se ve en Posiciones y se agrega por tema. Se usa para el tipo de página en el plan: la informacional pide un artículo, no una landing.
2. **Validación de grupos con la SERP** (gratis: ya guardamos el `top10` de dominios). Dos búsquedas seguidas comparten intención si comparten **4 o más dominios del top 10** (proxy de las URLs compartidas, que no guardamos).
   - Si están en temas distintos y cada tema apunta a una página distinta de la web: hallazgo `seo.serp_same_intent` (aviso). Google las trata como la misma búsqueda; mejor una página.
   - Técnica: `canibalizacion_resuelta`.
   - Se calcula al recoger las posiciones (fuente `seo.posiciones:serp`).
3. **Volumen de los temas** (de pago, barato): una vez al mes, las 300 consultas principales de los temas activos van a `volumes()` (Google Ads, unos 0,075 $ por llamada de hasta 1000 [NV]), con el tope de gasto. El resultado va a `seo_topic_queries.volume` y a `metrics.volumen` del tema. Así se ordena por demanda real y no solo por impresiones.
4. **Ideas de palabras** (bajo demanda, con el coste visible): botón «Buscar ideas» en Palabras.
   - Con los servicios confirmados (como mucho 10 semillas) y la zona, se llama a DataForSEO `keywords_for_keywords` de Google Ads (una tarea, unos 0,075 $ [NV]).
   - Las ideas van a la tabla nueva `seo_keyword_ideas` (migración 0073): búsqueda, volumen, competencia, CPC, semilla y estado (`nueva`, `seguida` o `descartada`).
   - Se filtran por reglas: fuera la marca de otros, lo que no quiere el cliente y volumen 0.
   - La persona puede **«Seguir»** una idea (pasa a Posiciones como `manual`) o **«Descartar»**.
   - Las ideas con volumen y sin página en la web aparecen como «demanda sin página» (valor con `topicValue`).

## Puntos de vista
1. **SEO estratega:**
   - lo que más falta es la demanda que la web todavía no capta. Search Console es la verdad de lo que ya hay, no de lo que podría haber;
   - la intención según la SERP evita crear una landing donde Google quiere artículos, y al revés;
   - validar con la SERP evita fusionar temas que Google separa.
2. **Costes y arquitectura:**
   - casi todo es gratis (datos ya guardados);
   - el volumen mensual y las ideas bajo demanda caben en los 5 $;
   - una tabla nueva, `seo_keyword_ideas`, y nada en el núcleo salvo un método opcional `keywordIdeas` en `SerpSource`, aditivo y anotado.
3. **Producto:**
   - las ideas son una lista que se decide (seguir o descartar), no un volcado de 1000 palabras;
   - como mucho 100 por pasada, ordenadas por valor y volumen.

## Alternativas
| | Qué | Coste | Riesgo | Se pierde |
|---|---|---|---|---|
| **A. Reglas sobre lo guardado + volumen mensual + ideas bajo demanda (elegida)** | Lo descrito | Unos 0,08 $/mes + 0,08 $ por búsqueda de ideas | Dominios en vez de URLs para validar | Precisión de la validación |
| B. DataForSEO Labs (keyword_suggestions, intención, dificultad) | Más datos, intención ya calculada | 0,01 $ + por resultado; dificultad aparte [NV] | Coste variable | — |
| C. SERP de cada idea para validar | Validación por URL | 0,0006 $ × ideas | Más gasto y complejidad | — |
| D. No hacer nada | — | 0 | No se ve la demanda nueva | La parte 7 |

## Decisión (hipótesis)
**A.** La intención y la validación salen de lo guardado; volumen e ideas con el tope de gasto. Tabla `seo_keyword_ideas` en la migración 0073.

**Pregunta 1. ¿Cumple el objetivo final?** Sí. El sistema propone la demanda y la persona decide qué seguir.

**Pregunta 2. ¿Qué riesgo oculto tiene?** La validación con dominios da falsos «misma intención» cuando el top 10 son directorios grandes (Páginas Amarillas, Doctoralia…). Se mitiga quitando los directorios conocidos antes de comparar.

**Pregunta 3. ¿Hay algo que ya tengamos y no usemos?** Sí, y se reutiliza:
- `top10` y `features` de las posiciones;
- `topicValue`;
- `volumes()`;
- el tope de gasto.

## Auditoría independiente
_(pendiente)_

**Hecha** por un subagente Opus 5.5 con esfuerzo alto. **Veredicto:** la dirección es buena, pero la decisión A no se sostiene tal como estaba.

**Graves:**
1. `buildKeywordMap` borra `seo_topic_queries` y sustituye `metrics` en cada pasada, así que el volumen guardado ahí se perdería. Hace falta una tabla de demanda por búsqueda que el mapa lea.
2. Las posiciones son como mucho 50 búsquedas y casi no cruzan con los temas: la intención y la validación cubrirían casi nada. Hay que reabrir la alternativa C, la SERP de la búsqueda principal de los temas con más valor. Es barato.
3. Con dominios, las búsquedas locales comparten siempre directorios y redes, lo que da «misma intención» falsos. Hay que guardar las URLs del top 10.

**Importantes:**
- La intención con `paid`, «precio» y `people_also_ask` no sirve. Mejor el tipo de página del top 10 (artículo o servicio), `local_pack` y `shopping`, con una etiqueta «mixta».
- El aviso solapa con la canibalización: no abrirlo si ya hay canibalización o `topic_unclear` sobre esas URLs, ni si las dos páginas están en el top 3. Necesita receta propia.
- El volumen de las variantes de una búsqueda no se suma: se toma el máximo por forma normalizada.
- Las ideas no llegarían al plan: hace falta un hallazgo propio de «demanda sin página».
- **Precios** (comprobados por el auditor):
  - Google Ads en directo: 0,09 $ por tarea (cola estándar: 0,06 $);
  - Labs: 0,012 $ por tarea + 0,00012 $ por resultado.
- `keywords_for_keywords` de Google Ads admite ciudad y catalán.
- Al «Seguir» una idea hay que respetar el tope de 50.

**Menores:**
- filtrar las búsquedas de más de 80 caracteres;
- conservar volúmenes bajos;
- añadir el tipo nuevo al Mapa Visual;
- `null` si no se pudo decidir.

**Sobra:** la intención navegacional por marca (ya existe `esMarca`) y la promesa de «dividir temas», que no se construye.

## Decisión final, rehecha (migración 0073)
- **Tabla `seo_demand`:** demanda por búsqueda, una fila por proyecto, búsqueda normalizada e idioma. Columnas:
  - volumen, CPC, competencia y meses;
  - origen (`mapa` o `idea`) y estado (`auto`, `nueva`, `seguida` o `descartada`);
  - semilla y tema (`topic_key`);
  - búsqueda seguida en Posiciones;
  - intención, tipo de página, URLs del top 10 y fecha de la SERP.
- **Columna aditiva `seo_rank_checks.top10_urls`**, desde la próxima recogida.
- **Proceso `seo.demanda`** (mensual, editable a 30, 60 o 90 días):
  1. **Volumen** (Google Ads en directo, 0,09 $ por llamada, con el tope) de las búsquedas principales de los 300 temas con más valor, sin repetir lo de los últimos 30 días.
  2. **SERP en directo** (unos 0,002 $ cada una, con el tope) de la búsqueda principal de los 40 temas con más valor y de las ideas seguidas: URLs del top 10, intención (`local`, `transaccional`, `informacional` o `mixta`) y tipo de página dominante.
  3. **Hallazgos** (fuente `seo.demanda:serp`):
     - `seo.serp_same_intent` (aviso): dos temas con páginas distintas que comparten 4 o más URLs del top 10, sin contar la web del cliente, los directorios ni las redes. No sale si hay canibalización o `topic_unclear` abiertos sobre esas URLs, ni si las dos están en el top 3. Clave por el par de URLs. Técnica nueva `unificar_o_diferenciar`.
     - `seo.demand_no_page` (info): ideas con volumen de 20 o más sin tema con página. Ganancia = volumen × 5 % (CTR de la posición 5). Como mucho 10. Técnica nueva `pagina_demanda`.
- **El mapa lee `seo_demand`:**
  - `metrics.volumen` = suma de los máximos por forma normalizada;
  - `metrics.intencion` y `metrics.tipoPagina` salen de la búsqueda principal.
- **Ideas bajo demanda** («Buscar ideas», unos 0,09 $):
  - `keywords_for_keywords` con los servicios confirmados (como mucho 10) en la ubicación del proyecto y sin socios de búsqueda;
  - se quitan las marcas de la competencia, lo que no quiere el cliente, el volumen 0 y lo de más de 80 caracteres;
  - se guardan las 100 mejores;
  - se asignan al tema más parecido por palabras (Jaccard ≥ 0,5);
  - «Seguir» la pasa a Posiciones como `manual` si cabe en el tope de 50; «Descartar».
- **Núcleo:** `SerpSource.keywordIdeas` opcional (aditivo).

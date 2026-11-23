# Diseño técnico del Hito 2 SEO: competencia, mapa de palabras, estratega por proyecto y 3 preguntas (para aprobar)

**Fecha:** 2026-11-24 · **Depende de:** `docs/DISENO-MODULO-SEO.md` v2 (§5 fases 2-4, §10 Hito 2) y el Hito 1 en producción (migraciones 0060 y 0061).
**Estado:** propuesta. No se ha tocado el esquema.

El Hito 2 tiene cuatro piezas:
1. competencia;
2. mapa de palabras;
3. estratega por proyecto;
4. correo de 3 preguntas, más los conectores de Bing y de visitas desde IA en GA4.

Cada decisión no trivial lleva su hipótesis, tres cuestionamientos y alternativas. Marco con **[NV]** lo que no he podido verificar.

---

## 0. Lo que ya existe y se reutiliza

| Pieza | Dónde | Cómo se reutiliza |
|---|---|---|
| Detalle de Search Console (consulta × página × día) | núcleo, `gsc_*` (0060) | Fuente principal del mapa de palabras y de la canibalización. |
| Rastreador con objetivo `competidor` | núcleo, `crawl_runs.target` | Rastreo ligero de las webs de la competencia (≤ 50 páginas). |
| Competidores del cliente | núcleo, `client_competitors` | Punto de partida de la lista de competencia. |
| DataForSEO (SERP y volúmenes) | módulo Agentes, integración | Se expone al núcleo como capacidad (igual que Google con `registerMetricSource`). |
| Embeddings y HDBSCAN | `lib/ai/clustering/` (keyword research de agosto) | Agrupado semántico de las consultas sin página común. |
| Estratega | módulo Estrategia | Pasa a poder trabajar por proyecto (§3). |
| Correos a clientes con aprobación y respuestas | núcleo, `client_messages` y `registerClientReplyListener` | El correo de 3 preguntas y la lectura de las respuestas. |
| Expediente con origen y confianza | `seo_dossier_facts` (0061) | Las preguntas salen de sus huecos; las respuestas entran como datos «propuestos». |
| `perf_daily` con dimensión libre | módulo Rendimiento | Las visitas desde IA de GA4 caben sin cambiar el esquema (`dim_type = 'source'`). |

---

## 1. Competencia

**Para qué (§5 fase 2).**
- Saber quién compite de verdad en Google por los servicios del cliente: orgánico y paquete local.
- Comparar sus webs y sus reseñas con las del cliente.
- Ver los huecos: palabras por las que salen ellos y no el cliente.

**Hipótesis.** Una tabla del módulo `seo_competitors` por proyecto.

**Cuestionamientos.**
- (a) **¿Es solo de SEO?** No. Ads necesitará la misma lista (quién puja), y la ficha del cliente ya tiene `client_competitors` en el núcleo. Una segunda lista en SEO acabaría desincronizada.
- (b) **¿Por proyecto o por cliente?** La competencia depende del mercado (servicio y zona), y eso es del proyecto. Pero la mayoría de clientes tienen un proyecto, y la ficha ya la guarda por cliente.
- (c) **¿Qué pasa a semanas vista?** Si cada fuente (ficha, SERP, paquete local) escribe sin estado, la lista crece sola con directorios y marketplaces («habitissimo», «cronoshare»). Hace falta un estado («propuesto / confirmado / descartado») y una regla que filtre agregadores conocidos.

**Recomendación: ampliar el núcleo `client_competitors`** con estas columnas:
- `project_id` (opcional);
- `status` (propuesto, confirmado o descartado);
- `kind` (directo, agregador o medio);
- `evidence jsonb` (en qué búsquedas sale, posición media y si está en el paquete local);
- `last_seen`.

Los que vienen de la búsqueda entran como «propuestos» y tú confirmas, igual que en el expediente.

| Alternativa | Coste | Riesgo | Qué se pierde |
|---|---|---|---|
| **Ampliar `client_competitors` (núcleo)** | 5 columnas | Toca el núcleo | — |
| `seo_competitors` en el módulo | Tabla nueva | Dos listas que divergen; Ads no la ve | Lista común |
| Solo la ficha, sin búsqueda | Nada | No detecta la competencia real | El dato principal |
| No hacer nada | Nada | — | Toda la fase 2 |

**Cómo se rellena (sin IA):**
1. **Consultas semilla:** los temas del mapa de palabras con más impresiones (§2) y «servicio + población» de la ficha. Como mucho 20 por proyecto.
2. **SERP orgánica y paquete local** de esas consultas con DataForSEO.
3. **Recuento por dominio:**
   - un dominio que sale en al menos 3 consultas es candidato;
   - los agregadores conocidos (lista en código, ampliable) se marcan `agregador`, no `directo`.
4. **Rastreo ligero** (`crawl_runs.target = 'competidor'`, 50 páginas) de los confirmados. Con él se comparan sus páginas por servicio, sus datos estructurados y la velocidad del servidor con las del cliente.
5. **Huecos:** palabras por las que posicionan los competidores y el cliente no. Salen de los resultados de DataForSEO ya descargados (paso 2) y, si compensa, de «palabras posicionadas» de DataForSEO Labs **[NV coste]**.

**Coste [NV]:** con los precios públicos de DataForSEO, unos 0,002 $ por SERP, lo que da menos de 0,10 $ por proyecto y mes con 20 consultas. Labs es más caro: solo bajo petición.

**Reseñas de la competencia:** van con la parte local, cuando haya acceso a Places o a Business Profile (ver §6).

## 2. Mapa de palabras

**Para qué (§5 fase 3).**
- Cada tema tiene su URL o queda como «página nueva».
- Se muestran los clics anónimos y la canibalización.
- Sustituye al asistente de keyword research de agosto (que se mantiene hasta retirarlo, con tu aprobación).

**Hipótesis.** Reutilizar tal cual el pipeline de agosto (embeddings + HDBSCAN + clasificador con IA).

**Cuestionamientos.**
- (a) **¿Agrupa por lo que Google ya decide?** El pipeline de agosto agrupa por parecido de texto. Pero Search Console ya dice qué página posiciona cada consulta. Si dos consultas llevan a la misma URL, Google las trata como el mismo tema. Ese dato es gratis y más fiable que un embedding.
- (b) **¿Escala?** Un proyecto mediano tiene entre 2.000 y 20.000 consultas en 16 meses. Calcular embeddings de todas cada vez es caro y lento. Hace falta guardarlas y reutilizarlas por texto (la misma consulta en otro proyecto no se vuelve a calcular).
- (c) **¿Necesita IA?** Solo para poner nombre a los grupos (Haiku). Agrupar es matemáticas: componentes conexos por página compartida y luego HDBSCAN sobre los embeddings.

**Recomendación: un agrupado en dos pasos, sin IA salvo los nombres.**
1. **Por página compartida.**
   - Se construye un grafo consulta–página, con un enlace cuando una página tiene ≥ 20 % de las impresiones de la consulta (90 días).
   - Las componentes conexas forman los temas «con URL».
   - Una componente gigante (la portada, por ejemplo) se parte por HDBSCAN.
2. **Por parecido** (embeddings guardados) para las consultas sin página clara y para las palabras de los huecos de la competencia. Esto da temas «página nueva».
3. **Nombres:** Haiku, con un lote por proyecto y solo los 5 términos principales de cada grupo. Coste **[NV]** < 0,02 $ por mapa.
4. **Métricas de cada tema:** clics, impresiones, posición media, tendencia a 28 días, volumen (DataForSEO, solo para los temas sin datos propios) y URL asignada.
5. **Señales:**
   - **canibalización:** una consulta con ≥ 2 páginas que se turnan en el top 10 en semanas distintas (señal temporal, no un simple recuento);
   - **clics anónimos:** el total diario (`gsc_daily_totals`) frente a la suma de las consultas.
   - Las dos se convierten en hallazgos (`seo.cannibalization`, `seo.anonymous_share`) y, desde ahí, en el plan de mejora.

**Tablas (módulo SEO):**
- `seo_topics`: proyecto, nombre, url (o null = página nueva), origen (página o parecido), métricas en jsonb, estado (activo, fusionado o descartado), `run_id`.
- `seo_topic_queries`: tema y consulta (texto + hash, `gsc_query_id` opcional), origen (gsc, competencia o manual), volumen y peso.
- `seo_text_embeddings`: hash del texto, modelo, vector de 1.536 y fecha. **Se reutiliza entre proyectos.** Lleva prefijo `seo_` porque hoy solo lo usa SEO; si Ads lo necesita, se sube al núcleo **[decisión tuya]**.

| Alternativa | Coste | Riesgo | Qué se pierde |
|---|---|---|---|
| **Página compartida + parecido (recomendada)** | Gratis el 1.er paso; embeddings una vez | La regla del 20 % puede necesitar ajuste | — |
| Pipeline de agosto tal cual | Embeddings y clasificador IA en cada ejecución | Caro con miles de consultas; ignora lo que Google decide | Precisión |
| Solo página compartida | Gratis | Las palabras sin página (huecos) quedan fuera | Las páginas nuevas |
| Herramienta externa (SE Ranking) | Suscripción | Dependencia; el rediseño la retira | Control y coste |

## 3. Estratega por proyecto

**Para qué (§5 fase 4).** El estratega (Estrategia) razona hoy por cliente. Con SEO por proyecto, tiene que ver lo que sabe SEO de ese proyecto (hallazgos, plan, temas, competencia e intervenciones) y citarlo como evidencia.

**Hipótesis.** Que Estrategia lea directamente las tablas `seo_*`.

**Cuestionamientos.**
- (a) Eso es un módulo leyendo a otro: está prohibido (CLAUDE.md y barreras de arquitectura).
- (b) Lo que el estratega necesita ya es, en parte, del núcleo: `findings`, `interventions` y `crawl_*`. Lo único propio de SEO son el plan y los temas.
- (c) ¿Dos planificadores compiten por las horas? Sí, si los dos proponen sin verse. El estratega debe ver las propuestas pendientes del plan de SEO, y el plan de SEO ya ve los encargos abiertos.

**Recomendación: un contrato del núcleo `registerProjectDossier(provider)`.**
- SEO registra una función que devuelve un resumen pequeño del proyecto: hallazgos agrupados por tipo, propuestas pendientes con sus horas, los 10 temas principales con su tendencia y la competencia confirmada.
- Estrategia la llama al montar su expediente y cita esos datos como evidencia.
- Sin tablas nuevas. Estrategia gana un `project_id` opcional en sus análisis.
- Esto último sí es una columna en `est_analyses` y `est_suggestions` del módulo Estrategia; el cambio de esquema es pequeño, pero te lo pido.

| Alternativa | Coste | Riesgo | Qué se pierde |
|---|---|---|---|
| **Contrato del núcleo (recomendada)** | Una función en `capabilities.ts` + `project_id` en Estrategia | — | — |
| Estrategia lee `seo_*` | Mínimo | Rompe las barreras; acoplamiento | La arquitectura |
| Un estratega propio en SEO | Duplicar el estratega | Dos planes compitiendo por las horas | Coherencia |
| Seguir por cliente | Nada | El estratega no ve lo de SEO | Calidad de las propuestas |

## 4. Correo de 3 preguntas

**Para qué (§5 «Completar el expediente»).** Hasta 3 preguntas al cliente, solo lo que el sistema no ha podido averiguar solo.

**Cómo (sin IA para elegir las preguntas):**
- **Candidatas,** por reglas sobre el expediente:
  - datos de la ficha que faltan (teléfono, dirección, servicios, zona);
  - datos con conflicto entre fuentes («¿el teléfono bueno es el 93… o el 91…?»);
  - datos con confianza < 60.
- **Se eligen las 3 que más pesan** (identidad > NAP > servicios > el resto).
- **El texto lo pone una plantilla,** no la IA.
- **Envío:** `createClientMessage(kind = 'preguntas')` del núcleo, con tu aprobación mientras esté activada y a los contactos marcados para «preguntas». Como mucho un correo por proyecto cada 30 días.
- **Respuestas:** `registerClientReplyListener` (ya existe). Haiku extrae cada respuesta a su campo («propuesto», origen `cliente`, con la cita literal). **Tú confirmas.**
- **Esquema:** añadir `cliente` a los orígenes permitidos de `seo_dossier_facts` (cambiar un CHECK).

**Modelo:** Haiku solo para extraer las respuestas. Es clasificación con cita, no razonamiento. Coste **[NV]** < 0,005 $ por respuesta.

## 5. Conectores

- **Visitas desde IA en GA4:** la fuente de Google (Agentes) añade una descarga diaria de sesiones por `sessionSource` filtrada a asistentes de IA. La lista va en código: chatgpt.com, perplexity.ai, gemini.google.com, copilot.microsoft.com, claude.ai y otros. Se guarda en `perf_daily` con `dim_type = 'source'`, **sin cambiar el esquema**. Sale en Rendimiento y en el expediente del estratega.
- **Bing Webmaster:**
  - necesita una **clave de API de Bing Webmaster** (la generas tú en bing.com/webmasters → Configuración → Acceso a la API);
  - descarga diaria de clics e impresiones y top de consultas;
  - `perf_daily` necesita aceptar `bing` en su CHECK de origen (cambio de esquema pequeño).
- **Propiedades sociales en Search Console** (función de julio de 2026) e **informe de IA de Search Console:** **[NV]** no sé si ya salen en la API pública. Lo compruebo antes de construir nada; si no salen, se quedan fuera del Hito 2.

## 6. Reseñas y ficha de Google: una vía que quizá no necesita Places

El módulo Agentes ya llama a la **API de Business Profile** con tu conexión de Google (`gbpLocations`), y esa API exige que Google haya aprobado el acceso del proyecto de Cloud.
- Si en producción funciona (pregúntale al agente por Telegram «¿qué fichas de Google tenemos?»), probablemente también funciona la de **reseñas (v4)**, que además permite **responder**. **[NV]**
- En ese caso, la parte local se haría así, mejor que con Places (que solo da 5 reseñas y no permite responder):
  - Agentes registra en el núcleo una fuente de reseñas, igual que las métricas;
  - SEO la usa para `seo_reviews`.
- Places solo haría falta para las fichas de la competencia.

## 7. Lo que pido (migración 0062)

1. **Núcleo:** 5 columnas en `client_competitors`: `project_id`, `status`, `kind`, `evidence` y `last_seen`.
2. **Núcleo:** el contrato `registerProjectDossier` (sin tabla).
3. **SEO:** tablas `seo_topics`, `seo_topic_queries` y `seo_text_embeddings`.
4. **SEO:** origen `cliente` en `seo_dossier_facts`.
5. **Estrategia:** `project_id` opcional en `est_analyses` y `est_suggestions`.
6. **Rendimiento:** `bing` en el CHECK de `perf_daily.source`, solo si quieres Bing ya.
7. **Accesos tuyos:**
   - DataForSEO conectado en producción (Agentes → Integraciones), si no lo está;
   - la clave de Bing Webmaster (opcional);
   - comprobar si la API de Business Profile responde (§6).

**Orden de construcción tras tu OK:**
1. Mapa de palabras: depende solo de Search Console, que ya está.
2. Competencia: usa los temas como semillas.
3. Estratega por proyecto.
4. Correo de 3 preguntas.
5. Visitas desde IA.
6. Bing.

## 8. Sin verificar

- Precios actuales de DataForSEO (SERP, paquete local, Labs).
- Si la API de Business Profile y la de reseñas v4 responden con nuestra conexión.
- Si la API de Search Console ya da las propiedades sociales y el informe de IA.
- El umbral del 20 % del agrupado por página compartida: se ajustará con CM Ibérica.

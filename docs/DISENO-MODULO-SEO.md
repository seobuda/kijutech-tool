# Diseño del departamento SEO (propuesta para aprobar)

**Fecha:** 2026-11-23 · **Estado:** propuesta, sin construir · **Pedido por Enric:** «tratar a todos los clientes como nuevos» y una prueba real de punta a punta del SEO.

Este documento sale de cinco investigaciones hechas el 23 nov:
- SEO profesional en 2026;
- arrancar con lo mínimo y la psicología de uso;
- el departamento de I+D;
- fuentes de datos y precios;
- el inventario del código actual.

Marcas en los datos externos: **[V]** comprobado en la fuente oficial; **[V2]** fuente secundaria o estudio de un proveedor; **[NV]** sin verificar. Los precios cambian: se vuelven a comprobar antes de gastar.

---

## 1. Qué queremos conseguir

- **Cerebro vivo del SEO de cada proyecto.**
  - Sabe qué hay que hacer.
  - Lo propone y lo convierte en encargos.
  - Vigila que se haga y mide el resultado en Google Search Console (GSC).
- **Arranque sin fricción.** Con el nombre o la web del cliente, el sistema empieza a trabajar el mismo día. Lo que falte se completa después:
  - por correo al cliente;
  - con un audio de Enric;
  - con la transcripción de una reunión.
- **Varios proyectos por cliente.** Otra web, otra línea de negocio u otra ciudad son proyectos distintos, con su propia estrategia.
- **Búsqueda en Search Console como fuente de verdad.**
  - SE Ranking no se renueva.
  - El equipo se mide por lo que aparece en GSC: clics no de marca, impresiones de páginas nuevas y URLs indexadas.
  - No se mide por herramientas de posiciones.
- **Nunca quedarse atrás.** Un departamento de I+D vigila los cambios de Google y las técnicas nuevas, y propone cambios en la base de conocimiento y en las reglas de auditoría.
- **La formación sigue, pero dentro del trabajo y no como asistente.** Cada hallazgo y cada fase enlaza a su explicación en la base de conocimiento («por qué importa esto»).

## 2. Lo que dice la investigación (lo que cambia el diseño)

1. **No hay metodología estándar** [V2]. Las agencias de referencia repiten este patrón:
   - descubrir;
   - auditar;
   - investigar palabras y la competencia;
   - hoja de ruta;
   - ejecutar;
   - informar;
   - volver a prever cada trimestre (Kevin Indig).

   **Cadencias habituales:**
   - diario: alertas;
   - semanal: oportunidades;
   - mensual: informe, rastreo, Core Web Vitals, visibilidad en IA y competencia;
   - trimestral: hoja de ruta, auditoría de contenido y análisis tras cada core update.
2. **Auditoría: la mayoría se resuelve con código, sin IA.** Por código:
   - estados y redirecciones;
   - robots, noindex y canonical (también antes y después del JavaScript);
   - sitemaps, hreflang y paginación;
   - títulos, H1 y estructura;
   - duplicados (hash y MinHash) y contenido escaso;
   - enlazado interno (huérfanas, profundidad, PageRank interno);
   - Core Web Vitals por CrUX;
   - HTTPS, contenido mixto y móvil;
   - JSON-LD.

   **La IA solo hace falta para el juicio:**
   - intención;
   - calidad;
   - E-E-A-T;
   - priorizar por impacto en el negocio.

   Google añadió en octubre de 2026 cuatro atributos de calidad (esfuerzo, originalidad, talento y exactitud) y llama engaño a los perfiles de autor inventados [V2].
3. **Datos estructurados** [V]:
   - **FAQ está muerto:** Google dejó de mostrarlo el 7 de mayo de 2026. Otros 7 tipos se retiraron en 2025.
   - **Vigentes y útiles para nuestros clientes:**
     - LocalBusiness con su subtipo más concreto;
     - Organization;
     - BreadcrumbList;
     - Product + Offer + política de devoluciones;
     - Article con autor real;
     - Review snippet y Video.
   - **Service** no da resultado enriquecido, aunque sirve de contexto.
   - **Trampa:** las reseñas de un negocio sobre sí mismo en su propia web **no** dan estrellas.
   - **No hay API del Rich Results Test.** Se valida con reglas propias sacadas de la documentación de Google y con URL Inspection por muestreo.
   - **Generación segura:** plantillas que se rellenan **solo** con datos verificados de la ficha; la IA solo propone el subtipo.
4. **Búsqueda con IA.**
   - Google dice que el GEO es SEO: no hacen falta llms.txt ni «schema para IA» [V].
   - **Lo que tiene evidencia:**
     - menciones de marca y medios ganados, que pesan mucho más que los enlaces para salir en la IA (Ahrefs: 0,664 frente a 0,218; Chen et al. 2025);
     - listas «mejores X» de expertos, el factor nº 1 de visibilidad en IA según Whitespark 2026;
     - contenido con datos propios (paper GEO de Princeton).
   - La «posición» en un LLM es ruido (SparkToro): se mide la frecuencia de aparición.
   - **GSC ya da impresiones en AI Overviews y AI Mode** desde mayo de 2026 [V]. Bing da citas con sus consultas.
5. **GSC da mucho más de lo que descargamos ahora** [V]:
   - 25.000 filas por petición y unas 50.000 al día por propiedad;
   - clasificación marca/no marca desde el 16 de noviembre de 2026;
   - exportación a BigQuery con todas las filas (gratis dentro del cupo).

   Lo que no da:
   - Las consultas anonimizadas: entre el 45 % y el 80 % de los clics en un sitio típico [V2]. Hay que enseñar siempre ese porcentaje.
   - Comparaciones limpias por la ruptura de septiembre de 2025 (`num=100`), que hay que anotar en las gráficas.

   **Hoy guardamos solo las 1.000 consultas y páginas top de cada mes: se queda muy corto.**
6. **SEO local (Whitespark 2026):**
   - **Mapa:** la categoría principal de la ficha de Google es el factor nº 1.
   - **Orgánico local:** una **página dedicada a cada servicio** es el factor nº 1.
   - **Tendencia:** las reseñas ganan peso.
   - La API de preguntas y respuestas de la ficha se cerró en noviembre de 2025.
7. **Arrancar con lo mínimo (psicología):**
   - Cada campo de un formulario cuesta abandono, y es más fácil **confirmar que escribir** (NN/g).
   - Capturar sin devolver un plan deja la cabeza ocupada: hay que «cerrar el ciclo» (Masicampo y Baumeister 2011).
   - Los avisos repetidos se ignoran (49-96 % en estudios clínicos).
   - Los correos con **1-3 preguntas** reciben un 50 % más de respuestas (Boomerang).
   - En dueños con perfil TDAH, lo que funciona es **delegar lo rutinario**, no «organizarse más».
   - Los LLM inventan más datos de pymes (≈5 %) que de grandes marcas. Para datos duros (horario, categoría, dirección) la fuente es Google Places, no la IA.
8. **I+D.**
   - Reddit quitó el RSS (13 de noviembre de 2026) y cierra su API pública en marzo de 2027: se lee solo por búsqueda web.
   - La búsqueda web de Claude cuesta 10 $ cada 1.000; leer páginas solo cuesta los tokens [V].
   - La norma UNE 166006 de vigilancia tecnológica dice que se empieza por **las preguntas que nos importan**, no por las fuentes.
9. **Google Ads.** Los developer tokens figuran como **retirados desde el 9 de septiembre de 2026** [V]; el acceso va ahora por proyectos de Google Cloud. **No hay que pedir el token que estaba pendiente**: hay que leer la guía nueva.

## 3. La propuesta

### 3.1 La unidad: el proyecto SEO

- **Un proyecto pertenece siempre a un cliente.** Un cliente puede tener varios proyectos.
- **Cada proyecto tiene su alcance:**
  - sus webs o dominios;
  - su propiedad de Search Console (y Analytics);
  - sus fichas de Google (una por sede);
  - sus líneas de servicio;
  - sus zonas.

  Todo sale de las «Webs y cuentas» que ya tiene la ficha del cliente: el proyecto elige cuáles son suyas.
- **Cada proyecto tiene, de forma independiente:**
  - su expediente;
  - su auditoría;
  - su competencia;
  - su mapa de palabras;
  - su plan de seguimiento;
  - su estrategia;
  - sus objetivos.
- **Ahora es el momento barato de hacerlo:**
  - Estrategia tiene **0 clientes con plan**.
  - El SEO antiguo tiene **1 proyecto de prueba**.
  - Pasar de «por cliente» a «por proyecto» no obliga a migrar datos reales.

### 3.2 El circuito de un proyecto

Todo corre solo en segundo plano. Enric y el equipo solo ven **propuestas que deciden con un botón**, y **avisos por excepción**.

**Fase 0. Alta mínima (minutos).**
- **Qué se da:** el nombre o la web. También vale un audio («nuevo proyecto SEO para Clínica X, quieren crecer en implantes en Bilbao»).
- **Identidad:** se confirma con **dos señales que coincidan** (dominio, teléfono, dirección o ficha de Google). Si hay dudas, Enric elige entre 2-3 fichas con un toque.
- **Lo que se recoge solo:**
  - la web del cliente (servicios, zonas, tono, propuesta de valor, NAP, datos estructurados);
  - Google Places (categoría, valoración, reseñas);
  - Wayback (historia de la web: migraciones, servicios antiguos);
  - la búsqueda de su marca;
  - GSC, si ya hay acceso.
- **Expediente provisional:** cada dato lleva **origen, confianza y estado** (propuesto, confirmado o en disputa). Enric lo revisa como una lista de «¿es correcto?», sin escribir nada.
- **Cierre del ciclo:** el sistema dice qué hará y cuándo («auditoría en marcha, mañana tienes el diagnóstico; el lunes pregunto al cliente X»).

**Fase 1. Diagnóstico automático (día 0-1).**
- **Auditoría determinista:**
  - rastreo de la web con sitemaps y robots;
  - todas las comprobaciones del punto 2.2;
  - CrUX y PageSpeed;
  - URL Inspection por muestreo de las URLs clave;
  - **cruce con GSC:** páginas con impresiones que el rastreo no encuentra, páginas huérfanas y lo indexado frente al sitemap.

  Cada hallazgo se guarda con su gravedad, su URL y **la regla que lo detectó**. Las reglas tienen versión, para que el I+D pueda proponer cambiarlas.
- **Datos estructurados:**
  - se detecta y valida el JSON-LD de cada plantilla de página;
  - lo que falta o está mal se convierte en **un encargo con el código JSON-LD listo para pegar**, generado por plantillas con los datos de la ficha;
  - se bloquea lo que no da resultado o es arriesgado: FAQPage para buscar estrellas, `aggregateRating` del propio negocio.
- **Local:**
  - ficha de Google: categoría principal, horarios, atributos, fotos y publicaciones;
  - reseñas: ritmo, nota, porcentaje respondido, y borradores de respuesta que Enric aprueba;
  - coherencia del NAP entre la web, el JSON-LD y la ficha;
  - **una página por servicio**, con alerta si las páginas de localización son casi copias.
- **Capa de juicio (IA):** prioriza por impacto en el negocio, valora la intención y la calidad de las páginas clave, y redacta el **plan de mejora** como propuestas → encargos (el mismo mecanismo que ya usa el estratega).

**Fase 2. Mercado y competencia (día 1-3).**
- **De dónde salen los competidores:**
  - los que diga el cliente;
  - los del paquete local de Google para cada servicio y zona (Places);
  - los competidores en orgánico (DataForSEO, puntual).
- **Qué se mira de cada uno:**
  - rastreo ligero: arquitectura, páginas de servicio y localización, plantillas, schema y ritmo de publicación;
  - CrUX, que es público;
  - nota y reseñas;
  - un resumen de sus mensajes y su propuesta de valor hecho por la IA.
- **Huecos:** las palabras por las que ellos aparecen y el cliente no (DataForSEO Labs, unos céntimos por competidor), y las listas «mejores X» y medios del sector donde salen ellos y no el cliente. De ahí salen tareas de autoridad y menciones.
- **Lo que no se promete:** su tráfico ni sus posiciones exactas.

**Fase 3. Mapa de palabras clave (día 2-5).**
- **Fuentes:**
  - GSC (consultas reales, marca/no marca);
  - las palabras de la competencia;
  - las líneas de servicio del expediente;
  - los volúmenes de DataForSEO (céntimos por cada mil palabras).
- **Agrupación:** se reutiliza el motor de agosto (embeddings y agrupación matemática), añadiendo como señal que **dos consultas que llevan a la misma URL** suelen ser la misma intención. La IA solo pone nombre a los grupos.
- **Resultado: el mapa del proyecto.** Cada tema queda asignado a una URL existente o a «página nueva», con su prioridad.
- **Detectores sobre GSC:**
  - canibalización con señal temporal (las URLs se alternan; no basta con «dos URLs»);
  - consultas al alcance (posición 4-20);
  - huecos de contenido;
  - el porcentaje de clics anonimizados, siempre visible.
- El mapa queda **guardado en la herramienta**, con enlace público para el cliente (ya existe), y nunca más disperso en Drive.

**Fase 4. Estrategia y hoja de ruta.** El estratega (Opus, ya construido) recibe el expediente, la auditoría, la competencia y el mapa, y propone:
- una hoja de ruta trimestral;
- encargos priorizados por impacto, confianza y horas, dentro de las horas contratadas;
- objetivos en cifras de GSC.

**Fase 5. Vida continua (siempre).**
- **Cadencias por proyecto, editables:**
  - diario: alertas técnicas y caídas;
  - semanal: oportunidades y reseñas;
  - mensual: informe, rastreo completo, Core Web Vitals, visibilidad en IA y competencia;
  - trimestral: volver a prever, auditar el contenido y repasar el mapa.
- **Anotaciones automáticas en las gráficas:** las core updates (del panel de estado de Google), la ruptura `num=100` y los cambios en la web.
- **El sistema avisa si un proyecto se queda parado:** encargos sin hacer, objetivos desviados o fases sin avanzar.

**Completar el expediente sin formularios.**
- **Huecos con peso:** cada dato que falta tiene un peso, según cuánto cambia la estrategia.
- **Pocas preguntas al cliente:** se le envía un correo con **3 preguntas como máximo**, las de más peso. Solo se pregunta lo que no se puede deducir:
  - el servicio más rentable y su margen;
  - el cliente que no quiere;
  - la zona real de servicio;
  - la capacidad;
  - el objetivo a 6-12 meses;
  - la estacionalidad;
  - su historial: otra agencia, penalizaciones;
  - los accesos.
- **Las respuestas llegan por cualquier vía:** el buzón de correo de la herramienta, un audio o la transcripción de una reunión. Entran como «propuesto», con la cita de dónde salió cada cosa.
- **Contradicciones:** si algo nuevo contradice un dato confirmado, se avisa a Enric una sola vez.
- **Mientras falten datos**, el sistema trabaja con una **hipótesis explícita** solo para decidir por dónde empezar («empezamos por implantes porque es lo que más destaca vuestra web y vuestras reseñas, salvo que digáis lo contrario»).

### 3.3 El departamento SEO en el organigrama

- **Jefe de SEO (IA):**
  - reparte el trabajo entre las fases;
  - resume la semana por excepción;
  - responde a «¿cómo va el SEO de X?».
- **Auditor técnico:** el motor determinista más su capa de juicio.
- **Analista de mercado y competencia.**
- **Investigador de palabras clave.**
- **Estratega:** ya existe.
- **I+D** (punto 3.4).

Son en su mayoría **procesos con pasos de IA donde hace falta juicio**, no agentes libres. Así son más fiables y más baratos, y cada uno tiene su presupuesto en el vigía de IA. En el organigrama aparecen como miembros del departamento con su actividad.

### 3.4 I+D (SEO ahora, Google Ads después)

- **Diario, sin IA:**
  - lee los RSS oficiales de Google (blog de Search Central, panel de estado de Search, registro de cambios de la documentación) y 6-8 medios;
  - quita duplicados.

  Un **update confirmado en el panel de estado avisa al instante** y se anota en las gráficas de todos los proyectos.
- **Semanal, con IA:**
  - agrupa las noticias del mismo hecho y descarta lo ya sabido, comparando con la base de conocimiento;
  - busca en foros y comunidades en inglés, alemán, francés y español mediante búsqueda web;
  - **verifica en la fuente primaria**, en una llamada aparte;
  - etiqueta la evidencia: confirmado por Google, estudio, observación de experto o rumor;
  - puntúa la relevancia para pymes y negocio local en España;
  - lo cruza con los proyectos afectados.
- **Cada hallazgo útil acaba en una de estas cuatro cosas:**
  - una **entrada propuesta para la base de conocimiento**;
  - un **cambio propuesto en las reglas de auditoría** (por ejemplo, «quitar la comprobación de FAQ»);
  - un **aviso a los proyectos afectados**;
  - «para vigilar».

  Todo se aprueba con un botón.
- **Seguridad:** el lector web no tiene herramientas de escritura ni datos de clientes. Devuelve datos estructurados y es el código el que crea las propuestas.
- **Se mide así:** porcentaje de propuestas aprobadas, días de adelanto y coste por propuesta aprobada.
- **Arranque recomendado:** la versión simple (RSS más un resumen semanal con un solo prompt, **< 3 $/mes**). Después de 2-3 semanas, la completa (**5-10 $/mes**) si la tasa de aprobación es buena.

### 3.5 Fuentes de datos (fase 0, coste casi cero)

| Fuente | Para qué | Coste | Estado |
|---|---|---|---|
| GSC: descarga **diaria completa** consulta × página (+ país/dispositivo, marca/no marca) | La verdad del equipo | 0 | Ampliar lo que hay |
| GSC URL Inspection | Indexación y resultados enriquecidos por URL (2.000/día por propiedad) | 0 | Ya conectado |
| GSC → BigQuery | Todas las filas en los clientes grandes | 0 (cupo gratis) | Lo activa Enric en Google Cloud |
| CrUX + CrUX History, PageSpeed con clave | Core Web Vitals reales y su tendencia (40 semanas) | 0 | Hace falta una clave (`.env` + `docker-compose.prod.yml`, con aprobación) |
| Rastreador propio ampliado | Auditoría, competencia y JSON-LD | 0 | Ampliar lo que hay |
| Business Profile API | Reseñas, respuestas, publicaciones y métricas | 0 | Ya conectado (métricas) |
| Places API (New) | Identidad, categoría y reseñas del cliente y la competencia | 0 dentro del cupo mensual | Hace falta una clave de Maps |
| DataForSEO (bajo demanda) | Volúmenes, palabras de la competencia y SERP puntual | ≈5-15 $/mes para 10 clientes; recarga mínima 50 $ | **La integración ya existe** en Agentes |
| Open PageRank | Autoridad orientativa | 0 | Nuevo |
| Google Trends API (alfa) | Tendencias y estacionalidad | 0 | Pedir acceso |

Más adelante:
- enlaces entrantes (DataForSEO Backlinks);
- un panel propio de visibilidad en IA (≈20-30 $/mes para 10 clientes);
- renderizar JavaScript con Playwright (dependencia nueva, con aprobación; mejor en un contenedor aparte);
- Screaming Frog para auditorías puntuales.

**No se hace:** seguimiento diario masivo de posiciones (es lo que fallaba en SE Ranking).

### 3.6 Qué se reutiliza y qué se retira

**Se reutiliza:**
- **Estrategia** (en producción) como motor del cerebro: procesos, vigilancia crítica, salud técnica, velocidad, detectores, objetivos, estratega Opus y propuestas → encargos. Se pasa de **cliente a proyecto**.
- **Rendimiento**, que pasa a descargar **todas** las propiedades de los proyectos, no solo la principal del cliente.
- **Del SEO de agosto:**
  - el motor de agrupación de palabras;
  - las tablas de grupos (ya van por proyecto);
  - el plan de contenido;
  - el lector de webs de la competencia (el único que ya extrae JSON-LD);
  - el enlace público.
- **Del núcleo y Agentes:**
  - relleno con IA de la ficha (el patrón de propuesta → aplicar);
  - buzón de correo;
  - búsqueda y lectura web de los agentes;
  - integración de DataForSEO;
  - base de conocimiento;
  - organigrama;
  - red segura (`fetchPublic`).

**Se retira:**
- el asistente lineal de agosto: pasos, progreso, checklist de onboarding, kickoff de 7 campos y Radiografía manual vacía;
- los pasos que dependían de copiar a mano de SE Ranking.

**Las 48 tarjetas de formación** pasan a la base de conocimiento como «Formación SEO», enlazadas desde cada fase y cada tipo de hallazgo.

### 3.7 Decisión técnica: un solo módulo

- **Hoy SEO y Estrategia son dos módulos**, y por las reglas de arquitectura no pueden usar el código del otro.
- **Propuesta:** **un solo módulo SEO**. Estrategia es en la práctica la parte viva del SEO, y su plan «Mantenimiento web» también es trabajo del departamento.
- **Lo compartido** (el lector de webs, el análisis de HTML con JSON-LD, sitemaps, robots) pasa al núcleo (`lib/core/web-audit.ts`), para que también lo use el futuro módulo de Ads.
- Cómo quedan los nombres de las tablas existentes (`est_*` y `seo_*`) se cerrará en el diseño técnico del esquema.

## 4. Alternativas comparadas

| Alternativa | Coste y esfuerzo | Riesgo | Qué se pierde |
|---|---|---|---|
| **A. Un solo módulo SEO por proyecto sobre el motor de Estrategia, aprovechando el SEO de agosto (recomendada)** | Medio. Re-clave por proyecto ahora, sin datos que migrar | Bajo-medio: cambio de núcleo (proyectos) y de esquema | El asistente de formación como tal (la formación sigue en la base) |
| B. Mantener dos módulos (SEO de agosto + Estrategia) y conectarlos por el núcleo | Alto: muchas conexiones y conceptos duplicados (dos auditorías, dos listas de palabras) | Medio: deriva entre los dos | Sencillez, y la continuidad queda partida |
| C. Reconstruir desde cero | Muy alto | Alto: se tira código en producción y probado (vigilancia, detectores, estratega) | Tiempo, sin ganar nada |
| D. No construir y usar herramientas externas (Screaming Frog + Drive + SE Ranking) | Bajo en desarrollo; licencias y horas | Alto: sigue disperso y sin continuidad | El objetivo: que el sistema trabaje solo |

**Cuestionado tres veces:**
1. **¿Cumple el objetivo final** (que el sistema trabaje solo, con supervisión)? Sí: todo arranca solo, y Enric solo confirma y decide.
2. **¿Coste o riesgo oculto a semanas vista?**
   - Volumen de GSC en Postgres (hasta unas 50.000 filas por propiedad y día): se guarda el detalle y se agrega; se medirá con los primeros clientes.
   - Ampliar Rendimiento a varias propiedades.
   - Leer webs de la competencia: respetar robots, ir despacio y no guardar datos personales.
   - Embeddings sin saldo: la agrupación necesita un proveedor con saldo.
3. **¿Hay algo que ya tenemos y no usamos?** Sí, y se aprovecha: DataForSEO ya integrado, la búsqueda web de los agentes, el buzón de correo para las respuestas del cliente, el relleno de ficha con IA y la base de conocimiento para la formación.

La conclusión no cambia: **A**.

## 5. Orden para llegar a la prueba real

- **Hito 1. Prueba real posible.**
  - Proyecto vinculado a su cliente y con su alcance.
  - Alta mínima con expediente provisional.
  - Auditoría determinista completa, con datos estructurados y código JSON-LD, y local.
  - Plan de mejora con IA → encargos.
  - Descarga completa de GSC.
  - I+D en versión simple (es independiente y pequeño).
- **Hito 2.** Competencia y mapa de palabras clave; el estratega trabaja por proyecto.
- **Hito 3.**
  - Correo de 3 preguntas y relleno desde audios y reuniones.
  - Cadencias vivas por proyecto y aviso de proyecto parado.
  - Jefe de SEO en el organigrama.
- **Hito 4.** Visibilidad en IA, autoridad y menciones, I+D completo, Playwright y BigQuery.

Con el Hito 1 ya se puede dar de alta un cliente real y ver el circuito funcionando. Cada hito se despliega y se prueba con ese cliente.

## 6. Lo que necesita Enric

**Aprobaciones (las reglas del proyecto lo exigen):**
- El planteamiento de este documento.
- **Núcleo:** que crear un proyecto exija elegir el cliente (`projects.client_id`, con selector) y que el proyecto guarde su alcance.
- **Esquema:** tablas nuevas del módulo (expediente con origen y confianza, hallazgos y reglas, mapa de palabras, I+D) y el cambio de las tablas de Estrategia de cliente a proyecto. Se presentará el diseño técnico del esquema antes de migrar, con backup.
- **Configuración de producción:** claves de PageSpeed/CrUX y de Places en `.env` y `docker-compose.prod.yml`.

**Acciones suyas:**
- Elegir el **cliente para la prueba**: mejor con web, Search Console conectado y ficha de Google.
- **Cuenta de DataForSEO** con una recarga de 50 $, si no la hay ya (la integración espera su clave).
- **Claves de Google Cloud:** PageSpeed/CrUX y Places, con facturación activada; el cupo gratuito cubre nuestro volumen.
- **Embeddings con saldo** (Gemini local da 402). Comprobar en producción; si no, otro proveedor.
- **Antes de que caduque SE Ranking:** exportar las palabras clave y el histórico de los clientes que lo tengan, para importarlos.
- **Opcional:** pedir el acceso alfa a la API de Google Trends y activar la exportación de GSC a BigQuery en los 2-3 clientes con más tráfico (solo empieza a acumular desde que se activa).
- **Google Ads:** no pedir el token de desarrollador. El sistema cambió el 9 de septiembre de 2026; lo revisaremos al llegar al módulo.

## 7. Sin verificar (se comprueba antes de construir o de gastar)

- Si el informe de IA de GSC está en la API.
- La cuota real de PageSpeed con clave.
- Los mínimos actuales de DataForSEO para Backlinks y menciones en IA.
- Las condiciones de caché de Places en el EEE.
- Los requisitos actuales de la API de Business Profile para una agencia gestora.
- La guía oficial del nuevo acceso a la API de Google Ads.
- Las URLs exactas de los RSS de los medios.

## 8. Fuentes principales

- **Google:**
  - guía de optimización para IA: https://developers.google.com/search/docs/fundamentals/ai-optimization-guide
  - galería de datos estructurados: https://developers.google.com/search/docs/appearance/structured-data/search-gallery
  - fin de FAQ: https://developers.google.com/search/docs/appearance/structured-data/faqpage
  - LocalBusiness: https://developers.google.com/search/docs/appearance/structured-data/local-business
  - informes de IA generativa en GSC: https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports
  - límites de la API de GSC: https://developers.google.com/webmaster-tools/limits
  - exportación a BigQuery: https://support.google.com/webmasters/answer/12918484
  - política de reputación del sitio en el EEE: https://developers.google.com/search/blog/2026/08/update-site-reputation-policy
  - retirada de los developer tokens de Ads: https://developers.google.com/google-ads/api/docs/deprecations
- **Estudios:**
  - Whitespark Local Search Ranking Factors 2026: https://whitespark.ca/local-search-ranking-factors/
  - paper GEO: https://arxiv.org/abs/2311.09735
  - Chen et al. 2025: https://arxiv.org/abs/2509.08919
  - Ahrefs sobre menciones en AI Overviews: https://ahrefs.com/blog/ai-overview-brand-correlation/
  - consultas anonimizadas: https://ahrefs.com/blog/gsc-anonymized-queries/
  - Zyppy: https://signal.zyppy.com/p/winning-google
  - Growth Memo: https://www.growth-memo.com/p/the-great-decoupling
- **Datos y precios:**
  - DataForSEO: https://dataforseo.com/pricing
  - Places: https://developers.google.com/maps/billing-and-pricing/pricing
  - CrUX: https://developer.chrome.com/docs/crux/api
  - búsqueda web de Claude: https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
- **Psicología y uso:**
  - NN/g, reconocer frente a recordar: https://www.nngroup.com/articles/recognition-and-recall/
  - Baymard: https://baymard.com/blog/checkout-flow-average-form-fields
  - Boomerang: https://blog.boomerangapp.com/2016/02/7-tips-for-getting-more-responses-to-your-emails-with-data/
  - Masicampo y Baumeister: https://pubmed.ncbi.nlm.nih.gov/21688924/
- **I+D:**
  - sistema de investigación multiagente de Anthropic: https://www.anthropic.com/engineering/multi-agent-research-system
  - cierre del RSS de Reddit: https://techcrunch.com/2026/09/30/reddit-is-killing-rss-feeds-ending-public-api-access-because-of-ai-bots/
  - UNE 166006: https://www.aenor.com/documents/d/guest/3-vigilancia-e-inteligencia

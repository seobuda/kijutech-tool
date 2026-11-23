# Diseño del departamento SEO, versión 2 (propuesta para aprobar)

**Fecha:** 2026-11-23 · **Estado:** propuesta, sin construir · **Sustituye a la versión 1 del mismo día.**

Este documento sale de ocho investigaciones:
1. SEO profesional en 2026.
2. Arrancar con lo mínimo y psicología de uso.
3. Departamento de I+D.
4. Fuentes de datos y precios.
5. Inventario del código.
6. Plataformas de presencia (Search Console social, ChatGPT, Bing, Apple…).
7. Organización y «cerebro».
8. Revisión crítica e independiente del código.

Marcas: **[V]** comprobado en fuente oficial · **[V2]** fuente secundaria · **[NV]** sin verificar. Los precios se vuelven a comprobar antes de gastar.

**Qué cambia respecto a la versión 1:**
- Ya **no** se reutiliza Estrategia «tal cual» re-claveada. La revisión del código mostró que su armazón no aguanta cientos de proyectos ni varios departamentos: planificador dentro de Operaciones y en memoria, consultas en directo a Google, resultados en JSON y contratos del núcleo por cliente.
- Se construye antes una **base de plataforma** pequeña y, encima, se traslada la lógica buena de Estrategia.
- Se añaden:
  - los **contactos del cliente con sus comunicaciones**;
  - **todas las plataformas de presencia**;
  - la **organización del departamento** en pocas piezas;
  - un **cerebro de I+D con aprendizaje propio**.

---

## 1. Objetivo (lo que no cambia)

- **Cerebro vivo del SEO de cada proyecto:** sabe qué hay que hacer, lo propone, lo convierte en encargos, vigila que se haga y mide el resultado.
- **Arranque con lo mínimo:** el nombre o la web, o un audio. El resto se completa sin formularios.
- **Varios proyectos por cliente:** otra web, otra línea de negocio u otra ciudad, cada uno con su estrategia.
- **La fuente de verdad son los datos reales de Google** (Search Console). SE Ranking no se renueva.
- **Absorber todos los datos posibles de cada proyecto**, para analizarlos y enseñárselos al cliente.
- **Nunca quedarse atrás:** un I+D que investiga y **aprende de nuestros propios resultados**.
- **Que escale:** cientos de proyectos y, después, Google Ads y otros departamentos sobre la misma base.

## 2. Las cuatro perspectivas sobre «qué reutilizamos»

**Consultor SEO.**
- Lo que vale de lo construido es el **criterio**:
  - detectores (consultas al alcance, canibalización con pérdida real, CTR bajo, caídas con estacionalidad);
  - objetivos con curva de crecimiento lenta y periodo de gracia;
  - estratega que exige evidencia y respeta las horas;
  - seguimiento del antes y el después de cada URL trabajada.
- Eso es oficio y hay que conservarlo.
- Lo que sobra:
  - el asistente de formación;
  - la dependencia de SE Ranking;
  - una auditoría que guarda los problemas en un bloque opaco.

  Un consultor necesita preguntar «¿qué páginas de este proyecto tienen el schema roto?», y hoy no se puede.

**Arquitecto de software** (hechos del código):
- **Planificador:** vive dentro del bucle del bot de Telegram (Operaciones), en memoria, en el mismo proceso que la web y en un servidor de 2 GB.
- **Search Console:** no se guarda el detalle. Se consulta en directo cada vez (13 llamadas), se pagina como mucho 25.000 filas y no hay histórico más allá de 16 meses.
- **Resultados en JSON:** los hallazgos se guardan en JSON y no se pueden consultar.
- **Catálogo de procesos cerrado:** Ads tendría que tocar Estrategia.
- **Contratos del núcleo por cliente:** métricas, encargos y horas. Dos proyectos del mismo cliente se comerían las mismas horas.
- **El agrupado de palabras de agosto:**
  - corre en el proceso web con una matriz que crece con el cuadrado del número de palabras;
  - no guarda los embeddings;
  - se salta la pasarela de IA;
  - no tiene pruebas.
- **Lo sólido:**
  - las reglas puras con sus pruebas;
  - el flujo propuesta → decisión → encargo;
  - el patrón de sincronización incremental de Rendimiento;
  - la red segura;
  - la base de conocimiento con vectores;
  - las barreras de arquitectura;
  - el registro de costes de IA.
- **Veredicto:** conservar la **lógica** y reescribir el **armazón**.

**Visión de producto (Jobs).** Simplicidad y foco. Enric no debe ver «módulos», sino **un proyecto que avanza solo y le pide decisiones con un botón**.
- Cada pantalla tiene una razón de ser.
- La complejidad se esconde en la plataforma, no en la interfaz.
- Arrastrar piezas pensadas para otro fin (un asistente de formación) daña la experiencia.

**Visión de plataforma (Gates y Bezos).** Construir **una vez** lo que todos los departamentos usarán:
- conectores de datos;
- almacén de métricas;
- rastreador;
- hallazgos tipados;
- cola de trabajos;
- cerebro.

Cada departamento es un «cliente» de la plataforma. Además:
- **Puertas de doble sentido:** lo reversible (pantallas, procesos) se decide rápido; lo irreversible (esquema, contratos del núcleo) se piensa ahora.
- **Working backwards:** cada área empieza por la frase «el cliente recibe…».
- **Ahora es el momento más barato:** 0 clientes con plan y 1 proyecto de prueba, así que no hay datos que migrar.

**Conclusión de las cuatro:**
- Se conserva el **criterio** (reglas, detectores, estratega, flujo de propuestas, patrón de sincronización, red segura, base de conocimiento).
- Se reescribe el **armazón** como plataforma común.
- Se tira lo que frena:
  - el asistente de agosto;
  - la tabla de salud técnica en JSON;
  - el pipeline de agrupado tal como está (se rescatan sus modificadores de intención y sus ejemplos);
  - las tablas de palabras de agosto (33 filas, se exportan antes).

## 3. Organización: pocas piezas con fronteras claras

Se adapta Team Topologies (plataforma, flujos de valor, equipo habilitador). Se evita el error del «modelo Spotify», que multiplicaba los ejes cruzados.

| Pieza | Tipo | Qué hace | La reutiliza Ads |
|---|---|---|---|
| **Plataforma** | Compartida | Proyecto y su alcance, contactos y comunicaciones, conectores de datos, almacén de métricas, rastreador, hallazgos tipados, cola de trabajos y procesos | Sí |
| **Cerebro** | Compartida | Conocimiento con evidencia y aprendizaje propio (§7) | Sí (otro dominio en las mismas tablas) |
| **Salud técnica** | Flujo del proyecto | Auditoría, Core Web Vitals, indexación, datos estructurados con su código | No |
| **Crecimiento orgánico** | Flujo del proyecto | Mapa de palabras sobre Search Console, contenido, canibalización, consultas al alcance | No |
| **Local y presencia** | Flujo del proyecto | Ficha de Google, reseñas, NAP, páginas por servicio, y Bing, Apple y ChatGPT | En parte |
| **Autoridad** | Flujo del proyecto | Menciones, listas «mejores X», medios, enlaces | No |
| **I+D** | Habilitador | Vigila, verifica y propone cambios al cerebro y a las reglas | Ads tendrá el suyo con la misma maquinaria |
| **Estratega + Jefe de SEO** | Coordinación | Prioriza entre flujos con las horas del proyecto y resume por excepción | Mismo patrón |

**Reglas para que no se vaya de las manos:**
1. Una capacidad nueva entra en un flujo o en la plataforma. **Nunca es una sección nueva.** Un quinto flujo solo se crea si tiene un resultado propio para el cliente («el cliente recibe…»).
2. Cada flujo tiene **un dueño** (agente o proceso con su presupuesto) y **una métrica de resultado**.
3. **Vocabulario común**, definido una sola vez: Proyecto, Activo, Tema, Hallazgo, Encargo, Intervención, Afirmación, Propuesta. Los flujos se comunican a través de estos objetos, no llamándose entre sí.

**Interfaz, con un número fijo de pantallas:**
- **Departamento SEO:** cartera de proyectos con un semáforo por flujo, excepciones y actividad de los agentes. Es una sola pantalla.
- **Proyecto:** **cinco pestañas fijas**: Resumen, Salud, Crecimiento, Local y autoridad, Resultados. Lo nuevo entra como **tarjeta** dentro de una pestaña.
- **Cerebro:** cuatro vistas: Novedades, Lo que sabemos, Aprendido en casa, Cambios propuestos.
- **Las decisiones no viven en estas pantallas:** llegan a **Para ti** y a Telegram, como ahora.

## 4. Proyecto, contactos y comunicaciones

**Proyecto.**
- Pertenece siempre a un cliente: `client_id` obligatorio, con un selector al crearlo.
- Su **alcance** son las webs, propiedades de Search Console y Analytics, fichas de Google por sede y perfiles sociales que elige de entre las «Webs y cuentas» del cliente. Va en una tabla de unión, sin textos sueltos.
- Tiene sus **horas** del contrato repartidas, para que dos proyectos del mismo cliente no se coman las mismas.
- **Los encargos llevan su proyecto.** Es un cambio en Operaciones y en el núcleo, así que necesita tu aprobación.

**Contactos y comunicaciones** (lo que pediste en el punto 1).
- **Lo que ya existe:** varios contactos por cliente, con nombre, cargo, rol, correo, teléfono, WhatsApp, canal preferido y quién es el principal.
- **Lo que se añade:**
  - **Qué recibe cada contacto**, por tipos que se marcan:
    - informes;
    - preguntas del proyecto;
    - avisos (por ejemplo, una caída o una incidencia);
    - aprobaciones (contenidos, cambios en la web);
    - facturación;
    - «todo».

    Se puede afinar **por proyecto**: el responsable de la web de Bilbao recibe las preguntas de ese proyecto.
  - **Cualquiera del equipo puede escribir al cliente**, persona o agente: una duda, una petición de acceso, una aprobación. El sistema elige al destinatario según el tipo, sale desde el buzón de la agencia, y las respuestas vuelven por el buzón que ya existe y se unen a su hilo.
  - **Política de aprobación**, con una casilla general y otra por cliente: «las comunicaciones con clientes pasan por mi aprobación». **De entrada, activada.** La aprobación llega a Para ti y a Telegram con el texto completo y los botones de siempre (enviar, corregir, descartar).
  - **Bloqueos claros:**
    - Si para un tipo de comunicación no hay ningún contacto con correo marcado, el paso que la necesita **queda bloqueado** («falta un contacto que reciba preguntas»).
    - Ese bloqueo te llega a ti como una decisión de un botón: «añadir el contacto o lo pregunto yo».
    - Nunca se envía a un contacto equivocado por falta de datos.

## 5. El circuito de un proyecto

Igual que en la versión 1, pero sobre la plataforma. Todo corre en segundo plano y solo llegan **propuestas** y **excepciones**.

**Fase 0. Alta mínima (minutos).**
- **Qué das:** nombre o web, o un audio.
- **Identidad confirmada** con dos señales que coincidan: dominio, teléfono, dirección o ficha.
- **Lo que se recoge solo:**
  - la web;
  - Places (categoría, valoración, reseñas);
  - el historial de la web en Wayback;
  - la búsqueda de la marca;
  - Search Console, si ya hay acceso.
- **Expediente provisional:** cada dato lleva origen, confianza y estado. **Tú confirmas, no escribes.**
- **Ciclo cerrado:** el sistema dice qué hará y cuándo.

**Fase 1. Diagnóstico (día 0-1).**
- **Rastreador de la plataforma:**
  - respeta robots y limita la velocidad por dominio;
  - lee sitemaps;
  - extrae HTML y JSON-LD.
- **Comprobaciones sin IA:**
  - estados y redirecciones;
  - indexabilidad y canonical;
  - títulos y encabezados;
  - duplicados y contenido escaso;
  - enlazado interno y páginas huérfanas;
  - Core Web Vitals por CrUX;
  - HTTPS y móvil;
  - cruce con Search Console: páginas con impresiones que no aparecen en el rastreo, y lo indexado frente al sitemap.
- **Hallazgos tipados:** cada uno con su URL, la regla que lo detectó (con versión), la gravedad y su ciclo de vida. Se pueden consultar.
- **Datos estructurados:** el código JSON-LD listo para pegar, por plantillas y con los datos verificados de la ficha. Bloquea FAQ (muerto desde mayo de 2026) y las reseñas del propio negocio. La IA solo propone el subtipo del negocio.
- **Local:** ficha de Google, reseñas con borradores de respuesta, coherencia del NAP y una página por servicio.
- **La IA solo para el juicio:** prioridades, intención, calidad. Su resultado es el **plan de mejora** convertido en propuestas → encargos.

**Fase 2. Mercado y competencia.**
- **Quiénes:** los que diga el cliente, los del paquete local de Google y los de DataForSEO.
- **Qué se mira:** rastreo ligero de sus webs, CrUX, reseñas y sus mensajes.
- **Huecos:** las palabras por las que aparecen ellos y no el cliente, y las listas y medios donde salen ellos.

**Fase 3. Mapa de palabras clave.**
- **Sobre el detalle de Search Console ya guardado,** más volúmenes de DataForSEO.
- **Embeddings guardados y reutilizados.**
- **Cómo se agrupa:** primero por páginas compartidas y después por parecido. La IA solo pone nombre a los grupos.
- **Resultado:** cada tema tiene su URL o queda como «página nueva».
- **Se muestra siempre:** el porcentaje de clics anónimos y la canibalización con señal temporal.

**Fase 4. Estrategia.**
- El estratega (su lógica actual) trabaja **por proyecto**.
- Consulta el cerebro: cada recomendación cita su evidencia.
- **Pre-registra** la hipótesis de cada encargo (§7.3).

**Fase 5. Vida continua.** Cadencias editables por proyecto:
- diario: alertas;
- semanal: oportunidades y reseñas;
- mensual: informe, rastreo y visibilidad en IA;
- trimestral: volver a prever.

Las core updates se anotan solas en las gráficas, y si un proyecto se queda parado salta un aviso.

**Completar el expediente.**
- **Hasta 3 preguntas por correo** a los contactos marcados para «preguntas», con tu aprobación mientras esté activada.
- **Respuestas por cualquier vía:** buzón, audios o reuniones. Entran como «propuesto», con su cita.
- **Hipótesis explícita** solo para decidir por dónde empezar.

## 6. Todos los datos del proyecto: conectores enchufables

Cada fuente es un **conector** con su descripción: autenticación, alcance (proyecto, sede o perfil social), métricas, frecuencia, cuánto histórico da el origen y su **estado**:
- **activo**: hay API;
- **solo interfaz**: se importa a mano o por CSV, para empezar a guardar historial ya;
- **vigilar**: todavía no existe o no está abierto en España.

Los datos caen en un **almacén de métricas** genérico. Solo lo pesado tiene tabla propia (el detalle de Search Console, en una tabla ancha particionada por mes con diccionarios de consultas y URLs).

| Fuente | Qué da | Acceso | España | Prioridad |
|---|---|---|---|---|
| Search Console web | Consultas, páginas, país, dispositivo, marca/no marca, Discover, News, imágenes, vídeo, Lens; inspección de URL | API (detalle diario completo, paginado) | Sí | Ya |
| Search Console, **propiedades sociales** (Instagram, TikTok, X, YouTube), desde julio de 2026 [V] | Clics, impresiones y consultas en Google de cada perfil social | API sin confirmar: se prueba; si no, importación | Sí | Ya (importación) |
| Search Console, informe de IA [V] | Impresiones en AI Overviews y AI Mode por URL (sin clics) | Solo interfaz | Sí | Ya (importación mensual) |
| Google Business Profile | Vistas, llamadas, rutas, web, reservas; reseñas y respuestas | API | Sí | Ya |
| GA4 | Sesiones y conversiones, incluidas las **visitas que llegan desde ChatGPT, Perplexity, Copilot y Gemini** | API | Sí | Ya |
| CrUX + historial, PageSpeed | Core Web Vitals reales y su tendencia | API (con clave) | Sí | Ya |
| Bing Webmaster + **AI Performance** [V] | Consultas; citas en Copilot con sus consultas, intenciones y cuota de citas | API clásica / IA solo interfaz | Sí | Ya |
| **ChatGPT, «Businesses in ChatGPT»** (beta desde el 10 de noviembre de 2026) [V] | Ficha reclamada, menciones, clics, vistas, temas | Sin API; vistas de 7 y 28 días | **Sin confirmar** (un intento fuera de EE. UU. quedó en lista de espera [V2]) | Vigilar; captura semanal en cuanto se abra |
| Bing Places | Ficha local (se sincroniza desde Google) | Sin API de métricas | Sí | Pronto (alta manual) |
| **Apple Business** (sustituye a Business Connect desde abril de 2026) [V] | Place Card en Maps, Siri y Spotlight; insights; ofertas | API solo para partners aprobados | Sí | Pronto (alta manual, insights por importación) |
| YouTube Analytics | Vistas, fuentes, términos de búsqueda en YouTube | API | Sí | Pronto |
| Meta (Instagram/Facebook) | Vistas, alcance, interacciones, clics al perfil | API (revisión de la app) | Sí | Pronto |
| TikTok | Métricas por vídeo de la cuenta Business | API (revisión) | Sí | Vigilar |
| DataForSEO | Volúmenes, palabras de la competencia, SERP puntual | API de pago por uso | Sí | Ya (bajo demanda) |
| Places API | Identidad, categoría, reseñas del cliente y la competencia | API (cupo gratis) | Sí | Ya |
| Tripadvisor (hostelería), Yelp, Foursquare | Nota y reseñas | De pago | Sí | Vigilar |
| Gestores de fichas (Partoo, Yext, Uberall) | Distribuir el NAP a Apple, Waze, HERE, Páginas Amarillas… | API de pago | Sí | Decidir según cuántos clientes tengan varias sedes |
| Panel propio de visibilidad en IA | Preguntas fijas a ChatGPT, Gemini y Perplexity: ¿aparece la marca? | APIs de los modelos | Sí | Más adelante |

**Nota:** ni ChatGPT ni Perplexity ni Gemini responden por API a «qué menciones ha tenido este negocio». Las menciones solo se ven en el panel de ChatGPT, con la ficha reclamada, o midiendo nosotros con preguntas fijas.

## 7. El cerebro de I+D

### 7.1 Qué es

No es una pila de documentos que se busca con IA. Es una **base de afirmaciones**:
- frases comprobables («Google dejó de mostrar FAQ en mayo de 2026»);
- cada una con su **evidencia citada**, su **nivel de certeza** y sus **fechas de validez**;
- organizadas por **temas** con un **resumen del estado actual**.

Ideas que tomamos (sin servicios nuevos, todo en PostgreSQL):
- validez en dos tiempos, de Zep/Graphiti: cuándo es cierto y cuándo lo supimos;
- resúmenes por niveles, de RAPTOR;
- un bloque núcleo siempre presente, de Letta;
- niveles de certeza al estilo de la medicina basada en evidencia (GRADE).

**Cuatro capas:**
- **Fuentes y documentos:** solo los lee el verificador.
- **Afirmaciones:** la unidad del conocimiento.
- **Temas:** una taxonomía fija de unos 40-80 por dominio, con un resumen de 150-300 tokens.
- **Informe del dominio:** unos 1.500 tokens, siempre en el prompt de los agentes con caché.

**Niveles de evidencia:**

| Nivel | Qué es |
|---|---|
| E1 | Confirmado por Google |
| E2 | Experimento controlado |
| E3 | Estudio de proveedor |
| E4 | Experto o caso aislado |
| E5 | Rumor |
| I | Medido en nuestros clientes |

La certeza baja si la evidencia es indirecta (un sitio grande frente a una pyme), si hay contradicciones, si la muestra es pequeña o si la fuente vende la herramienta.

**Olvidar y actualizar:**
- **Nada se borra:** las afirmaciones se cierran o se sustituyen. «¿Qué creíamos en marzo?» sigue siendo consultable.
- **Caducidad:** un rumor caduca a los 60 días si no sube de nivel.
- **Contradicciones:** se marcan «en disputa». Si contradicen algo de nivel superior, se crea una propuesta en lugar de cambiarlo solo.

**Escala y coste:**
- índices vectoriales solo sobre lo vigente;
- búsqueda híbrida (texto + vector) en una sola consulta;
- vistas precalculadas.

Cientos de miles de afirmaciones están dentro de lo normal. **Consultar cuesta unos 300-600 tokens**; el resumen del dominio va en caché.

### 7.2 Cómo lo usan los demás

**Cuatro herramientas, casi todas SQL sin IA:**

| Herramienta | Qué devuelve |
|---|---|
| `cerebro_resumen` | El informe del dominio |
| `que_sabemos(pregunta)` | Resumen del tema + hasta 5 afirmaciones vigentes |
| `que_ha_funcionado(técnica, tipo de negocio)` | Efectos medidos en casa |
| `citar(id)` | La cita literal de la evidencia |

**Regla:** un agente solo afirma como hecho lo que lleva la referencia de una afirmación. Lo demás lo presenta como opinión.

**El cerebro cambia el sistema, pero no escribe solo:** propone cambios versionados en tres sitios:
- **las reglas de auditoría**, con una **simulación** («con la regla nueva cambian 37 hallazgos en 9 proyectos»);
- **las plantillas** (JSON-LD, landing local);
- **los prompts**, que pasan su examen antes de llegar a ti.

Si se retira una afirmación, el sistema lista qué reglas, plantillas y prompts dependían de ella.

### 7.3 Aprender de nuestros propios resultados (lo que nadie más tiene)

Cada encargo hecho sobre una URL es un **experimento natural**. Ya guardamos qué se hizo y la serie diaria de la URL, con 90 días antes. Falta el método:

1. **Técnica normalizada** (unas 30: reescribir el título, ampliar contenido, schema, enlazado, nueva landing de zona…) y **tipo de negocio**.
2. **Hipótesis guardada al crear el encargo:** qué métrica, en qué dirección y en cuánto tiempo. Así nadie elige la métrica a posteriori.
3. **El efecto empieza cuando Google vuelve a rastrear la página**, no cuando se publica.
4. **Controles:**
   - páginas del mismo sitio sin tocar;
   - la media de otros proyectos del mismo sector, que absorbe las core updates y la temporada.
5. **Efecto de cada encargo** por diferencias en diferencias, con avisos de confusión: core update, otros cambios en la misma página o la ruptura de la medición.
6. **Agrupado entre clientes** con un método que corrige la suerte de los casos sueltos.
7. **Umbral para «aprendido»:** al menos 8 casos en 3 clientes y un intervalo que no cruce cero. Por debajo, es un «indicio», visible pero sin cambiar reglas.
8. **Opcional:** en cambios de plantilla que afectan a muchas páginas iguales, aplicarlo al 50 % durante 6-8 semanas como prueba controlada. Siempre con tu aprobación.

**Evidencia externa frente a la nuestra:**
- **Si coinciden,** la certeza sube.
- **Si dicen cosas distintas,** se marca «en disputa en nuestro contexto», por ejemplo: «funciona en sitios grandes; en nuestras pymes, no (14 casos, 5 clientes)».

### 7.4 Por fases

- **A. Bitácora** (desde ya, < 3 $/mes):
  - fuentes oficiales a diario sin IA, con aviso inmediato de las core updates;
  - resumen semanal → entradas propuestas a la base de conocimiento;
  - **empezar ya a guardar la técnica y la hipótesis** de cada encargo nuevo. Es el dato que no se puede recuperar después.
- **B. Afirmaciones** (3-8 $/mes): las tablas del cerebro, los resúmenes por tema, las herramientas de consulta y las reglas versionadas.
- **C. Cerebro completo** (5-12 $/mes por dominio): el aprendizaje propio con agrupado, controles y simulación. Cuando haya unas 30 intervenciones medibles en 5 clientes.
- **Google Ads:** el mismo cerebro con otro dominio, sus fuentes y sus técnicas. Sin código nuevo de cerebro.

## 8. La base de plataforma (lo que se construye antes)

Son cinco piezas, cada una con su prueba de barrera. SEO, y después Ads, solo **registran** cosas en ellas:

1. **Cola de trabajos y procesos:**
   - trabajos guardados en la base de datos;
   - cada uno reclamado por un solo trabajador;
   - topes, reintentos y latido;
   - un registro de procesos para que cada departamento aporte los suyos sin tocar los de otro;
   - **un trabajador en un contenedor aparte** de la web.
2. **Conectores:** el patrón de sincronización incremental de Rendimiento, generalizado. Google y DataForSEO salen de Agentes, con contador por minuto y reintento.
3. **Almacén de métricas:** KPIs diarios y el detalle de Search Console particionado.
4. **Rastreador:** cola de URLs, robots, límite por dominio, y extracción de HTML y JSON-LD a hallazgos.
5. **Hallazgos tipados:** tipos registrados, URL, consulta, cifra, ciclo de vida y evidencia consultable. Generaliza las «señales» actuales.

Además, se amplía la **pasarela de IA**:
- salida estructurada;
- el presupuesto se controla en la pasarela;
- no se guarda el mensaje completo de cada llamada.

Todo lo que llame a IA pasa por ella.

**Infraestructura:**
- **Servidor:** con 2 GB no cabe el rastreo ni el detalle de Search Console. Hace falta subir al menos a 4 GB y separar el trabajador. El coste exacto del cambio de servidor no está comprobado.

## 9. Alternativas comparadas

| Alternativa | Esfuerzo | Riesgo a 6-12 meses | Veredicto |
|---|---|---|---|
| **1. Plataforma pequeña primero + lógica de Estrategia trasladada + flujos SEO encima (recomendada)** | Grande (plataforma) + medio (migrar lógica) | Bajo: Ads y cientos de proyectos caben | Sí |
| 2. Versión 1: re-clavear Estrategia tal cual | Medio | Alto: planificador en Operaciones, sin almacén de Search Console, hallazgos en JSON, contratos por cliente | No: nos frena, como temías |
| 3. Desde cero, tirándolo todo | Muy grande | Medio: se pierden reglas probadas y el estratega | No: tira oficio que vale |
| 4. Herramientas externas (Screaming Frog, Drive) | Bajo en desarrollo | Alto: disperso y sin aprendizaje | No |

**Cuestionado tres veces:**
- **¿Cumple el objetivo final?** Sí: autonomía, escala y Ads.
- **¿Coste oculto?** El primer resultado visible tarda más, por la plataforma. Para compensarlo, el orden del punto 10 pone una **prueba real del Hito 1 en cuanto estén las tres piezas que la necesitan**, en lugar de terminar toda la plataforma antes.
- **¿Algo que ya tenemos y no usamos?**
  - el buzón para las respuestas del cliente;
  - el relleno de ficha con IA;
  - los contactos;
  - DataForSEO;
  - la búsqueda web de los agentes;
  - la base de conocimiento con vectores;
  - el sistema de exámenes de prompts.

  Se aprovechan todos.

## 10. Orden de construcción

- **Paso 0. Cimientos mínimos para la prueba:**
  - proyecto rehecho (cliente obligatorio, alcance, horas);
  - contactos con sus comunicaciones y la política de aprobación;
  - cola de trabajos con trabajador aparte;
  - conector de Search Console con el detalle guardado;
  - hallazgos tipados;
  - rastreador.
- **Hito 1. Prueba real:**
  - alta mínima con expediente provisional;
  - diagnóstico completo (técnico, JSON-LD con código, local);
  - plan de mejora → encargos;
  - I+D en fase A, guardando ya la técnica y la hipótesis de cada encargo.

  Aquí ya puedes dar de alta un cliente real.
- **Hito 2:**
  - competencia y mapa de palabras;
  - estratega por proyecto;
  - correo de 3 preguntas;
  - conectores de Bing, GA4 con las visitas desde IA, y la importación de las propiedades sociales y del informe de IA.
- **Hito 3:**
  - cerebro en fase B;
  - Jefe de SEO;
  - cadencias por proyecto;
  - YouTube, Meta, y Apple y Bing Places en manual;
  - ChatGPT si se abre en España.
- **Hito 4:**
  - cerebro en fase C (aprendizaje propio);
  - panel de visibilidad en IA;
  - autoridad y menciones;
  - gestor de fichas, si compensa.

## 11. Lo que necesito de ti

**Aprobaciones (lo exigen las reglas del proyecto):**
1. **Este planteamiento.**
2. **Núcleo:**
   - proyecto con cliente obligatorio, su alcance y sus horas;
   - contactos con sus tipos de comunicación y la política de aprobación;
   - cola de trabajos y procesos;
   - conectores;
   - hallazgos tipados;
   - **encargos con su proyecto** (también toca Operaciones).
3. **Esquema:** te presentaré el diseño técnico tabla por tabla antes de migrar, con backup y rama propia.
4. **Infraestructura:**
   - un **contenedor nuevo para el trabajador** (es un cambio en `docker-compose`);
   - **subir el servidor a 4 GB o más** (coste mensual por confirmar);
   - claves de PageSpeed/CrUX y Places en producción;
   - posiblemente una **dependencia** para analizar HTML de forma robusta, en vez de con expresiones regulares.

**Acciones tuyas:**
- **El cliente de la prueba:** mejor con web, Search Console y ficha de Google.
- **Cuentas y claves:** DataForSEO, con una recarga de 50 $; claves de Google Cloud con facturación activada (el cupo gratuito cubre nuestro volumen); embeddings con saldo.
- **Exportar SE Ranking** antes de que caduque.
- **Reclamar las fichas del cliente de la prueba:**
  - en **Bing Places** y **Apple Business**;
  - **probar en ChatGPT** («Businesses in ChatGPT») si deja dar de alta un negocio de España.
- **En Search Console**, añadir sus **propiedades sociales**.
- **Google Ads:** no pidas el token de desarrollador (el sistema cambió el 9 de septiembre de 2026).

## 12. Sin verificar

- Si las propiedades sociales y el informe de IA de Search Console salen por la API: probar `sites.list`.
- Si ChatGPT Business Hub admite negocios de España.
- Si Apple Business ofrece insights por API (solo partners).
- El coste de un servidor de 4 GB.
- La versión de pgvector en producción.
- Los mínimos actuales de DataForSEO.
- La cuota de PageSpeed con clave.
- Las condiciones de caché de Places en el EEE.

## 13. Fuentes principales

**Google:**
- Propiedades sociales en Search Console: https://developers.google.com/search/blog/2026/07/search-console-social-video-platforms · https://support.google.com/webmasters/answer/17148418
- Informe de IA en Search Console: https://developers.google.com/search/blog/2026/06/gen-ai-performance-reports
- Guía de optimización para IA: https://developers.google.com/search/docs/fundamentals/ai-optimization-guide
- Datos estructurados (galería y fin de FAQ): https://developers.google.com/search/docs/appearance/structured-data/search-gallery · https://developers.google.com/search/docs/appearance/structured-data/faqpage
- Límites de la API de Search Console: https://developers.google.com/webmaster-tools/limits
- Retirada de los tokens de Google Ads: https://developers.google.com/google-ads/api/docs/deprecations

**Otras plataformas:**
- ChatGPT para negocios: https://openai.com/index/introducing-businesses-chatgpt/ · https://openai.com/policies/businesses-in-chatgpt/
- Bing AI Performance: https://blogs.bing.com/search/June-2026/New-AI-Visibility-Insights-in-Bing-Webmaster-Tools-Intents-Topics-Citation-Share-Compare
- Apple Business: https://www.apple.com/newsroom/2026/03/introducing-apple-business-a-new-all-in-one-platform-for-businesses-of-all-sizes/

**Estudios y referencias SEO:**
- Whitespark 2026: https://whitespark.ca/local-search-ranking-factors/
- Paper GEO: https://arxiv.org/abs/2311.09735
- Chen et al.: https://arxiv.org/abs/2509.08919
- Ahrefs sobre menciones de marca: https://ahrefs.com/blog/ai-overview-brand-correlation/

**Organización:**
- Team Topologies: https://martinfowler.com/bliki/TeamTopologies.html
- Crítica del modelo Spotify: https://www.jeremiahlee.com/posts/failed-squad-goals/
- Ontología de Palantir: https://palantir.com/docs/foundry/ontology/core-concepts/

**Cerebro y medición:**
- Zep/Graphiti: https://arxiv.org/abs/2501.13956
- RAPTOR: https://arxiv.org/abs/2401.18059
- GRADE: https://bestpractice.bmj.com/info/evidence/learn-ebm/what-is-grade/
- SearchPilot: https://searchpilot.com/resources/blog/how-searchpilot-analyses-test-data
- CausalImpact: https://arxiv.org/abs/1506.00356
- Diferencias en diferencias escalonadas: https://arxiv.org/abs/1803.09015
- pgvector 0.8: https://www.postgresql.org/about/news/pgvector-080-released-2952/

**Uso:**
- NN/g: https://www.nngroup.com/articles/recognition-and-recall/
- Boomerang: https://blog.boomerangapp.com/2016/02/7-tips-for-getting-more-responses-to-your-emails-with-data/

# Inventario del departamento SEO y lo que falta para que esté completo

**Fecha:** 2026-11-25 · **Estado:** inventario comprobado en el código y propuesta de plan, para discutir con Enric. Todavía no hay nada aprobado.
**Fuentes:**
- el código de `lib/seo/**`, `lib/core/{crawler,gsc,findings}*`, `lib/estrategia/**`, `lib/rendimiento/**` y `lib/agentes/**`;
- los diseños `DISENO-MODULO-SEO.md` (v2), `DISENO-TECNICO-HITO1.md` y `DISENO-TECNICO-HITO2.md`.

**Leyenda:**
- ✅ **funciona**: en producción y con código que corre.
- 🟡 **a medias**: existe, pero en otro sitio, sin programar o sin terminar.
- ❌ **falta**.
- 🗑️ **legado**: lo sustituye algo nuevo y se retirará con aprobación.

**Marcas:** **[NV]** = sin verificar (precio, límite o documentación).

---

## 0. La foto en una frase

El módulo nuevo ya sabe **rastrear y auditar** la web, **ordenar las búsquedas** de Search Console en temas, **encontrar y comparar** a la competencia, **completar el expediente** del cliente y **convertir los problemas en encargos** con su hipótesis. Le falta casi todo lo que hace un experto **después del diagnóstico técnico**: demanda de búsqueda nueva, contenido, autoridad (enlaces), posiciones reales, reseñas, informe al cliente y medir si lo que hicimos funcionó.

Además hay **tres sistemas que se solapan**, y conviene ordenarlos antes de crecer:
1. El **módulo SEO nuevo**: Salud, Expediente, Palabras y Plan.
2. **Los procesos de Estrategia**, que también hacen SEO:
   - vigilancia crítica diaria;
   - salud semanal de unas 40 URL;
   - Core Web Vitals mensuales con PageSpeed;
   - detectores semanales: consultas al alcance, CTR bajo, páginas en caída y consultas nuevas;
   - posiciones de palabras críticas.
3. El **asistente de agosto** (keyword research con CSV de SE Ranking, clustering con IA, análisis de competidores con IA y plan de contenido), que el diseño v2 decidió retirar.

---

## 1. Inventario por área (lo que hace un SEO experto → lo que tenemos)

### 1.1 Alta y conocimiento del negocio
| Qué hace un experto | Estado | Dónde / nota |
|---|---|---|
| Identificar el negocio y sus datos (NAP, web, servicios, zona) | ✅ | Expediente: 14 campos, con origen, confianza y la identidad confirmada por 2 señales |
| Preguntar al cliente lo que no se averigua | ✅ | Correo de 3 preguntas, con aprobación; la respuesta la lee Haiku con cita literal |
| Datos públicos de su ficha de Google (categoría, nota, reseñas) | ❌ | Ya es posible con Places, conectado el 25 nov; el expediente aún no lo usa |
| Objetivos de negocio: qué es un cliente potencial, servicios más rentables, temporada, margen | 🟡 | Objetivos en Estrategia; el SEO no los usa para priorizar |
| Historia de la web: rediseños, migraciones, penalizaciones | 🟡 | Primera fecha en Wayback y GSC (486 días); no se detectan caídas históricas ni cambios de dominio |

### 1.2 Técnico (rastreo y auditoría)
| Qué hace un experto | Estado | Dónde / nota |
|---|---|---|
| Rastrear la web respetando robots y sitemaps | ✅ | Rastreador del núcleo: 500 páginas, sin JavaScript |
| Estados HTTP, redirecciones, canonical, noindex, sitemap | ✅ | 33 reglas en `salud/audit-rules.ts` |
| Títulos, descripciones, H1, contenido escaso, duplicados y casi duplicados | ✅ | Ídem |
| Huérfanas y profundidad | ✅ | Ídem |
| Cruce con Search Console (páginas con impresiones que no se rastrean) | ✅ | `seo.gsc_page_not_crawled` |
| Velocidad del servidor | ✅ | `seo.slow_server` (mediana) |
| **Core Web Vitals reales (CrUX) por plantilla** | 🟡 | Solo en Estrategia (PageSpeed en 3 URL al mes); no llegan a hallazgos SEO |
| **Renderizado de JavaScript** | ❌ | Solo una sospecha (`seo.js_rendered`); no se renderiza |
| Móvil y viewport | ❌ | |
| Contenido mixto http/https y caducidad del SSL | 🟡 | SSL en el proceso crítico de Estrategia; el contenido mixto no se mira |
| Cadenas de redirección largas y bucles | 🟡 | Solo detecta el primer salto |
| **Enlaces rotos hacia fuera** | ❌ | `links_external` se cuenta pero no se comprueba |
| Anchors del enlazado interno (genéricos, sobreoptimizados) | ❌ | `crawl_links.anchor` se guarda y no se analiza |
| hreflang y lang (webs en varios idiomas, frecuente en Cataluña) | ❌ | Se guardan y no hay regla |
| robots.txt que bloquea recursos o secciones importantes | 🟡 | El crítico de Estrategia solo mira `Disallow: /` |
| Imágenes pesadas o sin dimensiones; paginación; parámetros y filtros | ❌ | |
| **Indexación real** (inspección de URL, sitemaps enviados en GSC) | 🟡 | Estrategia inspecciona 8 URL a la semana; SEO no lo usa |
| **Qué ha cambiado entre dos rastreos** (títulos, noindex, páginas que desaparecen) | ❌ | Se guardan 3 rastreos y no se comparan |
| **Auditoría programada** | ❌ | Solo a mano; la vigilancia periódica está en Estrategia |
| Registros del servidor (cómo rastrea Googlebot) | ❌ | Difícil con pymes; ver §3 |

### 1.3 Palabras clave y demanda
| Qué hace un experto | Estado | Dónde / nota |
|---|---|---|
| Ordenar lo que ya trae tráfico en temas con su página | ✅ | Mapa de palabras (GSC 90 días, embeddings por tandas, canibalización) |
| Clics anónimos y canibalización | ✅ | |
| **Demanda que todavía no tenemos**: búsquedas por las que el cliente no sale | 🟡 | Solo los huecos frente a competidores (15 búsquedas); no hay investigación de palabras nuevas |
| Volumen, dificultad y estacionalidad | 🟡 | Volumen solo como herramienta del agente; no llega al mapa |
| **Intención de búsqueda** (qué tipo de página quiere Google) | ❌ | Estaba en el asistente legado, hecha con IA y sin mirar la SERP |
| Valor de negocio de cada tema (servicio rentable × volumen × posibilidad) | ❌ | |
| Oportunidades «al alcance» (posición 4-20) y CTR por debajo de lo esperado | 🟡 | Detectores semanales en Estrategia, no en el mapa ni en el plan |
| 🗑️ Asistente de agosto (CSV de SE Ranking y clustering con IA) | 🗑️ | SE Ranking no se renueva |

### 1.4 Contenido
| Qué hace un experto | Estado | Dónde / nota |
|---|---|---|
| Inventario y calidad del contenido: fecha, autor, E-E-A-T, profundidad, utilidad | ❌ | |
| Contenido que pierde tráfico (decaimiento) → actualizar | 🟡 | Detector «páginas en caída» en Estrategia; no genera propuesta SEO |
| **Brief de contenido** según lo que posiciona en Google | ❌ | |
| Optimización de una página frente a las que ganan (temas que faltan, estructura) | ❌ | |
| Páginas nuevas por tema o servicio («página nueva» del mapa) | 🟡 | El mapa la marca; no hay brief ni propuesta concreta |
| **Enlazado interno sugerido** (desde qué páginas enlazar a cuál) | ❌ | Tenemos el grafo de enlaces del rastreo |
| Calendario editorial y redacción asistida | ❌ | 🗑️ Plan de contenido del asistente legado |
| Publicar en WordPress | ❌ | |
| Comprobar que lo publicado cumple (QA tras el encargo) | ❌ | |

### 1.5 Datos estructurados
| Qué hace un experto | Estado | Dónde / nota |
|---|---|---|
| Schema del negocio con los datos verificados | ✅ | Generador JSON-LD sin IA; bloquea FAQ y las reseñas del propio negocio |
| Validar el schema existente | 🟡 | Campos mínimos; no se valida la elegibilidad para resultados enriquecidos |
| Schema por tipo de página (Service, Product, Article, Breadcrumb, Event…) | ❌ | Solo el del negocio y su web |

### 1.6 Local
| Qué hace un experto | Estado | Dónde / nota |
|---|---|---|
| NAP coherente entre la ficha y la web | ✅ | |
| Una página por servicio | ✅ | |
| Rendimiento de la ficha de Google (vistas, llamadas, rutas) | ⏸️ | Programado; espera a que Google apruebe Business Profile (APARCADO) |
| **Reseñas del cliente** (nuevas, nota, responder con borrador aprobado) | ❌ | La tabla `seo_reviews` existe sin código. Con Places: nota, número y 5 reseñas, sin responder |
| **Reseñas de la competencia** | ❌ | Places, listo para usar |
| Categorías de la ficha frente a las de los competidores | ❌ | Places las da |
| **Posición en el mapa por zonas** (geo-grid: ¿salgo en Sabadell? ¿y en Terrassa?) | ❌ | DataForSEO tiene búsqueda local por coordenadas [NV coste] |
| Citas en directorios (Páginas Amarillas, Cylex…) coherentes | ❌ | |
| Páginas de zona (servicio + población) | ❌ | Se puede proponer desde el mapa y la competencia |

### 1.7 Autoridad (enlaces y menciones)
| Qué hace un experto | Estado | Dónde / nota |
|---|---|---|
| Perfil de enlaces del cliente: dominios, anchors, crecimiento, tóxicos | ❌ | Nada. Hace falta un proveedor (DataForSEO Backlinks, Ahrefs, Majestic…) [NV coste] |
| Huecos de enlaces frente a la competencia | ❌ | |
| Prospección: medios, directorios sectoriales, menciones sin enlace | ❌ | |
| Enlaces rotos hacia el cliente (recuperarlos con redirecciones) | ❌ | Se puede con GSC + rastreo + proveedor |

### 1.8 Competencia
| Qué hace un experto | Estado | Dónde / nota |
|---|---|---|
| Quién compite de verdad en Google (orgánico y mapa) | ✅ | 15 búsquedas con DataForSEO; un humano confirma |
| Comparar webs: servicios, schema, velocidad, texto | ✅ | Rastreo ligero de 50 páginas, desde el 24 nov |
| Huecos de búsquedas | ✅ | Básico: solo las 15 búsquedas semilla |
| Todas sus palabras (qué posicionan que nosotros no) | ❌ | «Palabras posicionadas» de DataForSEO Labs [NV coste] |
| Vigilar sus cambios (páginas nuevas, precios, ofertas) | ❌ | |
| Su autoridad y sus reseñas | ❌ | Ver §1.6 y §1.7 |
| Cuota de visibilidad comparada en el tiempo | ❌ | |

### 1.9 Posiciones y visibilidad (incluida la IA)
| Qué hace un experto | Estado | Dónde / nota |
|---|---|---|
| Posición media por palabra (GSC) | 🟡 | Estrategia: palabras dadas de alta a mano, con aviso de caídas |
| Posición real en Google con ubicación y dispositivo, SERP features y paquete local | ❌ | DataForSEO; solo puntual desde el agente |
| Cuota de visibilidad (share of voice) frente a la competencia | ❌ | |
| **Presencia en AI Overviews / AI Mode** | ❌ | El informe de IA de GSC solo está en su interfaz; DataForSEO da la SERP con AI Overview [NV] |
| Menciones en ChatGPT, Gemini y Perplexity (preguntas fijas) | ❌ | Panel propio; diseño v2, Hito 4 |
| Visitas que llegan desde asistentes de IA | ✅ | GA4, desde el 24 nov |
| Bing Webmaster (incluido AI Performance) | ❌ | Espera la clave |

### 1.10 Medición, informes y aprendizaje
| Qué hace un experto | Estado | Dónde / nota |
|---|---|---|
| KPIs con comparación de periodos e hitos | ✅ | Rendimiento (GSC, GA4, GBP) |
| Alertas de subidas y bajadas | ✅ | Telegram |
| **Diagnóstico de una caída** (¿update?, ¿cambio en la web?, ¿competidor?, ¿estacional?) | ❌ | Tenemos las piezas sueltas: novedades de Google, rastreos, GSC y competencia |
| **Informe mensual para el cliente** (lo hecho, el resultado y lo siguiente) | ❌ | Solo un texto interno sin IA; `informe_mensual` está sin código |
| Atribución a contactos o ventas (eventos clave de GA4 por página orgánica) | 🟡 | Hay eventos clave en GA4; no se relacionan con temas ni páginas |
| **¿Funcionó lo que hicimos?** (hipótesis frente a resultado) | ❌ | La hipótesis se guarda y nadie la mide (diseño v2 §7.3) |
| Previsión (qué tráfico ganaríamos si…) | ❌ | |
| Anotar las core updates en las gráficas | 🟡 | Se detectan cada 3 h (novedades de Google), pero Rendimiento no las pinta |

### 1.11 Estrategia, plan y ejecución
| Qué hace un experto | Estado | Dónde / nota |
|---|---|---|
| Convertir problemas en un plan priorizado con horas | ✅ | Plan de mejora: 20 técnicas, prioridad y horas frente a las mensuales |
| Encargos al equipo con instrucciones | ✅ | Aprobar → ClickUp, con los hallazgos enlazados |
| Estrategia por proyecto (objetivos, plan, tareas) | ✅ | Estratega con Opus y el dossier del proyecto SEO |
| El plan propone también contenido, enlaces y local (no solo arreglos técnicos) | ❌ | Solo sale de hallazgos técnicos y de la canibalización |
| Instrucciones de ejecución que un junior pueda seguir sin un experto | 🟡 | Plantilla por técnica, todavía corta |
| Comprobar que el encargo se hizo bien (volver a auditar la URL) | ❌ | |
| Hoja de ruta trimestral y revisión | ❌ | `revision_trimestral` sin código |
| **Jefe de SEO** (agente que orquesta y responde) y cadencias por proyecto | ❌ | Diseño v2, Hito 3 |
| **Cerebro de I+D**: afirmaciones con evidencia y aprendizaje propio | 🟡 | Fase A (novedades de Google) hecha; B y C, no |

### 1.12 Casos especiales que un experto atiende
| Caso | Estado |
|---|---|
| **Migración o rediseño de una web** (mapa de redirecciones, comparar antes y después) | ❌ Muy frecuente en pymes, y la web de Kijutech se está rehaciendo |
| Webs en varios idiomas (hreflang) | ❌ |
| Tienda online (fichas de producto, filtros, Product schema, Merchant Center) | ❌ |
| Penalización manual o desindexación masiva | 🟡 Lo crítico de Estrategia detecta el noindex de la portada |

---

## 2. Cómo lo he revisado (cuatro pasadas, no la primera idea)

**Primera conclusión (hipótesis):** «falta una lista de comprobaciones; se añaden reglas y módulos hasta cubrir la tabla». Es el camino corto. Lo he cuestionado así:

1. **¿Cumple el objetivo final (que el sistema haga el trabajo de un SEO, con supervisión)?** No del todo. Un experto no vale por la lista de chequeos. Vale por tres cosas:
   - **priorizar por negocio**: qué da clientes;
   - **explicar causas**: por qué cayó;
   - **comprobar si lo hecho funcionó**.

   **Cambio:** el plan incluye el diagnóstico de caídas, el valor de negocio y la medición de las hipótesis como partes propias, no como extras.
2. **¿Qué coste o riesgo oculto tiene a semanas vista?**
   - **Tres sistemas solapados** (SEO, Estrategia, legado): cada área nueva que se añada encima duplica trabajo y confunde al equipo y al estratega.
   - **Datos de pago por proyecto** (enlaces, posiciones, palabras de la competencia): con cientos de proyectos, el coste mensual decide qué se puede hacer de serie y qué solo bajo petición.

   **Cambio:** una **parte 0 de consolidación** y un **presupuesto de datos por proyecto** antes de las áreas caras.
3. **¿Hay algo que ya tenemos y no usamos?** Sí, y mucho:
   - el grafo de enlaces internos, para sugerir enlazado;
   - los 3 rastreos guardados, para ver cambios;
   - la clave de PageSpeed de Estrategia, para CrUX en SEO;
   - Places, recién conectado;
   - los detectores de Estrategia;
   - las hipótesis guardadas en cada encargo;
   - el país en GSC;
   - los eventos clave de GA4.

   **Cambio:** las primeras partes aprovechan lo que hay antes de contratar fuentes nuevas.
4. **¿Escala y es innovador, o solo copia una herramienta SEO?** Copiar Semrush no es la meta. Lo diferencial es lo que nadie más tiene:
   - **aprender de nuestras propias intervenciones**;
   - **vigilar y diagnosticar** solo;
   - **pasar de dato a encargo aprobado sin humano en medio**.

   **Cambio:** la medición de resultados y el cerebro no van «al final si da tiempo»: tienen su parte con fecha.

---

## 3. Propuesta de plan por partes (orden y motivo)

Cada parte se entrega a producción por sí sola, con sus pruebas, su Mapa Visual y su documento. Las que necesitan esquema o gasto nuevo llevan diseño técnico para aprobar, como en los Hitos 1 y 2.

| Parte | Qué incluye | Por qué en este orden | Esquema / coste |
|---|---|---|---|
| **0. Consolidar** | La vigilancia crítica, la salud semanal, CrUX y los detectores de Estrategia pasan al módulo SEO como hallazgos y propuestas (Estrategia solo los lee). Auditoría programada por proyecto, con cadencia editable. Retirar el asistente de agosto (con tu aprobación). | Sin esto, cada parte nueva se construye dos veces. Es lo que ya decía el diseño v2. | Poco esquema; sin coste |
| **1. Técnico completo** | Comparación entre rastreos; cadenas y bucles; enlaces rotos hacia fuera; anchors; hreflang; móvil y viewport; contenido mixto; robots que bloquea recursos; imágenes; CrUX por plantilla; inspección de URL en muestra; render de JavaScript en las páginas sospechosas [NV coste de CPU]. | Es la base de todo lo demás y casi todo sale de datos que ya guardamos. | Sin esquema nuevo casi seguro |
| **2. Demanda y palabras** | Volúmenes y estacionalidad en el mapa; palabras nuevas (ideas de DataForSEO a partir de servicios y competencia); intención mirando la SERP real, no la IA; dificultad; **valor de negocio por tema**. | Sin esto el contenido no sabe qué escribir. | Algo de esquema; DataForSEO por uso [NV] |
| **3. Contenido** | Inventario y calidad del contenido; decaimiento → propuesta de actualizar; **brief** a partir de lo que posiciona; optimizar una página frente a las que ganan; **enlazado interno sugerido**; QA tras publicar. WordPress, en una parte aparte si lo quieres. | Es donde más horas del equipo se van, y donde más ayuda la IA bien acotada. | Esquema (briefs); IA por uso |
| **4. Local completo** | Places: nota, reseñas y categorías del cliente y la competencia; **geo-grid** de posiciones en el mapa; citas en directorios; páginas de zona. Business Profile (rendimiento y responder reseñas) cuando Google lo apruebe. | Casi todos los clientes son pymes locales. | Esquema pequeño; Places y DataForSEO por uso [NV] |
| **5. Posiciones y visibilidad** | Seguimiento real de las palabras clave del plan (SERP, paquete local, SERP features, AI Overviews); cuota de visibilidad frente a la competencia; panel de preguntas fijas a ChatGPT, Gemini y Perplexity; Bing cuando haya clave. | Hace falta para el informe y para medir. | Esquema; coste por palabra y día [NV] |
| **6. Autoridad** | Perfil de enlaces, huecos frente a la competencia, prospección y menciones; enlaces rotos hacia el cliente. | La más cara: antes hay que elegir proveedor con números. | Esquema; **suscripción de un proveedor [NV]** |
| **7. Medir y explicar** | **¿Funcionó?**: hipótesis frente a resultado, con controles (diseño v2 §7.3); **diagnóstico de caídas**; atribución a contactos; previsión; **informe mensual al cliente** con aprobación. | Es lo diferencial y lo que ve el cliente. Algunas piezas pueden adelantarse (el informe). | Esquema; IA por uso |
| **8. Orquestar y aprender** | **Jefe de SEO** (agente); cadencias por proyecto; cerebro de I+D fases B y C; el plan propone contenido, local y enlaces, no solo técnico. | Necesita que las partes anteriores existan. | Esquema |
| **Transversal: migraciones** | Asistente de rediseño: rastreo antes y después, mapa de redirecciones, vigilancia de las semanas siguientes. | Muy frecuente; puede adelantarse (la web de Kijutech). | Poco esquema |

**Lo que no haría (y por qué):**
- Registros del servidor de Googlebot: las pymes casi nunca tienen acceso. Mejor la inspección de URL de GSC.
- Replicar Semrush entero: el coste por proyecto no escala. Los datos de pago se piden **bajo demanda o por las palabras del plan**, no para todo el universo de búsquedas.

---

## 4. Lo que necesito que decidas antes de diseñar la parte 0

1. **¿Te encaja el orden?** Puedo adelantar el informe al cliente (parte 7) o las migraciones si te urgen antes de Google Ads.
2. **Presupuesto de datos por proyecto y mes** (DataForSEO, Places, proveedor de enlaces): con él decido qué va de serie y qué bajo demanda.
3. **¿Publicar en WordPress entra en «SEO completo»?** ¿Lo usan todos los clientes?
4. **¿Hay o habrá clientes con tienda online o con varios idiomas?** Cambia la prioridad de §1.12.
5. **¿Retiro el asistente de agosto** cuando el mapa y la parte 2 lo cubran?

## 5. Sin verificar
- Costes de DataForSEO (Labs, búsqueda local por coordenadas, SERP con AI Overview, Backlinks) y de Places por reseñas.
- La CPU y la memoria que necesitaría el render de JavaScript en el servidor actual.

# Diseño — Estrategia viva: seguimiento y estratega IA por cliente (paso 6, versión 4)

**Estado:** v4 **aprobada por Enric** el 15 nov («ok a todo, adelante con la fase 1»; posiciones solo con Search Console de momento). **Fase 1 construida** el 15-16 nov (migración 0050, ver docs/ESTADO.md §6.24). Diferencias con lo propuesto: las tablas de las fases 2 y 3 (análisis, propuestas, aprendizajes, revisiones e iniciativas) se crearán con su fase, no ahora; el estado de URL «no hace falta» y «no aplica» se unifican en «no_aplica».
**Fecha:** 15 nov 2026. **Rama:** `feature/estrategia-viva`.
**Investigación que la respalda:** `docs/INVESTIGACION-ESTRATEGIA-VIVA.md` (unas 70 fuentes de agencias, expertos, Google y el mercado de herramientas).

**Historial:**
- **v1:** objetivos y semáforo.
- **v2:** estratega IA proactivo.
- **v3:** planes de seguimiento, frecuencias editables por cliente y panel propio.
- **v4:** correcciones tras la investigación. Las marcadas con 🔬 son las que cambian algo respecto a la v3.

## 1. Objetivo

> Que cada cliente reciba exactamente el seguimiento que tiene contratado (desde «comprobar que su web va bien» hasta un estratega que analiza, relaciona el rendimiento con el trabajo hecho y propone tareas para llegar a sus KPIs) y que la agencia pueda ajustar qué se revisa y cada cuánto sin tocar código.

**Lo que nos diferencia (confirmado por la investigación):** ninguna herramienta del mercado conecta las recomendaciones con **las tareas reales de la agencia, sus horas y el impacto medido de cada tarea**, ni aprende con los datos de toda la agencia qué funciona. Ahí va el esfuerzo de construcción. Lo que ya es commodity se resuelve con código barato o se integra:
- detectores de oportunidades;
- visibilidad en buscadores con IA;
- resúmenes de informes.

**Principio de toda función nueva:** panel propio y separado, con frecuencias editables por defecto y por cliente, y activación por cliente.

## 2. 🔬 Tres capas: recoger, evaluar y avisar

La investigación es unánime: **guardar a diario está bien; decidir a diario, no.** Google pide esperar unas semanas tras un cambio, y Core Web Vitals es ya una media de 28 días.

| Capa | Cuándo | Qué | IA |
|---|---|---|---|
| **Recoger** | A diario (fijo) | Datos de Google (Rendimiento), URLs trabajadas, estado de la web y de la ficha | No |
| **Evaluar** | Con la frecuencia del plan (semanal, cada 15 días, mensual…) | Tendencias en ventanas de 28 días o semanas completas, comparadas con el periodo anterior y con el año pasado; oportunidades; estratega | Solo el estratega y los informes |
| **Avisar** | A diario, **solo lo crítico** | Web caída, errores 5xx, `noindex` o desindexación, ficha de Google suspendida, caída fuerte **confirmada** | No |

## 3. Tres niveles de configuración (de la v3)

```
CATÁLOGO DE PROCESOS (definido en código)
   ▼
PLANES DE SEGUIMIENTO (los edita el admin: procesos y frecuencias)
   ▼
CLIENTE (en su ficha: plan + ajustes propios opcionales + pausa)
```

- **Por defecto, ningún cliente tiene nada.** Al cambiar un plan, cambian todos sus clientes, salvo los procesos que un cliente tenga ajustados a mano.
- En la ficha y en el panel siempre se ve la **frecuencia efectiva** y de dónde sale («del plan» o «ajustada»), con el botón «Volver a la del plan».
- Los procesos declaran **dependencias**. El planificador no lanza el estratega hasta que se han ejecutado los procesos que lo alimentan dentro de la misma ventana.
- El estratega analiza **desde su última ejecución**: si un cliente está «cada 15 días», mira esos 15 días.

## 4. 🔬 Catálogo de procesos y frecuencias por defecto (revisadas)

Las frecuencias por defecto siguen la práctica más repetida en la investigación. Todas son editables.

| Proceso | Qué hace | Coste | Por defecto |
|---|---|---|---|
| Descarga de datos de Google | Rendimiento, que ya existe | Gratis | Diario (fijo) |
| 🔬 **Vigilancia crítica** | Web caída, errores 5xx, SSL a punto de caducar, `noindex` o `robots.txt` que bloquean, ficha de Google suspendida o editada. Avisa al momento | Gratis | Diario |
| 🔬 **Salud técnica completa** | Rastreo de las páginas principales (404, redirecciones, sitemap, indexación en Search Console) | Gratis | Semanal |
| 🔬 **Velocidad y Core Web Vitals** | PageSpeed Insights con datos reales (media de 28 días de Google) | Gratis | Mensual. Mirarlo más a menudo no aporta |
| 🔬 **Palabras clave posicionadas** | Search Console (gratis) y, si se activa, la posición exacta en Google con DataForSEO. **Diario solo durante 4 semanas tras publicar o cambiar una página**, y para las palabras marcadas como críticas | Gratis o DataForSEO | Semanal |
| Ficha de Google Business | Vistas, llamadas, cómo llegar y cambios en la ficha | Gratis | Semanal |
| URLs trabajadas | Seguimiento diario de las páginas tocadas, con 90 días de «antes» | Gratis | Diario mientras dure |
| **Detectores de oportunidades** | 🔬 Franjas ajustables. Consultas al alcance: posición 4-15 por defecto. CTR bajo **ajustado según haya AI Overview**. Páginas en caída. Consultas nuevas sin página. Canibalización **solo si hay pérdida real** | Gratis | Semanal |
| 🔬 **Contenido que pierde tráfico** | Páginas que caen frente al año anterior, filtrando la estacionalidad | Gratis | Trimestral |
| Competencia | Quién aparece para las palabras del cliente y qué cambia | DataForSEO | Mensual |
| 🔬 **Visibilidad en IA** | Impresiones del informe de IA de Search Console y, si se contrata, un proveedor de visibilidad en ChatGPT, Perplexity, AI Overviews y AI Mode (§9) | Gratis o proveedor | Mensual |
| Extracción de datos de tareas | Al cerrarse un encargo: tipo, URLs, palabras clave y KPIs. Pregunta la URL si falta | Haiku (≈ 0,0001 $) | Al cerrar cada tarea |
| 🔬 **Medición del impacto** | Por tipo de tarea y con páginas de control (§7) | Gratis | Automática según su ventana |
| **Análisis del estratega** | Opus correlaciona y propone tareas | Opus | Semanal |
| Análisis por alerta | El estratega actúa al momento ante algo grave | Opus | Encendido, tope de 2 al mes por cliente |
| Guardián | Objetivos, trabajo planificado, horas, propuestas sin responder y 🔬 **más de 90 días sin revisión de estrategia** | Gratis | Cada 3 días |
| Informe mensual | Interno y borrador para el cliente | Opus | Mensual, día 5 |
| 🔬 **Revisión trimestral de estrategia** | Repasa los objetivos y su previsión, qué funcionó, y replantea el plan del trimestre. Es lo que más relacionan las agencias con retener a los clientes | Opus | Trimestral |
| Aprendizajes de la agencia | Qué funciona, por tipo de trabajo y sector | Opus | Mensual (toda la agencia) |

## 5. 🔬 Planes iniciales (revisados)

| Plan | Procesos |
|---|---|
| **Ninguno** (por defecto) | — |
| **Mantenimiento web** | Vigilancia crítica (diario) · Salud técnica (semanal) · Velocidad (mensual) · Guardián (solo la web y las horas) |
| **SEO local** | Lo anterior + Ficha de Google (semanal) · Palabras clave (semanal) · Objetivos · Detectores (semanal) · Estratega (cada 15 días) · Informe mensual · Revisión trimestral |
| **SEO estratégico** | Todo el catálogo · Estratega semanal · Análisis por alerta · Contenido que pierde tráfico (trimestral) · Competencia (mensual) · Visibilidad en IA (mensual) |

No hay un estándar publicado que adapte la frecuencia de vigilancia según el paquete del cliente; nuestros planes van más allá de lo que se publica. Estas frecuencias son una propuesta razonada a partir de la práctica más común, y por eso son editables.

## 6. 🔬 Objetivos: metas realistas, no líneas rectas

- **Jerarquía de KPIs:** **negocio** (conversiones, llamadas, contactos) > **clics e impresiones** > **posiciones**. La posición media de Search Console **no se usa como KPI de un objetivo** porque engaña: empeora cuando la página empieza a salir para consultas nuevas. Solo se usa como contexto.
- **Curva con retraso en vez de línea recta.** El SEO tarda de 3 a 6 meses en notarse y crece a escalones. La trayectoria esperada sigue una **curva en S configurable por tipo de objetivo**. Por defecto:
  - solo el 10-15 % del avance en los primeros 90 días;
  - el grueso entre los meses 3 y 9;
  - estabilización al final.
- **Nunca «desviado» antes de 90 días.** Antes de ese plazo, el estado máximo es «vigilar».
- **Partida con estacionalidad:** si hay 13 meses o más de datos, lo esperado cada mes es el valor del año pasado ajustado a la tendencia actual (así agosto no se compara con marzo). Sin ese histórico, se usa la media de los 3 últimos meses y se avisa de que no hay estacionalidad.
- **Meta en rango.** El estratega propone una meta prudente, una esperada y una ambiciosa, explicando por qué con el histórico, las horas contratadas y los aprendizajes de clientes parecidos. Enric elige.
- **Se revisan cada trimestre** en la revisión de estrategia: se puede ajustar la meta o la fecha, y queda registrado.

## 7. 🔬 Medir el impacto de cada tarea (metodología corregida)

1. **Ventanas por tipo de tarea**, en múltiplos de 7 días:
   - cambios en una página existente (títulos, contenido, enlazado interno): **28, 56 y 84 días**;
   - contenido nuevo, ficha de Google y web nueva: **90 y 180 días**;
   - técnico: 28 y 56 días.

   Son editables en el panel.
2. **La ventana empieza cuando Google vuelve a rastrear la página**, consultando la fecha de último rastreo en la inspección de URL de Search Console, o con su primera impresión si es nueva. No empieza cuando se marca la tarea como hecha. Los últimos 3 días se descartan porque aún no son definitivos.
3. **Páginas de control.** La página trabajada se compara con páginas parecidas del mismo sitio que no se han tocado en ese periodo (diferencia en diferencias). Así se descuentan la estacionalidad, la demanda y las actualizaciones de Google que afectan a todo el sitio.
4. **Volumen mínimo.** Si la página tiene poco tráfico, no se publica un impacto individual: sale «sin datos suficientes» y la tarea **solo cuenta en el agregado** de toda la agencia. La investigación indica que un test fiable de una sola página necesita mucho más tráfico del que tiene casi cualquier pyme.
5. **Etiquetas de contexto.** Una medición se marca si se solapa con:
   - una **actualización de Google** (calendario, §8);
   - **otra tarea en la misma página**: el impacto es conjunto y no se atribuye a ninguna por separado;
   - un **cambio de URL** o redirección.
6. **Métricas:** clics, impresiones y CTR por separado. Las consultas con AI Overview van marcadas, para no culpar a una tarea de una caída de CTR que viene del propio Google.
7. **Lenguaje:** «señal compatible con la tarea (confianza media)», nunca «la tarea causó».
8. **Aprendizajes de la agencia con rigor:** por tipo de tarea y sector se guardan el **tamaño del efecto, su intervalo de confianza y el número de casos**, dando más peso a los casos limpios (con control y sin actualización de Google). Un aprendizaje solo se pasa al estratega a partir de un mínimo de casos (por defecto, 8). Se distinguen las **palancas con techo** (títulos, enlazado, velocidad) de las que **escalan** (contenido, enlaces).
9. **Fase posterior opcional:** CausalImpact (el modelo bayesiano de Google) para los clientes con mucho tráfico, si el método de control simple se queda corto.

## 8. 🔬 Calendario de actualizaciones de Google y eventos

- Tabla de **eventos externos** compartida por toda la agencia:
  - actualizaciones de Google, tomadas del Google Search Status Dashboard o añadidas a mano si no se pueden leer solas (sin verificar);
  - festivos;
  - incidencias de datos de Search Console.
- Se ven en todas las gráficas (también en Rendimiento), se usan para etiquetar las mediciones de impacto y se pasan al estratega.
- **Avisos más inteligentes**, que también mejoran los que ya están desplegados en Rendimiento:
  - volumen mínimo más alto;
  - caída **confirmada dos días seguidos**;
  - sin usar los días aún no definitivos;
  - durante una actualización de Google, el aviso llega etiquetado («coincide con la core update de noviembre»);
  - más adelante, descomposición estacional para los clientes con un año de datos o más.
- **Anotaciones en Search Console:** Google añadió en noviembre de 2025 anotaciones propias en los gráficos. Si su API permite escribirlas (sin verificar), las tareas terminadas se anotarían también allí.

## 9. 🔬 Visibilidad en buscadores con IA (nuevo)

- **Por qué:** los AI Overviews reducen los clics entre un 34 % y un 61 % según el estudio, y alrededor del 59 % de las búsquedas en la UE acaban sin clic. Un cliente puede ganar visibilidad y perder clics a la vez. Sin medirla, el sistema interpretaría mal el rendimiento.
- **Cómo medirla:** como tendencia, nunca como posición. Las respuestas de los LLM casi nunca se repiten, así que lo que cuenta es la **frecuencia de mención en varias ejecuciones** frente a la competencia.
- **Integrar, no construir:**
  1. **Gratis desde el primer día:** el informe de IA de Search Console, que da impresiones por página (si la API lo expone; sin verificar).
  2. **De pago, a elegir más adelante:** un proveedor europeo como Peec AI (desde unos 70 €/mes) u Otterly (desde unos 29 $), o el de una herramienta que ya paguemos (Ahrefs Brand Radar, Sistrix, Semrush). Se conectaría como una integración más del módulo Agentes. Precios sin verificar.
- Solo en el plan «SEO estratégico» por defecto.

## 10. El estratega y sus propuestas (de la v2 y v3, con mejoras 🔬)

- Opus con herramientas:
  - Rendimiento, señales, URLs trabajadas e impacto medido;
  - encargos y horas;
  - ficha, memoria y competencia;
  - objetivos;
  - historial de sus propuestas;
  - aprendizajes;
  - eventos externos;
  - SEO en directo (DataForSEO, Search Console, Clarity, lectura de webs) y el subagente Revisor web.
- 🔬 **Priorización ICE con horas reales:** cada propuesta lleva impacto esperado, confianza y esfuerzo en **horas estimadas a partir de las horas reales** de tareas parecidas del equipo, que ya registra Operaciones. Se ordenan por (impacto × confianza) / horas y se recortan a las **horas que quedan del contrato**.
- **Reglas contra los consejos genéricos:**
  - evidencia concreta obligatoria (URL, consulta, periodo y métrica), validada en el código;
  - sin duplicar encargos abiertos ni de los últimos 90 días;
  - tope de propuestas por análisis.
- **Aprobación humana siempre en esta fase.** El mensaje va por cliente, con los botones ✅ crear encargo en ClickUp, ✏️ ajustar, ⏸️ más adelante y ✖️ no, con motivo.
- 🔬 **No cambia nada en la web de los clientes.** La investigación confirma que los cambios automáticos por píxel o JS (OTTO, Alli AI) dan problemas. Si algún día se hace, sería por el CMS, con aprobación y con forma de deshacer.
- 🔬 **Calidad del estratega:**
  - tasa de aceptación y motivos de rechazo;
  - **tasa de ejecución**: lo aprobado que de verdad se hace (el sector ejecuta solo entre el 40 % y el 60 % de lo que recomienda);
  - **calibración**: impacto estimado frente a impacto real, con el error medio y el acierto de dirección.

  La calibración vuelve al estratega para que ajuste sus estimaciones.
- **Informe para el cliente:** primero los resultados de negocio, luego el trabajo hecho con su impacto y las horas consumidas frente a las contratadas, y en anexo las métricas de detalle.

## 11. Panel propio y ficha (de la v3)

- **Trabajo → Estrategia**, separado del resto, con cuatro pestañas:
  - **Clientes:** con plan, ajustes, semáforo, propuestas, horas y coste.
  - **Planes:** tabla de procesos por planes, con la frecuencia en un desplegable y el coste estimado.
  - 🔬 **Calidad y aprendizajes:** aceptación, ejecución, calibración, aprendizajes y calendario de eventos.
  - **Ajustes:** modelo, umbrales, franjas de los detectores, ventanas de impacto, curva por tipo de objetivo, tope de IA, DataForSEO, proveedor de visibilidad en IA y avisos.
- **Pestaña «Estrategia» en la ficha:** plan y procesos con su frecuencia efectiva, editables para ese cliente, y pausa. Solo se ven las secciones de sus procesos activos. Un cliente de «Mantenimiento web» solo ve la salud de su web.
- **Permisos:**
  - ver: lector;
  - aprobar propuestas y editar objetivos, iniciativas y palabras clave: editor;
  - planes, frecuencias, ajustes y borrar: admin.

## 12. Modelo de datos (prefijo `est_`, migración 0050)

**Tablas de la v3:**
- `est_plans`, `est_client_settings`, `est_process_runs`
- `est_objectives`: 🔬 con la meta en rango (prudente, esperada y ambiciosa) y el tipo de curva
- `est_initiatives`, `est_keywords`, `est_health_checks`, `est_signals`, `est_analyses`
- `est_suggestions`: 🔬 con la puntuación ICE, las horas estimadas, si se ejecutó y el impacto real para la calibración
- `est_work_facts`: 🔬 con la fecha de rastreo, las páginas de control, el efecto y su intervalo, las etiquetas de contexto y si es atribuible
- `est_tracked_urls`
- `est_learnings`: 🔬 con el tamaño del efecto, el intervalo de confianza, el número de casos y el tipo de palanca
- `est_reviews`: mensuales y 🔬 trimestrales
- `est_settings`

**Tabla nueva:**
- 🔬 `est_events`: actualizaciones de Google, festivos e incidencias de datos. Es de toda la agencia y la lee Rendimiento por el núcleo.

**Conexiones por el núcleo, sin que un módulo importe a otro:**
- Rendimiento: KPIs, URLs seguidas y eventos en las gráficas.
- Operaciones: encargos, horas, crear encargo y pregunta de la URL al cerrar.
- Agentes: herramientas del estratega y, más adelante, el proveedor de visibilidad en IA.

## 13. Coste

Con unos 8 clientes en «SEO estratégico» y unos 5 en «SEO local». Estimación con los precios de la tabla del sistema, sin uso real.

| Uso | Al mes |
|---|---|
| Estratega semanal (8) y cada 15 días (5), con Opus | ≈ 11,5 $ |
| Análisis por alerta | ≈ 3 $ |
| Informes mensuales y revisiones trimestrales | ≈ 3 $ |
| Aprendizajes y extracción de tareas | < 0,5 $ |
| **IA total** | **≈ 18 $/mes**, con un tope propio de 30 $ |
| DataForSEO (posiciones semanales y competencia) | Pocos $ (sin verificar) |
| Proveedor de visibilidad en IA, si se contrata | ≈ 30-70 €/mes (sin verificar). Decisión aparte |

## 14. Decisión: tres pasadas de cuestionamiento (v4)

1. **¿Cumple el objetivo final?** Sí, y ahora con una base metodológica que el sector reconoce. Sin la corrección de la medición del impacto, el «aprendizaje de la agencia» habría aprendido correlaciones falsas y el estratega habría propuesto con una confianza que no tenía. **Cambio:** la medición del impacto pasa a ser la pieza más cuidada del diseño.
2. **¿Coste o riesgo oculto?**
   - El coste apenas cambia.
   - **Riesgo nuevo detectado:** la desconfianza del equipo y de Enric si el sistema da falsas alarmas: objetivos «desviados» en el mes 2, avisos por caídas de 10 clics o «CTR bajo» que es culpa de los AI Overviews. **Cambio:** la curva con retraso, el volumen mínimo, la confirmación de dos días y el ajuste por AI Overviews entran en la fase 1, no como mejora posterior.
3. **¿Algo que ya tenemos o que se puede integrar?**
   - La visibilidad en IA y los detectores básicos son commodity. **Cambio:** la visibilidad en IA se integra y no se construye.
   - Las horas reales por tarea ya existen en Operaciones y dan las estimaciones de esfuerzo.
   - La medición de impacto podría delegarse en SEOTesting.com, pero no conoce nuestras tareas ni da datos para aprender entre clientes. Se construye.

**Alternativas comparadas**

| Alternativa | Qué se pierde |
|---|---|
| **A. v4: construir el diferencial (tareas, horas, impacto, aprendizaje) e integrar lo commodity (recomendada)** | — |
| B. Comprar una plataforma (Semrush Copilot, seoClarity, BrightEdge) | Recomendaciones sin relación con nuestras tareas, horas ni impacto. Consejos criticados por genéricos. Coste de gran empresa en las mejores |
| C. Agente con cambios automáticos en la web (estilo OTTO) | Riesgo de romper webs y de *cloaking*, dependencia del proveedor. Perdemos la supervisión, que es nuestra ventaja |
| D. Solo informes con IA (AgencyAnalytics, Whatagraph) | Ni proactividad ni propuestas de trabajo ni aprendizaje |

## 15. Plan de construcción (en fases, cada una desplegable)

1. **Fase 1, base configurable y medible:**
   - migración 0050 (con backup) y registros del núcleo;
   - catálogo, planes, ajustes por cliente y planificador;
   - panel y pestaña;
   - vigilancia crítica, salud técnica, velocidad, palabras clave, ficha de Google, URLs trabajadas y detectores;
   - objetivos con curva y partida estacional;
   - calendario de eventos y **avisos mejorados** (también los de Rendimiento);
   - extracción de tareas y pregunta de la URL.
2. **Fase 2, el estratega:**
   - Opus con herramientas;
   - priorización ICE con horas;
   - propuestas con botones que crean encargos;
   - calidad: aceptación, ejecución y calibración;
   - tope de coste.
3. **Fase 3, ciclo cerrado:**
   - medición del impacto con control;
   - aprendizajes;
   - informes mensuales y revisión trimestral;
   - contenido que pierde tráfico;
   - competencia;
   - visibilidad en IA, con el informe de Search Console y el proveedor que se elija.
4. **En cada fase:**
   - pruebas, incluidas las de seguridad;
   - Mapa Visual y su comprobación;
   - `docs/ESTADO.md`;
   - documento de sesión;
   - revisión completa.

Recomendación: desplegar tras la fase 1, para que se acumulen datos de URLs, posiciones e impacto cuanto antes.

## 16. Decisiones que necesito de Enric

1. **¿Apruebas el enfoque y el esquema** (migración 0050 con las tablas `est_*` y los registros del núcleo)?
2. **Planes y frecuencias por defecto** de §4 y §5, revisadas con la investigación. Todo será editable.
3. **Tope de IA del módulo:** 30 $/mes.
4. **Desplegar tras la fase 1.**
5. **Pregunta «¿en qué URL?»** al cerrar una tarea, con el botón «No aplica».
6. **DataForSEO** para las posiciones exactas en los planes SEO (semanal) o solo Search Console.
7. **Visibilidad en IA:** empezar con el informe gratuito de Search Console y decidir el proveedor de pago (Peec, Otterly o el de una herramienta que ya paguemos) en la fase 3. ¿Tenéis ya licencia de Ahrefs, Semrush o Sistrix?

# Diseño — Estrategia viva: seguimiento y estratega IA por cliente (paso 6, versión 3)

**Estado:** propuesta v3, **pendiente de aprobación de Enric**. Necesita la migración 0050, así que no se construye nada sin su OK.
**Fecha:** 15 nov 2026. **Rama:** `feature/estrategia-viva`.

**Historial:**
- **v1:** objetivos con un semáforo.
- **v2:** estratega IA proactivo, a petición de Enric de no recortar en IA.
- **v3:** recoge tres matices de Enric:
  1. **Activación por cliente:** solo algunos clientes llevan SEO estratégico, y otros solo necesitan comprobaciones básicas.
  2. **Cada análisis con su frecuencia, editable** desde un panel propio y también **por cliente**.
  3. **Opus** para el estratega.

## 1. Objetivo

> Que cada cliente reciba exactamente el seguimiento que tiene contratado (desde «comprobar cada 15 días que su web va bien» hasta un estratega que analiza, correlaciona con el trabajo hecho y propone tareas para llegar a sus KPIs) y que la agencia pueda ajustar qué se revisa y cada cuánto sin tocar código.

**Principio que aplica a esta función y a las siguientes:** cada función tiene **su propio panel, separado**. En él, el administrador cambia **qué se hace y cada cuánto**, con valores por defecto y **ajustes por cliente**. No hay frecuencias fijas en el código.

## 2. Tres niveles de configuración

```
CATÁLOGO DE PROCESOS (lo que el sistema sabe hacer; definido en código)
   │  p. ej. «Salud técnica de la web», «Palabras clave posicionadas», «Análisis del estratega»…
   ▼
PLANES DE SEGUIMIENTO (los define el admin en el panel)
   │  qué procesos lleva cada plan y con qué frecuencia
   │  p. ej. «Mantenimiento»: salud web cada 15 días · «SEO estratégico»: todo, estratega semanal
   ▼
CLIENTE (en su ficha)
      Plan asignado (o ninguno = apagado) + ajustes propios opcionales
      p. ej. «SEO estratégico, pero palabras clave cada 7 días porque tiene campañas»
```

- **Por defecto, ningún cliente tiene nada activado.** Se activa en la ficha eligiendo un plan.
- **Cambiar un plan** afecta a todos sus clientes, salvo los procesos que un cliente tenga ajustados a mano.
- En la ficha y en el panel se ve siempre la **frecuencia efectiva** de cada proceso y de dónde sale: «del plan» o «ajustada para este cliente». Hay un botón «Volver a la del plan».
- **Pausar** a un cliente (vacaciones del cliente, impago, cambio de web) detiene todo hasta una fecha sin perder su configuración.

## 3. Catálogo de procesos

Cada proceso tiene su frecuencia (diario, cada 3 días, semanal, cada 15 días, mensual o desactivado), su día preferido de la semana o del mes cuando aplica, y su tipo de coste. La **frecuencia por defecto** es la propuesta inicial y se cambia en el panel.

| Proceso | Qué hace | Coste | Frecuencia por defecto propuesta |
|---|---|---|---|
| **Descarga de datos de Google** | Rendimiento: Search Console, Analytics y Business Profile. Ya existe | Gratis | Diario. Es la base de todo y no consume IA; en Rendimiento ya se descargan todos los clientes con propiedades |
| **Semáforo de objetivos** | Recalcula cómo va cada objetivo y avisa solo si empeora | Gratis (código) | Diario |
| **Salud técnica de la web** | Velocidad y Core Web Vitals (PageSpeed Insights), páginas principales que responden bien (sin 404/500), certificado SSL, `noindex` o `robots.txt` que bloqueen, sitemap, páginas con problemas de indexación (Search Console) | Gratis (APIs de Google) | Cada 15 días |
| **Palabras clave posicionadas** | Posición de las palabras clave que sigue el cliente: de Search Console (gratis) y, si se activa, posición exacta en Google con DataForSEO (de pago, muy barato) | Gratis o DataForSEO | Cada 15 días |
| **Ficha de Google Business** | Vistas, llamadas, cómo llegar y datos de la ficha; avisa de caídas o de cambios en la ficha | Gratis | Cada 15 días |
| **URLs trabajadas** | Sigue día a día las páginas en las que se ha trabajado, con 90 días de «antes» descargados al marcarlas, para medir el impacto | Gratis | Diario mientras dure el seguimiento (180 días por defecto) |
| **Detectores de oportunidades** | Consultas al alcance (posición 4-20), CTR bajo, páginas en caída, consultas nuevas sin página, contenido envejecido, embudos rotos | Gratis (código) | Semanal |
| **Competencia** | Quién aparece en Google para las palabras clave del cliente y qué cambia | DataForSEO | Mensual |
| **Extracción de datos de tareas** | Al cerrarse un encargo del cliente: tipo de trabajo, URLs, palabras clave y KPIs que debería mover. Pregunta la URL si falta | IA mínima (Haiku, ≈ 0,0001 $ por tarea) | Al cerrar cada tarea |
| **Medición del impacto** | Mide cada tarea terminada a los 30, 60 y 90 días frente a su «antes» | Gratis (código) | Días configurables (30/60/90) |
| **Análisis del estratega** | Opus revisa todo lo anterior, correlaciona con el trabajo hecho y **propone tareas** con evidencias, dentro de las horas contratadas | IA (Opus) | Semanal |
| **Análisis por alerta** | El estratega actúa al momento si salta algo grave: objetivo desviado, caída fuerte o web caída | IA (Opus) | Encendido o apagado; tope de N al mes por cliente |
| **Guardián** | Comprueba que el cliente tiene objetivos, trabajo planificado para las próximas 2 semanas y horas al ritmo del contrato, y que no hay propuestas sin responder | Gratis (código) | Cada 3 días |
| **Revisión mensual** | Informe interno y borrador para el cliente | IA (Opus) | Mensual, día 5 |
| **Aprendizajes de la agencia** | Qué tipos de trabajo funcionan, en qué sector y en cuánto tiempo, con todos los clientes | IA (Opus) | Mensual (es de toda la agencia, no de cada cliente) |

- **Dependencias:** cada proceso declara de qué otros depende. Por ejemplo, el estratega necesita la descarga de datos y los detectores, y la medición del impacto necesita las URLs trabajadas. El panel avisa si se activa uno sin lo que necesita («El estratega funciona mejor con Detectores activados») y no deja activar uno imposible.
- **Ventana de datos de cada análisis:** el estratega ve lo ocurrido **desde su última ejecución** y lo compara con el mismo tramo anterior y con el año pasado. Si un cliente está «cada 15 días», analiza 15 días; si está «semanal», 7. Así la frecuencia y lo que se analiza siempre encajan.

## 4. Planes de seguimiento iniciales (editables)

Propuesta de partida, que el admin puede cambiar, duplicar o borrar:

| Plan | Para quién | Procesos activos |
|---|---|---|
| **Ninguno** (por defecto) | Clientes sin servicio de seguimiento | — |
| **Mantenimiento web** | SEO básico o mantenimiento: «que todo vaya bien» | Salud técnica cada 15 días · Guardián (solo «web caída» y horas) |
| **SEO local** | Negocios locales con ficha de Google | Salud técnica cada 15 días · Ficha de Google semanal · Palabras clave cada 15 días · Objetivos · Detectores semanal · Estratega cada 15 días · Revisión mensual |
| **SEO estratégico** | Clientes con estrategia orgánica completa (hoy unos 7 u 8) | Todo el catálogo · Estratega semanal · Análisis por alerta · Revisión mensual |

## 5. El panel propio: «Estrategia» (Trabajo → Estrategia)

Separado de Rendimiento y de Operaciones. Cuatro pestañas:

1. **Clientes:** solo los que tienen un plan. Para cada uno: plan, ajustes propios (marcados), semáforo de objetivos, propuestas pendientes, horas usadas frente a contratadas, último análisis, próxima ejecución de cada proceso y coste del mes. Filtros: «Necesitan atención», «Sin trabajo planificado», «Pausados». Botón «Activar cliente», que abre la lista de clientes sin plan.
2. **Planes:** tabla de procesos × planes; en cada casilla, la frecuencia en un desplegable. Debajo de cada plan, el **coste estimado al mes**, que se recalcula al cambiar una frecuencia con el coste medio real de cada proceso (al principio, la estimación). Crear, duplicar y borrar planes; al borrar uno, hay que pasar sus clientes a otro plan.
3. **Calidad y aprendizajes:** aceptación de las propuestas del estratega (a la primera, ajustadas, rechazadas y motivos), impacto medio de lo propuesto y los aprendizajes de la agencia.
4. **Ajustes:**
   - modelo del estratega (Opus 5.5 por defecto);
   - máximo de propuestas por cliente y análisis;
   - umbrales del semáforo;
   - **tope de gasto de IA del módulo** al mes, con aviso al 80 % y, si se alcanza, el estratega pasa a la mitad de frecuencia en vez de pararse;
   - DataForSEO encendido o apagado;
   - avisos por Telegram;
   - apartado en el informe semanal.

**En la ficha del cliente**, pestaña «Estrategia»:
- **Arriba:** el **plan** (desplegable, editor o admin) y la lista de procesos con su frecuencia efectiva y de dónde sale (del plan o ajustada), cada uno editable para ese cliente, más «Pausar hasta…».
- **Si no tiene plan:** «Este cliente no tiene seguimiento activo», con el botón «Activar» y una línea por plan explicando qué incluye y su coste estimado.
- **Con plan:** las secciones que correspondan a sus procesos activos, y solo esas:
  - último diagnóstico y «Analizar ahora»;
  - objetivos;
  - propuestas;
  - trabajo e impacto;
  - salud de la web;
  - palabras clave;
  - señales;
  - iniciativas;
  - revisiones.

  Un cliente de «Mantenimiento web» solo ve la salud de su web.

**Permisos:**
- ver: lector;
- aprobar propuestas y editar objetivos, iniciativas y palabras clave: editor;
- asignar un plan, ajustar las frecuencias de un cliente, editar planes y ajustes, y borrar: **admin**, porque cambia el coste.

## 6. El estratega y el ciclo (de la v2, sin cambios de fondo)

- **Medir:** Rendimiento, las URLs trabajadas día a día, las palabras clave y la salud de la web.
- **Entender:** los detectores (código) preparan las señales con su evidencia. El estratega (Opus, con herramientas) recibe:
  - las señales;
  - el trabajo hecho (encargos con sus datos extraídos y horas);
  - la ficha, la memoria y la competencia;
  - los objetivos;
  - el historial de sus propuestas;
  - los aprendizajes de la agencia.
  
  Puede profundizar con DataForSEO, Search Console en directo, Clarity, la lectura de webs y el subagente Revisor web. Separa siempre la correlación de la causa y da un nivel de confianza.
- **Proponer:** tareas con la evidencia obligatoria (validada en el código), el objetivo que persiguen, las horas estimadas y la prioridad. Respeta las horas restantes del contrato y no repite encargos abiertos ni de los últimos 90 días.
  - Te llegan en un mensaje por cliente, con los botones ✅ (crea el encargo en ClickUp por el flujo de Operaciones), ✏️ ajustar, ⏸️ más adelante y ✖️ no (con motivo).
  - Si el objetivo no cabe en las horas, lo dice: es una señal para ampliar el servicio.
- **Aprender:** el impacto de cada tarea se mide a los 30, 60 y 90 días, con los aprendizajes de la agencia. Las métricas de aceptación e impacto entran desde la primera versión. Los motivos de rechazo vuelven como contexto.
- **Autonomía:** al principio, todo con aprobación. El piloto automático podrá proponer pasar a autónomo los tipos de tarea con muchas aprobaciones a la primera, con el mecanismo que ya existe.
- **Objetivos:** semáforo con la trayectoria esperada, sobre los últimos 28 días, salvo que se decida otra cosa. El estratega propone metas realistas con el histórico, las horas y lo aprendido de clientes parecidos.

## 7. Modelo de datos (módulo «Estrategia», prefijo `est_`, migración 0050)

| Tabla | Para qué |
|---|---|
| `est_plans` | Planes: nombre, descripción y `processes` (jsonb: proceso → {activo, cada_días, día_preferido}) |
| `est_client_settings` | Una fila por cliente con seguimiento: plan, `overrides` (jsonb, mismo formato, solo lo ajustado), pausado hasta, prioridad, notas |
| `est_process_runs` | Agenda y registro: cliente, proceso, última ejecución, **próxima ejecución**, estado, error, duración y coste. El planificador elige lo que toca por `next_run_at` y reparte la carga |
| `est_objectives` | Objetivos: KPI, partida (y la del año pasado), meta, fechas, estado, último semáforo |
| `est_initiatives` | Agrupaciones de tareas con un fin; hito en las gráficas al terminar |
| `est_keywords` | Palabras clave seguidas por cliente: palabra, URL objetivo, ubicación e historial de posiciones |
| `est_health_checks` | Resultado de cada revisión de salud web: métricas (velocidad, CWV, errores) y problemas encontrados |
| `est_signals` | Señales detectadas, con evidencia, gravedad, estado y clave única para no repetir |
| `est_analyses` | Cada ejecución del estratega: motivo, ventana analizada, modelo, coste y resultado estructurado |
| `est_suggestions` | Tareas propuestas: evidencia, objetivo, horas, impacto esperado, estado, motivo de rechazo, tarea de ClickUp creada |
| `est_work_facts` | Datos de cada tarea terminada e impacto medido a 30/60/90 días |
| `est_tracked_urls` | URLs seguidas día a día (los datos se guardan en Rendimiento por el núcleo) |
| `est_learnings` | Aprendizajes de la agencia |
| `est_reviews` | Revisiones mensuales |
| `est_settings` | Ajustes del módulo por cuenta |

**Conexiones con otros módulos, por registros del núcleo:**
- KPIs, series y seguimiento de URLs: Rendimiento.
- Encargos, horas, crear encargos y pregunta de la URL al cerrar: Operaciones.
- Hitos en las gráficas: de Estrategia hacia Rendimiento.
- Herramientas del estratega, informe semanal y salud: los registros que ya existen.

Ningún módulo importa a otro.

## 8. Coste (revisado: solo los clientes activados)

Con unos **8 clientes en «SEO estratégico»** y unos 5 en «SEO local»: estimación con los precios de la tabla del sistema, sin verificar con uso real.

| Uso | Unidad | Al mes |
|---|---|---|
| Estratega semanal (Opus), 8 clientes × 4,3 | ≈ 0,25 $ | ≈ 9 $ |
| Estratega cada 15 días (Opus), 5 clientes × 2 | ≈ 0,25 $ | ≈ 2,5 $ |
| Análisis por alerta (tope de 2 al mes por cliente; uso real estimado: 1) | ≈ 0,25 $ | ≈ 3 $ |
| Revisiones mensuales (13) | ≈ 0,15 $ | ≈ 2 $ |
| Aprendizajes de la agencia | ≈ 0,30 $ | ≈ 0,3 $ |
| Extracción de tareas (Haiku) | ≈ 0,0001 $ | < 0,1 $ |
| DataForSEO (palabras clave cada 15 días y competencia mensual), si se activa | Según el número de palabras | Pocos $ (sin verificar) |
| **IA total** | | **≈ 17 $/mes** |

- **Presupuesto:** cabe en el presupuesto actual de 80 $/mes. Propongo un **tope propio del módulo de 30 $/mes**, editable en el panel, con el aviso del vigía de IA. No hace falta subir el general por ahora.
- **Coste por plan:** el panel enseña el coste estimado de cada plan y el real de cada cliente. Si un cliente cuesta más de lo esperado, se ve.

## 9. Riesgos y cómo se evitan

| Riesgo | Mitigación |
|---|---|
| Configuración demasiado compleja | Planes con valores razonables: lo normal es elegir un plan y listo. Los ajustes por cliente son opcionales y quedan marcados. Siempre se ve la frecuencia efectiva y de dónde sale |
| Activar un proceso sin lo que necesita | Dependencias declaradas: el panel avisa y no deja un estado imposible |
| Consejos genéricos o causalidad inventada | Evidencia obligatoria validada en el código; correlación y causa separadas; impacto medido con datos |
| Saturar al equipo o pasarse de horas | Tope de propuestas por análisis; prioridad dentro de las horas restantes; un mensaje por cliente |
| Coste | Solo los clientes activados; tope del módulo; coste visible por plan y por cliente; bajada de frecuencia automática al llegar al tope |
| Que el equipo se sienta vigilado | Se miden clientes y trabajo, no personas |

## 10. Decisión: tres pasadas de cuestionamiento (v3)

1. **¿Cumple el objetivo final?** Sí, y mejor que la v2. Un account manager no trata igual a todos los clientes: dedica más a los prioritarios y solo vigila a los de mantenimiento. Los planes con frecuencias reflejan cómo trabaja la agencia y lo que vende cada servicio. **Cambio:** los planes son la unidad central del diseño. Antes lo era el estratega.
2. **¿Coste o riesgo oculto?**
   - **Coste:** al activar solo los clientes que lo necesitan, baja de unos 45 a unos 17 $/mes.
   - **Riesgo nuevo:** la complejidad de configuración. Se mitiga con los planes por defecto, la frecuencia efectiva siempre visible y los ajustes por cliente opcionales.
   - **Riesgo de no coordinar ejecuciones:** con frecuencias distintas, el estratega podría correr antes de que haya datos frescos. Por eso declara dependencias, y el planificador no lo lanza hasta que sus procesos previos se han ejecutado en la misma ventana.
3. **¿Hay algo que ya tenemos y no usamos?**
   - **Servicios contratados y niveles de cliente de Operaciones:** se podría deducir el plan del servicio contratado. Pero la relación servicio → plan no siempre es directa, y Enric quiere decidirlo cliente a cliente. **Decisión:** el plan se elige a mano. El panel puede **sugerir** el plan según los servicios del cliente, sin aplicarlo solo.
   - **Automatizaciones de Operaciones:** ya tienen un panel de encendido y apagado. Pero son de Operaciones y no tienen ajustes por cliente; mezclarlas iría contra el «panel propio».

**Alternativas comparadas**

| Alternativa | Coste IA/mes | Qué se pierde |
|---|---|---|
| **A. Catálogo de procesos + planes editables + ajustes por cliente (recomendada)** | ≈ 17 $ | — |
| B. Un interruptor por cliente («estrategia avanzada sí/no») con frecuencias globales | Igual | No hay término medio (mantenimiento, SEO local) ni ritmo distinto para un cliente prioritario |
| C. Frecuencias solo por cliente, sin planes | Igual | Hay que configurar cada cliente proceso a proceso; cambiar algo para todos es lento y propenso a errores |
| D. Plan deducido solo de los servicios contratados | Igual | Menos control; los servicios no siempre dicen el nivel de seguimiento |

## 11. Plan de construcción (en fases, cada una desplegable)

1. **Fase 1, base configurable y medible:**
   - migración 0050 (con backup) y registros del núcleo;
   - catálogo de procesos, planes, ajustes por cliente y planificador por `next_run_at`;
   - panel (Clientes, Planes y Ajustes) y pestaña de la ficha con la activación;
   - procesos sin IA: salud técnica, palabras clave, ficha de Google, URLs trabajadas, detectores, semáforo y guardián;
   - extracción de las tareas y pregunta de la URL.
2. **Fase 2, el estratega:**
   - Opus con herramientas;
   - análisis periódico, por alerta y a petición;
   - propuestas con botones que crean encargos;
   - métricas de calidad y tope de coste.
3. **Fase 3, el ciclo cerrado:**
   - medición del impacto;
   - aprendizajes de la agencia;
   - revisión mensual;
   - apartado semanal;
   - iniciativas como hitos;
   - competencia.
4. **En cada fase:**
   - pruebas: lógica pura, base de datos y seguridad de cada acción;
   - Mapa Visual y su comprobación;
   - `docs/ESTADO.md`;
   - documento de sesión;
   - revisión completa.

**Recomendación:** desplegar tras la fase 1. Así empiezan a acumularse datos de URLs, palabras clave e impacto, y Enric puede ir configurando planes y clientes mientras se construye el estratega.

## 12. Decisiones que necesito de Enric

1. **¿Apruebas el enfoque A** (catálogo, planes y ajustes por cliente) **y el esquema** (migración 0050 con las tablas `est_*` y los registros del núcleo)?
2. **Planes iniciales y frecuencias por defecto** (§3 y §4): ¿te valen como punto de partida? Todo se podrá cambiar luego en el panel.
3. **Tope de IA del módulo:** 30 $/mes, sin subir el presupuesto general.
4. **Despliegue tras la fase 1** (recomendado).
5. **Pregunta «¿en qué URL?»** al cerrar una tarea que la necesite, con el botón «No aplica».
6. **DataForSEO** para la posición exacta de las palabras clave: ¿encendido en «SEO estratégico» y «SEO local», o solo Search Console, que es gratis pero da la posición media?

# Diseño — Estrategia viva: un estratega IA que vela por cada cliente (paso 6, versión 2)

**Estado:** propuesta v2, **pendiente de aprobación de Enric**. Necesita la migración 0050, así que no se construye nada sin su OK.
**Fecha:** 15 nov 2026. **Rama:** `feature/estrategia-viva`.
**Cambio respecto a la v1:** Enric pidió no recortar en IA y apostar por algo más potente: que la IA analice el rendimiento, lo **correlacione con las tareas hechas** y **proponga de forma proactiva las tareas nuevas** necesarias para llegar a los KPIs. La v1 era un registro de objetivos con un semáforo; la v2 es un **estratega que trabaja cada semana en cada cliente**.

## 1. Objetivo

> Que ningún cliente se quede sin el trabajo que necesita para llegar a sus objetivos, sin que Enric tenga que estar pendiente.

Un buen account manager o estratega SEO hace cada semana, con cada cliente:
1. Mirar los números y ver qué ha cambiado.
2. Entender por qué, cruzándolo con lo que se hizo (tareas, web nueva, artículos) y con lo que pasó fuera (actualizaciones de Google, temporada, competencia).
3. Decidir qué hay que hacer ahora para acercarse a los objetivos, dentro de las horas contratadas.
4. Encargarlo al equipo y comprobar después si funcionó.

Este diseño hace que el sistema haga los cuatro pasos. Enric y el equipo **supervisan y aprueban**. Con el tiempo, lo que demuestre funcionar puede pasar a autónomo, con el mismo mecanismo de autonomía por herramienta que ya existe.

## 2. El ciclo

```
   ┌──────────── MEDIR ────────────┐   Rendimiento (ya en producción) + URLs trabajadas día a día
   │                               ▼
APRENDER                        ENTENDER   Detectores de señales (código) + estratega IA
(impacto de cada tarea          (correlación con las tareas hechas)
 a 30/60/90 días; qué               │
 funciona en la agencia)            ▼
   ▲                             DECIDIR   El estratega propone tareas con evidencias,
   │                               │       impacto esperado y horas, dentro de la capacidad del cliente
   └──────── EJECUTAR ◄────────────┘   ✅ en Telegram / Mi bandeja → encargo en ClickUp (Operaciones)
```

## 3. Las piezas

### 3.1 Objetivos y KPIs (de la v1, mejorado con IA)
- **Objetivos medibles:** cifra de Rendimiento, partida, meta y fecha. También objetivos de hito, de sí o no.
- **Semáforo:** en camino, en riesgo, desviado, logrado o sin datos. Se calcula con aritmética sobre la trayectoria esperada. No se recorta nada por usar código aquí: es la medición, y tiene que ser exacta y reproducible. La inteligencia va encima.
- **Nuevo:** el estratega **propone objetivos realistas** a partir de cuatro fuentes:
  - el histórico del cliente: su tendencia y su estacionalidad;
  - lo que cuenta su ficha: negocio, zona y servicios contratados;
  - las horas contratadas;
  - lo que se ha conseguido con clientes parecidos de la agencia (§3.6).
  
  Cada propuesta explica por qué esa meta es alcanzable. Enric la aprueba o la ajusta.

### 3.2 Registro del trabajo hecho («qué tocamos y cuándo»)
Para correlacionar, el sistema tiene que saber **qué se hizo, cuándo y sobre qué URL o activo**.
- **Al terminar cada encargo de un cliente** (Operaciones ya lo sabe: estado completado, nota de cierre, tipo de trabajo y horas registradas), un modelo pequeño y muy barato (Haiku 5.5, unos 0,0001 $ por tarea) extrae de las tareas terminadas cuatro datos, que van a `est_work_facts`:
  - la **categoría** del trabajo: contenido nuevo, optimización on-page, técnico, enlaces, ficha de Google, web o campaña;
  - las **URLs o activos afectados**;
  - las **palabras clave objetivo**;
  - los **KPIs que debería mover**.
- **Si falta la URL** y la tarea la necesita (por ejemplo, «artículo publicado»), el bot pregunta al cerrarla: «¿En qué URL se ha publicado?», con un botón «No aplica». Es una pregunta de 5 segundos que hace posible medir el impacto de verdad.
- Al ver una tarea en ClickUp, el estratega también sabe el tiempo que costó.

### 3.3 Seguimiento diario de las URLs trabajadas
- Hoy guardamos el total diario de Search Console y el top 1.000 de páginas **por mes**. Para medir el efecto de un cambio en una página hace falta el detalle **diario** de esa página.
- Cuando una tarea toca una URL, Rendimiento empieza a seguir esa página día a día: clics, impresiones, CTR, posición y sus 20 consultas principales. Se guarda en `perf_daily` con desglose «page», sin migración de Rendimiento.
- **Lo mejor:** Search Console da 16 meses de histórico por página, así que al marcarla se descargan también **los 90 días anteriores al cambio**. El «antes» es exacto aunque la página no se siguiera antes.
- Coste: una petición más a Search Console por URL seguida y día. Las URLs dejan de seguirse a los 180 días del último cambio.

### 3.4 Detectores de señales (código, sin IA: rápidos, exactos y gratis)
Cada día, tras la descarga de Rendimiento, unas reglas buscan **oportunidades y problemas concretos**. Son lo que el estratega recibe para pensar, en vez de miles de filas sin procesar:

| Señal | Qué detecta | Acción típica que sugiere |
|---|---|---|
| **Al alcance** | Consultas en posición 4-20 con muchas impresiones | Optimizar la página que posiciona: títulos, contenido, enlaces internos |
| **CTR bajo** | Páginas o consultas con un CTR muy por debajo del esperado para su posición | Reescribir el title y la meta descripción |
| **Página en caída** | Páginas que pierden clics o posición de forma sostenida, frente a 4 semanas antes y frente al año pasado | Revisar y actualizar el contenido, mirar la competencia |
| **Consultas nuevas** | Consultas que aparecen y crecen sin una página pensada para ellas | Crear contenido |
| **Contenido envejecido** | Páginas importantes sin tocar en 12 meses y bajando | Actualizar |
| **Embudo roto** | Sube el tráfico y no las conversiones; suben las vistas de la ficha y no las llamadas | Revisar la conversión de la web o la ficha |
| **Ficha de Google** | Caída de vistas en Maps; reseñas o publicaciones paradas (cuando se integren) | Publicaciones y gestión de reseñas |
| **Objetivo torcido** | Un objetivo pasa a en riesgo o desviado | Análisis a fondo de ese KPI |
| **Sin trabajo planificado** | Cliente activo con objetivos y sin encargos próximos alineados | Plan de trabajo de las próximas semanas |
| **Horas sin usar o excedidas** | Las horas del mes van muy por debajo o por encima del contrato (ya se calcula en Operaciones) | Ajustar el plan |

Cada señal guarda su evidencia (números, URLs y consultas), su gravedad y su estado: nueva, atendida o descartada. Así no se repite.

### 3.5 El estratega (IA principal, modelo potente)
Es un agente nuevo, «Estratega», con el motor de agentes que ya existe. Trabaja con **herramientas** y no con un prompt gigante: lee lo que necesita y profundiza donde hay algo.
- **Cuándo trabaja:**
  - **Revisión semanal de cada cliente** con objetivos o servicio activo, repartida durante la semana para no concentrar el coste.
  - **Al instante** si salta una señal grave: objetivo desviado, caída fuerte o un cliente sin trabajo planificado.
  - **A petición** por Telegram («analiza X», «¿por qué ha caído X?», «¿qué hacemos este mes con X?») o con un botón en la pestaña.
- **Herramientas, todas ya existentes salvo las marcadas como nuevas:**
  - Rendimiento: cifras, consultas y páginas que suben y bajan, canales y el «antes y después» de los hitos.
  - Señales del cliente y detalle diario de las URLs trabajadas (nuevo).
  - Trabajo hecho y pendiente: encargos del cliente con sus datos extraídos, horas del mes y capacidad.
  - Ficha del cliente, memoria aceptada, competencia y servicios contratados.
  - Objetivos e iniciativas.
  - SEO en directo: SERP de Google, volúmenes (DataForSEO), Search Console en directo, Clarity y lectura de webs. Puede encargar una revisión al subagente «Revisor web».
  - Aprendizajes de la agencia (§3.6).
  - Historial de sus propias propuestas: las aceptadas, las rechazadas con su motivo y el impacto medido.
- **Qué entrega:** un resultado estructurado y validado, guardado en `est_analyses`:
  1. **Diagnóstico:** qué ha pasado y cómo van los objetivos.
  2. **Correlaciones:** «La página /servicios/x subió de la posición 14 a la 6 tras la optimización del 3 oct; +38 % de clics, confianza media porque coincide con una actualización de Google». Siempre con su evidencia y su nivel de confianza, y separando la relación temporal de la causa.
  3. **Tareas propuestas**, cada una con su evidencia, su porqué y lo que deja escrito para el encargo (ver la lista siguiente).
  4. **Preguntas** para Enric o el equipo, cuando le falta algo («¿se cambió el teléfono de la ficha en octubre?»).
  5. **Riesgos:** por ejemplo, «el objetivo de llamadas no se alcanzará con las horas actuales: harían falta unas 6 h/mes más». Esto es también una **señal comercial** para ampliar el servicio.
- **Lo que lleva cada tarea propuesta:**
  - título y descripción lista para el encargo;
  - el **objetivo y KPI** que persigue;
  - la **evidencia**: las consultas, URLs y números exactos;
  - el impacto esperado y su confianza;
  - las **horas estimadas**, el tipo de trabajo, la prioridad y la fecha propuesta;
  - el responsable sugerido, según los servicios del cliente.
- **Reglas que evitan consejos genéricos:**
  - No se acepta una tarea sin evidencia concreta. Se valida en el código y, si falla, la propuesta se descarta.
  - No repite lo que ya está pendiente o se hizo hace poco: se compara con los encargos abiertos y los últimos 90 días.
  - Respeta la capacidad: prioriza para que el total quepa en las horas restantes del mes. Lo que no quepa queda como «en cola», o como un riesgo si pone en peligro un objetivo.
  - Como mucho N propuestas por cliente y semana (ajustable), para no saturar al equipo.
  - Separa siempre correlación de causa, y lo dice cuando no puede saberlo.

### 3.6 Medir el impacto y aprender
- **Cada tarea terminada** con URL o KPI conocido se mide sola a los 30, 60 y 90 días. Hay dos comparaciones:
  - la URL contra su «antes», que es exacto gracias a §3.3;
  - el KPI del cliente contra su tendencia y contra el año anterior.
- Resultado en `est_work_facts`: impacto positivo, nulo, negativo o no concluyente, con sus números.
- **Aprendizajes de la agencia** (`est_learnings`): cada semana se resume qué tipos de trabajo funcionan, para qué sector y en cuánto tiempo. Por ejemplo, «Optimizar el title de páginas en posición 4-10: +22 % de clics de media a los 45 días, 31 casos». La agregación es código y la redacción, IA.
  - El estratega los usa al proponer y al estimar el impacto.
  - Es **conocimiento propio de la agencia**, que crece con cada cliente y que ninguna herramienta externa tiene.
- **Calidad del estratega:** porcentaje de propuestas aceptadas a la primera, corregidas y rechazadas (y por qué), e impacto medio de las tareas que propuso frente al resto. Se ve en la pantalla Agentes, como el resto de métricas del motor de acciones. Los motivos de rechazo se le dan como contexto para que no repita errores.

### 3.7 Del análisis al encargo (y autonomía)
- Las tareas propuestas llegan a Enric por **Telegram** (un mensaje por cliente con todas sus propuestas, no una por tarea) y a **Mi bandeja**. Botones por tarea:
  - ✅ **Crear:** crea el encargo en ClickUp con el flujo actual de Operaciones, el envío fiable y el responsable del servicio.
  - ✏️ **Ajustar** (por texto o audio).
  - ⏸️ **Más adelante.**
  - ✖️ **No** (pide un motivo breve).
- **Autonomía:** al principio, todo con aprobación. Cuando un tipo de tarea tenga muchas aprobaciones a la primera, el piloto automático propone pasarlo a «autónomo dentro de las horas contratadas», igual que ya hace con otros tipos.
- Las tareas creadas quedan ligadas a la propuesta, al objetivo y a la iniciativa. Así el ciclo de medir el impacto se cierra solo.

### 3.8 El guardián (cada día)
Cada mañana comprueba en cada cliente activo:
- que tiene objetivos (si no, propone);
- que tiene trabajo planificado para las próximas 2 semanas, alineado con sus objetivos;
- que las horas del mes van al ritmo del contrato;
- que no hay propuestas sin responder de hace más de N días (recordatorio con el plazo, como el resto de colas);
- que no hay objetivos vencidos sin cerrar.

Lo que no cumpla dispara el estratega o un aviso. En el informe semanal hay un apartado «Estrategia»: objetivos que cambian de estado, impacto de lo terminado y clientes que necesitan atención.

### 3.9 Revisión mensual
El día 5 de cada mes, el estratega redacta dos textos por cliente:
- **Interna:** cómo van los objetivos, qué funcionó y qué no (con el impacto medido), propuestas para el mes y riesgos.
- **Para el cliente:** un informe claro, en su lenguaje, con los logros y el trabajo hecho. Sale en borrador para copiar; nunca se envía solo.

## 4. Pantallas

**Pestaña «Estrategia» en la ficha del cliente**
- **Arriba:** el último diagnóstico del estratega en tres o cuatro frases, con su fecha y el botón **«Analizar ahora»**.
- **Objetivos:** tarjetas con la cifra actual, la meta, la trayectoria, el semáforo y una minigráfica. Botones: Nuevo, «Proponer objetivos», Editar, Ampliar fecha, Cerrar y Eliminar (admin).
- **Propuestas:** las tareas sugeridas pendientes, con su evidencia desplegable y los mismos botones que en Telegram.
- **Trabajo e impacto:** línea de tiempo de lo hecho, cada tarea con su impacto medido (🟢 / ⚪ / 🔴 / pendiente) y las URLs que tocó. Sirve para responder al cliente «¿qué habéis hecho y para qué ha servido?».
- **Señales abiertas:** oportunidades y problemas detectados, con su evidencia.
- **Iniciativas:** agrupaciones de varias tareas con un fin, como «Web nueva» o «Plan de contenidos del primer trimestre». Al terminarse, salen como hito en las gráficas de Rendimiento.
- **Revisiones mensuales.**
- **Estado vacío:** «Este cliente aún no tiene estrategia», con los botones «Proponer objetivos» y «Analizar ahora».

**Panel central: Trabajo → Estrategia**
- Todos los clientes con su semáforo, propuestas pendientes, horas usadas frente a contratadas, último análisis e impacto del trimestre.
- Filtros: «Necesitan atención», «Sin estrategia», «Sin trabajo planificado» y «Horas excedidas».
- **Aprendizajes de la agencia:** qué funciona y en cuánto tiempo.
- **Calidad y coste del estratega:** aceptación, impacto y gasto del mes.
- **Ajustes (admin):**
  - modelo del estratega;
  - frecuencia del análisis;
  - número máximo de propuestas por cliente y semana;
  - umbrales del semáforo;
  - presupuesto de IA del módulo;
  - avisos.

**Permisos:** ver = lector; crear, editar y aprobar propuestas = editor; eliminar y ajustes = admin.

## 5. Modelo de datos (módulo nuevo «Estrategia», prefijo `est_`, migración 0050)

| Tabla | Para qué |
|---|---|
| `est_objectives` | Objetivos: KPI, partida (y la del año pasado), meta, fechas, estado y último semáforo, para avisar solo al empeorar |
| `est_initiatives` | Iniciativas: agrupación de tareas con un fin; hito en las gráficas al terminar |
| `est_signals` | Señales detectadas: tipo, evidencia (jsonb), gravedad, estado y clave única por cliente, tipo y objeto para no repetir |
| `est_analyses` | Cada ejecución del estratega: motivo (semanal, señal, petición), modelo, coste, resultado estructurado (jsonb) y diagnóstico |
| `est_suggestions` | Tareas propuestas: evidencia, objetivo, horas, impacto esperado, estado (pendiente, aceptada, ajustada, pospuesta o rechazada), motivo, id de la tarea de ClickUp creada |
| `est_work_facts` | Datos extraídos de cada tarea terminada: categoría, URLs, palabras clave, KPIs, horas, fecha; impacto a 30/60/90 días |
| `est_tracked_urls` | URLs seguidas día a día: desde cuándo y hasta cuándo, y por qué tarea. Lo lee Rendimiento por el núcleo |
| `est_learnings` | Aprendizajes de la agencia por tipo de trabajo y sector: casos, impacto medio y plazo |
| `est_reviews` | Revisiones mensuales: interna y para el cliente |
| `est_settings` | Ajustes por cuenta |

Las tareas se ligan por el id de la tarea de ClickUp, sin clave foránea a las tablas de Operaciones: un módulo no depende de las tablas de otro.

## 6. Conexiones con otros módulos (por el núcleo, sin importarse)

| Necesidad | Quién la ofrece | Registro en `lib/core/capabilities.ts` |
|---|---|---|
| Catálogo de KPIs, valores y series; consultas, páginas y hitos | Rendimiento | `registerKpiProvider` (nuevo) |
| Seguir URLs día a día | Rendimiento | `registerTrackedUrlSource` (nuevo): Estrategia da la lista y Rendimiento la descarga |
| Encargos del cliente (hechos y pendientes), horas y capacidad; crear un encargo | Operaciones | `registerWorkItemSource` (nuevo); crear encargo vía `proposeChange` con el ejecutor de crear encargo que ya existe |
| Pregunta «¿en qué URL?» al cerrar una tarea | Operaciones | `registerTaskCloseHook` (nuevo): Estrategia indica si necesita la URL y Operaciones pregunta en el flujo de cierre que ya existe |
| Iniciativas como hitos | Estrategia → Rendimiento | `registerMilestoneSource` (nuevo) |
| Herramientas del estratega, informe semanal, salud y tareas programadas | — | Ya existen |

## 7. Coste de IA (estimación, sin verificar con el uso real)

Precios de la tabla de respaldo del sistema: Opus 5.5 a 4 $/20 $ por millón de tokens de entrada/salida y Haiku 5.5 a 0,10 $/0,50 $.

| Uso | Modelo | Por unidad | Al mes con 30 clientes |
|---|---|---|---|
| Análisis semanal con herramientas (≈ 40.000 tokens de entrada, con caché, y 5.000 de salida) | Opus 5.5 | ≈ 0,25 $ | ≈ 32 $ |
| Análisis por señal o a petición (estimado: 1 por cliente y mes) | Opus 5.5 | ≈ 0,25 $ | ≈ 8 $ |
| Revisión mensual (interna y para el cliente) | Opus 5.5 | ≈ 0,15 $ | ≈ 5 $ |
| Extracción de datos de cada tarea terminada (≈ 600 al mes) | Haiku 5.5 | ≈ 0,0001 $ | < 0,10 $ |
| Aprendizajes semanales | Opus 5.5 | ≈ 0,20 $ | ≈ 1 $ |
| **Total** | | | **≈ 45 $/mes con 30 clientes (≈ 1,5 $ por cliente)** |

- **Presupuesto:** el presupuesto de IA actual es de **80 $/mes** para todo el sistema. Esto lo superaría con el uso actual. Propongo **subirlo a 150 $/mes** y que el módulo tenga su propio tope, con un aviso del vigía de IA. Si se alcanza el tope, el estratega pasa a analizar cada dos semanas en vez de pararse.
- **Comparación:** 1,5 $ por cliente y mes frente a las horas de un account manager revisando cada cliente cada semana.
- **Si hay más clientes:** se puede usar Sonnet 5.5 (2 $/10 $) para la revisión semanal rutinaria y reservar Opus para los análisis por señal y la revisión mensual. Queda en los ajustes; recomiendo empezar con Opus en todo y bajar si la calidad lo permite, medido con la tasa de aceptación.

## 8. Riesgos y cómo se evitan

| Riesgo | Mitigación |
|---|---|
| Consejos genéricos («haced más contenido») | La evidencia concreta es obligatoria y se valida en el código; se comparan con los encargos abiertos y recientes; los motivos de rechazo vuelven como contexto |
| Causalidad inventada | Correlación y causa van separadas; confianza explícita; se cruza con temporada, año anterior y actualizaciones de Google conocidas (hitos de tipo «google»); impacto medido con datos, no con opiniones |
| Saturar al equipo o pasarse de horas | Tope de propuestas por cliente; prioridad dentro de las horas restantes; un solo mensaje por cliente; ⏸️ «más adelante» |
| Coste desbocado | Tope del módulo y vigía de IA; análisis repartidos durante la semana; caché de prompt; bajada automática de frecuencia |
| Datos incompletos (sin URL, sin GA4) | Pregunta «¿en qué URL?» al cerrar; el estratega trabaja con lo que hay y dice qué le falta («asigna Analytics a X para medir conversiones») |
| Propuestas que nadie responde | Plazo y recordatorio como el resto de colas de Mi bandeja; apartado en el semanal |
| Que el equipo se sienta vigilado | Mide **clientes y trabajo**, no personas. Ranking ni comparaciones entre personas; en la línea del rendimiento del equipo diseñado con psicología |

## 9. Decisión: tres pasadas de cuestionamiento

**Hipótesis:** un estratega IA semanal por cliente, sobre señales calculadas por código, que propone tareas con evidencia y mide su impacto.

1. **¿Cumple el objetivo final?** Sí, y es el corazón de la visión «Operaciones sustituye a un humano». La v1 solo informaba; esta decide y propone el trabajo. **Cambio tras esta pasada:** sin medir el impacto de cada tarea, el estratega propondría a ciegas. Por eso entran el seguimiento diario de URLs y el aprendizaje de la agencia. Sin ellos, la correlación sería de «impresión» y no de datos.
2. **¿Qué coste o riesgo oculto tiene?**
   - **Coste:** la IA sube unos 45 $/mes, asumible y con tope.
   - **Riesgo principal:** que las propuestas sean flojas y se ignoren. Por eso el diseño obliga a la evidencia, valida en el código y mide la calidad desde el primer día. **Cambio tras esta pasada:** las métricas de aceptación e impacto entran en la primera fase y no al final.
   - **Riesgo de datos:** sin la URL de cada tarea no hay correlación fina. De ahí la pregunta de 5 segundos al cerrar.
3. **¿Hay algo que ya tenemos y no usamos?**
   - **Motor de agentes con herramientas, subagentes, motor de propuestas con aprobación y métricas, autonomía por herramienta, Rendimiento, horas por tarea, tipos de trabajo, DataForSEO y Revisor web:** el 70 % de las piezas ya existe. El trabajo nuevo es sobre todo la orquestación, las señales, la medición del impacto y las pantallas.
   - **Módulo SEO con clusters y plan de contenidos:** el estratega podría usarlo para proponer el contenido. Queda como segunda fase, porque ese módulo trabaja con `projects` y no con la ficha del núcleo.

**Alternativas comparadas**

| Alternativa | Coste IA/mes | Esfuerzo | Qué se pierde |
|---|---|---|---|
| **A. Estratega proactivo con señales, impacto y aprendizaje (recomendada)** | ≈ 45 $ | Alto (≈ 1,5 veces Rendimiento) | — |
| B. v1: objetivos y semáforo sin IA | 0 $ | Medio | Lo que pide Enric: entender y proponer trabajo |
| C. Solo IA a petición («analiza X» por Telegram, sin ciclo semanal ni medición) | ≈ 5-10 $ | Bajo | Proactividad, guardián, aprendizaje: depende de que alguien pregunte |
| D. Herramienta externa con recomendaciones IA (plataformas SEO) | Su suscripción | Bajo | No conoce las tareas, horas ni objetivos del cliente; no crea encargos; no aprende de la agencia |

## 10. Plan de construcción (en fases, cada una desplegable)

1. **Fase 1, base medible:**
   - migración 0050 (con backup) y registros del núcleo;
   - objetivos con semáforo;
   - extracción de datos de las tareas terminadas y la pregunta de la URL;
   - seguimiento diario de URLs, con 90 días de «antes»;
   - detectores de señales;
   - pestaña y panel en versión básica.
2. **Fase 2, el estratega:**
   - agente «Estratega» con sus herramientas;
   - análisis semanal, por señal y a petición;
   - propuestas con ✅ / ✏️ / ⏸️ / ✖️ que crean encargos;
   - métricas de calidad;
   - tope de coste.
3. **Fase 3, el ciclo cerrado:**
   - medición del impacto a 30/60/90 días;
   - aprendizajes de la agencia;
   - guardián diario;
   - revisión mensual;
   - apartado semanal;
   - iniciativas como hitos.
4. **Cierre de cada fase:**
   - pruebas (lógica pura, base de datos, seguridad de cada acción);
   - Mapa Visual y su comprobación;
   - `docs/ESTADO.md`;
   - documento de sesión;
   - revisión completa.

Las tres fases van en esta rama. Puedo construirlas seguidas, como Rendimiento, o desplegar tras la fase 1 para que vayan acumulándose datos de URLs e impacto mientras se construye el resto. Recomiendo esto último: **el aprendizaje necesita tiempo de datos**, y cuanto antes empiece a medirse, antes será útil el estratega.

## 11. Decisiones que necesito de Enric

1. **¿Apruebas el enfoque A y el esquema** (migración 0050 con las tablas `est_*` y los registros nuevos del núcleo)?
2. **Presupuesto de IA:** ¿subimos el general a 150 $/mes, con un tope propio para el módulo (propuesta: 60 $/mes)?
3. **Modelo del estratega:** Opus 5.5 en todo (recomendado para empezar) o Sonnet 5.5 en la revisión semanal rutinaria.
4. **Despliegue:** tras la fase 1, para empezar a medir cuanto antes (recomendado), o todo junto al final.
5. **Pregunta «¿en qué URL?» al cerrar una tarea:** ¿te parece bien añadir esa pregunta al equipo? Es opcional, con el botón «No aplica».
6. **Medición del semáforo:** últimos 28 días (recomendado) o último mes natural cerrado.

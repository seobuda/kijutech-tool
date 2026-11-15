# Diseño — Estrategia viva por cliente (paso 6 de la hoja de ruta)

**Estado:** propuesta, **pendiente de aprobación de Enric**. Necesita la migración 0050 (tablas nuevas), así que no se construye nada sin su OK.
**Fecha:** 15 nov 2026. **Rama:** `feature/estrategia-viva`.
**Se apoya en:** Rendimiento del cliente (0049, en producción), ficha del cliente del núcleo (0048), Operaciones (encargos y motor de propuestas).

## 1. Objetivo

Hoy cada cliente tiene dos textos libres en su ficha: «Objetivos» y «Estrategia». Nadie puede contestar con datos a la pregunta **«¿vamos bien con este cliente?»**, y nadie avisa si un objetivo se tuerce.

Estrategia viva lo convierte en algo medible y que se sigue solo:

1. **Objetivos medibles:** cifra de partida, meta y fecha. Por ejemplo, «llamadas desde la ficha de Google: de 40 a 60 al mes antes de junio de 2027». El progreso sale solo de los datos de Rendimiento.
2. **Iniciativas:** lo que hacemos para conseguirlo, como la web nueva, 8 artículos o la optimización de la ficha. Cada una va ligada a sus encargos de ClickUp, y al terminarla sale como hito en las gráficas, con su «antes y después».
3. **Seguimiento por excepción.** El sistema dice qué objetivos van bien, cuáles en riesgo y cuáles desviados. Avisa solo cuando algo cambia a peor, lo resume en el informe semanal y prepara una revisión mensual por cliente.

Visión: un account manager revisa cada mes la estrategia de cada cliente, comprueba si va bien y decide qué hacer. Esto es la base para que el sistema lo haga solo y Enric solo supervise.

## 2. Conceptos

| Concepto | Qué es | Ejemplo |
|---|---|---|
| **Objetivo** | Una meta con fecha. Puede ser **medible** (ligado a una cifra de Rendimiento) o **de hito** (sí/no, sin cifra). | «Clics desde Google: 1.200 → 1.600 al mes antes del 30/06/2027» · «Web nueva publicada antes de marzo» |
| **Línea de partida** | La cifra al crear el objetivo. Se calcula sola: el valor medio mensual de los 3 meses anteriores y, si hay datos, también el del mismo periodo del año pasado. | 1.210 clics/mes |
| **Trayectoria esperada** | La línea recta de la partida a la meta. Sirve para saber si «vamos bien» hoy y no solo al final. | En febrero deberíamos ir por unos 1.400 |
| **Iniciativa** | Una acción concreta, opcionalmente ligada a un objetivo, con estado, responsable y fecha. | «Optimizar la ficha de Google Business» |
| **Encargos ligados** | Tareas de ClickUp (encargos de Operaciones) que forman la iniciativa. Su estado se lee de lo que Operaciones ya guarda, sin llamadas a ClickUp. | 3 de 5 terminados |
| **Revisión mensual** | Una foto de cada mes: cómo iba cada objetivo, qué iniciativas se hicieron y los próximos pasos. | «Octubre: 2 en camino, 1 en riesgo» |

## 3. Cómo se calcula «vamos bien» (sin IA)

- **Valor actual:** la cifra de los últimos 28 días llevada a 30 días (×30/28), para compararla con metas «al mes». En posición media y CTR se usa el valor tal cual.
- **Esperado hoy:** partida + (meta − partida) × (días transcurridos / días totales).
- **Estado:**
  - 🟢 **En camino:** el actual llega al menos al 90 % del avance esperado.
  - 🟡 **En riesgo:** entre el 60 % y el 90 %.
  - 🔴 **Desviado:** por debajo del 60 %, o la cifra va hacia el lado contrario.
  - ✅ **Logrado:** la meta se alcanza durante 28 días seguidos. Puede ser antes de la fecha.
  - ⚪ **Sin datos:** la propiedad no está asignada o no hay días con datos.
- **Al vencer la fecha:** queda como logrado o no logrado, con la cifra final. Se puede ampliar la fecha, y queda registrado.
- **Estacionalidad:** si hay datos del año pasado, la pestaña enseña también «frente al mismo periodo del año pasado». Así, una caída en agosto que también hubo el año anterior no se lee como un fracaso. El estado se calcula con la trayectoria. El dato del año pasado es contexto y no cambia el semáforo. Así es más fácil de entender y no hace falta tener 13 meses de datos.
- **Los umbrales del 90 % y el 60 %** se pueden cambiar en los ajustes del panel Estrategia (solo admin).

## 4. Modelo de datos (módulo nuevo «Estrategia», prefijo `est_`)

**`est_objectives`**
- `id`, `tenant_id`, `client_id` (→ `clients`, borrado en cascada)
- `title`, `kind` (`kpi` | `hito`), `kpi_key` (la clave del catálogo de Rendimiento, p. ej. `gbp_calls`; null si es de hito)
- `baseline_value`, `baseline_yoy` (null si no había datos), `target_value`, `start_date`, `due_date`
- `status`: `borrador` | `activo` | `logrado` | `no_logrado` | `descartado`. El semáforo (en camino, en riesgo, desviado) **no se guarda**: se calcula al pintar.
- `last_health` y `last_health_at`: solo para saber cuándo empeora y avisar una vez.
- `priority` (1 a 3), `notes`, `source` (`manual` | `agente`), `created_by`, `created_at`, `updated_at`, `closed_at`, `final_value`

**`est_initiatives`**
- `id`, `tenant_id`, `client_id`, `objective_id` (→ `est_objectives`; si se borra el objetivo, queda en null)
- `title`, `description`, `kind`, con los mismos tipos que los hitos de Rendimiento: servicio, web, contenido, campaña, Google, otro
- `status`: `idea` | `planificada` | `en_curso` | `hecha` | `descartada`
- `owner_user_id` (persona responsable, opcional), `planned_date`, `due_date`, `done_date`
- `show_as_milestone` (sí por defecto): al marcarla como hecha, sale como hito en las gráficas en la fecha `done_date`
- `source`, `created_by`, `created_at`, `updated_at`

**`est_initiative_tasks`**: encargos ligados a una iniciativa.
- `initiative_id` (borrado en cascada), `clickup_task_id`, `title` (copia al ligar)
- Único: (`initiative_id`, `clickup_task_id`)
- No referencia la tabla de encargos de Operaciones: un módulo no depende de las tablas de otro. El estado se pide al núcleo (ver §5).

**`est_reviews`**: revisión mensual.
- `id`, `tenant_id`, `client_id`, `month`, `snapshot` (jsonb: cada objetivo con su valor, esperado y estado, más las iniciativas hechas en el mes), `summary` (texto), `next_steps` (texto), `status` (`borrador` | `revisada`), `created_at`, `reviewed_by`
- Único: (`client_id`, `month`)

**`est_settings`**: una fila por cuenta.
- `tenant_id` (PK), `on_track_pct` 90, `at_risk_pct` 60, `alerts_enabled`, `weekly_section`, `monthly_review`, `state` (jsonb)

Volumen: unas decenas de filas por cliente. Es insignificante.

## 5. Cómo se habla con los otros módulos (sin importarse)

Igual que en Rendimiento, todo pasa por registros del núcleo en `lib/core/capabilities.ts`:

| Necesidad | Quién la ofrece | Registro nuevo en el núcleo |
|---|---|---|
| Catálogo de cifras y su valor en un periodo para un cliente | Rendimiento | `registerKpiProvider` → `listKpis()`, `kpiSeries(clientId, kpiKey, from, to)` |
| Estado de los encargos ligados (y buscar encargos de un cliente para ligarlos) | Operaciones | `registerWorkItemSource` → `getItems(tenantId, taskIds)`, `searchItems(tenantId, clientId, texto)`; lee `ops_requests`, sin llamadas a ClickUp |
| Iniciativas hechas como hitos en las gráficas | Estrategia | `registerMilestoneSource` → Rendimiento las añade al pintar, igual que hoy añade el «Inicio del servicio» |
| Proponer cambios con ✅ / ✖️ | Operaciones (ya existe) | `proposeChange` (ya existe) |
| Apartado en el informe semanal y comprobación de salud | Ya existen | `registerReportSection`, `registerHealthCheck` |

**Por qué los hitos se leen al pintar y no se copian a `perf_annotations`:** si la iniciativa cambia de fecha o se borra, el hito cambia con ella, sin copias desincronizadas.

## 6. Pantallas

**Pestaña «Estrategia» en la ficha del cliente**, junto a «Rendimiento».
- **Objetivos:** una tarjeta por objetivo con la cifra actual, la meta y la fecha, una barra de progreso con la marca de «esperado hoy», el semáforo y una minigráfica de la cifra con la trayectoria. Botones: Editar, Ampliar fecha, Marcar logrado o descartar, y Eliminar (solo admin, con confirmación).
- **Estado vacío:** «Este cliente aún no tiene objetivos». Botones «Nuevo objetivo» y **«Proponer objetivos»**. Este segundo calcula, sin IA, una propuesta por cada cifra con datos (p. ej. +20 % en 6 meses sobre la línea de partida) y deja elegir.
- **Iniciativas:** lista agrupada por estado (en curso, planificadas, ideas, hechas), con su objetivo, responsable, fecha y encargos (3/5 ✓). Botones: Nueva iniciativa, «Ligar encargo» (busca entre los encargos del cliente), Marcar hecha (pide la fecha real) y Descartar.
- **Revisiones:** la del mes en curso, en borrador, y las anteriores. Botón «Copiar para el cliente».
- **Textos de la ficha:** los campos de texto «Objetivos» y «Estrategia» se mantienen como contexto y se muestran arriba, plegados.

**Panel central: Trabajo → Estrategia**
- Una tabla con todos los clientes: objetivos en camino, en riesgo y desviados, iniciativas vencidas y última revisión. Se puede ordenar y filtrar por «En riesgo».
- Aviso de **clientes sin estrategia**: activos y sin objetivos.
- Ajustes, solo admin: umbrales, avisos, apartado semanal y revisión mensual.

**Permisos:** ver = lector; crear y editar = editor; eliminar y ajustes = admin.

## 7. Automatismos (por excepción)

- **Cada día, tras la descarga de Rendimiento (≈ 9:00):** se recalcula el semáforo de cada objetivo activo. Si **empeora** (de en camino a en riesgo, o de en riesgo a desviado), llega un aviso por Telegram, uno por objetivo y cambio de estado, con un enlace a la pestaña. Las mejoras no avisan; salen en el semanal.
- **Objetivo logrado:** aviso de buena noticia y propuesta de cerrarlo con ✅ / ✖️.
- **Fecha vencida:** se propone cerrarlo como logrado o no logrado, o ampliar la fecha.
- **Iniciativa con todos sus encargos terminados y sin marcar como hecha:** el agente pregunta «¿Damos por hecha "X"? ¿En qué fecha se publicó?». Así se cumple «el agente pregunta al equipo» del plan.
- **Informe semanal:** apartado «Estrategia» con los objetivos que han cambiado de estado, los logrados y las iniciativas vencidas.
- **Día 5 de cada mes:** se crea la revisión mensual en borrador de cada cliente con objetivos. La parte numérica (snapshot e iniciativas del mes) **no usa IA**. Ver §8.

## 8. IA: dónde sí y dónde no (directiva de optimización)

- **Sin IA:** el progreso, el semáforo, la línea de partida, la propuesta de objetivos, los avisos y el snapshot mensual. Todo es aritmética sobre los datos guardados. Coste: cero.
- **Con IA, solo bajo demanda o en la revisión mensual:**
  - **Resumen y próximos pasos de la revisión mensual.** Una llamada corta por cliente y mes con el snapshot ya calculado como entrada, unos 2.000 tokens. Con un modelo pequeño (Haiku), cuesta del orden de 0,01 $ por cliente y mes (sin verificar con precios actuales). Se puede apagar en los ajustes, y entonces se rellena una plantilla de texto sin IA.
  - **Agente por Telegram:** «propón objetivos para X a partir de su ficha» convierte los textos libres de la ficha en objetivos estructurados (motor de agentes existente).

## 9. Herramientas del agente

- `estrategia_cliente` (lectura): objetivos con su estado, iniciativas y última revisión. Responde a «¿cómo va la estrategia de X?» y «¿qué clientes van mal?».
- `proponer_objetivo`, `proponer_iniciativa` y `actualizar_iniciativa` (marcar hecha, cambiar fecha, ligar encargo): todas pasan por `proposeChange` y se aprueban con ✅ / ✖️.
- Se añaden a los agentes ya creados con el mecanismo de actualización de `lib/agentes/store.ts`, como se hizo con Rendimiento.

## 10. Decisión: tres pasadas de cuestionamiento

**Hipótesis inicial:** un módulo nuevo con objetivos ligados a las cifras de Rendimiento y con iniciativas ligadas a encargos.

1. **¿Cumple el objetivo final o solo el de hoy?** Para que el sistema sustituya a un account manager no basta con guardar objetivos: tiene que decir solo cuándo algo va mal y qué se hizo. Por eso entran la trayectoria esperada (y no solo «meta sí/no» al final), los avisos por empeoramiento y la revisión mensual. **Cambió la conclusión:** al principio solo había objetivos e iniciativas.
2. **¿Qué coste o riesgo oculto tiene a semanas vista?**
   - **Riesgo 1:** que nadie mantenga las iniciativas al día y se queden «en curso» para siempre. Mitigación: el agente pregunta cuando los encargos están terminados, y el panel marca las vencidas.
   - **Riesgo 2:** metas mal puestas, con un semáforo rojo constante que se acaba ignorando. Mitigación: la propuesta automática parte de la línea de partida real, y el aviso es solo al empeorar, una vez.
   - **Riesgo 3:** ligar por id de ClickUp ata a ClickUp. Pero es lo que usa hoy toda la agencia, y el registro del núcleo permite cambiar la fuente el día que se sustituya.
3. **¿Hay algo que ya tenemos y no usamos?**
   - **ClickUp tiene «Goals».** Pero su API está poco documentada y no se puede ligar a los datos de Google. Además gasta peticiones del límite de 100/min, y el objetivo es depender menos de ClickUp.
   - **Los textos de la ficha ya existen**, pero no se pueden medir.
   - **Los hitos de Rendimiento ya existen**, y las iniciativas los reutilizan como hitos en vez de duplicarlos. **Cambió la conclusión:** iniciativas = hitos futuros, con lectura al pintar.

**Alternativas comparadas**

| Alternativa | Coste / esfuerzo | Riesgo | Qué se pierde |
|---|---|---|---|
| **A. Módulo Estrategia nuevo, con registros del núcleo (recomendada)** | Medio (≈ el tamaño de Rendimiento B1, sin la parte de Google) | Bajo; patrón ya probado | — |
| B. No hacer nada: los textos de la ficha | Cero | Nadie sabe si se cumple | Todo el seguimiento y los avisos |
| C. Metas dentro de Rendimiento (una meta por cifra) | Bajo | Mezcla métricas con trabajo; no hay sitio para iniciativas ni encargos | Las iniciativas, la relación con el trabajo y los objetivos de hito |
| D. ClickUp Goals | Bajo de construir | Límite de peticiones, API pobre, sin datos de Google, más dependencia de ClickUp | El progreso automático y la independencia |

## 11. Decisiones que necesito de Enric

1. **¿Apruebas el esquema** (migración 0050 con 5 tablas `est_*`) y los registros nuevos del núcleo (`registerKpiProvider`, `registerWorkItemSource` y `registerMilestoneSource`)?
2. **Medición:** últimos 28 días llevados a 30 (recomendado: reacciona antes) o el último mes natural cerrado (más simple de explicar al cliente, pero con hasta un mes de retraso).
3. **Revisión mensual con IA (Haiku, ≈ 0,01 $/cliente/mes) o solo plantilla sin IA.** Recomiendo IA encendida, porque los próximos pasos son lo que más tiempo ahorra.
4. **¿Crear encargos desde una iniciativa?** Un botón «Crear encargo» que abra el flujo de Nuevo encargo ya rellenado. Propongo dejarlo para una segunda fase: en la primera solo se ligan encargos existentes.

## 12. Plan de construcción (si se aprueba)

1. **Migración 0050 y núcleo:** backup previo, las tablas y los tres registros.
2. **Lógica pura** (`lib/estrategia/rules.ts`): progreso, semáforo, línea de partida y propuesta de objetivos, con pruebas.
3. **Datos y acciones**, con guards y pruebas de seguridad.
4. **Pestaña** «Estrategia» y **panel central**.
5. **Automatismos:** semáforo diario, avisos, apartado semanal, revisión mensual y pregunta de iniciativas terminadas.
6. **Herramientas del agente.**
7. **Cierre:** Mapa Visual (nodo «Estrategia» del gris a construido), comprobación del mapa, `docs/ESTADO.md`, documento de sesión y revisión completa.

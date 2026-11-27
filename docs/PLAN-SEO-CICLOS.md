# Plan: estrategias (ciclos) del SEO — fase 2 «Trabajo»

**Fecha:** 2026-11-27 · **Autor del análisis y del plan:** Fable 5.2 (pedido por Enric), en solo lectura sobre el código.
**Ejecuta:** Claude Opus 5.5. **Estado:** APROBADO por Enric el 27 nov con las 6 recomendaciones del §9: por proyecto; trimestral con lectura a +90 días (mensual solo técnico); lote mensual aprobado por Enric en los dos primeros ciclos y automático después; aprueba solo admin; un solo cerebro (el estratega antiguo deja de proponer SEO donde hay proyecto SEO); reserva del 30 %, editable.
**Origen:** la visión de Enric para la fase 2: ficha → servicio → accesos → «Iniciar estrategia» → el sistema, de forma secuencial, monta la estrategia → tareas a personas y agentes → seguimiento; estrategias aisladas (mensuales, trimestrales…); un agente que propone estrategias; aprender qué funciona entre clientes y sectores. Lo marcado [NV] no está verificado.

## 1. Veredicto crítico

**Acertado:**
- El orden ficha → servicio → accesos → arranque → propuesta → validación humana → tareas → seguimiento. Es casi el que ya recorre el código.
- Hace falta un **contenedor con principio, fin, horas y objetivo**: hoy el plan es una lista sin fin.
- Aprender entre clientes es el diferencial real, y los cimientos ya están: `interventions`, la medición por diferencias en diferencias y las tendencias por técnica.

**Arriesgado o equivocado:**
1. **«Aislar por estrategia trimestral» aísla la contabilidad, no la causa.** Un cliente en un trimestre es n = 1 (temporada, actualizaciones de Google, trabajos solapados). La medición buena ya existe por intervención (`lib/core/measure.ts`). La estrategia agrupa y cuenta: nunca afirma «la estrategia X causó +Y %».
2. **Los ejemplos de Enric son justo lo que la medición actual no sabe juzgar.**
   - Un artículo nuevo no tiene «antes»: `baseTotal` = 0 da «no concluyente» [lectura del código].
   - `enlaces_externos`, `digital_pr`, `schema_negocio` y `schema_limpieza` están en `NOT_MEASURABLE` (`lib/core/measure-rules.ts`).
   - Hace falta un **marcador de cohorte por línea de trabajo**: publicados frente a previstos, indexados, impresiones, clics y top 10 de la cohorte a 90 días, y leads en esas URL.
3. **El cierre no coincide con el resultado.** El contenido del mes 3 madura en el trimestre siguiente. Hacen falta dos momentos: **cierre de ejecución** al acabar y **lectura de resultados a +90 días**. Lo mensual solo vale para lo técnico.
4. **«Todo autónomo hasta montar la estrategia» el día 1 es especulación.** Posiciones, mapa, demanda y leads llegan en semanas, y servicios, zona y competencia los confirma una persona (`readiness()`). El primer periodo es siempre igual (arreglos, ficha, línea base) y ya lo genera el plan por reglas. El agente aporta a partir del segundo ciclo.
5. **Volcar a ClickUp las tareas de todo el trimestre** deja 40-60 tareas envejeciendo y sepulta al junior. El calendario vive en nuestras tablas y solo las **próximas 2 semanas** pasan a encargos.
6. **Capacidad.** Dos artículos por semana son unos 8-9 al mes; aunque la IA los redacte, la revisión se come un contrato de 10 h [NV]. La viabilidad la calcula el código (`effortByType`), no el agente.
7. **El texto libre no se puede comparar entre clientes.** Una estrategia es una **combinación de líneas de un catálogo con parámetros** (cadencia, tipo de artículo, servicio foco). El agente elige y parametriza; no inventa.
8. **«Lo tenemos montado» es cierto en piezas.** Faltan tres cosas estructurales:
   - el contenedor;
   - el trabajo **proactivo** recurrente: hoy `regeneratePlan` solo nace de hallazgos;
   - **un solo cerebro**: Estrategia (`lib/estrategia`) y el Plan SEO se pisan (atasco 8).

**Vocabulario:**
- **Plan de mejora:** la cola reactiva de arreglos, con una reserva de horas.
- **Ciclo** (en pantalla, «Estrategia»): un periodo con tesis, objetivo, horas y de 1 a 3 **líneas de trabajo** del catálogo.
- **Caso:** cada unidad de trabajo, venga del plan o de una línea.

No se usa «experimento»: no hay aleatorización.

**¿Proyecto dentro del cliente?** El modelo ya lo tiene (`projects.client_id`, `projects.service`); el problema es de entrada. La ficha del cliente es la puerta: su pestaña SEO enseña el ciclo activo y enlaza al proyecto. El ciclo cuelga del **proyecto** (puede haber dos webs, o SEO y Ads, y las horas ya son por proyecto).

**Estructura:** Cliente → Proyecto (servicio) → Ciclos (uno activo) → Líneas → Casos → Intervenciones medidas. La cola reactiva corre en paralelo dentro del ciclo.

## 2. Qué existe y qué falta

| Pieza | Dónde | Estado |
|---|---|---|
| Ficha y accesos | `clients`, `client_assets`, `client_connections`, `gsc_properties` | Hecho |
| Activar un servicio | `projects.service`, `ops_client_services` | Hecho; sin un «activar» visible en la ficha |
| Iniciar y diagnóstico | `startProjectSetupAction`, `salud/audit.ts`, `alta/*`, mapa | Hecho; faltan las etapas visibles |
| Tareas con responsable y fecha | `approvePlanItem` / `approveThisMonth` → `createTask` | Hecho, solo lo reactivo |
| Reparto por meses | `scheduleMonths` | Parcial: sin semanas ni cadencias |
| Estrategia como contenedor | — | **Falta** |
| Trabajo proactivo recurrente | briefs sueltos | **Falta** |
| Agente que propone | `lib/estrategia/strategist.ts` (Opus, por cliente, sugerencias sueltas) | **Duplicado en conflicto** |
| Seguimiento de tareas | `syncInterventionStatus`, verificación fallida, cancelación | Hecho |
| Monitorización | `lib/seo/vigilancia`, posiciones, salud; también `est_*` | **Duplicado** |
| ¿Funcionó? | `lib/core/measure*.ts` | Hecho para páginas existentes; no para páginas nuevas, enlaces ni schema |
| Aprendizaje entre clientes | `technique-trends*` | Por técnica; no por estrategia ni por sector |
| Informe de cierre | informe mensual (§6.65) | Parcial |

**Un solo cerebro:**
- La única puerta a los encargos SEO es `seo_plan_items` (su `origin` ya admite `'ia'` y `'persona'`).
- El agente de ciclos vive en `lib/seo/estrategia/` y usa `callAI` del núcleo.
- El estratega actual queda para clientes sin proyecto SEO.
- La monitorización `est_*` no se activa en clientes con proyecto SEO.
- No se borra nada.

## 3. ¿Hace falta plan? Sí
1. La fase 2 de PLAN-UX (embudo y Caso) sobre un modelo sin ciclos habría que rehacerla.
2. Meter trabajo de un ciclo en `seo_plan_items` sin tocar `regeneratePlan` lo rompe: empareja por técnica y caduca todo lo pendiente que no sale de hallazgos.
3. Hay esquema nuevo y una decisión de arquitectura.

## 4. Modelo de datos (migración 0078, solo aditiva)

**`seo_cycles`:**
- Identificación: `id`, `tenant_id`, `project_id`, `seq`, `kind` (`cimientos` | `estrategia`), `name`.
- Periodo: `period_months` (1, 3, 6 o 12), `starts_on`, `ends_on`, `status` (`propuesto` | `activo` | `cerrado` | `leido` | `cancelado`).
- Horas: `hours_budget`, `maintenance_pct` (30 % por defecto).
- Contenido: `thesis`, `goal` jsonb, `baseline` jsonb (foto al empezar), `options` jsonb (también las alternativas no elegidas), `chosen_option`, `business_type`.
- Coste de la IA: `ai_job_id`, `cost_usd`.
- Aprobación, cierre y lectura: `approved_by`, `approved_at`, `closed_at`, `close_report` jsonb, `read_due_on`, `read_report` jsonb.
- Índice único parcial: un solo ciclo `activo` por proyecto.

**`seo_cycle_lines`:** `id`, `tenant_id`, `cycle_id`, `project_id`, `playbook`, `playbook_version`, `params` jsonb, `technique`, `hours_budget`, `planned_units`, `done_units`, `status`, `sort`, `scorecard` jsonb.

**`seo_cycle_slots` (calendario):**
- `id`, `tenant_id`, `cycle_id`, `line_id`, `project_id`;
- `due_week` (lunes), `title`, `role` (`tecnico` | `redactor` | `agente`), `est_hours`;
- `topic_key`, `keyword`, `target_url`;
- `status` (`previsto` | `encargado` | `hecho` | `saltado`), `plan_item_id`, `brief_id`.

**Columnas nuevas anulables:** `seo_plan_items.cycle_id` y `.cycle_line_id`, y `seo_briefs.cycle_line_id`.

**Prompt nuevo:** `seo_estratega_ciclo`. Las tablas del núcleo no cambian.

## 5. Catálogo de líneas (código puro, `lib/seo/estrategia/playbooks.ts`)

Líneas:
- `cimientos`;
- `contenido_cadencia` (por semana; mezcla comparativo / autoridad / servicio / local; servicio foco);
- `refuerzo_al_alcance`;
- `paginas_servicio_zona`;
- `local_ficha_resenas`;
- `autoridad_enlaces`;
- `datos_estructurados`;
- `recuperacion_contenido`.

Cada línea declara:
- requisitos (datos y puntos de la puesta en marcha);
- unidad y horas por unidad (mediana real con 3 casos o más; si no, la de la receta);
- técnica, rol, métrica y ventana de lectura;
- cómo se calcula su marcador.

## 6. Flujos
1. **Iniciar.** El botón existente lanza la cadena. Al terminar la auditoría y el plan, el código crea el **ciclo 0 «Cimientos»** (sin IA), que envuelve la cola por reglas. Las etapas visibles salen de `readiness()`: Accesos → Datos → Confirmación humana → Línea base → Propuesta.
2. **Proponer** (`seo.estrategia.proponer`, a mano o 21 días antes de `ends_on`):
   - El código arma el expediente (dossier, tendencias, marcadores anteriores, cola, horas, **líneas elegibles ya filtradas**).
   - **Opus 5.5** devuelve 2-3 opciones (prudente / recomendada / otro foco) con 1-3 líneas parametrizadas, una tesis con referencias al expediente y sus riesgos.
   - El código valida: línea elegible, parámetros en rango, horas ≤ meses × horas × (1 − reserva) y evidencia que exista.
3. **Validar.** Una persona elige la opción, ajusta la cadencia y las horas y aprueba. El ciclo pasa a `activo`.
4. **Calendario.** El código expande cada línea en huecos semanales. Los temas se eligen por puntuación (temas y demanda), sin IA, y se deduplican con los embeddings.
5. **Materializar** (`seo.estrategia.materializar`, semanal):
   - Crea un `seo_plan_items` por cada hueco de los próximos 14 días (`origin='ia'`, `plan_key='ciclo:<slot>'`, `cycle_id`).
   - Esas tareas entran en «Aprobar lo de este mes» o, si el ciclo está en automático, pasan por `approvePlanItem`.
   - **Obligatorio:** `regeneratePlan` debe filtrar por `origin='reglas'` en `same`, `pending` y `stale`.
6. **Seguimiento.** Lo que ya existe, más el ritmo del ciclo (hecho frente a previsto, horas frente a presupuesto). Aviso si a mitad de ciclo va por debajo del 60 %, y una línea en el informe semanal.
7. **Cierre y lectura.** En `ends_on`, `close_report` determinista. A +90 días, `read_report` con el marcador de cohorte de cada línea.
8. **Aprendizaje.** Una tabla por línea × tipo de negocio: número de clientes, mediana del marcador y % que llega al objetivo. Lleva las etiquetas «pocos casos / tendencia» y entra en el expediente del agente marcada como anecdótica hasta tener 10 clientes o más.

## 7. Pantallas
- **Proyecto → Trabajo → «Estrategia»** (la primera sección):
  - ciclo activo (tesis, objetivo, ritmo y horas);
  - líneas con su marcador y el calendario por semanas;
  - historial;
  - «Proponer nueva estrategia», con las opciones lado a lado;
  - estado vacío que enlaza a la puesta en marcha.
- **Plan de mejora:** el embudo de PLAN-UX fase 2. Cada Caso lleva la etiqueta de su ciclo y su línea, con filtro por ciclo.
- **Ficha del cliente → SEO:** por proyecto, el ciclo activo, su ritmo y la próxima fecha. La pestaña «Estrategia» del módulo `est` se renombra a «Seguimiento».
- **Resumen:** una línea con el estado del ciclo.
- **Resultados y Cartera:** marcas de inicio y fin de cada ciclo.

## 8. IA, reutilización y fases

**IA:**
- El código decide la elegibilidad, las horas, el calendario, los temas, el ritmo, los marcadores y el cierre.
- **Opus 5.5** solo propone opciones y tesis: 4-6 llamadas al año por proyecto, con un tope de 2 propuestas por ciclo [coste NV: mirar `est_analyses.cost_usd`].
- Examen del prompt con 3 expedientes sintéticos: que no proponga líneas no elegibles ni pase de las horas.

**Reutilizar:**
- `approvePlanItem`, `approveThisMonth`, `scheduleMonths`, `RECIPES`;
- briefs y artículo con IA;
- `interventions` con su medición y tendencias;
- el dossier, el informe mensual y `readiness`.

**Fusionar:** regla operativa: no activar el estratega `est` en clientes con proyecto SEO. Más adelante, si hace falta, un campo opcional del núcleo, con auditoría.

**No tocar:** `est_*`, el plan de contenidos antiguo y `clients.strategy`.

| Fase | Qué | Hecho cuando |
|---|---|---|
| **A** | Migración 0078, catálogo puro y filtro `origin='reglas'` en `regeneratePlan` | Prueba: un elemento `origin='ia'` sobrevive a `regeneratePlan`; pruebas del catálogo |
| **B** | Ciclo «Cimientos» automático, sección «Estrategia» en solo lectura, etapas del arranque, resumen en la ficha | Un proyecto recién arrancado muestra el ciclo 0; `pantallas-*` y seguridad en verde |
| **C** | Calendario y materialización semanal; crear un ciclo a mano desde el catálogo (sin IA) | 12 semanas × 1 = 12 huecos; materialización idempotente; ClickUp solo en «Pruebas Kiju» |
| **PLAN-UX 2** | Embudo, ficha de Caso y aprobación por lote, con la dimensión del ciclo | `docs/PLAN-UX-SEO.md` §8 |
| **D** | Agente que propone (Opus), validación y opciones lado a lado | Examen aprobado; propuesta inválida descartada con su motivo; tope de coste |
| **E** | Cierre, lectura a +90 días y marcador de cohorte | Pruebas puras; el informe no afirma causa |
| **F** | Aprendizaje entre clientes, que entra en el expediente del agente | «Pocos casos» con menos de 5 clientes |

Cada fase cierra con el Mapa Visual, `ESTADO.md`, el documento de sesión y el revisor de código.

## 9. Decisiones de Enric (con la recomendación)
1. **Unidad del ciclo:** por proyecto (recomendado) o por cliente.
2. **Duración:** trimestral por defecto, con lectura a +90 días; mensual solo para líneas técnicas (recomendado).
3. **Encargos:** lote mensual que aprueba Enric en los dos primeros ciclos de cada cliente y automático después (recomendado), o automático desde el principio.
4. **Quién aprueba un ciclo:** solo `admin` (recomendado) o también `edit`.
5. **Estratega actual:** deja de proponer SEO donde haya proyecto SEO (recomendado: sí).
6. **Reserva para arreglos:** 30 % de las horas, editable por ciclo.

## 10. Riesgos y métricas

**Riesgos:**
- Vender causalidad. Mitigación: marcador descriptivo y nunca «la estrategia causó».
- Sobreplanificar con 10 h. Mitigación: horas validadas en el código y 3 líneas como máximo.
- Pocos clientes para aprender: el aprendizaje por sector tardará 6-12 meses en dejar de ser anécdota, y se dice en pantalla.
- Que `regeneratePlan` choque con las líneas. Mitigación: prueba en la fase A.
- Que el agente se salga del catálogo. Mitigación: validación y examen del prompt.

**Métricas** (sobre la línea base `app_usage_events`):
- % de proyectos con ciclo activo;
- hecho frente a previsto;
- horas estimadas frente a fichadas;
- días de propuesta a aprobación;
- % de opciones aprobadas sin editar;
- % de ciclos con lectura a +90 días;
- minutos de Enric por revisión semanal.

## 11. Auditoría independiente (Opus 5.5, alto, 27 nov) y cambios del modelo antes de la migración
Se aceptan todos los hallazgos:
- **G1, dos bolsas de horas:**
  - Los huecos del ciclo van por su semana y no pasan por `scheduleMonths`.
  - Lo reactivo tiene de tope `monthlyHours × reserva` más lo que el ciclo no use.
  - Activar un ciclo exige `monthlyHours`.
  - Si un crítico se come horas del ciclo, los huecos se mueven o se saltan, siempre con su motivo.
- **G2, aprobación del lote:**
  - `seo_cycles.approval_mode` (`lote_admin` en los dos primeros ciclos de estrategia de cada proyecto y `automatico` después; editable).
  - La aprobación vive en los huecos (`approved_by` / `approved_at`, guard `admin`). Se aprueba el mes entero.
  - La materialización a 14 días solo encarga huecos aprobados.
- **G3, un solo camino para el contenido:**
  - El hueco de contenido se encarga por el brief (`requestBrief` → `briefToTask`, intervención `seo.brief`). No crea propuesta en el plan.
  - Los demás roles van por `seo_plan_items` (`origin='ia'`) → `approvePlanItem`.
  - Que la medición no deje «sin páginas» para siempre al contenido nuevo es núcleo: va a la fase E, con su protocolo.
- **I1, ciclo de vida:**
  - Cancelar el ciclo o una línea pasa sus pendientes a `caducada` y sus huecos a `saltado`.
  - Un hueco atrasado se encarga una vez con fecha nueva. Si no está aprobado tres semanas después de su semana, pasa a `saltado` con su motivo.
- **I2, sin duplicados entre las dos bolsas:** el hueco guarda los `finding_ids` de su tema. Los temas se eligen al materializar, excluyendo los que tienen una propuesta reactiva abierta.
- **I3, modelo:**
  - Sin `planned_units` / `done_units`: se derivan de los huecos.
  - Únicos: `(project_id, seq)` y `(line_id, due_week, n)`; un solo ciclo activo por proyecto.
  - Cascada ciclo → líneas → huecos; `seo_plan_items.cycle_id` con `SET NULL`.
  - El objetivo va por línea.
  - Las propuestas de la IA (varias por ciclo) irán en una tabla propia en la fase D.
- **I4, marcador mínimo en la fase C:** publicados frente a previstos e impresiones y clics de las URL publicadas (`gsc_daily`; no incluye las búsquedas anónimas, y así se dice). Los leads por URL de entrada no se pueden medir: fuera del marcador.
- **I5:** en el expediente se dice que el ciclo n+1 se propone sin la lectura del n; se usan indicadores a 28 y 56 días, marcados como tales.
- **I6:** en la fase D, la opción recomendada sale de un puntuador por reglas y Opus solo aporta la tesis y otro foco. Evidencias como identificadores validados, versión del prompt guardada y examen.
- **I7, un solo cerebro en código:** `seoCoverage` (`lib/estrategia/processes.ts`) corta las propuestas SEO del estratega `est` en clientes con proyecto SEO.
- **Orden nuevo:** **A+C juntas** (ciclo manual desde el catálogo, calendario, aprobación del mes por un admin, dos bolsas y marcador mínimo) → B (ciclo 0 y etapas) → PLAN-UX 2 → D (IA, tras 2-3 ciclos manuales) → E → F.
